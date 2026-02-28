/**
 * Lab test suite — Selection system, navigation, DOM mapping & edge cases
 *
 * Covers: text selection types, node selection types, property selection,
 * DOM ↔ model mapping, selection validation, backwards selections,
 * can_insert checks, traverse, to_json, get_selected helpers, session.get path resolution,
 * schema inspection, and various edge cases.
 */
import { describe, it, expect } from 'vitest';
import {
	create_session,
	create_text_doc,
	create_mixed_doc,
	create_annotated_doc,
	create_empty_doc,
	create_single_empty_text_doc,
	set_text_selection,
	set_text_selection_by_path,
	set_node_selection,
	set_property_selection,
	render_editor,
	create_mock_clipboard,
	dispatch_copy,
	dispatch_paste,
	tick,
	wait,
	nanoid
} from './helpers.js';

describe('Selection system', () => {
	// -----------------------------------------------------------------------
	// 91. Collapsed text selection (cursor)
	// -----------------------------------------------------------------------
	it('91 — collapsed text selection has matching anchor and focus', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 5, 5);

		expect(session.selection.type).toBe('text');
		expect(session.selection.anchor_offset).toBe(5);
		expect(session.selection.focus_offset).toBe(5);
	});

	// -----------------------------------------------------------------------
	// 92. Expanded text selection
	// -----------------------------------------------------------------------
	it('92 — expanded text selection spans a character range', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 5);

		expect(session.selection.type).toBe('text');
		expect(session.selection.anchor_offset).toBe(0);
		expect(session.selection.focus_offset).toBe(5);
	});

	// -----------------------------------------------------------------------
	// 93. Backwards text selection (focus < anchor)
	// -----------------------------------------------------------------------
	it('93 — backwards text selection is preserved', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 8, 3);

		expect(session.selection.anchor_offset).toBe(8);
		expect(session.selection.focus_offset).toBe(3);
	});

	// -----------------------------------------------------------------------
	// 94. Node selection — collapsed cursor between nodes
	// -----------------------------------------------------------------------
	it('94 — collapsed node cursor has matching anchor and focus', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 1, 1);

		expect(session.selection.type).toBe('node');
		expect(session.selection.anchor_offset).toBe(1);
		expect(session.selection.focus_offset).toBe(1);
	});

	// -----------------------------------------------------------------------
	// 95. Node selection — single node selected
	// -----------------------------------------------------------------------
	it('95 — single node selection spans one node', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 0, 1);

		const selected = session.get_selected_nodes();
		expect(selected.length).toBe(1);
		expect(selected[0]).toBe('text_1');
	});

	// -----------------------------------------------------------------------
	// 96. Node selection — multiple nodes selected
	// -----------------------------------------------------------------------
	it('96 — multi-node selection spans multiple nodes', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 0, 3);

		const selected = session.get_selected_nodes();
		expect(selected.length).toBe(3);
	});

	// -----------------------------------------------------------------------
	// 97. Property selection
	// -----------------------------------------------------------------------
	it('97 — property selection addresses a specific property', () => {
		const session = create_session(create_mixed_doc);
		set_property_selection(session, ['page_1', 'body', 0, 'image']);

		expect(session.selection.type).toBe('property');
		expect(session.selection.path).toEqual(['page_1', 'body', 0, 'image']);
	});

	// -----------------------------------------------------------------------
	// 98. selected_node for single node selection
	// -----------------------------------------------------------------------
	it('98 — selected_node returns the node for single-node selection', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 0, 1);

		const node = session.selected_node;
		expect(node).not.toBeNull();
		expect(node.id).toBe('text_1');
	});

	// -----------------------------------------------------------------------
	// 99. selected_node returns null for multi-node selection
	// -----------------------------------------------------------------------
	it('99 — selected_node is null for multi-node selection', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 0, 2);

		expect(session.selected_node).toBeNull();
	});

	// -----------------------------------------------------------------------
	// 100. selected_node for text selection returns owning node
	// -----------------------------------------------------------------------
	it('100 — selected_node for text selection returns owning node', () => {
		const session = create_session();
		set_text_selection(session, 'text_2', 'content', 3, 3);

		const node = session.selected_node;
		expect(node).not.toBeNull();
		expect(node.id).toBe('text_2');
	});
});

