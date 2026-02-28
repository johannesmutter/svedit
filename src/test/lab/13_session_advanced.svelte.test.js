/**
 * Lab test suite — Session advanced paths
 *
 * Covers: apply() batch timing, history boundary conditions, selection
 * getter/setter, undo/redo at boundaries, _validate_selection,
 * multiple sequential apply calls, history length tracking.
 */
import { describe, it, expect } from 'vitest';
import {
	create_session,
	create_text_doc,
	create_annotated_doc,
	create_mixed_doc,
	create_empty_doc,
	set_text_selection,
	set_node_selection,
	set_property_selection,
	nanoid
} from './helpers.js';

describe('Session.apply batching', () => {
	it('non-batch apply creates separate history entries', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 0);

		session.apply(session.tr.insert_text('A'));
		session.apply(session.tr.insert_text('B'));

		expect(session.history.length).toBe(2);
	});

	it('batch apply within window groups into single entry', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 0);

		session.apply(session.tr.insert_text('A'), { batch: true });
		session.apply(session.tr.insert_text('B'), { batch: true });
		session.apply(session.tr.insert_text('C'), { batch: true });

		expect(session.history.length).toBe(1);
	});

	it('non-batch after batch creates new entry', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 0);

		session.apply(session.tr.insert_text('A'), { batch: true });
		session.apply(session.tr.insert_text('B'));

		expect(session.history.length).toBe(2);
	});

	it('batch mode resets when non-batch apply is made', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 0);

		session.apply(session.tr.insert_text('A'), { batch: true });
		session.apply(session.tr.insert_text('B'));
		session.apply(session.tr.insert_text('C'), { batch: true });

		expect(session.history.length).toBe(3);
	});

	it('batch entry accumulates ops from all batched transactions', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 0);

		session.apply(session.tr.insert_text('A'), { batch: true });
		session.apply(session.tr.insert_text('B'), { batch: true });

		const entry = session.history[0];
		expect(entry.ops.length).toBeGreaterThan(1);
	});

	it('undo of batched entry undoes all ops in batch', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 0);

		session.apply(session.tr.insert_text('A'), { batch: true });
		session.apply(session.tr.insert_text('B'), { batch: true });

		expect(session.get('text_1').content.text).toBe('ABHello world');

		session.undo();
		expect(session.get('text_1').content.text).toBe('Hello world');
	});
});

describe('Session — history boundary conditions', () => {
	it('undo when already at beginning does nothing', () => {
		const session = create_session();
		session.undo();

		expect(session.get('text_1').content.text).toBe('Hello world');
		expect(session.history_index).toBe(-1);
	});

	it('redo when already at end does nothing', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 0);
		session.apply(session.tr.insert_text('X'));
		session.redo();

		expect(session.get('text_1').content.text).toBe('XHello world');
	});

	it('new edit after undo truncates future history', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 0);

		session.apply(session.tr.insert_text('A'));
		session.apply(session.tr.insert_text('B'));
		session.apply(session.tr.insert_text('C'));

		session.undo();
		session.undo();
		expect(session.history.length).toBe(3);

		session.apply(session.tr.insert_text('Z'));
		expect(session.history.length).toBe(2);
		expect(session.can_redo).toBe(false);
	});

	it('multiple undo then redo traverses history correctly', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 11, 11);

		session.apply(session.tr.insert_text('!'));
		session.apply(session.tr.insert_text('?'));
		session.apply(session.tr.insert_text('.'));

		expect(session.get('text_1').content.text).toBe('Hello world!?.');

		session.undo();
		expect(session.get('text_1').content.text).toBe('Hello world!?');
		session.undo();
		expect(session.get('text_1').content.text).toBe('Hello world!');
		session.redo();
		expect(session.get('text_1').content.text).toBe('Hello world!?');
		session.redo();
		expect(session.get('text_1').content.text).toBe('Hello world!?.');
	});

	it('history_index is -1 initially and increments with each apply', () => {
		const session = create_session();
		expect(session.history_index).toBe(-1);

		set_text_selection(session, 'text_1', 'content', 0, 0);
		session.apply(session.tr.insert_text('A'));
		expect(session.history_index).toBe(0);

		session.apply(session.tr.insert_text('B'));
		expect(session.history_index).toBe(1);
	});
});

describe('Session — selection management', () => {
	it('selection can be set to null', () => {
		const session = create_session();
		session.selection = null;
		expect(session.selection).toBeNull();
	});

	it('setting text selection stores it correctly', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 3, 7);

		expect(session.selection.type).toBe('text');
		expect(session.selection.anchor_offset).toBe(3);
		expect(session.selection.focus_offset).toBe(7);
	});

	it('selection is a new reference after apply (triggers reactivity)', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 3, 3);
		const sel_before = session.selection;

		session.apply(session.tr.insert_text('X'));
		expect(session.selection).not.toBe(sel_before);
	});

	it('selection is restored to pre-change state after undo', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 5, 5);

		session.apply(session.tr.insert_text('X'));
		expect(session.selection.anchor_offset).toBe(6);

		session.undo();
		expect(session.selection.anchor_offset).toBe(5);
		expect(session.selection.focus_offset).toBe(5);
	});
});

describe('Session — path resolution edge cases', () => {
	it('get with string array path returns element', () => {
		const session = create_session(create_mixed_doc);
		expect(session.get(['page_1', 'keywords', 0])).toBe('test');
	});

	it('get with integer array path returns element', () => {
		const session = create_session(create_mixed_doc);
		expect(session.get(['page_1', 'daily_visitors', 0])).toBe(42);
	});

	it('get annotated_text sub-path returns text string', () => {
		const session = create_session();
		const text = session.get(['page_1', 'body', 0, 'content', 'text']);
		expect(text).toBe('Hello world');
	});

	it('get annotated_text annotations sub-path returns array', () => {
		const session = create_session(create_annotated_doc);
		const annotations = session.get(['page_1', 'body', 0, 'content', 'annotations']);
		expect(Array.isArray(annotations)).toBe(true);
		expect(annotations.length).toBe(3);
	});

	it('get annotation by index returns annotation object', () => {
		const session = create_session(create_annotated_doc);
		const anno = session.get(['page_1', 'body', 0, 'content', 'annotations', 0]);
		expect(anno.start_offset).toBe(6);
		expect(anno.end_offset).toBe(10);
		expect(anno.node_id).toBe('strong_1');
	});

	it('get annotation node_id resolves to the annotation node', () => {
		const session = create_session(create_annotated_doc);
		const node = session.get(['page_1', 'body', 0, 'content', 'annotations', 0, 'node_id']);
		expect(node.id).toBe('strong_1');
		expect(node.type).toBe('strong');
	});

	it('get annotation start_offset returns offset value', () => {
		const session = create_session(create_annotated_doc);
		const offset = session.get(['page_1', 'body', 0, 'content', 'annotations', 1, 'start_offset']);
		expect(offset).toBe(11);
	});

	it('get annotation end_offset returns offset value', () => {
		const session = create_session(create_annotated_doc);
		const offset = session.get(['page_1', 'body', 0, 'content', 'annotations', 1, 'end_offset']);
		expect(offset).toBe(17);
	});

	it('get undefined node returns undefined', () => {
		const session = create_session();
		expect(session.get('nonexistent_node')).toBeUndefined();
	});
});
