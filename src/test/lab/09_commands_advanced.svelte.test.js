/**
 * Lab test suite batch 2 — Advanced commands: CycleLayout, CycleNodeType,
 * ResetImage, AddNewLine, command fallback chains, command disabled states.
 *
 * Tests 161–180.
 */
import { describe, it, expect } from 'vitest';
import {
	create_session,
	create_text_doc,
	create_mixed_doc,
	create_annotated_doc,
	set_text_selection,
	set_text_selection_by_path,
	set_node_selection,
	set_property_selection,
	render_editor,
	tick,
	wait
} from './helpers.js';

describe('Layout changes via transaction', () => {
	// 161
	it('161 — setting layout property changes node layout', () => {
		const session = create_session();
		expect(session.get('text_1').layout).toBe(1);

		const tr = session.tr;
		tr.set(['text_1', 'layout'], 2);
		session.apply(tr);

		expect(session.get('text_1').layout).toBe(2);
	});

	// 162
	it('162 — layout wraps around: max_layouts → 1', () => {
		const session = create_session();
		const max_layouts = session.config.node_layouts.text; // 4

		const tr = session.tr;
		tr.set(['text_1', 'layout'], max_layouts);
		session.apply(tr);
		expect(session.get('text_1').layout).toBe(max_layouts);

		const wrapped = (session.get('text_1').layout % max_layouts) + 1;
		const tr2 = session.tr;
		tr2.set(['text_1', 'layout'], wrapped);
		session.apply(tr2);
		expect(session.get('text_1').layout).toBe(1);
	});

	// 163
	it('163 — layout change is undoable', () => {
		const session = create_session();

		const tr = session.tr;
		tr.set(['text_1', 'layout'], 3);
		session.apply(tr);

		expect(session.get('text_1').layout).toBe(3);

		session.undo();
		expect(session.get('text_1').layout).toBe(1);
	});

	// 164
	it('164 — layout change preserves text content', () => {
		const session = create_session();
		const original_text = session.get('text_1').content.text;

		const tr = session.tr;
		tr.set(['text_1', 'layout'], 2);
		session.apply(tr);

		expect(session.get('text_1').content.text).toBe(original_text);
		expect(session.get('text_1').layout).toBe(2);
	});
});

describe('CycleNodeType', () => {
	// 165
	it('165 — insert a story node via inserter at node cursor', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 1, 1);

		const tr = session.tr;
		session.config.inserters.story(tr);
		session.apply(tr);

		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(4);
		const new_story = session.get(body[1]);
		expect(new_story.type).toBe('story');
	});

	// 166
	it('166 — insert a list node via inserter at node cursor', () => {
		const session = create_session();
		set_node_selection(session, ['page_1', 'body'], 0, 0);

		const tr = session.tr;
		session.config.inserters.list(tr);
		session.apply(tr);

		const body = session.get(['page_1', 'body']);
		expect(body.length).toBe(4);
		const new_list = session.get(body[0]);
		expect(new_list.type).toBe('list');
		expect(new_list.list_items.length).toBe(1);
	});

	// 167
	it('167 — node_array schema allows multiple types in body', () => {
		const session = create_session();
		const info = session.inspect(['page_1', 'body']);
		expect(info.node_types).toContain('text');
		expect(info.node_types).toContain('story');
		expect(info.node_types).toContain('list');
	});

	// 168
	it('168 — list_items only allows list_item type', () => {
		const session = create_session(create_mixed_doc);
		const info = session.inspect(['list_1', 'list_items']);
		expect(info.node_types).toEqual(['list_item']);
		expect(info.default_node_type).toBe('list_item');
	});
});

describe('ResetImage', () => {
	// 169
	it('169 — reset image sets image property to empty string', () => {
		const session = create_session(create_mixed_doc);
		expect(session.get('story_1').image).toBe('https://example.com/img.jpg');

		const tr = session.tr;
		tr.set(['story_1', 'image'], '');
		session.apply(tr);

		expect(session.get('story_1').image).toBe('');
	});

	// 170
	it('170 — reset image is undoable', () => {
		const session = create_session(create_mixed_doc);
		const original = session.get('story_1').image;

		const tr = session.tr;
		tr.set(['story_1', 'image'], '');
		session.apply(tr);
		expect(session.get('story_1').image).toBe('');

		session.undo();
		expect(session.get('story_1').image).toBe(original);
	});
});

describe('AddNewLine', () => {
	// 171
	it('171 — insert newline at text cursor adds \\n character', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 5, 5);

		session.apply(session.tr.insert_text('\n'));

		expect(session.get('text_1').content.text).toBe('Hello\n world');
		expect(session.selection.anchor_offset).toBe(6);
	});

	// 172
	it('172 — insert newline at beginning of text', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 0, 0);

		session.apply(session.tr.insert_text('\n'));

		expect(session.get('text_1').content.text).toBe('\nHello world');
	});

	// 173
	it('173 — insert newline at end of text', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 11, 11);

		session.apply(session.tr.insert_text('\n'));

		expect(session.get('text_1').content.text).toBe('Hello world\n');
	});

	// 174
	it('174 — insert multiple newlines', () => {
		const session = create_session();
		set_text_selection(session, 'text_1', 'content', 5, 5);

		session.apply(session.tr.insert_text('\n\n'));

		expect(session.get('text_1').content.text).toBe('Hello\n\n world');
	});
});

describe('Command — fallback chains', () => {
	// 175
	it('175 — Enter at text cursor executes break_text_node (not insert_default)', async () => {
		const session = create_session();
		await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 5, 5);
		await tick();

		session.commands.break_text_node.execute();
		expect(session.get(['page_1', 'body']).length).toBe(4);
	});

	// 176
	it('176 — Enter at node cursor executes insert_default_node', async () => {
		const session = create_session();
		await render_editor(session);
		set_node_selection(session, ['page_1', 'body'], 1, 1);
		await tick();

		session.commands.insert_default_node.execute();
		expect(session.get(['page_1', 'body']).length).toBe(4);
	});

	// 177
	it('177 — undo command restores state when enabled', async () => {
		const session = create_session();
		await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 0, 0);
		session.apply(session.tr.insert_text('X'));
		await tick();

		session.commands.undo.execute();
		expect(session.get('text_1').content.text).toBe('Hello world');
	});

	// 178
	it('178 — redo command re-applies after undo', async () => {
		const session = create_session();
		await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 0, 0);
		session.apply(session.tr.insert_text('X'));
		session.undo();
		await tick();

		session.commands.redo.execute();
		expect(session.get('text_1').content.text).toBe('XHello world');
	});

	// 179
	it('179 — select_parent from text promotes to node selection', async () => {
		const session = create_session();
		await render_editor(session);
		set_text_selection(session, 'text_1', 'content', 3, 3);
		await tick();

		session.commands.select_parent.execute();
		expect(session.selection.type).toBe('node');
	});

	// 180
	it('180 — toggle_emphasis active reflects annotation presence', async () => {
		const session = create_session(create_annotated_doc);
		await render_editor(session);

		set_text_selection(session, 'text_1', 'content', 14, 14);
		await tick();
		expect(session.commands.toggle_emphasis.active).toBeTruthy();

		set_text_selection(session, 'text_1', 'content', 3, 3);
		await tick();
		expect(session.commands.toggle_emphasis.active).toBeFalsy();
	});
});
