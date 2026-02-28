/**
 * Lab test suite — History (undo/redo) & commands
 *
 * Covers: undo single change, redo single change, multiple undo/redo,
 * undo restores selection, redo restores selection, history truncation on new edit,
 * batch history entries, command enable/disable state, keyboard shortcut commands,
 * SelectAll progressive expansion, SelectParent, CycleLayout, CycleNodeType.
 */
import { describe, it, expect } from 'vitest';
import {
	create_session,
	create_text_doc,
	create_mixed_doc,
	create_annotated_doc,
	set_text_selection,
	set_node_selection,
	set_property_selection,
	render_editor,
	tick,
	wait
} from './helpers.js';
import { break_text_node } from '../../lib/transforms.svelte.js';

describe('History — undo & redo', () => {
	// -----------------------------------------------------------------------
	// 66. Undo reverts a text insertion
	// -----------------------------------------------------------------------
	it('66 — undo reverts a text insertion', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 5, 5);

		session.apply(session.tr.insert_text(' there'));

		expect(session.get('text_1').content.text).toBe('Hello there world');
		expect(session.can_undo).toBe(true);

		session.undo();
		expect(session.get('text_1').content.text).toBe('Hello world');
		expect(session.can_undo).toBe(false);
	});

	// -----------------------------------------------------------------------
	// 67. Redo re-applies an undone change
	// -----------------------------------------------------------------------
	it('67 — redo re-applies an undone text insertion', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 5, 5);

		session.apply(session.tr.insert_text('X'));
		session.undo();
		expect(session.can_redo).toBe(true);

		session.redo();
		expect(session.get('text_1').content.text).toBe('HelloX world');
		expect(session.can_redo).toBe(false);
	});

	// -----------------------------------------------------------------------
	// 68. Multiple undos revert in order
	// -----------------------------------------------------------------------
	it('68 — multiple undo operations revert in reverse order', () => {
		const session = create_session();

		set_text_selection(session, 'text_1', 'content', 0, 0);
		session.apply(session.tr.insert_text('A'));
		session.apply(session.tr.insert_text('B'));
		session.apply(session.tr.insert_text('C'));

		expect(session.get('text_1').content.text).toBe('ABCHello world');

		session.undo();
		expect(session.get('text_1').content.text).toBe('ABHello world');
		session.undo();
		expect(session.get('text_1').content.text).toBe('AHello world');
		session.undo();
		expect(session.get('text_1').content.text).toBe('Hello world');
	});

	// -----------------------------------------------------------------------
	// 69. Undo restores selection before the change
	// -----------------------------------------------------------------------
	it('69 — undo restores selection to state before the change', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 3, 3);

		session.apply(session.tr.insert_text('X'));
		expect(session.selection.anchor_offset).toBe(4);

		session.undo();
		expect(session.selection.anchor_offset).toBe(3);
		expect(session.selection.focus_offset).toBe(3);
	});

	// -----------------------------------------------------------------------
	// 70. Redo restores selection after the change
	// -----------------------------------------------------------------------
	it('70 — redo restores selection to state after the change', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 3, 3);

		session.apply(session.tr.insert_text('X'));
		session.undo();
		session.redo();

		expect(session.selection.anchor_offset).toBe(4);
	});

	// -----------------------------------------------------------------------
	// 71. New edit after undo truncates redo history
	// -----------------------------------------------------------------------
	it('71 — new edit after undo truncates redo history', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 0);

		session.apply(session.tr.insert_text('A'));
		session.apply(session.tr.insert_text('B'));
		session.undo();

		session.apply(session.tr.insert_text('Z'));
		expect(session.can_redo).toBe(false);
		expect(session.get('text_1').content.text).toBe('AZHello world');
	});

	// -----------------------------------------------------------------------
	// 72. Undo after node deletion restores nodes
	// -----------------------------------------------------------------------
	it('72 — undo restores deleted nodes and their children', () => {
		const session = create_session(create_mixed_doc);
		set_node_selection(session, ['page_1', 'body'], 2, 3);

		session.apply(session.tr.delete_selection());
		expect(session.get('list_1')).toBeUndefined();

		session.undo();
		expect(session.get('list_1')).toBeDefined();
		expect(session.get('list_item_1')).toBeDefined();
		expect(session.get(['page_1', 'body']).length).toBe(4);
	});

	// -----------------------------------------------------------------------
	// 73. Undo after break_text_node rejoins nodes
	// -----------------------------------------------------------------------
	it('73 — undo after break_text_node restores original single node', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 5, 5);

		const tr = session.tr;
		break_text_node(tr);
		session.apply(tr);

		expect(session.get(['page_1', 'body']).length).toBe(4);

		session.undo();
		expect(session.get(['page_1', 'body']).length).toBe(3);
		expect(session.get('text_1').content.text).toBe('Hello world');
	});

	// -----------------------------------------------------------------------
	// 74. Batch mode groups sequential inserts into one history entry
	// -----------------------------------------------------------------------
	it('74 — batch mode groups sequential inserts into single history entry', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 0);

		session.apply(session.tr.insert_text('A'), { batch: true });
		session.apply(session.tr.insert_text('B'), { batch: true });
		session.apply(session.tr.insert_text('C'), { batch: true });

		expect(session.get('text_1').content.text).toBe('ABCHello world');
		expect(session.history.length).toBe(1);

		session.undo();
		expect(session.get('text_1').content.text).toBe('Hello world');
	});

	// -----------------------------------------------------------------------
	// 75. can_undo and can_redo reflect state correctly
	// -----------------------------------------------------------------------
	it('75 — can_undo and can_redo reflect history state', () => {
		const session = create_session();
		expect(session.can_undo).toBe(false);
		expect(session.can_redo).toBe(false);

		set_text_selection(session, 'text_1', 'content', 0, 0);
		session.apply(session.tr.insert_text('X'));

		expect(session.can_undo).toBe(true);
		expect(session.can_redo).toBe(false);

		session.undo();
		expect(session.can_undo).toBe(false);
		expect(session.can_redo).toBe(true);

		session.redo();
		expect(session.can_undo).toBe(true);
		expect(session.can_redo).toBe(false);
	});

	// -----------------------------------------------------------------------
	// 76. Undo annotation toggle restores annotation
	// -----------------------------------------------------------------------
	it('76 — undo annotation toggle restores the annotation', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 5);

		session.apply(session.tr.annotate_text('strong'));
		expect(session.get('text_1').content.annotations.length).toBe(1);

		session.undo();
		expect(session.get('text_1').content.annotations.length).toBe(0);
	});

	// -----------------------------------------------------------------------
	// 77. Undo removing an annotation restores it
	// -----------------------------------------------------------------------
	it('77 — undo removing annotation restores the annotation and its node', () => {
		const session = create_session(create_annotated_doc);
		set_text_selection(session, 'text_1', 'content', 8, 8);

		session.apply(session.tr.annotate_text('strong'));
		expect(session.get('strong_1')).toBeUndefined();

		session.undo();
		expect(session.get('strong_1')).toBeDefined();
		expect(session.get('text_1').content.annotations.find((a) => a.node_id === 'strong_1')).toBeDefined();
	});
});

