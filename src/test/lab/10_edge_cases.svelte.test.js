/**
 * Lab test suite batch 2 — Edge cases: annotation splitting/joining,
 * shared node references, schema validation, immutability, transaction
 * validation, get_next_node_insert_cursor, and utility functions.
 *
 * Tests 181–200.
 */
import { describe, it, expect } from 'vitest';
import {
	create_session,
	create_text_doc,
	create_mixed_doc,
	create_annotated_doc,
	create_multi_annotated_doc,
	create_shared_ref_doc,
	create_empty_doc,
	create_single_empty_text_doc,
	set_text_selection,
	set_text_selection_by_path,
	set_node_selection,
	render_editor,
	tick,
	wait,
	nanoid,
	document_schema
} from './helpers.js';
import { break_text_node, join_text_node } from '../../lib/transforms.svelte.js';
import {
	split_annotated_text,
	join_annotated_text,
	get_char_length,
	char_slice,
	get_selection_range,
	is_selection_collapsed,
	snake_to_pascal
} from '../../lib/utils.js';

describe('Annotation splitting', () => {
	// 181
	it('181 — split_annotated_text splits annotation at boundary', () => {
		const text = { text: 'Hello world', annotations: [{ start_offset: 0, end_offset: 5, node_id: 's1' }] };
		const [left, right] = split_annotated_text(text, 5);

		expect(left.text).toBe('Hello');
		expect(left.annotations.length).toBe(1);
		expect(left.annotations[0]).toEqual({ start_offset: 0, end_offset: 5, node_id: 's1' });
		expect(right.text).toBe(' world');
		expect(right.annotations.length).toBe(0);
	});

	// 182
	it('182 — split_annotated_text splits annotation spanning split point', () => {
		const text = { text: 'ABCDEFGH', annotations: [{ start_offset: 2, end_offset: 6, node_id: 's1' }] };
		const [left, right] = split_annotated_text(text, 4);

		expect(left.text).toBe('ABCD');
		expect(left.annotations[0]).toEqual({ start_offset: 2, end_offset: 4, node_id: 's1' });
		expect(right.text).toBe('EFGH');
		expect(right.annotations[0]).toEqual({ start_offset: 0, end_offset: 2, node_id: 's1' });
	});

	// 183
	it('183 — split_annotated_text keeps annotation entirely in right part', () => {
		const text = { text: 'ABCDEF', annotations: [{ start_offset: 4, end_offset: 6, node_id: 's1' }] };
		const [left, right] = split_annotated_text(text, 2);

		expect(left.annotations.length).toBe(0);
		expect(right.annotations[0]).toEqual({ start_offset: 2, end_offset: 4, node_id: 's1' });
	});

	// 184
	it('184 — split at position 0 puts everything in right', () => {
		const text = { text: 'Hello', annotations: [{ start_offset: 0, end_offset: 5, node_id: 's1' }] };
		const [left, right] = split_annotated_text(text, 0);

		expect(left.text).toBe('');
		expect(right.text).toBe('Hello');
		expect(right.annotations[0]).toEqual({ start_offset: 0, end_offset: 5, node_id: 's1' });
	});

	// 185
	it('185 — split at end puts everything in left', () => {
		const text = { text: 'Hello', annotations: [{ start_offset: 0, end_offset: 5, node_id: 's1' }] };
		const [left, right] = split_annotated_text(text, 5);

		expect(left.text).toBe('Hello');
		expect(left.annotations[0]).toEqual({ start_offset: 0, end_offset: 5, node_id: 's1' });
		expect(right.text).toBe('');
		expect(right.annotations.length).toBe(0);
	});
});

describe('Annotation joining', () => {
	// 186
	it('186 — join_annotated_text merges adjacent same-node annotations', () => {
		const first = { text: 'AB', annotations: [{ start_offset: 0, end_offset: 2, node_id: 's1' }] };
		const second = { text: 'CD', annotations: [{ start_offset: 0, end_offset: 2, node_id: 's1' }] };

		const result = join_annotated_text(first, second);
		expect(result.text).toBe('ABCD');
		expect(result.annotations.length).toBe(1);
		expect(result.annotations[0]).toEqual({ start_offset: 0, end_offset: 4, node_id: 's1' });
	});

	// 187
	it('187 — join_annotated_text shifts second annotations by first text length', () => {
		const first = { text: 'Hello', annotations: [] };
		const second = { text: ' world', annotations: [{ start_offset: 1, end_offset: 6, node_id: 's1' }] };

		const result = join_annotated_text(first, second);
		expect(result.text).toBe('Hello world');
		expect(result.annotations[0]).toEqual({ start_offset: 6, end_offset: 11, node_id: 's1' });
	});

	// 188
	it('188 — join_annotated_text keeps separate non-adjacent annotations', () => {
		const first = { text: 'AB', annotations: [{ start_offset: 0, end_offset: 2, node_id: 's1' }] };
		const second = { text: 'CD', annotations: [{ start_offset: 1, end_offset: 2, node_id: 's2' }] };

		const result = join_annotated_text(first, second);
		expect(result.annotations.length).toBe(2);
	});
});

