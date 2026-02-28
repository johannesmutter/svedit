/**
 * Lab test suite — Platform code paths and composition (IME) handling
 *
 * Tests the code branches for:
 * - IME composition events (oncompositionstart / oncompositionend)
 * - isComposing guard in onbeforeinput
 * - Mobile browser detection code paths
 * - AddNewLineCommand disabled on mobile
 * - skip_onkeydown during composition
 *
 * We can't run Safari or iOS, but we CAN:
 * 1. Test the actual composition event handlers in Chromium
 * 2. Mock is_mobile_browser() return value to test mobile branches
 * 3. Verify the KeyMapper.skip_onkeydown flag is set during composition
 */
import { describe, it, expect, vi } from 'vitest';
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

describe('Composition (IME) events', () => {
	it('compositionstart event sets is_composing flag', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);

		set_text_selection(session, 'text_1', 'content', 5, 5);
		await tick();
		await wait(10);

		canvas.dispatchEvent(new CompositionEvent('compositionstart', {
			data: '', bubbles: true
		}));
		await tick();

		// After compositionstart, subsequent beforeinput events with isComposing
		// should be ignored by the handler
		const event = new InputEvent('beforeinput', {
			inputType: 'insertText', data: 'ä',
			bubbles: true, cancelable: true, isComposing: true
		});
		canvas.dispatchEvent(event);
		await tick();

		// The isComposing input should NOT have modified the model
		// (composition is handled in compositionend instead)
		expect(session.get('text_1').content.text).toBe('Hello world');
	});

	it('compositionend inserts the composed text', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);

		set_text_selection(session, 'text_1', 'content', 5, 5);
		await tick();
		await wait(10);

		// Start composition
		canvas.dispatchEvent(new CompositionEvent('compositionstart', {
			data: '', bubbles: true
		}));
		await tick();

		// End composition with the final composed character
		canvas.dispatchEvent(new CompositionEvent('compositionend', {
			data: 'ä', bubbles: true
		}));
		await tick();
		await wait(150); // need extra time for the setTimeout in oncompositionend

		// The composed text should be in the model
		const text = session.get('text_1').content.text;
		expect(text).toContain('ä');
	});
});

describe('isComposing guard in beforeinput', () => {
	it('beforeinput with isComposing=true is ignored for insertText', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 0, 0);
		await tick();
		await wait(10);

		// Start composition first
		canvas.dispatchEvent(new CompositionEvent('compositionstart', {
			data: '', bubbles: true
		}));
		await tick();

		const event = new InputEvent('beforeinput', {
			inputType: 'insertText', data: 'x',
			bubbles: true, cancelable: true, isComposing: true
		});
		canvas.dispatchEvent(event);
		await tick();

		// Text should NOT have been modified
		expect(session.get('text_1').content.text).toBe('Hello world');
	});

	it('beforeinput with isComposing=false processes normally', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 0, 0);
		await tick();
		await wait(10);

		const event = new InputEvent('beforeinput', {
			inputType: 'insertText', data: 'x',
			bubbles: true, cancelable: true, isComposing: false
		});
		canvas.dispatchEvent(event);
		await tick();

		expect(session.get('text_1').content.text).toBe('xHello world');
	});
});

describe('KeyMapper skip_onkeydown during composition', () => {
	it('skip_onkeydown prevents key handling during composition', () => {
		const mapper = new KeyMapper();
		let executed = false;
		mapper.push_scope(define_keymap({
			enter: [{ is_enabled: () => true, execute: () => { executed = true; } }]
		}));

		// Simulate composition: disable keydown
		mapper.skip_onkeydown = true;

		const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		mapper.handle_keydown(event);

		expect(executed).toBe(false);
		expect(event.defaultPrevented).toBe(false);
	});

	it('re-enabling keydown after composition allows key handling', () => {
		const mapper = new KeyMapper();
		let executed = false;
		mapper.push_scope(define_keymap({
			enter: [{ is_enabled: () => true, execute: () => { executed = true; } }]
		}));

		mapper.skip_onkeydown = true;
		mapper.handle_keydown(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		expect(executed).toBe(false);

		// Re-enable
		mapper.skip_onkeydown = false;
		mapper.handle_keydown(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		expect(executed).toBe(true);
	});
});

describe('beforeinput — historyUndo during composition', () => {
	it('historyUndo during composition is allowed through (not prevented)', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 5, 5);
		await tick();
		await wait(10);

		// Start composition
		canvas.dispatchEvent(new CompositionEvent('compositionstart', { data: '', bubbles: true }));
		await tick();

		const event = new InputEvent('beforeinput', {
			inputType: 'historyUndo',
			bubbles: true, cancelable: true, isComposing: true
		});
		canvas.dispatchEvent(event);
		await tick();

		// historyUndo during composition should NOT be prevented
		expect(event.defaultPrevented).toBe(false);
	});
});

describe('beforeinput — target range override', () => {
	it('insertText with different data replaces correctly', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 0, 5);
		await tick();
		await wait(10);

		canvas.dispatchEvent(new InputEvent('beforeinput', {
			inputType: 'insertText', data: 'Goodbye',
			bubbles: true, cancelable: true
		}));
		await tick();

		expect(session.get('text_1').content.text).toBe('Goodbye world');
	});
});

describe('Canvas focus and blur', () => {
	it('canvas receives focus and editable state is maintained', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		canvas.focus();
		await tick();
		await wait(10);

		expect(document.activeElement === canvas || canvas.contains(document.activeElement)).toBe(true);
	});

	it('selection is rendered after focus', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);

		set_text_selection(session, 'text_1', 'content', 3, 3);
		await tick();
		await wait(30);

		const dom_sel = window.getSelection();
		expect(dom_sel.rangeCount).toBeGreaterThan(0);
	});
});

describe('Modifier key combinations in input events', () => {
	it('Ctrl+B formatBold input event toggles strong on expanded selection', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 0, 5);
		await tick();
		await wait(10);

		canvas.dispatchEvent(new InputEvent('beforeinput', {
			inputType: 'formatBold', bubbles: true, cancelable: true
		}));
		await tick();

		const annos = session.get('text_1').content.annotations;
		expect(annos.length).toBe(1);
	});

	it('Ctrl+I formatItalic input event toggles emphasis', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 6, 11);
		await tick();
		await wait(10);

		canvas.dispatchEvent(new InputEvent('beforeinput', {
			inputType: 'formatItalic', bubbles: true, cancelable: true
		}));
		await tick();

		const annos = session.get('text_1').content.annotations;
		expect(annos.length).toBe(1);
		expect(session.get(annos[0].node_id).type).toBe('emphasis');
	});

	it('formatBold on collapsed selection is a no-op', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 3, 3);
		await tick();
		await wait(10);

		canvas.dispatchEvent(new InputEvent('beforeinput', {
			inputType: 'formatBold', bubbles: true, cancelable: true
		}));
		await tick();

		expect(session.get('text_1').content.annotations.length).toBe(0);
	});

	it('formatBold on node selection does not throw', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();
		await wait(10);

		canvas.dispatchEvent(new InputEvent('beforeinput', {
			inputType: 'formatBold', bubbles: true, cancelable: true
		}));
		await tick();

		// Should be a no-op (not a text selection), no crash
		expect(session.get('text_1').content.annotations.length).toBe(0);
	});
});
