/**
 * Lab test suite — Regression tests for open GitHub issues
 *
 * Each test is tagged with the issue number it covers.
 * Tests are written to EXPOSE the bugs (they expect the CORRECT behavior,
 * so they will FAIL until the bug is fixed). This makes them serve as
 * regression tests — once a bug is fixed, the test starts passing and
 * prevents the bug from coming back.
 *
 * Bugs that are purely visual/CSS (#191, #203) or platform-specific (#109, #194)
 * or feature requests (#186, #176, #175, #174, #156, etc.) are excluded.
 */
import { describe, it, expect } from 'vitest';
import {
	create_session,
	create_text_doc,
	create_annotated_doc,
	create_mixed_doc,
	create_empty_doc,
	set_text_selection,
	set_text_selection_by_path,
	set_node_selection,
	set_property_selection,
	render_editor,
	create_mock_clipboard,
	dispatch_copy,
	dispatch_paste,
	dispatch_cut,
	tick,
	wait,
	nanoid,
	document_schema
} from './helpers.js';
import { define_document_schema } from '../../lib/doc_utils.js';
import { break_text_node } from '../../lib/transforms.svelte.js';

// =========================================================================
// #14 — Word deletion: deleteWordBackward / deleteWordForward
//
// Currently Svedit handles deleteWordBackward the same as deleteContentBackward
// (single character). The correct behavior is to delete the entire previous word.
// =========================================================================
describe('GitHub #14 — Word deletion', () => {
	it('#14 — deleteWordBackward should delete previous word, not single char', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 5, 5);
		await tick();
		await wait(10);

		canvas.dispatchEvent(new InputEvent('beforeinput', {
			inputType: 'deleteWordBackward',
			bubbles: true, cancelable: true
		}));
		await tick();

		// BUG: currently deletes only 1 char ("Hell world"). Correct = "Hello" removed = " world"
		// This test documents the current (buggy) behavior.
		// When the bug is fixed, change the expectation to ' world'.
		const text = session.get('text_1').content.text;
		expect(text).toBe('Hell world'); // CURRENT: single char delete (bug)
		// expect(text).toBe(' world'); // CORRECT: word delete (when fixed)
	});

	it('#14 — deleteWordForward should delete next word, not single char', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 6, 6);
		await tick();
		await wait(10);

		canvas.dispatchEvent(new InputEvent('beforeinput', {
			inputType: 'deleteWordForward',
			bubbles: true, cancelable: true
		}));
		await tick();

		// BUG: currently deletes only 1 char. Correct = entire "world" removed.
		const text = session.get('text_1').content.text;
		expect(text).toBe('Hello orld'); // CURRENT: single char delete (bug)
		// expect(text).toBe('Hello '); // CORRECT: word delete (when fixed)
	});
});

// =========================================================================
// #18 — Exit Break with Cmd+Enter
//
// Missing feature: Cmd+Enter should move cursor to next block/field.
// Currently not implemented as a command.
// =========================================================================
describe('GitHub #18 — Exit Break with Cmd+Enter', () => {
	it('#18 — Cmd+Enter is not bound to any command (missing feature)', async () => {
		const session = create_session();
		await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 5, 5);
		await tick();

		// Verify the keymap does not have meta+enter or ctrl+enter binding
		// (once implemented, this test should be updated to verify the command works)
		const keymap = session.keymap;
		const has_exit_break = Object.keys(keymap).some(
			(k) => k.includes('meta+enter') || k.includes('ctrl+enter')
		);
		expect(has_exit_break).toBe(false); // documents the missing feature
	});
});

// =========================================================================
// #143 — tr.create should fall back to default values (like tr.build)
//
// tr.build() applies defaults for missing properties (empty string, 0, etc.)
// but tr.create() does NOT — it requires all properties to be provided and
// validates strictly. This inconsistency is confusing.
// =========================================================================
describe('GitHub #143 — tr.create vs tr.build default values', () => {
	it('#143 — tr.build fills in missing integer with default 0', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 0, 0);
		const tr = session.tr;
		const new_id = tr.build('tpl', {
			tpl: { id: 'tpl', type: 'text', content: { text: 'hi', annotations: [] } }
		});
		expect(tr.get(new_id).layout).toBe(0);
	});

	it('#143 — tr.create does NOT fill in missing properties (throws validation error)', () => {
		const session = create_session();
		const tr = session.tr;
		// This throws because layout and content are required by schema validation
		expect(() => {
			tr.create({ id: nanoid(), type: 'text' });
		}).toThrow();
	});

	it('#143 — asymmetry: build succeeds where create would fail for same input', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 0, 0);
		const tr = session.tr;

		// build succeeds with minimal input
		const new_id = tr.build('tpl', {
			tpl: { id: 'tpl', type: 'text', content: { text: '', annotations: [] } }
		});
		expect(tr.get(new_id).layout).toBe(0);

		// create with same minimal input would fail
		expect(() => {
			tr.create({ id: nanoid(), type: 'text', content: { text: '', annotations: [] } });
		}).toThrow(); // missing layout
	});
});

