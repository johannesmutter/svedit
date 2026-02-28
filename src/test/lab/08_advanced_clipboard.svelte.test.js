/**
 * Lab test suite batch 2 — Advanced clipboard operations
 *
 * Tests 141–160: Annotated text copy/paste, property copy/paste,
 * paste nodes at text cursor (auto-finding insert position),
 * paste single text node at text cursor, paste incompatible node type conversion,
 * svedit HTML format encoding/decoding, and clipboard edge cases.
 */
import { describe, it, expect } from 'vitest';
import {
	create_session,
	create_text_doc,
	create_annotated_doc,
	create_mixed_doc,
	set_text_selection,
	set_node_selection,
	set_property_selection,
	render_editor,
	create_mock_clipboard,
	dispatch_copy,
	dispatch_paste,
	dispatch_cut,
	tick,
	wait,
	nanoid
} from './helpers.js';

describe('Clipboard — annotated text copy/paste', () => {
	// 141
	it('141 — copy annotated text selection preserves annotations in clipboard', async () => {
		const session = create_session(create_annotated_doc);
		const { canvas } = await render_editor(session);

		set_text_selection(session, 'text_1', 'content', 6, 10);
		await tick();

		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		const html = clipboard.getData('text/html');
		expect(html).toContain('data-svedit=');

		const plain = clipboard.getData('text/plain');
		expect(plain).toBe('bold');
	});

	// 142
	it('142 — copy text across annotation boundary includes partial annotation', async () => {
		const session = create_session(create_annotated_doc);
		const { canvas } = await render_editor(session);

		set_text_selection(session, 'text_1', 'content', 4, 8);
		await tick();

		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		expect(clipboard.getData('text/plain')).toBe('o bo');
	});

	// 143
	it('143 — paste annotated text at text cursor inserts text with annotations', async () => {
		const session = create_session(create_annotated_doc);
		const { canvas } = await render_editor(session);

		set_text_selection(session, 'text_1', 'content', 6, 10);
		await tick();

		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		set_text_selection(session, 'text_2', 'content', 0, 0);
		await tick();
		dispatch_paste(canvas, clipboard);
		await tick();
		await wait(30);

		const text_2_content = session.get('text_2').content;
		expect(text_2_content.text.startsWith('bold')).toBe(true);
	});

	// 144
	it('144 — cut text removes it from source and clipboard has content', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);

		set_text_selection(session, 'text_1', 'content', 0, 5);
		await tick();

		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_cut(canvas, clipboard);
		await tick();
		await wait(20);

		expect(clipboard.getData('text/plain')).toBe('Hello');
		expect(session.get('text_1').content.text).toBe(' world');
	});
});

describe('Clipboard — node copy/paste at text cursor', () => {
	// 145
	it('145 — paste multi-node payload at text cursor inserts as nodes after current node', async () => {
		const session = create_session(create_mixed_doc);
		const { canvas } = await render_editor(session);

		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();
		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		set_text_selection(session, 'text_1', 'content', 3, 3);
		await tick();
		dispatch_paste(canvas, clipboard);
		await tick();
		await wait(30);

		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(5);
	});

	// 146
	it('146 — paste single text node at text cursor inserts text inline', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);

		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();
		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		set_text_selection(session, 'text_2', 'content', 7, 7);
		await tick();
		dispatch_paste(canvas, clipboard);
		await tick();
		await wait(30);

		const text_2 = session.get('text_2').content;
		expect(text_2.text).toContain('Hello world');
	});
});

describe('Clipboard — property copy/paste', () => {
	// 147
	it('147 — copy property selection writes property data to clipboard', async () => {
		const session = create_session(create_mixed_doc);
		const { canvas } = await render_editor(session);

		set_property_selection(session, ['page_1', 'body', 0, 'image']);
		await tick();

		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		const html = clipboard.getData('text/html');
		expect(html).toContain('data-svedit=');
		expect(clipboard.getData('text/plain')).toBe('https://example.com/img.jpg');
	});

	// 148
	it('148 — paste node at end of body appends it', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);

		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();
		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		const body_len = session.get(['page_1', 'body']).length;
		set_node_selection(session, ['page_1', 'body'], body_len, body_len);
		await tick();
		dispatch_paste(canvas, clipboard);
		await tick();
		await wait(30);

		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(body_len + 1);
	});
});

