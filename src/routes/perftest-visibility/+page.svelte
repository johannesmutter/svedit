<script>
	import { SvelteSet } from 'svelte/reactivity';
	import { setContext, onMount, tick } from 'svelte';
	import { Svedit, Session, KeyMapper } from 'svedit';
	import { document_schema, session_config } from '../create_demo_session.js';
	import nanoid from '../nanoid.js';

	/**
	 * Visibility Signal Benchmark
	 *
	 * Compares two approaches for communicating node viewport state:
	 *
	 * A) Imperative classList toggle (current svedit approach)
	 *    - IO callback → el.classList.toggle('in-view', bool)
	 *    - Consumers read via CSS selectors or MutationObserver
	 *
	 * B) Reactive SvelteSet
	 *    - IO callback → set.add(path) / set.delete(path)
	 *    - Consumers read via $derived(set.has(path)) — Svelte tracks per-key
	 *
	 * We simulate realistic IO batches (5–15 entries per frame during scroll)
	 * and measure:
	 *   1. Raw write cost per batch (just the state mutation, no subscribers)
	 *   2. Write cost with pre-populated set (steady-state mid-scroll)
	 *   3. Full scroll FPS with each strategy active on a real document
	 */

	const NODE_COUNT = 500;
	const BATCH_SIZES = [5, 10, 15, 25];
	const SCROLL_DURATION_MS = 3000;
	const MICRO_ITERATIONS = 2000;

	let results = $state([]);
	let scroll_results = $state([]);
	let is_testing = $state(false);
	let status = $state('');
	let mount_key = $state(0);

	function generate_document(count) {
		const nodes = {};
		const body = [];
		for (let i = 0; i < count; i++) {
			const id = nanoid();
			nodes[id] = {
				id, type: 'text', layout: i % 5 === 0 ? 2 : 1,
				content: {
					text: `Paragraph ${i + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.`,
					annotations: []
				}
			};
			body.push(id);
		}
		nodes['perf_page'] = {
			id: 'perf_page', type: 'page',
			body, keywords: [], daily_visitors: [],
			created_at: new Date().toISOString()
		};
		return { document_id: 'perf_page', nodes };
	}

	function make_session() {
		const config = { ...session_config, view_classes: true };
		const doc = generate_document(NODE_COUNT);
		const s = new Session(document_schema, doc, config);
		s.validate_doc();
		return s;
	}

	let session = $state(make_session());
	const key_mapper = new KeyMapper();
	setContext('key_mapper', key_mapper);

	/**
	 * Measures classList.toggle cost on detached elements.
	 * @param {number} batch_size
	 * @param {number} iterations
	 */
	function bench_classlist(batch_size, iterations) {
		const els = Array.from({ length: NODE_COUNT }, (_, i) => {
			const el = document.createElement('div');
			el.dataset.path = `body.${i}`;
			return el;
		});

		const t0 = performance.now();
		for (let iter = 0; iter < iterations; iter++) {
			const start_idx = (iter * batch_size) % NODE_COUNT;
			for (let j = 0; j < batch_size; j++) {
				const idx = (start_idx + j) % NODE_COUNT;
				const entering = iter % 2 === 0;
				const el = els[idx];
				el.classList.toggle('in-view', entering);
				if (entering) el.classList.add('seen');
				el.classList.toggle('fully-in-view', entering);
				el.classList.toggle('visible-top', entering);
				el.classList.toggle('visible-bottom', false);
			}
		}
		return (performance.now() - t0) / iterations;
	}

	/**
	 * Measures SvelteSet add/delete cost.
	 * @param {number} batch_size
	 * @param {number} iterations
	 */
	function bench_svelteset(batch_size, iterations) {
		const in_view = new SvelteSet();
		const seen = new SvelteSet();
		const paths = Array.from({ length: NODE_COUNT }, (_, i) => `body.${i}`);

		const t0 = performance.now();
		for (let iter = 0; iter < iterations; iter++) {
			const start_idx = (iter * batch_size) % NODE_COUNT;
			for (let j = 0; j < batch_size; j++) {
				const idx = (start_idx + j) % NODE_COUNT;
				const path = paths[idx];
				const entering = iter % 2 === 0;
				if (entering) {
					in_view.add(path);
					seen.add(path);
				} else {
					in_view.delete(path);
				}
			}
		}
		return (performance.now() - t0) / iterations;
	}

	/**
	 * Measures SvelteSet with pre-populated state (steady-state scroll).
	 * @param {number} batch_size
	 * @param {number} iterations
	 */
	function bench_svelteset_steady(batch_size, iterations) {
		const in_view = new SvelteSet();
		const paths = Array.from({ length: NODE_COUNT }, (_, i) => `body.${i}`);
		for (let i = 0; i < 15; i++) in_view.add(paths[i]);

		const t0 = performance.now();
		for (let iter = 0; iter < iterations; iter++) {
			const start_idx = (iter * batch_size) % NODE_COUNT;
			for (let j = 0; j < batch_size; j++) {
				const idx = (start_idx + j) % NODE_COUNT;
				const path = paths[idx];
				const entering = iter % 2 === 0;
				if (entering) {
					in_view.add(path);
				} else {
					in_view.delete(path);
				}
			}
		}
		return (performance.now() - t0) / iterations;
	}

	async function run_micro_benchmarks() {
		is_testing = true;
		results = [];
		status = 'Running microbenchmarks...';
		await new Promise(r => setTimeout(r, 50));

		for (const batch of BATCH_SIZES) {
			const cl_time = bench_classlist(batch, MICRO_ITERATIONS);
			const set_time = bench_svelteset(batch, MICRO_ITERATIONS);
			const set_time_ss = bench_svelteset_steady(batch, MICRO_ITERATIONS);

			results = [...results, {
				batch_size: batch,
				classlist_us: (cl_time * 1000).toFixed(1),
				svelteset_us: (set_time * 1000).toFixed(1),
				svelteset_ss_us: (set_time_ss * 1000).toFixed(1),
				ratio: (set_time / cl_time).toFixed(2),
			}];
			await new Promise(r => setTimeout(r, 10));
		}
		status = 'Microbenchmarks done.';
		is_testing = false;
	}

	/** @param {number[]} stamps */
	function calc_fps_stats(stamps) {
		if (stamps.length < 2) return { avg: 0, min: 0, p5: 0, frames: 0 };
		const gaps = [];
		for (let i = 1; i < stamps.length; i++) gaps.push(stamps[i] - stamps[i - 1]);
		const total = stamps[stamps.length - 1] - stamps[0];
		const avg = Math.round((stamps.length - 1) * 1000 / total);
		gaps.sort((a, b) => b - a);
		const worst = gaps[0];
		const p95_idx = Math.floor(gaps.length * 0.05);
		return {
			avg,
			min: Math.round(1000 / worst),
			p5: Math.round(1000 / (gaps[p95_idx] || worst)),
			frames: stamps.length
		};
	}

	/**
	 * @param {'baseline' | 'classlist_extra' | 'svelteset_extra'} mode
	 */
	async function scroll_test(mode) {
		const el = document.documentElement;
		el.scrollTop = 0;
		await new Promise(r => setTimeout(r, 300));
		const max_scroll = el.scrollHeight - window.innerHeight;

		const extra_set = new SvelteSet();
		const stamps = [];
		const t0 = performance.now();

		await new Promise(resolve => {
			function step(now) {
				stamps.push(now);
				const p = Math.min((now - t0) / SCROLL_DURATION_MS, 1);
				el.scrollTop = p * max_scroll;

				if (mode === 'svelteset_extra') {
					const visible_idx = Math.floor(p * NODE_COUNT);
					for (let i = 0; i < 10; i++) {
						extra_set.add(`body.${(visible_idx + i) % NODE_COUNT}`);
					}
					for (let i = 0; i < 10; i++) {
						extra_set.delete(`body.${(visible_idx - 15 + i + NODE_COUNT) % NODE_COUNT}`);
					}
					for (let i = 0; i < 10; i++) {
						extra_set.has(`body.${i * 50}`);
					}
				} else if (mode === 'classlist_extra') {
					const node_els = document.querySelectorAll('[data-type="node"]');
					const len = node_els.length;
					if (len > 0) {
						const visible_start = Math.floor(p * (len - 1));
						for (let i = 0; i < Math.min(10, len); i++) {
							const el = node_els[(visible_start + i) % len];
							if (el) el.classList.toggle('extra-marker', true);
						}
					}
				}

				if (p < 1) requestAnimationFrame(step); else resolve();
			}
			requestAnimationFrame(step);
		});

		return calc_fps_stats(stamps);
	}

	async function run_scroll_benchmarks() {
		is_testing = true;
		scroll_results = [];

		status = 'Scroll: baseline (full edit mode, all IOs active)...';
		await new Promise(r => setTimeout(r, 100));
		const baseline = await scroll_test('baseline');
		scroll_results = [...scroll_results, { mode: 'baseline (full edit mode)', ...baseline }];

		status = 'Scroll: + extra classList work per frame...';
		await new Promise(r => setTimeout(r, 500));
		const cl_extra = await scroll_test('classlist_extra');
		scroll_results = [...scroll_results, { mode: '+ 10 classList toggles/frame', ...cl_extra }];

		status = 'Scroll: + SvelteSet writes + reads per frame...';
		await new Promise(r => setTimeout(r, 500));
		const set_extra = await scroll_test('svelteset_extra');
		scroll_results = [...scroll_results, { mode: '+ SvelteSet (10 add + 10 del + 10 has)/frame', ...set_extra }];

		status = 'Done.';
		is_testing = false;
	}

	async function run_all() {
		await run_micro_benchmarks();
		await new Promise(r => setTimeout(r, 500));
		await run_scroll_benchmarks();
	}

	onMount(() => {
		/** @type {any} */ (window).__visibility_bench = {
			run_micro_benchmarks,
			run_scroll_benchmarks,
			run_all,
			get results() { return { micro: results, scroll: scroll_results }; }
		};
		return () => { delete /** @type {any} */ (window).__visibility_bench; };
	});