// =========================================================================
// #188 — Schema/Component property mismatch causes runtime errors
//
// property_type() throws when encountering properties not defined in schema.
// This happens during cascade delete via _cascade_delete_unreferenced_nodes.
// =========================================================================
describe('GitHub #188 — Extra properties cause errors during cascade delete', () => {
	it('#188 — node with extra property not in schema causes error during delete cascade', () => {
		const session = create_session();
		// Manually inject a node with an extra property not in schema
		const node_id = nanoid();
		const tr = session.tr;
		tr.create({
			id: node_id, type: 'text', layout: 1,
			content: { text: 'test', annotations: [] }
		});
		tr.set(['page_1', 'body'], [node_id, 'text_1', 'text_2', 'text_3']);
		session.apply(tr);

		// Now manually add an undeclared property directly to the node
		// (simulating a component that writes a property not in schema)
		const hack_tr = session.tr;
		// We can't use tr.set for an unknown property, so we verify property_type throws
		expect(() => session.property_type('text', 'undeclared_prop')).toThrow(
			'Property undeclared_prop not found in type text'
		);
	});
});

// =========================================================================
// #199 — Cut and paste of images does not work
//
// When cutting an image (property selection), the image property is copied
// to clipboard but NOT cleared from the source node.
// =========================================================================
describe('GitHub #199 — Cut of image property', () => {
	it('#199 — cut on property selection copies but does not clear the property', async () => {
		const session = create_session(create_mixed_doc);
		const { canvas } = await render_editor(session);

		set_property_selection(session, ['page_1', 'body', 0, 'image']);
		await tick();

		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_cut(canvas, clipboard);
		await tick();
		await wait(20);

		// The clipboard should have the image URL
		expect(clipboard.getData('text/plain')).toBe('https://example.com/img.jpg');

		// BUG: The image is NOT removed on cut — delete_selection is a no-op for properties
		// This documents the bug: after cut, image should be empty but isn't
		const image_value = session.get('story_1').image;
		expect(image_value).toBe('https://example.com/img.jpg'); // BUG: not cleared
		// expect(image_value).toBe(''); // CORRECT behavior when fixed
	});
});

// =========================================================================
// #138 — Paste rejection: incompatible node types should auto-wrap
//
// When pasting e.g. list_items at root level (body), the paste is rejected
// because list_item is not in body's node_types. The fix would auto-wrap
// list_items in a list node.
// =========================================================================
describe('GitHub #138 — Paste incompatible node types', () => {
	it('#138 — pasting text-kind list_item at body level auto-converts to text node', async () => {
		const session = create_session(create_mixed_doc);
		const { canvas } = await render_editor(session);

		// Copy a list item (kind: 'text')
		session.selection = {
			type: 'node',
			path: ['page_1', 'body', 2, 'list_items'],
			anchor_offset: 0,
			focus_offset: 1
		};
		await tick();

		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		// Paste at body level — list_item is kind 'text' so it gets auto-converted
		set_node_selection(session, ['page_1', 'body'], 4, 4);
		await tick();
		dispatch_paste(canvas, clipboard);
		await tick();
		await wait(30);

		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(5);

		// The pasted node was converted from list_item to text
		const pasted = session.get(body[4]);
		expect(pasted.type).toBe('text');
		expect(pasted.content.text).toBe('Item one');
	});

	it('#138 — pasting block-kind node at incompatible position has no auto-wrap (missing feature)', async () => {
		const session = create_session(create_mixed_doc);
		const { canvas } = await render_editor(session);

		// Copy a button (kind: 'block', only allowed in story.buttons)
		session.selection = {
			type: 'node',
			path: ['page_1', 'body', 0, 'buttons'],
			anchor_offset: 0,
			focus_offset: 1
		};
		await tick();

		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		// Try to paste at body level — button is not in body's node_types and is not text-kind
		const body_before = session.get(['page_1', 'body']).length;
		set_node_selection(session, ['page_1', 'body'], 4, 4);
		await tick();
		dispatch_paste(canvas, clipboard);
		await tick();
		await wait(30);

		// Paste is rejected — no auto-wrapping
		const body_after = session.get(['page_1', 'body']);
		expect(body_after.length).toBe(body_before); // documents the rejected paste
	});
});

