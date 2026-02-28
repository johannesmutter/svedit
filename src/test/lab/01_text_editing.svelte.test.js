/**
 * Lab test suite — Text editing basics
 *
 * Covers: typing, inserting text, deleting text (backward/forward),
 * collapsed cursor operations, text replacement on expanded selection,
 * newline insertion, and cursor positioning after edits.
 */
import { describe, it, expect } from 'vitest';
import {
	create_session,
	create_text_doc,
	create_single_empty_text_doc,
	render_editor,
	set_text_selection,
	set_text_selection_by_path,
	tick,
	wait
} from './helpers.js';

describe('Text editing basics', () => {
	// -----------------------------------------------------------------------
	// 1. Insert single character at cursor
	// -----------------------------------------------------------------------
	it('1 — insert single character at collapsed cursor', async () => {
		const session = create_session();
		await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 5, 5);

		const tr = session.tr;
		tr.insert_text('X');
		session.apply(tr);

		expect(session.get('text_1').content.text).toBe('HelloX world');
		expect(session.selection.anchor_offset).toBe(6);
		expect(session.selection.focus_offset).toBe(6);
	});

	// -----------------------------------------------------------------------
	// 2. Insert multi-character string
	// -----------------------------------------------------------------------
	it('2 — insert multi-character string', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 0);

		session.apply(session.tr.insert_text('ABC'));
		expect(session.get('text_1').content.text).toBe('ABCHello world');
		expect(session.selection.anchor_offset).toBe(3);
	});

	// -----------------------------------------------------------------------
	// 3. Insert text at end of string
	// -----------------------------------------------------------------------
	it('3 — insert text at end of text node', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 11, 11);

		session.apply(session.tr.insert_text('!'));
		expect(session.get('text_1').content.text).toBe('Hello world!');
		expect(session.selection.anchor_offset).toBe(12);
	});

	// -----------------------------------------------------------------------
	// 4. Insert text replaces expanded selection
	// -----------------------------------------------------------------------
	it('4 — insert text replaces expanded text selection', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 5);

		session.apply(session.tr.insert_text('Goodbye'));
		expect(session.get('text_1').content.text).toBe('Goodbye world');
		expect(session.selection.anchor_offset).toBe(7);
		expect(session.selection.focus_offset).toBe(7);
	});

	// -----------------------------------------------------------------------
	// 5. Insert text into empty text node
	// -----------------------------------------------------------------------
	it('5 — insert text into empty text node', () => {
		const session = create_session(create_single_empty_text_doc);
		set_text_selection(session, 'text_1', 'content', 0, 0);

		session.apply(session.tr.insert_text('First'));
		expect(session.get('text_1').content.text).toBe('First');
		expect(session.selection.anchor_offset).toBe(5);
	});

	// -----------------------------------------------------------------------
	// 6. Delete backward (backspace) one character
	// -----------------------------------------------------------------------
	it('6 — delete backward (backspace) removes previous character', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 5, 5);

		session.apply(session.tr.delete_selection('backward'));
		expect(session.get('text_1').content.text).toBe('Hell world');
		expect(session.selection.anchor_offset).toBe(4);
		expect(session.selection.focus_offset).toBe(4);
	});

	// -----------------------------------------------------------------------
	// 7. Delete forward (delete key) one character
	// -----------------------------------------------------------------------
	it('7 — delete forward removes next character', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 5, 5);

		session.apply(session.tr.delete_selection('forward'));
		expect(session.get('text_1').content.text).toBe('Helloworld');
		expect(session.selection.anchor_offset).toBe(5);
	});

	// -----------------------------------------------------------------------
	// 8. Delete expanded text selection
	// -----------------------------------------------------------------------
	it('8 — delete expanded text selection', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 5);

		session.apply(session.tr.delete_selection());
		expect(session.get('text_1').content.text).toBe(' world');
		expect(session.selection.anchor_offset).toBe(0);
		expect(session.selection.focus_offset).toBe(0);
	});

	// -----------------------------------------------------------------------
	// 9. Delete backward at position 0 triggers join
	// -----------------------------------------------------------------------
	it('9 — delete backward at position 0 joins with previous text node', () => {
		const session = create_session();
		set_text_selection(session, 'text_2', 'content', 0, 0);

		session.apply(session.tr.delete_selection('backward'));
		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(2);
		expect(session.get('text_1').content.text).toBe('Hello worldSecond paragraph');
		expect(session.selection.type).toBe('text');
		expect(session.selection.anchor_offset).toBe(11);
	});

	// -----------------------------------------------------------------------
	// 10. Delete forward at end joins with next text node
	// -----------------------------------------------------------------------
	it('10 — delete forward at end of text joins with next text node', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 11, 11);

		session.apply(session.tr.delete_selection('forward'));
		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(2);
		expect(session.get('text_1').content.text).toBe('Hello worldSecond paragraph');
	});

	// -----------------------------------------------------------------------
	// 11. Delete backward on empty text node deletes it
	// -----------------------------------------------------------------------
	it('11 — delete backward on empty text node removes it', () => {
		const session = create_session();
		const tr = session.tr;
		const empty_id = session.generate_id();
		tr.create({ id: empty_id, type: 'text', layout: 1, content: { text: '', annotations: [] } });
		tr.set(['page_1', 'body'], ['text_1', empty_id, 'text_2', 'text_3']);
		session.apply(tr);

		set_text_selection_by_path(session, ['page_1', 'body', 1, 'content'], 0, 0);
		session.apply(session.tr.delete_selection('backward'));

		expect(session.get(empty_id)).toBeUndefined();
		const body = session.get(['page_1', 'body']);
		expect(body).toEqual(['text_1', 'text_2', 'text_3']);
	});

	// -----------------------------------------------------------------------
	// 12. Delete entire text content via select-all + delete
	// -----------------------------------------------------------------------
	it('12 — delete entire text content via expanded selection', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 11);

		session.apply(session.tr.delete_selection());
		expect(session.get('text_1').content.text).toBe('');
		expect(session.selection.anchor_offset).toBe(0);
	});

	// -----------------------------------------------------------------------
	// 13. Insert newline character
	// -----------------------------------------------------------------------
	it('13 — insert newline character into text', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 5, 5);

		session.apply(session.tr.insert_text('\n'));
		expect(session.get('text_1').content.text).toBe('Hello\n world');
		expect(session.selection.anchor_offset).toBe(6);
	});

	// -----------------------------------------------------------------------
	// 14. Replace entire text with new text
	// -----------------------------------------------------------------------
	it('14 — replace entire node text with new text', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 11);

		session.apply(session.tr.insert_text('Replaced'));
		expect(session.get('text_1').content.text).toBe('Replaced');
		expect(session.selection.anchor_offset).toBe(8);
	});

	// -----------------------------------------------------------------------
	// 15. Insert text with backwards selection
	// -----------------------------------------------------------------------
	it('15 — insert text handles backwards (focus < anchor) selection', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 11, 0);

		session.apply(session.tr.insert_text('New'));
		expect(session.get('text_1').content.text).toBe('New');
		expect(session.selection.anchor_offset).toBe(3);
	});

	// -----------------------------------------------------------------------
	// 16. Multiple sequential inserts accumulate correctly
	// -----------------------------------------------------------------------
	it('16 — multiple sequential inserts accumulate', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 0);

		session.apply(session.tr.insert_text('A'), { batch: true });
		session.apply(session.tr.insert_text('B'), { batch: true });
		session.apply(session.tr.insert_text('C'), { batch: true });

		expect(session.get('text_1').content.text).toBe('ABCHello world');
	});

	// -----------------------------------------------------------------------
	// 17. Insert Unicode emoji
	// -----------------------------------------------------------------------
	it('17 — insert Unicode emoji character', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 5, 5);

		session.apply(session.tr.insert_text('🌍'));
		expect(session.get('text_1').content.text).toBe('Hello🌍 world');
		expect(session.selection.anchor_offset).toBe(6);
	});

	// -----------------------------------------------------------------------
	// 18. Delete backward on emoji removes entire grapheme
	// -----------------------------------------------------------------------
	it('18 — delete backward removes entire emoji grapheme', () => {
		const session = create_session();
		const tr = session.tr;
		tr.set(['text_1', 'content'], { text: 'A🌍B', annotations: [] });
		session.apply(tr);

		set_text_selection(session, 'text_1', 'content', 2, 2);
		session.apply(session.tr.delete_selection('backward'));
		expect(session.get('text_1').content.text).toBe('AB');
	});

	// -----------------------------------------------------------------------
	// 19. Delete backward at pos 0 with no previous node does nothing
	// -----------------------------------------------------------------------
	it('19 — delete backward at pos 0 of first text node returns false', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 0);

		const tr = session.tr;
		tr.delete_selection('backward');
		session.apply(tr);

		expect(session.get('text_1').content.text).toBe('Hello world');
	});

	// -----------------------------------------------------------------------
	// 20. Delete selection direction does not matter for expanded
	// -----------------------------------------------------------------------
	it('20 — expanded delete ignores direction parameter', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 2, 8);

		session.apply(session.tr.delete_selection('forward'));
		expect(session.get('text_1').content.text).toBe('Herld');
		expect(session.selection.anchor_offset).toBe(2);
	});
});
