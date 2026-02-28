/**
 * Lab test suite batch 2 — Input events, beforeinput, focus/blur, keyboard dispatch
 *
 * Tests 121–140: Verifies onbeforeinput handling (insertText, deleteContentBackward,
 * deleteContentForward, formatBold/Italic/Underline), focus/blur keymap scope
 * management, and keyboard event dispatching through KeyMapper.
 */
import { describe, it, expect } from 'vitest';
import {
	create_session,
	create_text_doc,
	create_annotated_doc,
	set_text_selection,
	set_node_selection,
	render_editor,
	tick,
	wait,
	KeyMapper,
	define_keymap
} from './helpers.js';

function create_input_event(input_type, data = null, options = {}) {
	const event = new InputEvent('beforeinput', {
		inputType: input_type,
		data,
		bubbles: true,
		cancelable: true,
		...options
	});
	return event;
}

function create_keyboard_event(key, modifiers = {}) {
	return new KeyboardEvent('keydown', {
		key,
		bubbles: true,
		cancelable: true,
		metaKey: modifiers.meta || false,
		ctrlKey: modifiers.ctrl || false,
		altKey: modifiers.alt || false,
		shiftKey: modifiers.shift || false
	});
}

describe('beforeinput — text insertion', () => {
	// 121
	it('121 — insertText beforeinput inserts character into model', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 5, 5);
		await tick();
		await wait(10);

		const event = create_input_event('insertText', 'X');
		canvas.dispatchEvent(event);
		await tick();

		expect(event.defaultPrevented).toBe(true);
		expect(session.get('text_1').content.text).toBe('HelloX world');
	});

	// 122
	it('122 — insertText with multi-char data inserts all', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 0, 0);
		await tick();
		await wait(10);

		canvas.dispatchEvent(create_input_event('insertText', 'ABC'));
		await tick();

		expect(session.get('text_1').content.text).toBe('ABCHello world');
	});

	// 123
	it('123 — insertText with null data is prevented (no-op)', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 5, 5);
		await tick();
		await wait(10);

		const event = create_input_event('insertText', null);
		canvas.dispatchEvent(event);
		await tick();

		expect(event.defaultPrevented).toBe(true);
		expect(session.get('text_1').content.text).toBe('Hello world');
	});
});

describe('beforeinput — deletion', () => {
	// 124
	it('124 — deleteContentBackward removes previous character', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 5, 5);
		await tick();
		await wait(10);

		canvas.dispatchEvent(create_input_event('deleteContentBackward'));
		await tick();

		expect(session.get('text_1').content.text).toBe('Hell world');
	});

	// 125
	it('125 — deleteContentForward removes next character', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 5, 5);
		await tick();
		await wait(10);

		canvas.dispatchEvent(create_input_event('deleteContentForward'));
		await tick();

		expect(session.get('text_1').content.text).toBe('Helloworld');
	});

	// 126
	it('126 — deleteWordBackward removes previous character (same as backward)', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 5, 5);
		await tick();
		await wait(10);

		canvas.dispatchEvent(create_input_event('deleteWordBackward'));
		await tick();

		expect(session.get('text_1').content.text).toBe('Hell world');
	});

	// 127
	it('127 — deleteWordForward removes next character (same as forward)', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 5, 5);
		await tick();
		await wait(10);

		canvas.dispatchEvent(create_input_event('deleteWordForward'));
		await tick();

		expect(session.get('text_1').content.text).toBe('Helloworld');
	});
});

describe('beforeinput — formatting', () => {
	// 128
	it('128 — formatBold toggles strong annotation on text selection', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 0, 5);
		await tick();
		await wait(10);

		canvas.dispatchEvent(create_input_event('formatBold'));
		await tick();

		const content = session.get('text_1').content;
		expect(content.annotations.length).toBe(1);
		const node = session.get(content.annotations[0].node_id);
		expect(node.type).toBe('strong');
	});

	// 129
	it('129 — formatItalic toggles emphasis annotation', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 0, 5);
		await tick();
		await wait(10);

		canvas.dispatchEvent(create_input_event('formatItalic'));
		await tick();

		const content = session.get('text_1').content;
		expect(content.annotations.length).toBe(1);
		const node = session.get(content.annotations[0].node_id);
		expect(node.type).toBe('emphasis');
	});

	// 130
	it('130 — formatUnderline toggles highlight annotation (remapped)', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 0, 5);
		await tick();
		await wait(10);

		canvas.dispatchEvent(create_input_event('formatUnderline'));
		await tick();

		const content = session.get('text_1').content;
		expect(content.annotations.length).toBe(1);
		const node = session.get(content.annotations[0].node_id);
		expect(node.type).toBe('highlight');
	});
});