describe('Commands', () => {
	// -----------------------------------------------------------------------
	// 78. SelectAll — first call selects all text in node
	// -----------------------------------------------------------------------
	it('78 — SelectAll first call selects all text in current node', async () => {
		const session = create_session();
		const { canvas } = await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 3, 3);
		await tick();

		session.commands.select_all.execute();
		expect(session.selection.type).toBe('text');
		expect(session.selection.anchor_offset).toBe(0);
		expect(session.selection.focus_offset).toBe(11);
	});

	// -----------------------------------------------------------------------
	// 79. SelectAll — second call selects containing node
	// -----------------------------------------------------------------------
	it('79 — SelectAll second call promotes to node selection', async () => {
		const session = create_session();
		await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 0, 11);
		await tick();

		session.commands.select_all.execute();
		expect(session.selection.type).toBe('node');
		expect(session.selection.anchor_offset).toBe(0);
		expect(session.selection.focus_offset).toBe(1);
	});

	// -----------------------------------------------------------------------
	// 80. SelectAll — third call selects entire node array
	// -----------------------------------------------------------------------
	it('80 — SelectAll third call selects entire node array', async () => {
		const session = create_session();
		await render_editor(session);
		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();

		session.commands.select_all.execute();
		expect(session.selection.type).toBe('node');
		expect(session.selection.anchor_offset).toBe(0);
		expect(session.selection.focus_offset).toBe(3);
	});

	// -----------------------------------------------------------------------
	// 81. SelectParent — text → node
	// -----------------------------------------------------------------------
	it('81 — SelectParent promotes text selection to parent node selection', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 5, 5);

		session.select_parent();
		expect(session.selection.type).toBe('node');
		expect(session.selection.path).toEqual(['page_1', 'body']);
		expect(session.selection.anchor_offset).toBe(0);
		expect(session.selection.focus_offset).toBe(1);
	});

	// -----------------------------------------------------------------------
	// 82. SelectParent — node → parent null at top level
	// -----------------------------------------------------------------------
	it('82 — SelectParent at top-level node sets selection to null', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 0, 1);

		session.select_parent();
		expect(session.selection).toBeNull();
	});

	// -----------------------------------------------------------------------
	// 83. SelectParent — property → node
	// -----------------------------------------------------------------------
	it('83 — SelectParent promotes property selection to node selection', () => {
		const session = create_session(create_mixed_doc);
		set_property_selection(session, ['page_1', 'body', 0, 'image']);

		session.select_parent();
		expect(session.selection.type).toBe('node');
		expect(session.selection.anchor_offset).toBe(0);
		expect(session.selection.focus_offset).toBe(1);
	});

	// -----------------------------------------------------------------------
	// 84. BreakTextNodeCommand is disabled for non-text selections
	// -----------------------------------------------------------------------
	it('84 — BreakTextNodeCommand is disabled for node selection', async () => {
		const session = create_session();
		await render_editor(session);
		set_node_selection(session, ['page_1', 'body'], 0, 1);
		await tick();

		expect(session.commands.break_text_node.disabled).toBe(true);
	});

	// -----------------------------------------------------------------------
	// 85. BreakTextNodeCommand is enabled for text selection
	// -----------------------------------------------------------------------
	it('85 — BreakTextNodeCommand is enabled for text selection', async () => {
		const session = create_session();
		await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 3, 3);
		await tick();

		expect(session.commands.break_text_node.disabled).toBe(false);
	});

	// -----------------------------------------------------------------------
	// 86. InsertDefaultNodeCommand is enabled only for collapsed node selection
	// -----------------------------------------------------------------------
	it('86 — InsertDefaultNodeCommand is only enabled for collapsed node cursor', async () => {
		const session = create_session();
		await render_editor(session);

		set_node_selection(session, ['page_1', 'body'], 1, 1);
		await tick();
		expect(session.commands.insert_default_node.disabled).toBe(false);

		set_node_selection(session, ['page_1', 'body'], 0, 2);
		await tick();
		expect(session.commands.insert_default_node.disabled).toBe(true);
	});

	// -----------------------------------------------------------------------
	// 87. Undo command disabled when no history
	// -----------------------------------------------------------------------
	it('87 — Undo command disabled when history is empty', async () => {
		const session = create_session();
		await render_editor(session);
		await tick();

		expect(session.commands.undo.disabled).toBe(true);
	});

	// -----------------------------------------------------------------------
	// 88. Undo command enabled after edit
	// -----------------------------------------------------------------------
	it('88 — Undo command enabled after an edit', async () => {
		const session = create_session();
		await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 0, 0);
		session.apply(session.tr.insert_text('X'));
		await tick();

		expect(session.commands.undo.disabled).toBe(false);
	});

	// -----------------------------------------------------------------------
	// 89. Redo command disabled when at latest
	// -----------------------------------------------------------------------
	it('89 — Redo command disabled when at the latest state', async () => {
		const session = create_session();
		await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 0, 0);
		session.apply(session.tr.insert_text('X'));
		await tick();

		expect(session.commands.redo.disabled).toBe(true);
	});

	// -----------------------------------------------------------------------
	// 90. Toggle strong command active state
	// -----------------------------------------------------------------------
	it('90 — toggle_strong active state reflects annotation presence', async () => {
		const session = create_session(create_annotated_doc);
		await render_editor(session);

		set_text_selection(session, 'text_1', 'content', 8, 8);
		await tick();
		expect(session.commands.toggle_strong.active).toBeTruthy();

		set_text_selection(session, 'text_1', 'content', 3, 3);
		await tick();
		expect(session.commands.toggle_strong.active).toBeFalsy();
	});
});
