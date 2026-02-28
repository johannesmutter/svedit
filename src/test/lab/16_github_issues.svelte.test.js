/**
 * Lab test suite — Regression tests for open GitHub issues
 *
 * Strategy:
 * - it.fails() for tests that assert the CORRECT behavior but the bug
 *   prevents it. These tests PASS in vitest (because the failure is expected).
 *   When the bug is fixed, the test will unexpectedly succeed, and vitest
 *   will flag it — prompting you to change it.fails() back to it().
 * - Regular it() for tests that verify current broken behavior is observable,
 *   or for documenting missing features where there's no wrong code path.
 */
import { describe, it, expect } from 'vitest';
import {
	create_session,
	create_text_doc,
	create_annotated_doc,
	create_mixed_doc,
	set_text_selection,
	set_text_selection_by_path,
	set_node_selection,
	set_property_selection,
	render_editor,
	create_mock_clipboard,
	dispatch_copy,
	dispatch_paste,
	dispatch_cut,
	tick,
	wait,
	nanoid
} from './helpers.js';
import { break_text_node } from '../../lib/transforms.svelte.js';

// =========================================================================
// #14 — Word deletion
// deleteWordBackward / deleteWordForward currently delete single characters
// instead of whole words.
// =========================================================================
describe('GitHub #14 — Word deletion', () => {
	it.fails('#14 — deleteWordBackward SHOULD delete previous word (currently deletes 1 char)', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		// "Hello world" — cursor after "Hello"
		set_text_selection(session, 'text_1', 'content', 5, 5);
		await tick();
		await wait(10);

		canvas.dispatchEvent(new InputEvent('beforeinput', {
			inputType: 'deleteWordBackward', bubbles: true, cancelable: true
		}));
		await tick();

		// CORRECT: should delete "Hello" → " world"
		expect(session.get('text_1').content.text).toBe(' world');
	});

	it.fails('#14 — deleteWordForward SHOULD delete next word (currently deletes 1 char)', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		// "Hello world" — cursor after "Hello "
		set_text_selection(session, 'text_1', 'content', 6, 6);
		await tick();
		await wait(10);

		canvas.dispatchEvent(new InputEvent('beforeinput', {
			inputType: 'deleteWordForward', bubbles: true, cancelable: true
		}));
		await tick();

		// CORRECT: should delete "world" → "Hello "
		expect(session.get('text_1').content.text).toBe('Hello ');
	});
});

// =========================================================================
// #199 — Cut of image property does not remove image
// delete_selection is a no-op for property selections, so cut only copies.
// =========================================================================
describe('GitHub #199 — Cut image property', () => {
	it.fails('#199 — cut on property selection SHOULD clear the property value', async () => {
		const session = create_session(create_mixed_doc);
		const { canvas } = await render_editor(session);

		set_property_selection(session, ['page_1', 'body', 0, 'image']);
		await tick();

		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_cut(canvas, clipboard);
		await tick();
		await wait(20);

		expect(clipboard.getData('text/plain')).toBe('https://example.com/img.jpg');

		// CORRECT: after cut, image should be cleared
		expect(session.get('story_1').image).toBe('');
	});
});

// =========================================================================
// #143 — tr.create should fall back to defaults like tr.build
// =========================================================================
describe('GitHub #143 — tr.create vs tr.build defaults', () => {
	it.fails('#143 — tr.create SHOULD accept node with missing optional properties', () => {
		const session = create_session();
		const tr = session.tr;
		const id = nanoid();

		// CORRECT: this should succeed, filling layout with default 0
		tr.create({ id, type: 'text', content: { text: '', annotations: [] } });
		expect(tr.get(id).layout).toBe(0);
	});

	it('#143 — tr.build fills defaults (existing behavior, for contrast)', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 0, 0);
		const tr = session.tr;
		const new_id = tr.build('tpl', {
			tpl: { id: 'tpl', type: 'text', content: { text: '', annotations: [] } }
		});
		expect(tr.get(new_id).layout).toBe(0);
	});
});

// =========================================================================
// #136 — HTML export doesn't include annotation tags
// =========================================================================
describe('GitHub #136 — Annotations in HTML export', () => {
	it.fails('#136 — HTML fallback SHOULD contain <strong>/<em> tags for annotations', async () => {
		const session = create_session(create_annotated_doc);
		const { canvas } = await render_editor(session);

		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();

		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		const html = clipboard.getData('text/html');
		// CORRECT: fallback HTML should render annotation tags
		expect(html).toContain('<strong>');
	});
});