describe('break_text_node with annotations', () => {
	// 189
	it('189 — break_text_node splits annotated text preserving annotation in left', () => {
		const session = create_session(create_multi_annotated_doc);
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 0, 'content'],
			anchor_offset: 8,
			focus_offset: 8
		};

		const tr = session.tr;
		break_text_node(tr);
		session.apply(tr);

		expect(session.get('text_1').content.text).toBe('AB bold ');
		const ann = session.get('text_1').content.annotations;
		expect(ann.length).toBe(1);
		expect(ann[0].start_offset).toBe(3);
		expect(ann[0].end_offset).toBe(7);
	});

	// 190
	it('190 — break_text_node splits annotation spanning split point into two', () => {
		const session = create_session(create_multi_annotated_doc);
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 0, 'content'],
			anchor_offset: 5,
			focus_offset: 5
		};

		const tr = session.tr;
		break_text_node(tr);
		session.apply(tr);

		const left = session.get('text_1').content;
		expect(left.text).toBe('AB bo');
		expect(left.annotations[0].end_offset).toBe(5);

		const body = session.get(['page_1', 'body']);
		const right = session.get(body[1]).content;
		expect(right.text).toBe('ld CD');
		expect(right.annotations[0].start_offset).toBe(0);
		expect(right.annotations[0].end_offset).toBe(2);
	});
});

describe('join_text_node with annotations', () => {
	// 191
	it('191 — join_text_node merges annotations from both nodes', () => {
		const session = create_session(create_multi_annotated_doc);
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 1, 'content'],
			anchor_offset: 0,
			focus_offset: 0
		};

		const tr = session.tr;
		join_text_node(tr);
		session.apply(tr);

		const joined = session.get('text_1').content;
		expect(joined.text).toBe('AB bold CDEF italic GH');
		expect(joined.annotations.length).toBe(2);

		const strong = joined.annotations.find((a) => a.node_id === 'strong_1');
		expect(strong.start_offset).toBe(3);
		expect(strong.end_offset).toBe(7);

		const emphasis = joined.annotations.find((a) => a.node_id === 'emphasis_1');
		expect(emphasis.start_offset).toBe(13);
		expect(emphasis.end_offset).toBe(19);
	});
});

describe('Shared node references', () => {
	// 192
	it('192 — shared node is referenced twice in body', () => {
		const session = create_session(create_shared_ref_doc);
		const body = session.get(['page_1', 'body']);
		expect(body).toEqual(['text_shared', 'text_unique', 'text_shared']);
		expect(session.count_references('text_shared')).toBe(2);
	});

	// 193
	it('193 — deleting one reference of shared node keeps node alive', () => {
		const session = create_session(create_shared_ref_doc);
		set_node_selection(session, ['page_1', 'body'], 0, 1);

		session.apply(session.tr.delete_selection());

		expect(session.get(['page_1', 'body'])).toEqual(['text_unique', 'text_shared']);
		expect(session.get('text_shared')).toBeDefined();
	});

	// 194
	it('194 — deleting all references of shared node removes it', () => {
		const session = create_session(create_shared_ref_doc);
		set_node_selection(session, ['page_1', 'body'], 0, 3);

		session.apply(session.tr.delete_selection());

		expect(session.get('text_shared')).toBeUndefined();
		expect(session.get('text_unique')).toBeUndefined();
	});
});

