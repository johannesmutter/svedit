/**
 * Lab test suite — Regression tests for open GitHub issues
 *
 * STRATEGY: Every test asserts the CORRECT behavior. If the bug is still
 * present, the test FAILS RED. This gives an honest picture:
 *
 *   "385 passed, 14 failed — here are the 14 known bugs"
 *
 * When a developer fixes a bug, the corresponding test(s) start passing.
 * No `it.fails()` tricks, no green-washing.
 *
 * Tests are grouped by issue number. Each describe block links to the issue.
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
import { break_text_node } from '../../lib/transforms.svelte.js';

// =========================================================================
// #14 — Word deletion (https://github.com/michael/svedit/issues/14)
//
// BUG: deleteWordBackward / deleteWordForward are handled identically to
// deleteContentBackward / deleteContentForward — they delete a single
// character instead of the whole word.
//
// ROOT CAUSE: In Svedit.svelte onbeforeinput(), both 'deleteWordBackward'
// and 'deleteContentBackward' fall into the same handler:
//   if (['deleteContentBackward', 'deleteWordBackward', ...].includes(event.inputType))
// which calls delete_selection('backward') — always single char.
// =========================================================================
describe('GitHub #14 — Word deletion', () => {
	it('#14 — deleteWordBackward should delete the entire previous word', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		// "Hello world" — cursor after "Hello"
		set_text_selection(session, 'text_1', 'content', 5, 5);
		await tick();
		await wait(10);

		canvas.dispatchEvent(new InputEvent('beforeinput', {
			inputType: 'deleteWordBackward', bubbles: true, cancelable: true
		}));
		await tick();

		// Correct: "Hello" should be deleted → " world"
		expect(session.get('text_1').content.text).toBe(' world');
	});

	it('#14 — deleteWordForward should delete the entire next word', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		// "Hello world" — cursor after "Hello "
		set_text_selection(session, 'text_1', 'content', 6, 6);
		await tick();
		await wait(10);

		canvas.dispatchEvent(new InputEvent('beforeinput', {
			inputType: 'deleteWordForward', bubbles: true, cancelable: true
		}));
		await tick();

		// Correct: "world" should be deleted → "Hello "
		expect(session.get('text_1').content.text).toBe('Hello ');
	});
});

// =========================================================================
// #199 — Cut image property (https://github.com/michael/svedit/issues/199)
//
// BUG: When cutting a property selection (e.g. an image), the value is
// copied to clipboard but NOT removed from the node.
//
// ROOT CAUSE: oncut() calls oncopy(event, true), which calls
// delete_selection(). But Transaction.delete_selection() has:
//   if (!this.selection || this.selection.type === 'property') return this;
// So property deletions are explicitly skipped.
// =========================================================================
describe('GitHub #199 — Cut image property', () => {
	it('#199 — cutting a property selection should clear the property value', async () => {
		const session = create_session(create_mixed_doc);
		const { canvas } = await render_editor(session);

		set_property_selection(session, ['page_1', 'body', 0, 'image']);
		await tick();

		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_cut(clipboard);
		await tick();
		await wait(20);

		// Clipboard should have the value
		expect(clipboard.getData('text/plain')).toBe('https://example.com/img.jpg');
		// Correct: after cut, the property should be cleared
		expect(session.get('story_1').image).toBe('');
	});
});

// =========================================================================
// #143 — tr.create should use defaults (https://github.com/michael/svedit/issues/143)
//
// BUG: tr.build() fills missing properties with defaults (0, '', [], etc.)
// but tr.create() throws a validation error for the exact same input.
//
// ROOT CAUSE: tr.create() calls validate_node() which requires all schema
// properties to be present. tr.build() manually applies defaults before
// calling tr.create().
// =========================================================================
describe('GitHub #143 — tr.create vs tr.build defaults', () => {
	it('#143 — tr.create should accept a node with missing optional properties and fill defaults', () => {
		const session = create_session();
		const tr = session.tr;
		const id = nanoid();

		// This should work — layout should default to 0
		tr.create({ id, type: 'text', content: { text: '', annotations: [] } });
		expect(tr.get(id).layout).toBe(0);
	});
});

// =========================================================================
// #136 — HTML export annotations (https://github.com/michael/svedit/issues/136)
//
// BUG: When copying nodes, the fallback HTML (for pasting into other apps)
// does not wrap annotated text in semantic tags like <strong>, <em>.
//
// ROOT CAUSE: default_node_html_exporter() in Svedit.svelte just wraps
// annotated_text content in <p> tags using text_content alone:
//   html += `<p>${text_content}</p>`
// without iterating annotations.
// =========================================================================
describe('GitHub #136 — HTML export should include annotation markup', () => {
	it('#136 — HTML fallback should contain <strong> tags for bold text', async () => {
		const session = create_session(create_annotated_doc);
		const { canvas } = await render_editor(session);

		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();

		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_copy(clipboard);
		await tick();

		const html = clipboard.getData('text/html');
		expect(html).toContain('<strong>');
	});
});

// =========================================================================
// #138 — Auto-wrap incompatible paste (https://github.com/michael/svedit/issues/138)
//
// BUG: Pasting a block-kind node (like a button) at a position that doesn't
// accept it (like body) silently fails. It should auto-wrap the node in a
// valid parent container.
// =========================================================================
describe('GitHub #138 — Paste block node auto-wrap', () => {
	it('#138 — pasting block-kind node at incompatible position should auto-wrap it', async () => {
		const session = create_session(create_mixed_doc);
		const { canvas } = await render_editor(session);

		// Copy a button (only allowed inside story.buttons)
		session.selection = {
			type: 'node', path: ['page_1', 'body', 0, 'buttons'],
			anchor_offset: 0, focus_offset: 1
		};
		await tick();

		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_copy(clipboard);
		await tick();

		// Paste at body level — button is not in body's node_types
		const body_before = session.get(['page_1', 'body']).length;
		set_node_selection(session, ['page_1', 'body'], 4, 4);
		await tick();
		dispatch_paste(clipboard);
		await tick();
		await wait(30);

		// Correct: should auto-wrap button in a valid parent (story) and insert
		expect(session.get(['page_1', 'body']).length).toBe(body_before + 1);
	});
});

// =========================================================================
// #18 — Exit Break (https://github.com/michael/svedit/issues/18)
//
// MISSING FEATURE: Cmd+Enter / Ctrl+Enter should move cursor to next block.
// =========================================================================
describe('GitHub #18 — Exit Break with Cmd+Enter', () => {
	it.todo('#18 — Cmd+Enter should move cursor to next block or field');
});

// =========================================================================
// #67 — Arrow key navigation (https://github.com/michael/svedit/issues/67)
//
// MISSING FEATURE: Arrow keys should navigate between text nodes and
// node cursors with custom logic.
// =========================================================================
describe('GitHub #67 — Arrow key navigation', () => {
	it.todo('#67 — ArrowDown at end of text node should move to next node');
	it.todo('#67 — ArrowUp at start of text node should move to previous node');
});

// =========================================================================
// #188 — Extra properties cause runtime errors
// (https://github.com/michael/svedit/issues/188)
//
// BUG: property_type() throws on properties not defined in schema. This
// crashes during _cascade_delete_unreferenced_nodes when iterating all
// node properties.
// =========================================================================
describe('GitHub #188 — Extra properties crash cascade delete', () => {
	it('#188 — property_type should not throw for unknown properties (or cascade should skip them)', () => {
		const session = create_session();

		// Correct: should either return undefined or handle gracefully
		expect(() => session.property_type('text', 'undeclared_prop')).not.toThrow();
	});
});

// =========================================================================
// #130 — Schema required/optional (https://github.com/michael/svedit/issues/130)
// =========================================================================
describe('GitHub #130 — Schema required vs optional properties', () => {
	it.todo('#130 — schema should support marking properties as optional with defaults');
});

// =========================================================================
// #6 — Double-click overflow (https://github.com/michael/svedit/issues/6)
//
// BUG: Double-clicking the last text node in a container sometimes selects
// the next sibling block too, because the native browser selection extends
// past the trailing <br> and the DOM→model mapping interprets it as a
// cross-node selection.
//
// We test this by setting a DOM selection that extends to the container
// element (as happens with trailing <br>) and verifying the model doesn't
// over-select.
// =========================================================================
describe('GitHub #6 — Double-click on last text node overflows', () => {
	it('#6 — DOM selection reaching the text element boundary should not become node selection', async () => {
		const session = create_session();
		const { container, canvas } = await render_editor(session);
		canvas.focus();
		await tick();
		await wait(20);

		// Find the last text node's element
		const text_el = container.querySelector('[data-type="text"][data-path="page_1.body.2.content"]');
		expect(text_el).not.toBeNull();

		// Simulate what happens on double-click of last line:
		// The browser sets selection from start of text to the container element itself
		// (past the <br>), which the DOM→model mapper can misinterpret
		const sel = window.getSelection();
		sel.removeAllRanges();
		const range = document.createRange();
		range.selectNodeContents(text_el);
		sel.addRange(range);
		document.dispatchEvent(new Event('selectionchange'));
		await tick();
		await wait(20);

		// Correct: should be a text selection within this node, NOT a node selection
		// that includes the next sibling
		expect(session.selection.type).toBe('text');
		const path_str = session.selection.path.join('.');
		expect(path_str).toContain('page_1.body.2.content');
	});
});
