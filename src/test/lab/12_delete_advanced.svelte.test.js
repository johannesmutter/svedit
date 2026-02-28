/**
 * Lab test suite — Advanced deletion paths
 *
 * Covers: delete_selection forward join with next text node, cascade delete
 * unreferenced annotation nodes, delete text partially overlapping annotations,
 * delete backward/forward at boundaries with non-text neighbors.
 */
import { describe, it, expect } from 'vitest';
import {
	create_session,
	create_text_doc,
	create_annotated_doc,
	create_mixed_doc,
	create_multi_annotated_doc,
	set_text_selection,
	set_text_selection_by_path,
	set_node_selection,
	nanoid
} from './helpers.js';
import { join_text_node } from '../../lib/transforms.svelte.js';

describe('delete_selection — forward join', () => {
	it('forward delete at end of text node joins with next text node', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 11, 11);

		session.apply(session.tr.delete_selection('forward'));

		expect(session.get('text_1').content.text).toBe('Hello worldSecond paragraph');
		expect(session.get('text_2')).toBeUndefined();
		expect(session.get(['page_1', 'body']).length).toBe(2);
	});

	it('forward delete at end with non-text next node does nothing', () => {
		const session = create_session(create_mixed_doc);
		set_text_selection(session, 'text_1', 'content', 15, 15);

		session.apply(session.tr.delete_selection('forward'));

		expect(session.get('text_1').content.text).toBe('First paragraph');
		expect(session.get(['page_1', 'body']).length).toBe(4);
	});

	it('forward delete at end of last text node does nothing', () => {
		const session = create_session();
		set_text_selection(session, 'text_3', 'content', 15, 15);

		session.apply(session.tr.delete_selection('forward'));

		expect(session.get('text_3').content.text).toBe('Third paragraph');
		expect(session.get(['page_1', 'body']).length).toBe(3);
	});

	it('backward delete at pos 0 of first node with non-text predecessor does nothing', () => {
		const session = create_session(create_mixed_doc);
		set_text_selection(session, 'text_1', 'content', 0, 0);

		const tr = session.tr;
		const result = join_text_node(tr);
		expect(result).toBe(false);
	});
});

describe('delete_selection — annotation cleanup on text deletion', () => {
	it('deleting text that spans entire annotation removes annotation node', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 5, 11);

		session.apply(session.tr.delete_selection());

		const content = session.get('text_1').content;
		const strong_annos = content.annotations.filter((a) => a.node_id === 'strong_1');
		expect(strong_annos.length).toBe(0);
		expect(session.get('strong_1')).toBeUndefined();
	});

	it('deleting text that partially overlaps annotation start shrinks it', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 4, 8);

		session.apply(session.tr.delete_selection());

		const content = session.get('text_1').content;
		const strong = content.annotations.find((a) => a.node_id === 'strong_1');
		expect(strong).toBeDefined();
		expect(strong.start_offset).toBe(4);
		expect(strong.end_offset).toBe(6);
	});

	it('deleting text that partially overlaps annotation end shrinks it', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 8, 12);

		session.apply(session.tr.delete_selection());

		const content = session.get('text_1').content;
		const strong = content.annotations.find((a) => a.node_id === 'strong_1');
		expect(strong).toBeDefined();
		expect(strong.start_offset).toBe(6);
		expect(strong.end_offset).toBe(8);
	});

	it('deleting all text including multiple annotations removes all annotation nodes', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 0, 30);

		session.apply(session.tr.delete_selection());

		expect(session.get('text_1').content.text).toBe('');
		expect(session.get('text_1').content.annotations.length).toBe(0);
		expect(session.get('strong_1')).toBeUndefined();
		expect(session.get('emphasis_1')).toBeUndefined();
		expect(session.get('link_1')).toBeUndefined();
	});

	it('backward delete character inside annotation does not remove annotation', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 8, 8);

		session.apply(session.tr.delete_selection('backward'));

		const content = session.get('text_1').content;
		const strong = content.annotations.find((a) => a.node_id === 'strong_1');
		expect(strong).toBeDefined();
		expect(strong.end_offset).toBe(9);
	});
});

describe('delete_selection — node deletion cascade', () => {
	it('deleting story cascades to button children', () => {
		const session = create_session(create_mixed_doc);
		set_node_selection(session, ['page_1', 'body'], 0, 1);

		session.apply(session.tr.delete_selection());

		expect(session.get('story_1')).toBeUndefined();
		expect(session.get('button_1')).toBeUndefined();
	});

	it('deleting list cascades to all list items', () => {
		const session = create_session(create_mixed_doc);
		set_node_selection(session, ['page_1', 'body'], 2, 3);

		session.apply(session.tr.delete_selection());

		expect(session.get('list_1')).toBeUndefined();
		expect(session.get('list_item_1')).toBeUndefined();
		expect(session.get('list_item_2')).toBeUndefined();
		expect(session.get('list_item_3')).toBeUndefined();
	});

	it('undo of cascade deletion restores all child nodes', () => {
		const session = create_session(create_mixed_doc);
		set_node_selection(session, ['page_1', 'body'], 0, 1);

		session.apply(session.tr.delete_selection());
		session.undo();

		expect(session.get('story_1')).toBeDefined();
		expect(session.get('button_1')).toBeDefined();
		expect(session.get('story_1').buttons).toContain('button_1');
	});

	it('deleting node then re-adding different node does not resurrect old children', () => {
		const session = create_session(create_mixed_doc);
		set_node_selection(session, ['page_1', 'body'], 0, 1);
		session.apply(session.tr.delete_selection());

		expect(session.get('button_1')).toBeUndefined();

		set_node_selection(session, ['page_1', 'body'], 0, 0);
		const tr = session.tr;
		session.config.inserters.text(tr);
		session.apply(tr);

		expect(session.get('button_1')).toBeUndefined();
	});
});

describe('delete_selection — backward at various positions', () => {
	it('backward delete at pos 1 removes first character', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 1, 1);

		session.apply(session.tr.delete_selection('backward'));

		expect(session.get('text_1').content.text).toBe('ello world');
		expect(session.selection.anchor_offset).toBe(0);
	});

	it('forward delete at pos 0 removes first character', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 0);

		session.apply(session.tr.delete_selection('forward'));

		expect(session.get('text_1').content.text).toBe('ello world');
		expect(session.selection.anchor_offset).toBe(0);
	});

	it('backward delete at last position removes last character', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 11, 11);

		session.apply(session.tr.delete_selection('backward'));

		expect(session.get('text_1').content.text).toBe('Hello worl');
		expect(session.selection.anchor_offset).toBe(10);
	});
});