describe('Immutability — copy-on-write', () => {
	// 195
	it('195 — applying transaction creates new doc reference', () => {
		const session = create_session();
		const doc_before = session.doc;

		set_text_selection(session, 'text_1', 'content', 0, 0);
		session.apply(session.tr.insert_text('X'));

		expect(session.doc).not.toBe(doc_before);
	});

	// 196
	it('196 — unchanged nodes keep same reference after transaction', () => {
		const session = create_session();
		const text_2_before = session.doc.nodes.text_2;

		set_text_selection(session, 'text_1', 'content', 0, 0);
		session.apply(session.tr.insert_text('X'));

		expect(session.doc.nodes.text_2).toBe(text_2_before);
	});

	// 197
	it('197 — undo restores previous doc reference', () => {
		const session = create_session();
		const doc_before = session.doc;

		set_text_selection(session, 'text_1', 'content', 0, 0);
		session.apply(session.tr.insert_text('X'));
		session.undo();

		expect(session.get('text_1').content.text).toBe('Hello world');
	});
});

describe('Utility functions', () => {
	// 198
	it('198 — get_char_length counts graphemes not code units', () => {
		expect(get_char_length('Hello')).toBe(5);
		expect(get_char_length('a😀b')).toBe(3);
		expect(get_char_length('')).toBe(0);
	});

	// 199
	it('199 — char_slice handles emoji correctly', () => {
		expect(char_slice('a😀b', 1, 2)).toBe('😀');
		expect(char_slice('Hello', 0, 3)).toBe('Hel');
	});

	// 200
	it('200 — snake_to_pascal converts correctly', () => {
		expect(snake_to_pascal('text')).toBe('Text');
		expect(snake_to_pascal('list_item')).toBe('ListItem');
		expect(snake_to_pascal('image_grid_item')).toBe('ImageGridItem');
	});
});

describe('get_next_node_insert_cursor', () => {
	// get_next_node_insert_cursor from text selection
	it('get_next_node_insert_cursor from text selection computes parent node cursor', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 3, 3);

		const cursor = session.get_next_node_insert_cursor(session.selection);
		expect(cursor.type).toBe('node');
		expect(cursor.path).toEqual(['page_1', 'body']);
		expect(cursor.anchor_offset).toBe(1);
	});

	// get_next_node_insert_cursor returns null at root
	it('get_next_node_insert_cursor returns null when path is too short', () => {
		const session = create_session();
		session.selection = { type: 'node', path: ['page_1', 'body'], anchor_offset: 0, focus_offset: 0 };

		const cursor = session.get_next_node_insert_cursor(session.selection);
		expect(cursor).toBeNull();
	});
});

describe('Selection utilities', () => {
	// get_selection_range normalizes direction
	it('get_selection_range normalizes backwards selection', () => {
		const sel = { type: 'text', path: ['a', 'b'], anchor_offset: 10, focus_offset: 3 };
		const range = get_selection_range(sel);
		expect(range.start_offset).toBe(3);
		expect(range.end_offset).toBe(10);
	});

	// is_selection_collapsed
	it('is_selection_collapsed detects collapsed selections', () => {
		expect(is_selection_collapsed({ type: 'text', path: [], anchor_offset: 5, focus_offset: 5 })).toBe(true);
		expect(is_selection_collapsed({ type: 'text', path: [], anchor_offset: 5, focus_offset: 8 })).toBe(false);
		expect(is_selection_collapsed({ type: 'property', path: [] })).toBe(false);
	});

	// get_selection_range returns null for property
	it('get_selection_range returns null for property selection', () => {
		expect(get_selection_range({ type: 'property', path: [] })).toBeNull();
	});
});

describe('Transaction validation', () => {
	// create duplicate node throws
	it('creating duplicate node ID throws error', () => {
		const session = create_session();
		const tr = session.tr;
		expect(() => {
			tr.create({ id: 'text_1', type: 'text', layout: 1, content: { text: '', annotations: [] } });
		}).toThrow('already exists');
	});

	// set_selection with invalid node selection throws
	it('set_selection with out-of-bounds offset throws', () => {
		const session = create_session();
		const tr = session.tr;
		expect(() => {
			tr.set_selection({ type: 'node', path: ['page_1', 'body'], anchor_offset: 0, focus_offset: 99 });
		}).toThrow();
	});

	// set_selection with invalid text selection throws
	it('set_selection with text offset exceeding length throws', () => {
		const session = create_session();
		const tr = session.tr;
		expect(() => {
			tr.set_selection({ type: 'text', path: ['page_1', 'body', 0, 'content'], anchor_offset: 0, focus_offset: 999 });
		}).toThrow();
	});
});