describe('Navigation & DOM mapping', () => {
	// -----------------------------------------------------------------------
	// Node cursor maps to DOM cursor trap
	// -----------------------------------------------------------------------
	it('node cursor maps to DOM cursor trap element', async () => {
		const session = create_session();
		await render_editor(session);
		set_node_selection(session, ['page_1', 'body'], 1, 1);
		await tick();
		await wait(20);

		const dom_sel = window.getSelection();
		expect(dom_sel).not.toBeNull();
		expect(dom_sel.isCollapsed).toBe(true);
	});

	// -----------------------------------------------------------------------
	// Text selection maps to DOM selection
	// -----------------------------------------------------------------------
	it('text selection maps to DOM range', async () => {
		const session = create_session();
		await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 2, 7);
		await tick();
		await wait(20);

		const dom_sel = window.getSelection();
		expect(dom_sel).not.toBeNull();
		expect(dom_sel.isCollapsed).toBe(false);
	});

	// -----------------------------------------------------------------------
	// Property selection maps to DOM property element
	// -----------------------------------------------------------------------
	it('property selection focuses the property cursor trap', async () => {
		const session = create_session(create_mixed_doc);
		await render_editor(session);
		set_property_selection(session, ['page_1', 'body', 0, 'image']);
		await tick();
		await wait(20);

		const dom_sel = window.getSelection();
		expect(dom_sel).not.toBeNull();
	});
});

describe('Session API', () => {
	// -----------------------------------------------------------------------
	// session.get with string ID
	// -----------------------------------------------------------------------
	it('session.get(string) returns node by ID', () => {
		const session = create_session();
		const node = session.get('text_1');
		expect(node.id).toBe('text_1');
		expect(node.type).toBe('text');
	});

	// -----------------------------------------------------------------------
	// session.get with path resolves nested properties
	// -----------------------------------------------------------------------
	it('session.get(path) resolves nested path', () => {
		const session = create_session(create_mixed_doc);
		const items = session.get(['page_1', 'body', 2, 'list_items']);
		expect(items).toEqual(['list_item_1', 'list_item_2', 'list_item_3']);
	});

	// -----------------------------------------------------------------------
	// session.inspect returns property metadata
	// -----------------------------------------------------------------------
	it('session.inspect returns property type info', () => {
		const session = create_session();
		const info = session.inspect(['page_1', 'body']);
		expect(info.type).toBe('node_array');
		expect(info.node_types).toContain('text');
	});

	// -----------------------------------------------------------------------
	// session.kind returns node kind
	// -----------------------------------------------------------------------
	it('session.kind returns correct node kinds', () => {
		const session = create_session(create_mixed_doc);
		expect(session.kind(session.get('text_1'))).toBe('text');
		expect(session.kind(session.get('story_1'))).toBe('block');
		expect(session.kind(session.get('list_1'))).toBe('block');
		expect(session.kind(session.get('list_item_1'))).toBe('text');
	});

	// -----------------------------------------------------------------------
	// session.can_insert checks node type compatibility
	// -----------------------------------------------------------------------
	it('session.can_insert checks node type against schema', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 0, 0);

		expect(session.can_insert('text')).toBe(true);
		expect(session.can_insert('story')).toBe(true);
		expect(session.can_insert('list')).toBe(true);
		expect(session.can_insert('button')).toBe(false);
	});

	// -----------------------------------------------------------------------
	// session.traverse returns depth-first nodes
	// -----------------------------------------------------------------------
	it('session.traverse returns all reachable nodes depth-first', () => {
		const session = create_session(create_mixed_doc);
		const nodes = session.traverse('list_1');

		expect(nodes.length).toBe(4);
		expect(nodes[0].id).toBe('list_item_1');
		expect(nodes[1].id).toBe('list_item_2');
		expect(nodes[2].id).toBe('list_item_3');
		expect(nodes[3].id).toBe('list_1');
	});

	// -----------------------------------------------------------------------
	// session.to_json returns clean document
	// -----------------------------------------------------------------------
	it('session.to_json returns all reachable nodes', () => {
		const session = create_session(create_mixed_doc);
		const json = session.to_json();

		expect(json.document_id).toBe('page_1');
		expect(Object.keys(json.nodes).length).toBeGreaterThanOrEqual(8);
		expect(json.nodes.page_1).toBeDefined();
		expect(json.nodes.story_1).toBeDefined();
	});

	// -----------------------------------------------------------------------
	// session.count_references
	// -----------------------------------------------------------------------
	it('session.count_references counts node references', () => {
		const session = create_session();
		expect(session.count_references('text_1')).toBe(1);
	});

	// -----------------------------------------------------------------------
	// session.get_selected_plain_text
	// -----------------------------------------------------------------------
	it('session.get_selected_plain_text extracts selected text', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 6, 11);

		expect(session.get_selected_plain_text()).toBe('world');
	});

	// -----------------------------------------------------------------------
	// session.get_selected_annotated_text with annotations
	// -----------------------------------------------------------------------
	it('session.get_selected_annotated_text includes annotations in range', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 6, 10);

		const result = session.get_selected_annotated_text();
		expect(result.text).toBe('bold');
		expect(result.annotations.length).toBe(1);
		expect(result.annotations[0].start_offset).toBe(0);
		expect(result.annotations[0].end_offset).toBe(4);
	});

	// -----------------------------------------------------------------------
	// session.property_type
	// -----------------------------------------------------------------------
	it('session.property_type returns schema property type', () => {
		const session = create_session();
		expect(session.property_type('page', 'body')).toBe('node_array');
		expect(session.property_type('text', 'content')).toBe('annotated_text');
		expect(session.property_type('text', 'layout')).toBe('integer');
	});

	// -----------------------------------------------------------------------
	// session.document_id
	// -----------------------------------------------------------------------
	it('session.document_id returns the root document id', () => {
		const session = create_session();
		expect(session.document_id).toBe('page_1');
	});

	// -----------------------------------------------------------------------
	// session.generate_id produces unique IDs
	// -----------------------------------------------------------------------
	it('session.generate_id produces unique IDs', () => {
		const session = create_session();
		const ids = new Set();
		for (let i = 0; i < 100; i++) ids.add(session.generate_id());
		expect(ids.size).toBe(100);
	});
});