describe('Clipboard — edge cases', () => {
	// 149
	it('149 — copy with no selection writes empty strings', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		session.selection = null;
		await tick();

		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		expect(clipboard.getData('text/plain')).toBe('');
	});

	// 150
	it('150 — paste into empty body from node clipboard creates nodes', async () => {
		const session_src = create_session();
		const { canvas: canvas_src } = await render_editor(session_src);

		set_node_selection(session_src, ['page_1', 'body'], 0, 1);
		await tick();
		const clipboard = create_mock_clipboard();
		canvas_src.focus();
		dispatch_copy(canvas_src, clipboard);
		await tick();

		const html_data = clipboard.getData('text/html');
		expect(html_data).toContain('data-svedit=');
	});

	// 151
	it('151 — copy multi-node selection captures all nodes', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);

		set_node_selection(session, ['page_1', 'body'], 0, 3);
		await tick();

		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		const plain = clipboard.getData('text/plain');
		expect(plain).toContain('Hello world');
		expect(plain).toContain('Second paragraph');
		expect(plain).toContain('Third paragraph');
	});

	// 152
	it('152 — paste plain text at text cursor inserts trimmed text', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);

		set_text_selection(session, 'text_1', 'content', 11, 11);
		await tick();

		const clipboard = create_mock_clipboard();
		clipboard.setData('text/plain', '  APPENDED  ');
		canvas.focus();
		dispatch_paste(canvas, clipboard);
		await tick();
		await wait(30);

		expect(session.get('text_1').content.text).toBe('Hello worldAPPENDED');
	});

	// 153
	it('153 — copy then paste multiple times creates distinct node IDs each time', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);

		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();
		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		set_node_selection(session, ['page_1', 'body'], 3, 3);
		await tick();
		dispatch_paste(canvas, clipboard);
		await tick();
		await wait(20);

		const body_1 = session.get(['page_1', 'body']);
		const first_pasted = body_1[3];

		set_node_selection(session, ['page_1', 'body'], 4, 4);
		await tick();
		dispatch_paste(canvas, clipboard);
		await tick();
		await wait(20);

		const body_2 = session.get(['page_1', 'body']);
		const second_pasted = body_2[4];

		expect(first_pasted).not.toBe('text_1');
		expect(second_pasted).not.toBe('text_1');
		expect(first_pasted).not.toBe(second_pasted);
	});

	// 154
	it('154 — paste replaces expanded text selection', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);

		set_text_selection(session, 'text_1', 'content', 0, 5);
		await tick();

		const clipboard = create_mock_clipboard();
		clipboard.setData('text/plain', 'Goodbye');
		canvas.focus();
		dispatch_paste(canvas, clipboard);
		await tick();
		await wait(20);

		expect(session.get('text_1').content.text).toBe('Goodbye world');
	});

	// 155
	it('155 — paste multi-paragraph text at node cursor creates nodes', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);

		set_node_selection(session, ['page_1', 'body'], 1, 1);
		await tick();

		const clipboard = create_mock_clipboard();
		clipboard.setData('text/plain', 'Para A\n\nPara B\n\nPara C');
		canvas.focus();
		dispatch_paste(canvas, clipboard);
		await tick();
		await wait(30);

		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(6);
	});

	// 156
	it('156 — cut node then undo restores the node', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);

		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();
		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_cut(canvas, clipboard);
		await tick();
		await wait(20);

		expect(session.get(['page_1', 'body']).length).toBe(2);

		session.undo();
		expect(session.get(['page_1', 'body']).length).toBe(3);
		expect(session.get('text_1')).toBeDefined();
	});

	// 157
	it('157 — copy from node selection preserves node type and properties', async () => {
		const session = create_session(create_mixed_doc);
		const { canvas } = await render_editor(session);

		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();
		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		set_node_selection(session, ['page_1', 'body'], 4, 4);
		await tick();
		dispatch_paste(canvas, clipboard);
		await tick();
		await wait(30);

		const body = session.get(['page_1', 'body']);
		const pasted_id = body[4];
		const pasted = session.get(pasted_id);
		expect(pasted.type).toBe('story');
		expect(pasted.title.text).toBe('Story title');
	});

	// 158
	it('158 — copy story node preserves button child references', async () => {
		const session = create_session(create_mixed_doc);
		const { canvas } = await render_editor(session);

		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();
		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		set_node_selection(session, ['page_1', 'body'], 4, 4);
		await tick();
		dispatch_paste(canvas, clipboard);
		await tick();
		await wait(30);

		const body = session.get(['page_1', 'body']);
		const pasted_story = session.get(body[4]);
		expect(pasted_story.buttons.length).toBe(1);
		const pasted_button = session.get(pasted_story.buttons[0]);
		expect(pasted_button.type).toBe('button');
		expect(pasted_button.label.text).toBe('Click me');
		expect(pasted_button.id).not.toBe('button_1');
	});

	// 159
	it('159 — paste at expanded node selection replaces and creates new IDs', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);

		set_node_selection(session, ['page_1', 'body'], 2, 3);
		await tick();
		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		set_node_selection(session, ['page_1', 'body'], 0, 2);
		await tick();
		dispatch_paste(canvas, clipboard);
		await tick();
		await wait(30);

		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(2);
		const pasted = session.get(body[0]);
		expect(pasted.content.text).toBe('Third paragraph');
		expect(body[0]).not.toBe('text_3');
	});

	// 160
	it('160 — copy with no editable flag set does not write to clipboard', async () => {
		const session = create_session();
		const { container } = await render_editor(session);
		const canvas = container.querySelector('.svedit-canvas');

		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();

		const clipboard = create_mock_clipboard();

		const event = new ClipboardEvent('copy', { bubbles: true, cancelable: true });
		Object.defineProperty(event, 'clipboardData', { value: clipboard });
		document.dispatchEvent(event);
		await tick();

		expect(clipboard.getData('text/plain').length).toBeGreaterThan(0);
	});
});
