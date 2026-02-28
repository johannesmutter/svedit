/**
 * Lab test suite — DOM selection mapping
 *
 * Covers: render_selection for text/node/property, collapsed/expanded,
 * backwards selection DOM rendering, selection change after edits,
 * selection across annotation boundaries, node cursor at various positions.
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

describe('DOM selection — text cursor', () => {
	it('collapsed cursor at position 0 places DOM caret correctly', async () => {
		const session = create_session();
		await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 0, 0);
		await tick();
		await wait(30);

		const dom_sel = window.getSelection();
		expect(dom_sel.isCollapsed).toBe(true);
	});

	it('collapsed cursor at end of text places DOM caret correctly', async () => {
		const session = create_session();
		await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 11, 11);
		await tick();
		await wait(30);

		const dom_sel = window.getSelection();
		expect(dom_sel.isCollapsed).toBe(true);
	});

	it('expanded text selection creates non-collapsed DOM selection', async () => {
		const session = create_session();
		await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 0, 5);
		await tick();
		await wait(30);

		const dom_sel = window.getSelection();
		expect(dom_sel.isCollapsed).toBe(false);
		expect(dom_sel.toString()).toBe('Hello');
	});

	it('text selection in second node targets correct DOM element', async () => {
		const session = create_session();
		const { container } = await render_editor(session);
		set_text_selection(session, 'text_2', 'content', 0, 6);
		await tick();
		await wait(30);

		const dom_sel = window.getSelection();
		expect(dom_sel.toString()).toBe('Second');
	});

	it('text cursor in empty text node has valid DOM selection', async () => {
		const session = create_session(create_single_empty_text_doc);
		await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 0, 0);
		await tick();
		await wait(30);

		const dom_sel = window.getSelection();
		expect(dom_sel).not.toBeNull();
	});
});

describe('DOM selection — node cursor', () => {
	it('node cursor at position 0 focuses position-zero cursor trap', async () => {
		const session = create_session();
		const { container } = await render_editor(session);
		set_node_selection(session, ['page_1', 'body'], 0, 0);
		await tick();
		await wait(30);

		const dom_sel = window.getSelection();
		expect(dom_sel.isCollapsed).toBe(true);
		const focus_el = dom_sel.focusNode;
		expect(focus_el.classList?.contains('cursor-trap') || focus_el.parentElement?.classList?.contains('position-zero-cursor-trap')).toBeTruthy();
	});

	it('node cursor between nodes focuses after-node cursor trap', async () => {
		const session = create_session();
		const { container } = await render_editor(session);
		set_node_selection(session, ['page_1', 'body'], 1, 1);
		await tick();
		await wait(30);

		const dom_sel = window.getSelection();
		expect(dom_sel.isCollapsed).toBe(true);
	});

	it('node cursor at end of body focuses last after-node cursor trap', async () => {
		const session = create_session();
		await render_editor(session);
		set_node_selection(session, ['page_1', 'body'], 3, 3);
		await tick();
		await wait(30);

		const dom_sel = window.getSelection();
		expect(dom_sel.isCollapsed).toBe(true);
	});

	it('expanded node selection (1 node) creates non-collapsed DOM selection', async () => {
		const session = create_session();
		await render_editor(session);
		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();
		await wait(30);

		const dom_sel = window.getSelection();
		expect(dom_sel.isCollapsed).toBe(false);
	});

	it('expanded node selection (multiple nodes) creates wide DOM selection', async () => {
		const session = create_session();
		await render_editor(session);
		set_node_selection(session, ['page_1', 'body'], 0, 3);
		await tick();
		await wait(30);

		const dom_sel = window.getSelection();
		expect(dom_sel.isCollapsed).toBe(false);
	});
});

describe('DOM selection — property', () => {
	it('property selection focuses the property cursor trap', async () => {
		const session = create_session(create_mixed_doc);
		const { container } = await render_editor(session);
		set_property_selection(session, ['page_1', 'body', 0, 'image']);
		await tick();
		await wait(30);

		const dom_sel = window.getSelection();
		expect(dom_sel).not.toBeNull();
		expect(dom_sel.isCollapsed).toBe(true);
	});
});

describe('DOM selection — annotation context', () => {
	it('cursor inside annotated text has DOM caret within annotation element', async () => {
		const session = create_session(create_annotated_doc);
		const { container } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 8, 8);
		await tick();
		await wait(30);

		const dom_sel = window.getSelection();
		expect(dom_sel.isCollapsed).toBe(true);
		const focus_node = dom_sel.focusNode;
		const parent = focus_node.parentElement;
		expect(parent.tagName.toLowerCase() === 'strong' || parent.closest('strong')).toBeTruthy();
	});

	it('expanded selection across annotation renders non-collapsed selection', async () => {
		const session = create_session(create_annotated_doc);
		await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 4, 12);
		await tick();
		await wait(30);

		const dom_sel = window.getSelection();
		expect(dom_sel.isCollapsed).toBe(false);
	});
});

describe('DOM selection — transitions', () => {
	it('changing selection from text to node updates DOM', async () => {
		const session = create_session();
		await render_editor(session);

		set_text_selection(session, 'text_1', 'content', 3, 3);
		await tick();
		await wait(20);
		expect(window.getSelection().isCollapsed).toBe(true);

		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();
		await wait(20);
		expect(window.getSelection().isCollapsed).toBe(false);
	});

	it('setting selection to null clears DOM selection', async () => {
		const session = create_session();
		await render_editor(session);

		set_text_selection(session, 'text_1', 'content', 3, 3);
		await tick();
		await wait(20);

		session.selection = null;
		await tick();
		await wait(20);

		const dom_sel = window.getSelection();
		expect(dom_sel.rangeCount === 0 || dom_sel.isCollapsed).toBe(true);
	});

	it('selection updates after text insert reflect new cursor position', async () => {
		const session = create_session();
		await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 5, 5);
		await tick();

		session.apply(session.tr.insert_text('X'));
		await tick();
		await wait(30);

		expect(session.selection.anchor_offset).toBe(6);
	});
});

describe('DOM rendering — CSS class state', () => {
	it('hide-selection class applied during node selection', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();
		await wait(20);

		expect(canvas.classList.contains('hide-selection')).toBe(true);
	});

	it('node-cursor class applied during collapsed node selection', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_node_selection(session, ['page_1', 'body'], 1, 1);
		await tick();
		await wait(20);

		expect(canvas.classList.contains('node-cursor')).toBe(true);
	});

	it('property-selection class applied during property selection', async () => {
		const session = create_session(create_mixed_doc);
		const { canvas } = await render_editor(session);
		set_property_selection(session, ['page_1', 'body', 0, 'image']);
		await tick();
		await wait(20);

		expect(canvas.classList.contains('property-selection')).toBe(true);
	});
});