</script>

<svelte:head>
	<title>Visibility Signal Benchmark</title>
</svelte:head>

<div class="bench-controls">
	<h2>Visibility Signal Benchmark</h2>
	<p class="subtitle">
		Compares imperative classList vs reactive SvelteSet for node visibility signals.
		Document: {NODE_COUNT} text nodes, edit mode (gap IO + gap markers + view IO all active).
	</p>

	<div class="control-row">
		<button class="primary" onclick={run_all} disabled={is_testing}>Run All</button>
		<button onclick={run_micro_benchmarks} disabled={is_testing}>Microbenchmarks Only</button>
		<button onclick={run_scroll_benchmarks} disabled={is_testing}>Scroll FPS Only</button>
	</div>

	{#if status}
		<div class="status" class:active={is_testing}>{status}</div>
	{/if}

	{#if results.length > 0}
		<div class="results-section">
			<h3>Microbenchmark: cost per IO batch (µs)</h3>
			<p class="note">
				{MICRO_ITERATIONS} iterations each. classList operates on detached DOM elements
				(5 toggles per entry matching current #apply_view_classes).
				SvelteSet operates on a real Svelte 5 SvelteSet.
				"steady-state" pre-populates 15 entries to simulate mid-scroll.
			</p>
			<table>
				<thead>
					<tr>
						<th>Batch size</th>
						<th>classList (µs)</th>
						<th>SvelteSet (µs)</th>
						<th>SvelteSet steady-state (µs)</th>
						<th>Ratio (set/class)</th>
					</tr>
				</thead>
				<tbody>
					{#each results as r}
						<tr>
							<td>{r.batch_size}</td>
							<td>{r.classlist_us}</td>
							<td>{r.svelteset_us}</td>
							<td>{r.svelteset_ss_us}</td>
							<td class:warn={parseFloat(r.ratio) > 3} class:good={parseFloat(r.ratio) < 1.5}>{r.ratio}x</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	{#if scroll_results.length > 0}
		<div class="results-section">
			<h3>Scroll FPS ({NODE_COUNT} nodes, edit mode, {SCROLL_DURATION_MS}ms scroll)</h3>
			<p class="note">
				"baseline" = full edit mode (gap IO + positioned toggling + gap markers + view_classes).
				Other modes add extra per-frame work to simulate what replacing classList with reactive signals would cost.
			</p>
			<table>
				<thead>
					<tr>
						<th>Mode</th>
						<th>Avg FPS</th>
						<th>Min FPS</th>
						<th>P5 FPS</th>
						<th>Frames</th>
					</tr>
				</thead>
				<tbody>
					{#each scroll_results as r}
						<tr>
							<td>{r.mode}</td>
							<td>{r.avg}</td>
							<td>{r.min}</td>
							<td>{r.p5}</td>
							<td>{r.frames}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<div class="editor-area">
	{#key mount_key}
		<Svedit {session} editable={true} path={[session.doc.document_id]} />
	{/key}
</div>

<svelte:window onkeydown={key_mapper.handle_keydown.bind(key_mapper)} />

<style>
	.bench-controls {
		position: sticky;
		top: 0;
		z-index: 100;
		background: white;
		border-bottom: 2px solid #e0e0e0;
		padding: 12px 20px;
		font-family: system-ui, -apple-system, sans-serif;
		font-size: 13px;
	}

	h2 { margin: 0 0 4px; font-size: 16px; }
	h3 { margin: 12px 0 4px; font-size: 14px; }

	.subtitle { margin: 0 0 10px; color: #666; }

	.note {
		margin: 0 0 8px;
		color: #888;
		font-size: 11px;
		max-width: 700px;
	}

	.control-row {
		display: flex;
		gap: 8px;
		margin-bottom: 8px;
	}

	button {
		padding: 5px 12px;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: #f5f5f5;
		cursor: pointer;
		font-size: 12px;
	}

	button:hover:not(:disabled) { background: #e0e0e0; }
	button:disabled { opacity: 0.5; cursor: not-allowed; }
	button.primary { background: #333; color: white; border-color: #333; }

	.status { padding: 4px 0; color: #666; }
	.status.active { color: oklch(50% 0.2 280); font-weight: 600; }

	.results-section { margin-top: 8px; }

	table {
		border-collapse: collapse;
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}

	th, td {
		padding: 4px 10px;
		border: 1px solid #ddd;
		text-align: right;
	}

	th { background: #f5f5f5; text-align: center; font-weight: 600; }
	td:first-child { text-align: left; }

	.warn { color: #c00; font-weight: 600; }
	.good { color: #080; font-weight: 600; }

	.editor-area {
		max-width: 800px;
		margin: 0 auto;
		padding: 20px;
	}
</style>
