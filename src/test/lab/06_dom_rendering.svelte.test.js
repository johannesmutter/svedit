/**
 * Lab test suite batch 2 — DOM rendering, fragments, placeholders, empty states
 *
 * Tests 101–120: Verifies that the Svelte components render correct DOM structure,
 * data attributes, CSS classes, text content, placeholders, and annotation fragments.
 */
import { describe, it, expect } from 'vitest';
import {
	create_session,
	create_text_doc,
	create_annotated_doc,
	create_mixed_doc,
	create_empty_doc,
	create_single_empty_text_doc,
	set_text_selection,
	set_node_selection,
	set_property_selection,
	render_editor,
	tick,
	wait
} from './helpers.js';

describe('DOM rendering — text nodes', () => {
	// 101
	it('101 — text node renders with data-type="node" and data-path', async () => {
		const session = create_session();
		const { container } = await render_editor(session);

		const node_el = container.querySelector('[data-node-id="text_1"]');
		expect(node_el).not.toBeNull();
		expect(node_el.dataset.type).toBe('node');
		expect(node_el.dataset.path).toBe('page_1.body.0');
	});

	// 102
	it('102 — text property renders with data-type="text" and correct text', async () => {
		const session = create_session();
		const { container } = await render_editor(session);

		const text_el = container.querySelector('[data-type="text"][data-path="page_1.body.0.content"]');
		expect(text_el).not.toBeNull();
		expect(text_el.textContent).toContain('Hello world');
	});

	// 103
	it('103 — empty text node renders with "empty" CSS class', async () => {
		const session = create_session(create_single_empty_text_doc);
		const { container } = await render_editor(session);

		const text_el = container.querySelector('[data-type="text"]');
		expect(text_el).not.toBeNull();
		expect(text_el.classList.contains('empty')).toBe(true);
	});

	// 104
	it('104 — non-empty text node does not have "empty" class', async () => {
		const session = create_session();
		const { container } = await render_editor(session);

		const text_el = container.querySelector('[data-type="text"][data-path="page_1.body.0.content"]');
		expect(text_el.classList.contains('empty')).toBe(false);
	});

	// 105
	it('105 — multiple text nodes render in correct order', async () => {
		const session = create_session();
		const { container } = await render_editor(session);

		const text_els = container.querySelectorAll('[data-type="text"]');
		expect(text_els.length).toBe(3);
		expect(text_els[0].textContent).toContain('Hello world');
		expect(text_els[1].textContent).toContain('Second paragraph');
		expect(text_els[2].textContent).toContain('Third paragraph');
	});

	// 106
	it('106 — focused text node gets "focused" CSS class', async () => {
		const session = create_session();
		const { container } = await render_editor(session);

		set_text_selection(session, 'text_1', 'content', 3, 3);
		await tick();
		await wait(30);

		const text_el = container.querySelector('[data-path="page_1.body.0.content"]');
		expect(text_el.classList.contains('focused')).toBe(true);
	});

	// 107
	it('107 — unfocused text node does not have "focused" class', async () => {
		const session = create_session();
		const { container } = await render_editor(session);

		set_text_selection(session, 'text_1', 'content', 3, 3);
		await tick();
		await wait(20);

		const text_el2 = container.querySelector('[data-path="page_1.body.1.content"]');
		expect(text_el2.classList.contains('focused')).toBe(false);
	});
});

describe('DOM rendering — annotations', () => {
	// 108
	it('108 — annotated text renders annotation inline elements', async () => {
		const session = create_session(create_annotated_doc);
		const { container } = await render_editor(session);

		const text_el = container.querySelector('[data-path="page_1.body.0.content"]');
		expect(text_el).not.toBeNull();
		expect(text_el.innerHTML).toContain('bold');
		expect(text_el.innerHTML).toContain('italic');
	});

	// 109
	it('109 — text before first annotation renders as plain text node', async () => {
		const session = create_session(create_annotated_doc);
		const { container } = await render_editor(session);

		const text_el = container.querySelector('[data-path="page_1.body.0.content"]');
		expect(text_el.textContent).toContain('Hello');
	});

	// 110
	it('110 — annotated text element contains the annotation text content', async () => {
		const session = create_session(create_annotated_doc);
		const { container } = await render_editor(session);

		const text_el = container.querySelector('[data-path="page_1.body.0.content"]');
		const full_text = text_el.textContent;
		expect(full_text).toContain('bold');
		expect(full_text).toContain('italic');
		expect(full_text).toContain('linked');
	});
});

describe('DOM rendering — node array containers', () => {
	// 111
	it('111 — node_array renders with data-type="node_array"', async () => {
		const session = create_session();
		const { container } = await render_editor(session);

		const na = container.querySelector('[data-type="node_array"][data-path="page_1.body"]');
		expect(na).not.toBeNull();
	});

	// 112
	it('112 — node_array children count matches body length', async () => {
		const session = create_session();
		const { container } = await render_editor(session);

		const na = container.querySelector('[data-type="node_array"][data-path="page_1.body"]');
		const children = na.querySelectorAll(':scope > [data-type="node"]');
		expect(children.length).toBe(3);
	});

	// 113
	it('113 — empty node_array renders empty-node-array element when editable', async () => {
		const session = create_session(create_empty_doc);
		const { container } = await render_editor(session);

		const empty = container.querySelector('.empty-node-array');
		expect(empty).not.toBeNull();
	});
});

describe('DOM rendering — cursor traps', () => {
	// 114
	it('114 — first node in array has position-zero-cursor-trap', async () => {
		const session = create_session();
		const { container } = await render_editor(session);

		const first_node = container.querySelector('[data-path="page_1.body.0"]');
		const trap = first_node.querySelector('.position-zero-cursor-trap');
		expect(trap).not.toBeNull();
	});

	// 115
	it('115 — each node has an after-node-cursor-trap', async () => {
		const session = create_session();
		const { container } = await render_editor(session);

		const nodes = container.querySelectorAll('[data-type="node_array"][data-path="page_1.body"] > [data-type="node"]');
		for (const node of nodes) {
			const trap = node.querySelector('.after-node-cursor-trap');
			expect(trap).not.toBeNull();
		}
	});

	// 116
	it('116 — cursor trap contains a svedit-selectable element', async () => {
		const session = create_session();
		const { container } = await render_editor(session);

		const trap = container.querySelector('.after-node-cursor-trap');
		const selectable = trap.querySelector('.svedit-selectable');
		expect(selectable).not.toBeNull();
	});
});

describe('DOM rendering — mixed content', () => {
	// 117
	it('117 — story node renders with correct data-node-id', async () => {
		const session = create_session(create_mixed_doc);
		const { container } = await render_editor(session);

		const story = container.querySelector('[data-node-id="story_1"]');
		expect(story).not.toBeNull();
		expect(story.dataset.type).toBe('node');
	});

	// 118
	it('118 — list node renders its list items', async () => {
		const session = create_session(create_mixed_doc);
		const { container } = await render_editor(session);

		const list_items_container = container.querySelector('[data-path="page_1.body.2.list_items"]');
		expect(list_items_container).not.toBeNull();
		const items = list_items_container.querySelectorAll('[data-type="node"]');
		expect(items.length).toBe(3);
	});

	// 119
	it('119 — property element renders with data-type="property"', async () => {
		const session = create_session(create_mixed_doc);
		const { container } = await render_editor(session);

		const prop = container.querySelector('[data-type="property"]');
		expect(prop).not.toBeNull();
	});

	// 120
	it('120 — contenteditable is set to true on canvas when editable', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);

		expect(canvas.getAttribute('contenteditable')).toBe('true');
	});
});
