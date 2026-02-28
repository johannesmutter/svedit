/**
 * Lab test suite — Real browser selection tests
 *
 * These tests set DOM selections programmatically using the browser's
 * Selection API, then trigger selectionchange to verify the DOM→model
 * mapping works correctly. This catches bugs that model-only tests miss.
 *
 * Technique: instead of setting session.selection (model → DOM),
 * we set window.getSelection() ranges (DOM → model) and fire
 * document selectionchange events.
 */
import { describe, it, expect } from 'vitest';
import {
	create_session,
	create_text_doc,
	create_annotated_doc,
	create_mixed_doc,
	create_single_empty_text_doc,
	set_text_selection,
	set_node_selection,
	render_editor,
	tick,
	wait
} from './helpers.js';

/**
 * Set a DOM selection range on specific text content within an element,
 * then fire selectionchange so the model picks it up.
 */
function set_dom_text_range(container, data_path, start_offset, end_offset) {
	const el = container.querySelector(`[data-type="text"][data-path="${data_path}"]`);
	if (!el) throw new Error(`No text element found for path: ${data_path}`);

	const text_node = find_first_text_node(el);
	if (!text_node) throw new Error(`No text node found in: ${data_path}`);

	const sel = window.getSelection();
	sel.removeAllRanges();
	const range = document.createRange();
	range.setStart(text_node, start_offset);
	range.setEnd(text_node, end_offset);
	sel.addRange(range);

	document.dispatchEvent(new Event('selectionchange'));
}

/**
 * Set a DOM selection that spans from one text element to another,
 * simulating a cross-node drag selection.
 */
function set_dom_cross_node_range(container, start_path, start_offset, end_path, end_offset) {
	const start_el = container.querySelector(`[data-type="text"][data-path="${start_path}"]`);
	const end_el = container.querySelector(`[data-type="text"][data-path="${end_path}"]`);
	if (!start_el || !end_el) throw new Error('Elements not found');

	const start_text = find_first_text_node(start_el);
	const end_text = find_first_text_node(end_el);
	if (!start_text || !end_text) throw new Error('Text nodes not found');

	const sel = window.getSelection();
	sel.removeAllRanges();
	const range = document.createRange();
	range.setStart(start_text, start_offset);
	range.setEnd(end_text, end_offset);
	sel.addRange(range);

	document.dispatchEvent(new Event('selectionchange'));
}

function find_first_text_node(el) {
	for (const child of el.childNodes) {
		if (child.nodeType === Node.TEXT_NODE && child.textContent.length > 0) return child;
		if (child.nodeType === Node.ELEMENT_NODE) {
			const found = find_first_text_node(child);
			if (found) return found;
		}
	}
	return null;
}

describe('DOM→model: text selection via browser Selection API', () => {
	it('collapsed DOM cursor maps to collapsed model text selection', async () => {
		const session = create_session();
		const { container, canvas } = await render_editor(session);
		canvas.focus();
		await tick();
		await wait(20);

		set_dom_text_range(container, 'page_1.body.0.content', 3, 3);
		await tick();
		await wait(20);

		expect(session.selection).not.toBeNull();
		expect(session.selection.type).toBe('text');
		expect(session.selection.anchor_offset).toBe(3);
		expect(session.selection.focus_offset).toBe(3);
	});

	it('expanded DOM selection maps to expanded model text selection', async () => {
		const session = create_session();
		const { container, canvas } = await render_editor(session);
		canvas.focus();
		await tick();
		await wait(20);

		set_dom_text_range(container, 'page_1.body.0.content', 0, 5);
		await tick();
		await wait(20);

		expect(session.selection.type).toBe('text');
		const start = Math.min(session.selection.anchor_offset, session.selection.focus_offset);
		const end = Math.max(session.selection.anchor_offset, session.selection.focus_offset);
		expect(start).toBe(0);
		expect(end).toBe(5);
	});

	it('DOM selection in second text node maps to correct model path', async () => {
		const session = create_session();
		const { container, canvas } = await render_editor(session);
		canvas.focus();
		await tick();
		await wait(20);

		set_dom_text_range(container, 'page_1.body.1.content', 0, 6);
		await tick();
		await wait(20);

		expect(session.selection.type).toBe('text');
		expect(session.selection.path).toEqual(['page_1', 'body', '1', 'content']);
	});

	it('DOM cursor at end of text maps to correct model offset', async () => {
		const session = create_session();
		const { container, canvas } = await render_editor(session);
		canvas.focus();
		await tick();
		await wait(20);

		const el = container.querySelector('[data-type="text"][data-path="page_1.body.0.content"]');
		const text_node = find_first_text_node(el);
		const text_length = text_node.textContent.length;

		const sel = window.getSelection();
		sel.removeAllRanges();
		const range = document.createRange();
		range.setStart(text_node, text_length);
		range.setEnd(text_node, text_length);
		sel.addRange(range);
		document.dispatchEvent(new Event('selectionchange'));
		await tick();
		await wait(20);

		expect(session.selection.type).toBe('text');
		expect(session.selection.anchor_offset).toBe(11);
	});
});