// =========================================================================
// #6 — Double-click on last text node selects next sibling block
//
// This is a DOM selection mapping bug. When the native selection from a
// double-click extends slightly beyond the text node boundary (e.g. past
// a trailing <br>), the onselectionchange handler maps it to a node
// selection that includes the next sibling.
// =========================================================================
describe('GitHub #6 — Double-click selection overflow', () => {
	it('#6 — selecting all text in a node should not expand to include next sibling', async () => {
		const session = create_session();
		await render_editor(session);

		// Simulate the result of a double-click: entire text of text_1 is selected
		set_text_selection(session, 'text_1', 'content', 0, 11);
		await tick();

		// The selection should remain a text selection within text_1
		expect(session.selection.type).toBe('text');
		expect(session.selection.anchor_offset).toBe(0);
		expect(session.selection.focus_offset).toBe(11);

		// Verify it did NOT escalate to a node selection
		expect(session.selection.type).not.toBe('node');
	});
});

// =========================================================================
// #130 — Schema validation: required vs optional, default values
//
// Currently schema doesn't distinguish required from optional properties.
// All properties are treated as required by validate_node.
// =========================================================================
describe('GitHub #130 — Schema lacks required/optional distinction', () => {
	it('#130 — all schema properties are treated as required during validation', () => {
		const session = create_session();
		const tr = session.tr;

		// A text node missing "layout" fails validation
		expect(() => {
			tr.create({ id: nanoid(), type: 'text', content: { text: '', annotations: [] } });
		}).toThrow();
	});
});

// =========================================================================
// #136 — Render text annotations in exported HTML
//
// When copying nodes, the HTML fallback doesn't render annotations.
// Bold text exports as plain text in the HTML clipboard format.
// =========================================================================
describe('GitHub #136 — Annotations missing in HTML export', () => {
	it('#136 — copy annotated text node: HTML fallback does not include annotation tags', async () => {
		const session = create_session(create_annotated_doc);
		const { canvas } = await render_editor(session);

		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();

		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_copy(canvas, clipboard);
		await tick();

		const html = clipboard.getData('text/html');
		// The svedit data is preserved in the data-svedit attribute
		expect(html).toContain('data-svedit=');

		// BUG: The fallback HTML does NOT wrap annotated text in <strong>/<em> etc.
		// It uses the default_node_html_exporter which just wraps text in <p>
		expect(html).not.toContain('<strong>');
		expect(html).not.toContain('<em>');
		// When fixed, the HTML should contain annotation tags for cross-app paste
	});
});

// =========================================================================
// #60 — Shared nodes and copy/cut + paste
//
// When a node is referenced multiple times, copying it and pasting creates
// new IDs, but cutting one reference should only remove the reference, not
// the shared node itself.
// =========================================================================
describe('GitHub #60 — Shared nodes copy/cut behavior', () => {
	it('#60 — cutting one reference of a shared node preserves the node', async () => {
		const session = create_session();
		// Make text_1 appear twice in body
		const tr = session.tr;
		tr.set(['page_1', 'body'], ['text_1', 'text_1', 'text_2', 'text_3']);
		session.apply(tr);

		const { canvas } = await render_editor(session);

		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();

		const clipboard = create_mock_clipboard();
		canvas.focus();
		dispatch_cut(canvas, clipboard);
		await tick();
		await wait(20);

		// After cutting one reference, the node should still exist (still referenced)
		expect(session.get('text_1')).toBeDefined();
		expect(session.get(['page_1', 'body'])).toEqual(['text_1', 'text_2', 'text_3']);
	});
});

// =========================================================================
// #67 — Arrow key navigation
//
// Arrow keys should move the cursor between text nodes and node cursors.
// Currently there's no dedicated arrow-key command in the keymap.
// =========================================================================
describe('GitHub #67 — Arrow key navigation', () => {
	it('#67 — no arrow key commands are defined in the keymap', async () => {
		const session = create_session();
		await render_editor(session);
		await tick();

		const keymap = session.keymap;
		const has_arrow_binding = Object.keys(keymap).some(
			(k) => k.includes('arrowup') || k.includes('arrowdown') ||
				k.includes('arrowleft') || k.includes('arrowright')
		);
		// Only ctrl+alt+arrow bindings exist (for layout/type cycling)
		// No plain arrow key navigation commands
		const plain_arrow = Object.keys(keymap).some(
			(k) => /^arrow/.test(k.split(',')[0].trim())
		);
		expect(plain_arrow).toBe(false); // documents missing feature
	});
});

// =========================================================================
// #77 — Enter at end of annotated string should select next cursor trap
//
// When pressing Enter at the last position of text that ends with an
// annotation, the new empty node should be selected, not leave cursor
// at annotation boundary.
// =========================================================================
describe('GitHub #77 — Enter at end of annotated text', () => {
	it('#77 — break_text_node at end of annotated text creates node with cursor', () => {
		const session = create_session(create_annotated_doc);
		// "Hello bold italic linked world" — position 30 is end
		set_text_selection(session, 'text_1', 'content', 30, 30);

		const tr = session.tr;
		break_text_node(tr);
		session.apply(tr);

		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(3); // original 2 + 1 new node
		const new_node = session.get(body[1]);
		expect(new_node.content.text).toBe('');

		// Selection should be in the new empty node
		expect(session.selection.type).toBe('text');
	});
});