describe('Edge cases', () => {
	// -----------------------------------------------------------------------
	// Empty document body
	// -----------------------------------------------------------------------
	it('empty body document has no nodes', () => {
		const session = create_session(create_empty_doc);
		expect(session.get(['page_1', 'body'])).toEqual([]);
	});

	// -----------------------------------------------------------------------
	// Insert into empty body via insert_default_node
	// -----------------------------------------------------------------------
	it('insert_default_node into empty body creates first node', () => {
		const session = create_session(create_empty_doc);
		set_node_selection(session, ['page_1', 'body'], 0, 0);

		const tr = session.tr;
		session.config.inserters.text(tr);
		session.apply(tr);

		expect(session.get(['page_1', 'body']).length).toBe(1);
	});

	// -----------------------------------------------------------------------
	// Copy text selection
	// -----------------------------------------------------------------------
	it('copy text selection writes annotated text to clipboard', async () => {
		const session = create_session(create_annotated_doc);
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 6, 10);
		await tick();

		const clipboard = create_mock_clipboard();
		canvas?.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		const text = clipboard.getData('text/plain');
		expect(text).toBe('bold');

		const html = clipboard.getData('text/html');
		expect(html).toContain('data-svedit=');
	});

	// -----------------------------------------------------------------------
	// Paste plain text at text cursor
	// -----------------------------------------------------------------------
	it('paste plain text inserts at text cursor', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 5, 5);
		await tick();

		const clipboard = create_mock_clipboard();
		clipboard.setData('text/plain', ' beautiful');
		canvas?.focus();
		dispatch_paste(canvas, clipboard);
		await tick();
		await wait(20);

		expect(session.get('text_1').content.text).toBe('Hello beautiful world');
	});

	// -----------------------------------------------------------------------
	// Paste multi-paragraph plain text creates multiple nodes
	// -----------------------------------------------------------------------
	it('paste multi-paragraph plain text creates multiple text nodes', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_node_selection(session, ['page_1', 'body'], 3, 3);
		await tick();

		const clipboard = create_mock_clipboard();
		clipboard.setData('text/plain', 'First para\n\nSecond para');
		canvas?.focus();
		dispatch_paste(canvas, clipboard);
		await tick();
		await wait(20);

		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(5);
	});

	// -----------------------------------------------------------------------
	// Validate document detects no issues on valid doc
	// -----------------------------------------------------------------------
	it('validate_doc succeeds on valid document', () => {
		const session = create_session(create_mixed_doc);
		expect(() => session.validate_doc()).not.toThrow();
	});

	// -----------------------------------------------------------------------
	// Transaction chaining works
	// -----------------------------------------------------------------------
	it('transaction methods are chainable', () => {
		const session = create_session();
		const new_id = nanoid();

		const tr = session.tr;
		tr.create({ id: new_id, type: 'text', layout: 1, content: { text: 'Chain', annotations: [] } })
			.set(['text_1', 'content'], { text: 'Modified', annotations: [] });

		session.apply(tr);
		expect(session.get('text_1').content.text).toBe('Modified');
		expect(session.get(new_id).content.text).toBe('Chain');
	});
});
