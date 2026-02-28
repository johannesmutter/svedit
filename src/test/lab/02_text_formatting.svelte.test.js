/**
 * Lab test suite — Text formatting & annotations
 *
 * Covers: toggling bold/italic/highlight, adding/removing links,
 * annotation boundaries, annotation adjustments on insert/delete,
 * annotation splitting, and annotation state queries.
 */
import { describe, it, expect } from 'vitest';
import {
	create_session,
	create_text_doc,
	create_annotated_doc,
	set_text_selection,
	set_text_selection_by_path,
	render_editor,
	tick,
	wait
} from './helpers.js';

describe('Text formatting & annotations', () => {
	// -----------------------------------------------------------------------
	// 21. Toggle bold on expanded selection
	// -----------------------------------------------------------------------
	it('21 — toggle bold (strong) on expanded text selection', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 5);

		session.apply(session.tr.annotate_text('strong'));

		const content = session.get('text_1').content;
		expect(content.annotations.length).toBe(1);
		expect(content.annotations[0].start_offset).toBe(0);
		expect(content.annotations[0].end_offset).toBe(5);
		const annotation_node = session.get(content.annotations[0].node_id);
		expect(annotation_node.type).toBe('strong');
	});

	// -----------------------------------------------------------------------
	// 22. Toggle italic on expanded selection
	// -----------------------------------------------------------------------
	it('22 — toggle italic (emphasis) on expanded text selection', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 6, 11);

		session.apply(session.tr.annotate_text('emphasis'));

		const content = session.get('text_1').content;
		expect(content.annotations.length).toBe(1);
		const node = session.get(content.annotations[0].node_id);
		expect(node.type).toBe('emphasis');
		expect(content.annotations[0].start_offset).toBe(6);
		expect(content.annotations[0].end_offset).toBe(11);
	});

	// -----------------------------------------------------------------------
	// 23. Toggle highlight on expanded selection
	// -----------------------------------------------------------------------
	it('23 — toggle highlight on expanded text selection', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 2, 8);

		session.apply(session.tr.annotate_text('highlight'));

		const content = session.get('text_1').content;
		expect(content.annotations.length).toBe(1);
		const node = session.get(content.annotations[0].node_id);
		expect(node.type).toBe('highlight');
	});

	// -----------------------------------------------------------------------
	// 24. Remove bold by toggling again with cursor inside
	// -----------------------------------------------------------------------
	it('24 — remove bold by toggling again while cursor is inside annotation', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 7, 7);

		expect(session.active_annotation('strong')).not.toBeNull();

		session.apply(session.tr.annotate_text('strong'));

		const content = session.get('text_1').content;
		const strong_annotations = content.annotations.filter(
			(a) => session.get(a.node_id)?.type === 'strong'
		);
		expect(strong_annotations.length).toBe(0);
		expect(session.get('strong_1')).toBeUndefined();
	});

	// -----------------------------------------------------------------------
	// 25. Cannot add annotation to collapsed cursor
	// -----------------------------------------------------------------------
	it('25 — annotation on collapsed cursor is a no-op', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 3, 3);

		session.apply(session.tr.annotate_text('strong'));
		expect(session.get('text_1').content.annotations.length).toBe(0);
	});

	// -----------------------------------------------------------------------
	// 26. Active annotation detection — cursor inside bold
	// -----------------------------------------------------------------------
	it('26 — active_annotation detects strong when cursor is inside bold', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 8, 8);

		expect(session.active_annotation('strong')).not.toBeNull();
		expect(session.active_annotation('emphasis')).toBeNull();
	});

	// -----------------------------------------------------------------------
	// 27. Active annotation detection — cursor inside emphasis
	// -----------------------------------------------------------------------
	it('27 — active_annotation detects emphasis', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 13, 13);

		expect(session.active_annotation('emphasis')).not.toBeNull();
		expect(session.active_annotation('strong')).toBeNull();
	});

	// -----------------------------------------------------------------------
	// 28. Active annotation detection — cursor inside link
	// -----------------------------------------------------------------------
	it('28 — active_annotation detects link with href', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 20, 20);

		const link = session.active_annotation('link');
		expect(link).not.toBeNull();
	});

	// -----------------------------------------------------------------------
	// 29. Active annotation returns null outside any annotation
	// -----------------------------------------------------------------------
	it('29 — active_annotation returns null outside annotations', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 3, 3);

		expect(session.active_annotation()).toBeNull();
		expect(session.active_annotation('strong')).toBeNull();
	});

	// -----------------------------------------------------------------------
	// 30. Inserting text inside annotation expands it
	// -----------------------------------------------------------------------
	it('30 — inserting text inside an annotation expands the annotation range', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 8, 8);

		session.apply(session.tr.insert_text('XX'));

		const content = session.get('text_1').content;
		const strong = content.annotations.find((a) => a.node_id === 'strong_1');
		expect(strong.start_offset).toBe(6);
		expect(strong.end_offset).toBe(12);
	});

	// -----------------------------------------------------------------------
	// 31. Inserting text before annotation shifts it right
	// -----------------------------------------------------------------------
	it('31 — inserting text before annotation shifts annotation offsets right', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 0, 0);

		session.apply(session.tr.insert_text('PRE'));

		const content = session.get('text_1').content;
		const strong = content.annotations.find((a) => a.node_id === 'strong_1');
		expect(strong.start_offset).toBe(9);
		expect(strong.end_offset).toBe(13);
	});

	// -----------------------------------------------------------------------
	// 32. Deleting text that contains an annotation removes annotation
	// -----------------------------------------------------------------------
	it('32 — deleting all annotated text removes the annotation and its node', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 6, 10);

		session.apply(session.tr.delete_selection());

		const content = session.get('text_1').content;
		const remaining_strong = content.annotations.filter((a) => a.node_id === 'strong_1');
		expect(remaining_strong.length).toBe(0);
		expect(session.get('strong_1')).toBeUndefined();
	});

	// -----------------------------------------------------------------------
	// 33. Deleting text after annotation does not affect it
	// -----------------------------------------------------------------------
	it('33 — deleting text after annotation does not affect annotation offsets', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 25, 30);

		session.apply(session.tr.delete_selection());

		const content = session.get('text_1').content;
		const strong = content.annotations.find((a) => a.node_id === 'strong_1');
		expect(strong.start_offset).toBe(6);
		expect(strong.end_offset).toBe(10);
	});

	// -----------------------------------------------------------------------
	// 34. Deleting text before annotation shifts annotation left
	// -----------------------------------------------------------------------
	it('34 — deleting text before annotation shifts annotation offsets left', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 0, 3);

		session.apply(session.tr.delete_selection());

		const content = session.get('text_1').content;
		const strong = content.annotations.find((a) => a.node_id === 'strong_1');
		expect(strong.start_offset).toBe(3);
		expect(strong.end_offset).toBe(7);
	});

	// -----------------------------------------------------------------------
	// 35. Partially deleting annotated text shrinks annotation
	// -----------------------------------------------------------------------
	it('35 — partially deleting annotated text shrinks annotation range', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 8, 10);

		session.apply(session.tr.delete_selection());

		const content = session.get('text_1').content;
		const strong = content.annotations.find((a) => a.node_id === 'strong_1');
		expect(strong.start_offset).toBe(6);
		expect(strong.end_offset).toBe(8);
	});

	// -----------------------------------------------------------------------
	// 36. Cannot stack two annotations on same range
	// -----------------------------------------------------------------------
	it('36 — cannot add a different annotation type when one already exists (exclusive annotations)', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 6, 10);

		session.apply(session.tr.annotate_text('emphasis'));

		const content = session.get('text_1').content;
		const strong = content.annotations.filter(
			(a) => session.get(a.node_id)?.type === 'strong'
		);
		const emphasis = content.annotations.filter(
			(a) => session.get(a.node_id)?.type === 'emphasis'
		);
		expect(strong.length).toBe(1);
		expect(emphasis.length).toBe(0);
	});

	// -----------------------------------------------------------------------
	// 37. Available annotation types for text property
	// -----------------------------------------------------------------------
	it('37 — available_annotation_types returns schema-defined annotation types', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 0, 5);

		const types = session.available_annotation_types;
		expect(types).toContain('strong');
		expect(types).toContain('emphasis');
		expect(types).toContain('link');
		expect(types).toContain('highlight');
	});

	// -----------------------------------------------------------------------
	// 38. Available annotation types empty for non-text selection
	// -----------------------------------------------------------------------
	it('38 — available_annotation_types is empty for non-text selection', () => {
		const session = create_session();
		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 1
		};

		expect(session.available_annotation_types).toEqual([]);
	});

	// -----------------------------------------------------------------------
	// 39. Annotation survives text insertion at boundary
	// -----------------------------------------------------------------------
	it('39 — inserting text at annotation start does not extend annotation', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 6, 6);

		session.apply(session.tr.insert_text('X'));

		const content = session.get('text_1').content;
		const strong = content.annotations.find((a) => a.node_id === 'strong_1');
		expect(strong.start_offset).toBe(7);
		expect(strong.end_offset).toBe(11);
	});

	// -----------------------------------------------------------------------
	// 40. Link annotation carries href property
	// -----------------------------------------------------------------------
	it('40 — link annotation node carries href property', () => {
		const session = create_session(create_annotated_doc);

		const link_node = session.get('link_1');
		expect(link_node.type).toBe('link');
		expect(link_node.href).toBe('https://example.com');
	});
});
