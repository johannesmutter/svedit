/**
 * Lab test suite — Node operations
 *
 * Covers: creating nodes, deleting nodes, inserting nodes at node cursor,
 * break_text_node (Enter), join_text_node (Backspace), insert_default_node,
 * copy/paste of nodes, cut nodes, multi-node selection delete,
 * node reference counting, cascade deletion, and paste with ID remapping.
 */
import { describe, it, expect } from 'vitest';
import {
	create_session,
	create_text_doc,
	create_mixed_doc,
	create_empty_doc,
	create_annotated_doc,
	set_text_selection,
	set_text_selection_by_path,
	set_node_selection,
	render_editor,
	create_mock_clipboard,
	dispatch_copy,
	dispatch_paste,
	dispatch_cut,
	tick,
	wait,
	nanoid
} from './helpers.js';
import { break_text_node, join_text_node, insert_default_node } from '../../lib/transforms.svelte.js';

describe('Node operations', () => {
	// -----------------------------------------------------------------------
	// 41. Break text node (Enter) in the middle of text
	// -----------------------------------------------------------------------
	it('41 — break_text_node splits text at cursor into two nodes', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 5, 5);

		const tr = session.tr;
		const result = break_text_node(tr);
		expect(result).toBe(true);
		session.apply(tr);

		expect(session.get('text_1').content.text).toBe('Hello');
		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(4);
		const new_node_id = body[1];
		expect(session.get(new_node_id).content.text).toBe(' world');
	});

	// -----------------------------------------------------------------------
	// 42. Break text node at beginning creates empty node before
	// -----------------------------------------------------------------------
	it('42 — break_text_node at position 0 creates empty preceding node', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 0);

		const tr = session.tr;
		break_text_node(tr);
		session.apply(tr);

		expect(session.get('text_1').content.text).toBe('');
		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(4);
		expect(session.get(body[1]).content.text).toBe('Hello world');
	});

	// -----------------------------------------------------------------------
	// 43. Break text node at end creates empty node after
	// -----------------------------------------------------------------------
	it('43 — break_text_node at end of text creates empty new node', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 11, 11);

		const tr = session.tr;
		break_text_node(tr);
		session.apply(tr);

		expect(session.get('text_1').content.text).toBe('Hello world');
		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(4);
		expect(session.get(body[1]).content.text).toBe('');
	});

	// -----------------------------------------------------------------------
	// 44. Break text node with expanded selection deletes then splits
	// -----------------------------------------------------------------------
	it('44 — break_text_node with expanded selection deletes selected text then splits', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 3, 8);

		const tr = session.tr;
		break_text_node(tr);
		session.apply(tr);

		expect(session.get('text_1').content.text).toBe('Hel');
		const body = session.get(['page_1', 'body']);
		expect(session.get(body[1]).content.text).toBe('rld');
	});

	// -----------------------------------------------------------------------
	// 45. Break text node on non-text kind returns false
	// -----------------------------------------------------------------------
	it('45 — break_text_node returns false for block nodes', () => {
		const session = create_session(create_mixed_doc);
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 0, 'title'],
			anchor_offset: 3,
			focus_offset: 3
		};

		const tr = session.tr;
		const result = break_text_node(tr);
		expect(result).toBe(false);
	});

	// -----------------------------------------------------------------------
	// 46. Join text node merges two text nodes
	// -----------------------------------------------------------------------
	it('46 — join_text_node merges current text into previous and sets cursor', () => {
		const session = create_session();
		set_text_selection(session, 'text_2', 'content', 0, 0);

		const tr = session.tr;
		const result = join_text_node(tr);
		expect(result).toBe(true);
		session.apply(tr);

		expect(session.get('text_1').content.text).toBe('Hello worldSecond paragraph');
		expect(session.get('text_2')).toBeUndefined();

		expect(session.selection.type).toBe('text');
		expect(session.selection.anchor_offset).toBe(11);
		expect(session.selection.focus_offset).toBe(11);
	});

	// -----------------------------------------------------------------------
	// 47. Join text node deletes empty first node
	// -----------------------------------------------------------------------
	it('47 — join_text_node on empty node at position 0 deletes it', () => {
		const session = create_session();
		const empty_id = nanoid();
		const tr = session.tr;
		tr.create({ id: empty_id, type: 'text', layout: 1, content: { text: '', annotations: [] } });
		tr.set(['page_1', 'body'], [empty_id, 'text_1', 'text_2', 'text_3']);
		session.apply(tr);

		set_text_selection_by_path(session, ['page_1', 'body', 0, 'content'], 0, 0);
		const join_tr = session.tr;
		join_text_node(join_tr);
		session.apply(join_tr);

		expect(session.get(empty_id)).toBeUndefined();
	});

	// -----------------------------------------------------------------------
	// 48. Insert default node at collapsed node cursor
	// -----------------------------------------------------------------------
	it('48 — insert_default_node creates a new text node at collapsed node cursor', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 1, 1);

		const tr = session.tr;
		insert_default_node(tr);
		session.apply(tr);

		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(4);
		const new_id = body[1];
		expect(session.get(new_id).type).toBe('text');
		expect(session.get(new_id).content.text).toBe('');
	});

	// -----------------------------------------------------------------------
	// 49. Delete single node via node selection
	// -----------------------------------------------------------------------
	it('49 — delete single node via expanded node selection', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 0, 1);

		session.apply(session.tr.delete_selection());

		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(2);
		expect(body[0]).toBe('text_2');
		expect(session.get('text_1')).toBeUndefined();
	});

	// -----------------------------------------------------------------------
	// 50. Delete multiple nodes via node selection
	// -----------------------------------------------------------------------
	it('50 — delete multiple nodes via expanded node selection', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 0, 2);

		session.apply(session.tr.delete_selection());

		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(1);
		expect(body[0]).toBe('text_3');
	});

	// -----------------------------------------------------------------------
	// 51. Delete all nodes leaves empty body
	// -----------------------------------------------------------------------
	it('51 — delete all nodes leaves empty body', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 0, 3);

		session.apply(session.tr.delete_selection());

		expect(session.get(['page_1', 'body'])).toEqual([]);
	});

	// -----------------------------------------------------------------------
	// 52. Cascade delete removes child nodes
	// -----------------------------------------------------------------------
	it('52 — deleting a list node cascade-deletes its list items', () => {
		const session = create_session(create_mixed_doc);
		set_node_selection(session, ['page_1', 'body'], 2, 3);

		session.apply(session.tr.delete_selection());

		expect(session.get('list_1')).toBeUndefined();
		expect(session.get('list_item_1')).toBeUndefined();
		expect(session.get('list_item_2')).toBeUndefined();
		expect(session.get('list_item_3')).toBeUndefined();
	});

	// -----------------------------------------------------------------------
	// 53. Cascade delete removes story + button children
	// -----------------------------------------------------------------------
	it('53 — deleting a story cascade-deletes its button children', () => {
		const session = create_session(create_mixed_doc);
		set_node_selection(session, ['page_1', 'body'], 0, 1);

		session.apply(session.tr.delete_selection());

		expect(session.get('story_1')).toBeUndefined();
		expect(session.get('button_1')).toBeUndefined();
	});

	// -----------------------------------------------------------------------
	// 54. Node selection after deletion collapses to start
	// -----------------------------------------------------------------------
	it('54 — node selection collapses to deletion start after delete', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 1, 2);

		session.apply(session.tr.delete_selection());

		expect(session.selection.type).toBe('node');
		expect(session.selection.anchor_offset).toBe(1);
		expect(session.selection.focus_offset).toBe(1);
	});

	// -----------------------------------------------------------------------
	// 55. Create and insert a new node manually
	// -----------------------------------------------------------------------
	it('55 — create + insert_nodes adds a node to the body', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 1, 1);

		const new_id = nanoid();
		const tr = session.tr;
		tr.create({ id: new_id, type: 'text', layout: 1, content: { text: 'Inserted', annotations: [] } });
		tr.insert_nodes([new_id]);
		session.apply(tr);

		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(4);
		expect(body[1]).toBe(new_id);
		expect(session.get(new_id).content.text).toBe('Inserted');
	});

	// -----------------------------------------------------------------------
	// 56. Insert nodes at an expanded selection replaces those nodes
	// -----------------------------------------------------------------------
	it('56 — insert_nodes at expanded selection replaces selected nodes', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 0, 2);

		const new_id = nanoid();
		const tr = session.tr;
		tr.create({ id: new_id, type: 'text', layout: 1, content: { text: 'Replacement', annotations: [] } });
		tr.insert_nodes([new_id]);
		session.apply(tr);

		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(2);
		expect(body[0]).toBe(new_id);
		expect(body[1]).toBe('text_3');
	});

	// -----------------------------------------------------------------------
	// 57. Copy node via clipboard (DOM test)
	// -----------------------------------------------------------------------
	it('57 — copy node writes svedit data to clipboard', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();

		const clipboard = create_mock_clipboard();
		canvas?.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		const html = clipboard.getData('text/html');
		expect(html).toContain('data-svedit=');

		const text = clipboard.getData('text/plain');
		expect(text).toContain('Hello world');
	});

	// -----------------------------------------------------------------------
	// 58. Cut node removes it from document
	// -----------------------------------------------------------------------
	it('58 — cut node removes it from the document', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();

		const clipboard = create_mock_clipboard();
		canvas?.focus();
		dispatch_cut(canvas, clipboard);
		await tick();
		await wait(20);

		expect(session.get(['page_1', 'body']).length).toBe(2);
		expect(session.get('text_1')).toBeUndefined();
	});

	// -----------------------------------------------------------------------
	// 59. Paste node inserts copy with new IDs
	// -----------------------------------------------------------------------
	it('59 — paste node inserts a copy with remapped IDs', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);

		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();
		const clipboard = create_mock_clipboard();
		canvas?.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		set_node_selection(session, ['page_1', 'body'], 3, 3);
		await tick();
		dispatch_paste(canvas, clipboard);
		await tick();
		await wait(20);

		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(4);

		const pasted_id = body[3];
		expect(pasted_id).not.toBe('text_1');
		expect(session.get(pasted_id).content.text).toBe('Hello world');
	});

	// -----------------------------------------------------------------------
	// 60. Paste at expanded node selection replaces those nodes
	// -----------------------------------------------------------------------
	it('60 — paste at expanded node selection replaces the selected nodes', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);

		set_node_selection(session, ['page_1', 'body'], 2, 3);
		await tick();
		const clipboard = create_mock_clipboard();
		canvas?.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();
		dispatch_paste(canvas, clipboard);
		await tick();
		await wait(20);

		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(3);
		expect(session.get(body[0]).content.text).toBe('Third paragraph');
	});

	// -----------------------------------------------------------------------
	// 61. Break text in list item creates new list item
	// -----------------------------------------------------------------------
	it('61 — break_text_node inside list item creates new list item', () => {
		const session = create_session(create_mixed_doc);
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 2, 'list_items', 0, 'content'],
			anchor_offset: 4,
			focus_offset: 4
		};

		const tr = session.tr;
		const result = break_text_node(tr);
		expect(result).toBe(true);
		session.apply(tr);

		const items = session.get(['list_1', 'list_items']);
		expect(items.length).toBe(4);
		expect(session.get('list_item_1').content.text).toBe('Item');
		expect(session.get(items[1]).content.text).toBe(' one');
	});

	// -----------------------------------------------------------------------
	// 62. Join list item merges with previous list item
	// -----------------------------------------------------------------------
	it('62 — join_text_node merges list item with previous item', () => {
		const session = create_session(create_mixed_doc);
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 2, 'list_items', 1, 'content'],
			anchor_offset: 0,
			focus_offset: 0
		};

		const tr = session.tr;
		const result = join_text_node(tr);
		expect(result).toBe(true);
		session.apply(tr);

		expect(session.get('list_item_1').content.text).toBe('Item oneItem two');
		expect(session.get('list_item_2')).toBeUndefined();
		expect(session.get(['list_1', 'list_items']).length).toBe(2);
	});

	// -----------------------------------------------------------------------
	// 63. tr.build() remaps IDs for subgraphs
	// -----------------------------------------------------------------------
	it('63 — tr.build() remaps all node IDs in a subgraph', () => {
		const session = create_session(create_mixed_doc);
		set_node_selection(session, ['page_1', 'body'], 2, 2);

		const list = session.get('list_1');
		const items = list.list_items.map((id) => session.get(id));
		const subgraph = {};
		for (const item of items) subgraph[item.id] = item;
		subgraph[list.id] = list;

		const tr = session.tr;
		const new_list_id = tr.build('list_1', subgraph);
		expect(new_list_id).not.toBe('list_1');

		const new_list = tr.get(new_list_id);
		expect(new_list.type).toBe('list');
		expect(new_list.list_items.length).toBe(3);
		for (const item_id of new_list.list_items) {
			expect(item_id).not.toBe('list_item_1');
			expect(item_id).not.toBe('list_item_2');
			expect(item_id).not.toBe('list_item_3');
		}
	});

	// -----------------------------------------------------------------------
	// 64. Set node property updates node state
	// -----------------------------------------------------------------------
	it('64 — tr.set updates a node property', () => {
		const session = create_session(create_mixed_doc);
		const tr = session.tr;
		tr.set(['story_1', 'image'], 'https://new-image.com');
		session.apply(tr);

		expect(session.get('story_1').image).toBe('https://new-image.com');
	});

	// -----------------------------------------------------------------------
	// 65. Set property on annotated_text replaces content
	// -----------------------------------------------------------------------
	it('65 — tr.set on annotated_text replaces content and annotations', () => {
		const session = create_session();
		const tr = session.tr;
		tr.set(['text_1', 'content'], { text: 'New content', annotations: [] });
		session.apply(tr);

		expect(session.get('text_1').content.text).toBe('New content');
		expect(session.get('text_1').content.annotations).toEqual([]);
	});
});