describe('DOM→model: cross-node selection', () => {
	it('selection spanning two text nodes maps to node selection', async () => {
		const session = create_session();
		const { container, canvas } = await render_editor(session);
		canvas.focus();
		await tick();
		await wait(20);

		set_dom_cross_node_range(
			container,
			'page_1.body.0.content', 3,
			'page_1.body.1.content', 5
		);
		await tick();
		await wait(20);

		// Cross-node text selection should map to a node or text selection
		expect(session.selection).not.toBeNull();
		expect(['node', 'text'].includes(session.selection.type)).toBe(true);
	});
});

describe('DOM→model: node cursor traps', () => {
	it('clicking position-zero cursor trap maps to node cursor at 0', async () => {
		const session = create_session();
		const { container, canvas } = await render_editor(session);
		canvas.focus();
		await tick();
		await wait(20);

		const trap = container.querySelector('.position-zero-cursor-trap .svedit-selectable');
		expect(trap).not.toBeNull();

		const sel = window.getSelection();
		sel.removeAllRanges();
		const range = document.createRange();
		range.selectNodeContents(trap);
		range.collapse(false);
		sel.addRange(range);
		document.dispatchEvent(new Event('selectionchange'));
		await tick();
		await wait(20);

		expect(session.selection).not.toBeNull();
		expect(session.selection.type).toBe('node');
		expect(session.selection.anchor_offset).toBe(0);
		expect(session.selection.focus_offset).toBe(0);
	});

	it('clicking after-node cursor trap maps to node cursor after that node', async () => {
		const session = create_session();
		const { container, canvas } = await render_editor(session);
		canvas.focus();
		await tick();
		await wait(20);

		const first_node = container.querySelector('[data-path="page_1.body.0"]');
		expect(first_node).not.toBeNull();
		const trap = first_node.querySelector('.after-node-cursor-trap .svedit-selectable');
		expect(trap).not.toBeNull();

		const sel = window.getSelection();
		sel.removeAllRanges();
		const range = document.createRange();
		range.selectNodeContents(trap);
		range.collapse(false);
		sel.addRange(range);
		document.dispatchEvent(new Event('selectionchange'));
		await tick();
		await wait(20);

		expect(session.selection).not.toBeNull();
		expect(session.selection.type).toBe('node');
		expect(session.selection.anchor_offset).toBe(1);
		expect(session.selection.focus_offset).toBe(1);
	});
});

describe('DOM→model: annotation-aware selection', () => {
	it('DOM cursor inside <strong> element maps to correct text offset', async () => {
		const session = create_session(create_annotated_doc);
		const { container, canvas } = await render_editor(session);
		canvas.focus();
		await tick();
		await wait(20);

		const strong_el = container.querySelector('[data-path="page_1.body.0.content"] strong');
		expect(strong_el).not.toBeNull();
		const text_node = find_first_text_node(strong_el);
		expect(text_node).not.toBeNull();

		const sel = window.getSelection();
		sel.removeAllRanges();
		const range = document.createRange();
		range.setStart(text_node, 2);
		range.setEnd(text_node, 2);
		sel.addRange(range);
		document.dispatchEvent(new Event('selectionchange'));
		await tick();
		await wait(20);

		expect(session.selection.type).toBe('text');
		// Cursor at offset 2 inside "bold" → global offset = 6 + 2 = 8
		expect(session.selection.anchor_offset).toBe(8);
	});

	it('DOM selection spanning annotation boundary maps to correct offsets', async () => {
		const session = create_session(create_annotated_doc);
		const { container, canvas } = await render_editor(session);
		canvas.focus();
		await tick();
		await wait(20);

		const text_el = container.querySelector('[data-path="page_1.body.0.content"]');
		expect(text_el).not.toBeNull();
		const first_text = find_first_text_node(text_el);
		expect(first_text).not.toBeNull();
		const strong_el = text_el.querySelector('strong');
		expect(strong_el).not.toBeNull();
		const strong_text = find_first_text_node(strong_el);
		expect(strong_text).not.toBeNull();

		const sel = window.getSelection();
		sel.removeAllRanges();
		const range = document.createRange();
		range.setStart(first_text, 3);
		range.setEnd(strong_text, 2);
		sel.addRange(range);
		document.dispatchEvent(new Event('selectionchange'));
		await tick();
		await wait(20);

		expect(session.selection.type).toBe('text');
		const start = Math.min(session.selection.anchor_offset, session.selection.focus_offset);
		const end = Math.max(session.selection.anchor_offset, session.selection.focus_offset);
		expect(start).toBe(3);
		expect(end).toBe(8);
	});
});

describe('DOM→model: empty text node', () => {
	it('cursor in empty text node maps to offset 0', async () => {
		const session = create_session(create_single_empty_text_doc);
		const { container, canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 0, 0);
		await tick();
		await wait(20);

		canvas.focus();
		await tick();
		await wait(20);

		expect(session.selection.type).toBe('text');
		expect(session.selection.anchor_offset).toBe(0);
	});
});

describe('Model→DOM→Model round-trip', () => {
	it('setting model selection, reading DOM, then reading model back is consistent', async () => {
		const session = create_session();
		await render_editor(session);

		set_text_selection(session, 'text_1', 'content', 3, 7);
		await tick();
		await wait(30);

		const dom_sel = window.getSelection();
		expect(dom_sel.toString()).toBe('lo w');

		expect(session.selection.type).toBe('text');
		const start = Math.min(session.selection.anchor_offset, session.selection.focus_offset);
		const end = Math.max(session.selection.anchor_offset, session.selection.focus_offset);
		expect(start).toBe(3);
		expect(end).toBe(7);
	});
});
