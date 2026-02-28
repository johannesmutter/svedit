/**
 * Lab test suite — Transaction advanced paths
 *
 * Covers: insert_text with annotations param, insert_text with nodes param,
 * annotate_text with annotation_properties (link href), build() default values,
 * insert_nodes on non-node selection, insert_text on non-text selection.
 */
import { describe, it, expect } from 'vitest';
import {
	create_session,
	create_text_doc,
	create_annotated_doc,
	create_mixed_doc,
	set_text_selection,
	set_node_selection,
	nanoid
} from './helpers.js';

describe('Transaction.insert_text with annotations', () => {
	it('insert_text with annotations applies them to inserted range', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 5, 5);

		const strong_node = { id: 'new_strong', type: 'strong' };
		const annotations = [{ start_offset: 0, end_offset: 4, node_id: 'new_strong' }];
		const nodes = { new_strong: strong_node };

		const tr = session.tr;
		tr.insert_text('BOLD', annotations, nodes);
		session.apply(tr);

		const content = session.get('text_1').content;
		expect(content.text).toBe('HelloBOLD world');

		const strong_annotations = content.annotations.filter(
			(a) => session.get(a.node_id)?.type === 'strong'
		);
		expect(strong_annotations.length).toBe(1);
		expect(strong_annotations[0].start_offset).toBe(5);
		expect(strong_annotations[0].end_offset).toBe(9);
	});

	it('insert_text with annotations remaps node IDs via build()', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 0);

		const annotations = [{ start_offset: 0, end_offset: 3, node_id: 'orig_emph' }];
		const nodes = { orig_emph: { id: 'orig_emph', type: 'emphasis' } };

		session.apply(session.tr.insert_text('ABC', annotations, nodes));

		const content = session.get('text_1').content;
		expect(content.annotations.length).toBe(1);
		expect(content.annotations[0].node_id).not.toBe('orig_emph');

		const remapped_node = session.get(content.annotations[0].node_id);
		expect(remapped_node.type).toBe('emphasis');
	});

	it('insert_text with annotations does not apply when cursor is inside existing annotation', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 8, 8);

		const annotations = [{ start_offset: 0, end_offset: 2, node_id: 'test_em' }];
		const nodes = { test_em: { id: 'test_em', type: 'emphasis' } };

		session.apply(session.tr.insert_text('XX', annotations, nodes));

		const content = session.get('text_1').content;
		const emphasis_annos = content.annotations.filter(
			(a) => session.get(a.node_id)?.type === 'emphasis'
		);
		expect(emphasis_annos.length).toBe(1);
		expect(emphasis_annos[0].node_id).toBe('emphasis_1');
	});

	it('insert_text with annotation of incompatible type is filtered out', () => {
		const session = create_session(create_mixed_doc);
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 0, 'title'],
			anchor_offset: 0,
			focus_offset: 0
		};

		const annotations = [{ start_offset: 0, end_offset: 2, node_id: 'test_link' }];
		const nodes = { test_link: { id: 'test_link', type: 'link', href: 'http://x.com' } };

		session.apply(session.tr.insert_text('AB', annotations, nodes));

		const title = session.get('story_1').title;
		expect(title.text).toBe('ABStory title');
		const link_annos = title.annotations.filter(
			(a) => session.get(a.node_id)?.type === 'link'
		);
		expect(link_annos.length).toBe(0);
	});
});

describe('Transaction.annotate_text with properties', () => {
	it('annotate_text creates link annotation with href property', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 6, 11);

		session.apply(session.tr.annotate_text('link', { href: 'https://test.com' }));

		const content = session.get('text_1').content;
		expect(content.annotations.length).toBe(1);
		const link_node = session.get(content.annotations[0].node_id);
		expect(link_node.type).toBe('link');
		expect(link_node.href).toBe('https://test.com');
	});

	it('annotate_text on non-text selection is a no-op', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 0, 1);

		const tr = session.tr;
		tr.annotate_text('strong');
		session.apply(tr);

		expect(session.get('text_1').content.annotations.length).toBe(0);
	});
});

describe('Transaction.build defaults', () => {
	it('build applies default empty string for missing string properties', () => {
		const session = create_session(create_mixed_doc);
		set_node_selection(session, ['page_1', 'body'], 0, 0);

		const tr = session.tr;
		const new_id = tr.build('btn_template', {
			btn_template: { id: 'btn_template', type: 'button', label: { text: 'Hi', annotations: [] } }
		});

		const built = tr.get(new_id);
		expect(built.type).toBe('button');
		expect(built.href).toBe('');
		expect(built.label.text).toBe('Hi');
	});

	it('build applies default 0 for missing integer properties', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 0, 0);

		const tr = session.tr;
		const new_id = tr.build('tpl', {
			tpl: { id: 'tpl', type: 'text', content: { text: 'X', annotations: [] } }
		});

		const built = tr.get(new_id);
		expect(built.layout).toBe(0);
	});

	it('build applies default empty annotated_text when value is null', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 0, 0);

		const tr = session.tr;
		const new_id = tr.build('tpl', {
			tpl: { id: 'tpl', type: 'text', layout: 1 }
		});

		const built = tr.get(new_id);
		expect(built.content).toEqual({ text: '', annotations: [] });
	});

	it('build applies default empty array for missing node_array', () => {
		const session = create_session(create_mixed_doc);
		set_node_selection(session, ['page_1', 'body'], 0, 0);

		const tr = session.tr;
		const new_id = tr.build('tpl', {
			tpl: { id: 'tpl', type: 'list', layout: 1 }
		});

		const built = tr.get(new_id);
		expect(built.list_items).toEqual([]);
	});
});

describe('Transaction edge cases', () => {
	it('insert_nodes on non-node selection is a no-op', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 3, 3);

		const new_id = nanoid();
		const tr = session.tr;
		tr.create({ id: new_id, type: 'text', layout: 1, content: { text: '', annotations: [] } });
		tr.insert_nodes([new_id]);
		session.apply(tr);

		expect(session.get(['page_1', 'body']).length).toBe(3);
	});

	it('insert_text on non-text selection is a no-op', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 1, 1);

		const tr = session.tr;
		tr.insert_text('Hello');
		session.apply(tr);

		expect(session.get('text_1').content.text).toBe('Hello world');
	});

	it('delete_selection on property selection is a no-op', () => {
		const session = create_session(create_mixed_doc);
		session.selection = { type: 'property', path: ['page_1', 'body', 0, 'image'] };

		const tr = session.tr;
		tr.delete_selection();
		session.apply(tr);

		expect(session.get('story_1').image).toBe('https://example.com/img.jpg');
	});

	it('delete_selection with no selection is a no-op', () => {
		const session = create_session();
		session.selection = null;

		const tr = session.tr;
		tr.delete_selection();
		session.apply(tr);

		expect(session.get(['page_1', 'body']).length).toBe(3);
	});
});