// =========================================================================
// #138 — Paste incompatible block node: no auto-wrap in valid parent
// =========================================================================
describe('GitHub #138 — Paste block node auto-wrap', () => {
	it('#138 — text-kind nodes auto-convert on paste (works correctly)', async () => {
		const session = create_session(create_mixed_doc);
		const { canvas } = await render_editor(session);

		session.selection = { type: 'node', path: ['page_1', 'body', 2, 'list_items'], anchor_offset: 0, focus_offset: 1 };
		await tick();
		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		set_node_selection(session, ['page_1', 'body'], 4, 4);
		await tick();
		dispatch_paste(canvas, clipboard);
		await tick();
		await wait(30);

		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(5);
		expect(session.get(body[4]).type).toBe('text');
	});

	it.fails('#138 — block-kind paste SHOULD auto-wrap in valid parent container', async () => {
		const session = create_session(create_mixed_doc);
		const { canvas } = await render_editor(session);

		session.selection = { type: 'node', path: ['page_1', 'body', 0, 'buttons'], anchor_offset: 0, focus_offset: 1 };
		await tick();
		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		const body_before = session.get(['page_1', 'body']).length;
		set_node_selection(session, ['page_1', 'body'], 4, 4);
		await tick();
		dispatch_paste(canvas, clipboard);
		await tick();
		await wait(30);

		// CORRECT: should auto-wrap button in a story node and insert
		expect(session.get(['page_1', 'body']).length).toBe(body_before + 1);
	});
});

// =========================================================================
// #188 — Extra properties cause errors during cascade delete
// =========================================================================
describe('GitHub #188 — property_type throws on undeclared properties', () => {
	it('#188 — property_type throws for properties not in schema', () => {
		const session = create_session();
		expect(() => session.property_type('text', 'undeclared_prop')).toThrow(
			'Property undeclared_prop not found in type text'
		);
	});
});

// =========================================================================
// #18 — Exit Break (Cmd+Enter) not implemented
// =========================================================================
describe('GitHub #18 — Exit Break', () => {
	it('#18 — no meta+enter / ctrl+enter binding exists in keymap', async () => {
		const session = create_session();
		await render_editor(session);
		await tick();

		const has_exit_break = Object.keys(session.keymap).some(
			(k) => k.includes('meta+enter') || k.includes('ctrl+enter')
		);
		expect(has_exit_break).toBe(false);
	});
});

// =========================================================================
// #130 — Schema doesn't distinguish required vs optional
// =========================================================================
describe('GitHub #130 — Schema required/optional', () => {
	it('#130 — all schema properties are required (no optional support)', () => {
		const session = create_session();
		expect(() => {
			session.tr.create({ id: nanoid(), type: 'text', content: { text: '', annotations: [] } });
		}).toThrow();
	});
});

// =========================================================================
// #60 — Shared nodes: cutting one reference preserves the node
// =========================================================================
describe('GitHub #60 — Shared node cut', () => {
	it('#60 — cut one reference of doubly-referenced node preserves it', async () => {
		const session = create_session();
		const tr = session.tr;
		tr.set(['page_1', 'body'], ['text_1', 'text_1', 'text_2', 'text_3']);
		session.apply(tr);

		const { canvas } = await render_editor(session);
		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();

		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_cut(canvas, clipboard);
		await tick();
		await wait(20);

		expect(session.get('text_1')).toBeDefined();
		expect(session.get(['page_1', 'body'])).toEqual(['text_1', 'text_2', 'text_3']);
	});
});

// =========================================================================
// #67 — Arrow key navigation (missing feature)
// =========================================================================
describe('GitHub #67 — Arrow navigation', () => {
	it('#67 — no plain arrow key commands in keymap', async () => {
		const session = create_session();
		await render_editor(session);
		await tick();

		const has_plain_arrow = Object.keys(session.keymap).some(
			(k) => /^(arrow|escape)/.test(k.split(',')[0].trim()) === false &&
				k.split(',').some((alt) => /^arrow/.test(alt.trim()))
		);
		expect(has_plain_arrow).toBe(false);
	});
});

// =========================================================================
// #77 — Enter at end of annotated text
// =========================================================================
describe('GitHub #77 — Enter at end of annotated text', () => {
	it('#77 — break at end creates new node with text cursor', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 30, 30);

		const tr = session.tr;
		break_text_node(tr);
		session.apply(tr);

		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(3);
		const new_node = session.get(body[1]);
		expect(new_node.content.text).toBe('');
		expect(session.selection.type).toBe('text');
	});
});