describe('beforeinput — drag/drop rejection', () => {
	// 131
	it('131 — deleteByDrag is prevented', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 0, 5);
		await tick();
		await wait(10);

		const event = create_input_event('deleteByDrag');
		canvas.dispatchEvent(event);
		await tick();

		expect(event.defaultPrevented).toBe(true);
		expect(session.get('text_1').content.text).toBe('Hello world');
	});

	// 132
	it('132 — insertFromDrop is prevented', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 5, 5);
		await tick();
		await wait(10);

		const event = create_input_event('insertFromDrop');
		canvas.dispatchEvent(event);
		await tick();

		expect(event.defaultPrevented).toBe(true);
		expect(session.get('text_1').content.text).toBe('Hello world');
	});
});

describe('KeyMapper', () => {
	// 133
	it('133 — KeyMapper push/pop scope manages stack correctly', () => {
		const mapper = new KeyMapper();
		expect(mapper.scope_stack.length).toBe(0);

		const keymap1 = define_keymap({ 'ctrl+a': [{ is_enabled: () => true, execute: () => {} }] });
		const keymap2 = define_keymap({ 'ctrl+b': [{ is_enabled: () => true, execute: () => {} }] });

		mapper.push_scope(keymap1);
		expect(mapper.scope_stack.length).toBe(1);

		mapper.push_scope(keymap2);
		expect(mapper.scope_stack.length).toBe(2);

		const popped = mapper.pop_scope();
		expect(popped).toBe(keymap2);
		expect(mapper.scope_stack.length).toBe(1);
	});

	// 134
	it('134 — KeyMapper handle_keydown executes matching command', () => {
		const mapper = new KeyMapper();
		let executed = false;
		const keymap = define_keymap({
			'ctrl+s': [{ is_enabled: () => true, execute: () => { executed = true; } }]
		});
		mapper.push_scope(keymap);

		const event = create_keyboard_event('s', { ctrl: true });
		mapper.handle_keydown(event);

		expect(executed).toBe(true);
		expect(event.defaultPrevented).toBe(true);
	});

	// 135
	it('135 — KeyMapper skips disabled commands and tries next', () => {
		const mapper = new KeyMapper();
		let which_executed = '';
		const keymap = define_keymap({
			'ctrl+s': [
				{ is_enabled: () => false, execute: () => { which_executed = 'first'; } },
				{ is_enabled: () => true, execute: () => { which_executed = 'second'; } }
			]
		});
		mapper.push_scope(keymap);

		mapper.handle_keydown(create_keyboard_event('s', { ctrl: true }));
		expect(which_executed).toBe('second');
	});

	// 136
	it('136 — KeyMapper tries scopes from top to bottom', () => {
		const mapper = new KeyMapper();
		let which = '';
		const bottom = define_keymap({ 'ctrl+s': [{ is_enabled: () => true, execute: () => { which = 'bottom'; } }] });
		const top = define_keymap({ 'ctrl+s': [{ is_enabled: () => true, execute: () => { which = 'top'; } }] });

		mapper.push_scope(bottom);
		mapper.push_scope(top);

		mapper.handle_keydown(create_keyboard_event('s', { ctrl: true }));
		expect(which).toBe('top');
	});

	// 137
	it('137 — KeyMapper skip_onkeydown disables key handling', () => {
		const mapper = new KeyMapper();
		let executed = false;
		mapper.push_scope(define_keymap({
			'ctrl+s': [{ is_enabled: () => true, execute: () => { executed = true; } }]
		}));

		mapper.skip_onkeydown = true;
		mapper.handle_keydown(create_keyboard_event('s', { ctrl: true }));
		expect(executed).toBe(false);
	});

	// 138
	it('138 — define_keymap rejects invalid key combos', () => {
		expect(() => define_keymap({ 'ctrl+a+b': [{}] })).toThrow();
		expect(() => define_keymap({ '': [{}] })).toThrow();
	});

	// 139
	it('139 — KeyMapper handles comma-separated alternatives', () => {
		const mapper = new KeyMapper();
		let count = 0;
		mapper.push_scope(define_keymap({
			'meta+s,ctrl+s': [{ is_enabled: () => true, execute: () => { count++; } }]
		}));

		mapper.handle_keydown(create_keyboard_event('s', { meta: true }));
		expect(count).toBe(1);
		mapper.handle_keydown(create_keyboard_event('s', { ctrl: true }));
		expect(count).toBe(2);
	});

	// 140
	it('140 — KeyMapper does not match when extra modifier is pressed', () => {
		const mapper = new KeyMapper();
		let executed = false;
		mapper.push_scope(define_keymap({
			'ctrl+s': [{ is_enabled: () => true, execute: () => { executed = true; } }]
		}));

		mapper.handle_keydown(create_keyboard_event('s', { ctrl: true, shift: true }));
		expect(executed).toBe(false);
	});
});
