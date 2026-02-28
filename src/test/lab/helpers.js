/**
 * Shared test helpers for the Svedit lab test suite.
 *
 * Provides utilities for creating sessions, rendering the editor,
 * simulating clipboard events, and asserting on selections and DOM state.
 */

import { tick } from 'svelte';
import { render } from 'vitest-browser-svelte';
import Session from '../../lib/Session.svelte.js';
import { define_document_schema } from '../../lib/doc_utils.js';
import { define_keymap, KeyMapper } from '../../lib/KeyMapper.svelte.js';
import Command, {
	UndoCommand,
	RedoCommand,
	SelectParentCommand,
	ToggleAnnotationCommand,
	AddNewLineCommand,
	BreakTextNodeCommand,
	SelectAllCommand,
	InsertDefaultNodeCommand
} from '../../lib/Command.svelte.js';
import nanoid from '../../routes/nanoid.js';

import Overlays from '../../routes/components/Overlays.svelte';
import NodeCursorTrap from '../../routes/components/NodeCursorTrap.svelte';
import Page from '../../routes/components/Page.svelte';
import Story from '../../routes/components/Story.svelte';
import Button from '../../routes/components/Button.svelte';
import Text from '../../routes/components/Text.svelte';
import List from '../../routes/components/List.svelte';
import ListItem from '../../routes/components/ListItem.svelte';
import SveditTest from '../testing_components/SveditTest.svelte';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const document_schema = define_document_schema({
	page: {
		kind: 'document',
		properties: {
			body: {
				type: 'node_array',
				node_types: ['text', 'story', 'list'],
				default_node_type: 'text'
			},
			keywords: { type: 'string_array' },
			daily_visitors: { type: 'integer_array' },
			created_at: { type: 'datetime' }
		}
	},
	button: {
		kind: 'block',
		properties: {
			label: { type: 'annotated_text', node_types: [], allow_newlines: false },
			href: { type: 'string' }
		}
	},
	text: {
		kind: 'text',
		properties: {
			layout: { type: 'integer' },
			content: { type: 'annotated_text', node_types: ['strong', 'emphasis', 'highlight', 'link'], allow_newlines: true }
		}
	},
	story: {
		kind: 'block',
		properties: {
			layout: { type: 'integer' },
			title: { type: 'annotated_text', node_types: ['emphasis', 'highlight'], allow_newlines: false },
			description: { type: 'annotated_text', node_types: ['strong', 'emphasis', 'highlight', 'link'], allow_newlines: true },
			buttons: { type: 'node_array', node_types: ['button'], default_node_type: 'button' },
			image: { type: 'string' }
		}
	},
	list_item: {
		kind: 'text',
		properties: {
			content: { type: 'annotated_text', node_types: ['strong', 'emphasis', 'highlight', 'link'], allow_newlines: true }
		}
	},
	list: {
		kind: 'block',
		properties: {
			layout: { type: 'integer' },
			list_items: {
				type: 'node_array',
				node_types: ['list_item'],
				default_node_type: 'list_item'
			}
		}
	},
	strong: { kind: 'annotation', properties: {} },
	emphasis: { kind: 'annotation', properties: {} },
	highlight: { kind: 'annotation', properties: {} },
	link: {
		kind: 'annotation',
		properties: {
			href: { type: 'string' }
		}
	}
});

// ---------------------------------------------------------------------------
// Session config
// ---------------------------------------------------------------------------

export const session_config = {
	generate_id: nanoid,
	system_components: { NodeCursorTrap, Overlays },
	node_components: { Page, Button, Text, Story, List, ListItem },
	node_layouts: { text: 4, story: 3, list: 5, list_item: 1 },
	create_commands_and_keymap: (context) => {
		const commands = {
			select_all: new SelectAllCommand(context),
			insert_default_node: new InsertDefaultNodeCommand(context),
			add_new_line: new AddNewLineCommand(context),
			break_text_node: new BreakTextNodeCommand(context),
			toggle_strong: new ToggleAnnotationCommand('strong', context),
			toggle_emphasis: new ToggleAnnotationCommand('emphasis', context),
			toggle_highlight: new ToggleAnnotationCommand('highlight', context),
			undo: new UndoCommand(context),
			redo: new RedoCommand(context),
			select_parent: new SelectParentCommand(context)
		};

		const keymap = define_keymap({
			'meta+a,ctrl+a': [commands.select_all],
			enter: [commands.break_text_node, commands.insert_default_node],
			'shift+enter': [commands.add_new_line, commands.insert_default_node],
			'meta+b,ctrl+b': [commands.toggle_strong],
			'meta+i,ctrl+i': [commands.toggle_emphasis],
			'meta+u,ctrl+u': [commands.toggle_highlight],
			'meta+z,ctrl+z': [commands.undo],
			'meta+shift+z,ctrl+shift+z': [commands.redo],
			escape: [commands.select_parent]
		});

		return { commands, keymap };
	},
	inserters: {
		button(tr) {
			const node = { id: nanoid(), type: 'button', label: { text: '', annotations: [] }, href: 'https://editable.website' };
			tr.create(node);
			tr.insert_nodes([node.id]);
			tr.set_selection({ type: 'node', path: [...tr.selection.path], anchor_offset: tr.selection.focus_offset, focus_offset: tr.selection.focus_offset });
		},
		text(tr, content) {
			const node = { id: nanoid(), type: 'text', layout: 1, content: content || { text: '', annotations: [] } };
			tr.create(node);
			tr.insert_nodes([node.id]);
			tr.set_selection({ type: 'text', path: [...tr.selection.path, tr.selection.focus_offset - 1, 'content'], anchor_offset: 0, focus_offset: 0 });
		},
		story(tr) {
			const btn = { id: nanoid(), type: 'button', label: { text: '', annotations: [] }, href: 'https://editable.website' };
			tr.create(btn);
			const node = { id: nanoid(), type: 'story', layout: 1, image: '', title: { text: '', annotations: [] }, description: { text: '', annotations: [] }, buttons: [btn.id] };
			tr.create(node);
			tr.insert_nodes([node.id]);
		},
		list(tr) {
			const item = { id: nanoid(), type: 'list_item', content: { text: '', annotations: [] } };
			tr.create(item);
			const node = { id: nanoid(), type: 'list', list_items: [item.id], layout: 3 };
			tr.create(node);
			tr.insert_nodes([node.id]);
		},
		list_item(tr, content) {
			const node = { id: nanoid(), type: 'list_item', content: content || { text: '', annotations: [] } };
			tr.create(node);
			tr.insert_nodes([node.id]);
			tr.set_selection({ type: 'text', path: [...tr.selection.path, tr.selection.focus_offset - 1, 'content'], anchor_offset: 0, focus_offset: 0 });
		}
	}
};

// ---------------------------------------------------------------------------
// Document fixtures
// ---------------------------------------------------------------------------

/** Minimal document with a few text nodes for basic editing tests. */
export function create_text_doc() {
	return {
		document_id: 'page_1',
		nodes: {
			text_1: { id: 'text_1', type: 'text', layout: 1, content: { text: 'Hello world', annotations: [] } },
			text_2: { id: 'text_2', type: 'text', layout: 1, content: { text: 'Second paragraph', annotations: [] } },
			text_3: { id: 'text_3', type: 'text', layout: 1, content: { text: 'Third paragraph', annotations: [] } },
			page_1: { id: 'page_1', type: 'page', body: ['text_1', 'text_2', 'text_3'], keywords: [], daily_visitors: [], created_at: '2025-01-01T00:00:00.000Z' }
		}
	};
}

/** Document with annotated text (bold, italic, links). */
export function create_annotated_doc() {
	return {
		document_id: 'page_1',
		nodes: {
			strong_1: { id: 'strong_1', type: 'strong' },
			emphasis_1: { id: 'emphasis_1', type: 'emphasis' },
			link_1: { id: 'link_1', type: 'link', href: 'https://example.com' },
			text_1: {
				id: 'text_1', type: 'text', layout: 1,
				content: {
					text: 'Hello bold italic linked world',
					annotations: [
						{ start_offset: 6, end_offset: 10, node_id: 'strong_1' },
						{ start_offset: 11, end_offset: 17, node_id: 'emphasis_1' },
						{ start_offset: 18, end_offset: 24, node_id: 'link_1' }
					]
				}
			},
			text_2: { id: 'text_2', type: 'text', layout: 1, content: { text: 'Plain text node', annotations: [] } },
			page_1: { id: 'page_1', type: 'page', body: ['text_1', 'text_2'], keywords: [], daily_visitors: [], created_at: '2025-01-01T00:00:00.000Z' }
		}
	};
}

/** Full demo-like document with mixed node types. */
export function create_mixed_doc() {
	return {
		document_id: 'page_1',
		nodes: {
			button_1: { id: 'button_1', type: 'button', label: { text: 'Click me', annotations: [] }, href: 'https://example.com' },
			story_1: { id: 'story_1', type: 'story', layout: 1, image: 'https://example.com/img.jpg', title: { text: 'Story title', annotations: [] }, description: { text: 'Story description', annotations: [] }, buttons: ['button_1'] },
			text_1: { id: 'text_1', type: 'text', layout: 1, content: { text: 'First paragraph', annotations: [] } },
			list_item_1: { id: 'list_item_1', type: 'list_item', content: { text: 'Item one', annotations: [] } },
			list_item_2: { id: 'list_item_2', type: 'list_item', content: { text: 'Item two', annotations: [] } },
			list_item_3: { id: 'list_item_3', type: 'list_item', content: { text: 'Item three', annotations: [] } },
			list_1: { id: 'list_1', type: 'list', layout: 1, list_items: ['list_item_1', 'list_item_2', 'list_item_3'] },
			text_2: { id: 'text_2', type: 'text', layout: 2, content: { text: 'Second paragraph', annotations: [] } },
			page_1: { id: 'page_1', type: 'page', body: ['story_1', 'text_1', 'list_1', 'text_2'], keywords: ['test'], daily_visitors: [42], created_at: '2025-01-01T00:00:00.000Z' }
		}
	};
}

/** Empty body document. */
export function create_empty_doc() {
	return {
		document_id: 'page_1',
		nodes: {
			page_1: { id: 'page_1', type: 'page', body: [], keywords: [], daily_visitors: [], created_at: '2025-01-01T00:00:00.000Z' }
		}
	};
}

/** Single empty text node. */
export function create_single_empty_text_doc() {
	return {
		document_id: 'page_1',
		nodes: {
			text_1: { id: 'text_1', type: 'text', layout: 1, content: { text: '', annotations: [] } },
			page_1: { id: 'page_1', type: 'page', body: ['text_1'], keywords: [], daily_visitors: [], created_at: '2025-01-01T00:00:00.000Z' }
		}
	};
}

// ---------------------------------------------------------------------------
// Session creation
// ---------------------------------------------------------------------------

export function create_session(doc_factory = create_text_doc) {
	return new Session(document_schema, doc_factory(), session_config);
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

export async function render_editor(session) {
	const result = render(SveditTest, { session });
	await tick();
	await wait(50);
	await tick();

	const canvas = result.container.querySelector('.svedit-canvas');
	if (canvas) canvas.focus();
	await tick();
	await wait(10);
	return { ...result, canvas };
}

// ---------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------

export function set_text_selection(session, node_id, prop, anchor, focus) {
	const body = session.get([session.doc.document_id, 'body']);
	const index = body.indexOf(node_id);
	if (index === -1) throw new Error(`Node ${node_id} not in body`);
	session.selection = {
		type: 'text',
		path: [session.doc.document_id, 'body', index, prop],
		anchor_offset: anchor,
		focus_offset: focus
	};
}

export function set_text_selection_by_path(session, path, anchor, focus) {
	session.selection = { type: 'text', path, anchor_offset: anchor, focus_offset: focus };
}

export function set_node_selection(session, container_path, anchor, focus) {
	session.selection = { type: 'node', path: container_path, anchor_offset: anchor, focus_offset: focus };
}

export function set_property_selection(session, path) {
	session.selection = { type: 'property', path };
}

// ---------------------------------------------------------------------------
// Clipboard mock helpers
// ---------------------------------------------------------------------------

export function create_mock_clipboard() {
	let stored_html = '';
	let stored_text = '';

	return {
		setData(format, data) {
			if (format === 'text/html') stored_html = data;
			else if (format === 'text/plain') stored_text = data;
		},
		getData(format) {
			if (format === 'text/html') return stored_html;
			if (format === 'text/plain') return stored_text;
			return '';
		},
		get items() { return []; }
	};
}

export function dispatch_copy(target_el, mock_clipboard) {
	const event = new ClipboardEvent('copy', { bubbles: true, cancelable: true });
	Object.defineProperty(event, 'clipboardData', { value: mock_clipboard, writable: false });
	document.dispatchEvent(event);
	return event;
}

export function dispatch_cut(target_el, mock_clipboard) {
	const event = new ClipboardEvent('cut', { bubbles: true, cancelable: true });
	Object.defineProperty(event, 'clipboardData', { value: mock_clipboard, writable: false });
	document.dispatchEvent(event);
	return event;
}

export function dispatch_paste(target_el, mock_clipboard) {
	const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
	Object.defineProperty(event, 'clipboardData', { value: mock_clipboard, writable: false });
	document.dispatchEvent(event);
	return event;
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

export function wait(ms = 10) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Document with multiple annotated text nodes for split/join tests. */
export function create_multi_annotated_doc() {
	return {
		document_id: 'page_1',
		nodes: {
			strong_1: { id: 'strong_1', type: 'strong' },
			emphasis_1: { id: 'emphasis_1', type: 'emphasis' },
			text_1: {
				id: 'text_1', type: 'text', layout: 1,
				content: {
					text: 'AB bold CD',
					annotations: [{ start_offset: 3, end_offset: 7, node_id: 'strong_1' }]
				}
			},
			text_2: {
				id: 'text_2', type: 'text', layout: 1,
				content: {
					text: 'EF italic GH',
					annotations: [{ start_offset: 3, end_offset: 9, node_id: 'emphasis_1' }]
				}
			},
			text_3: { id: 'text_3', type: 'text', layout: 1, content: { text: 'Plain text', annotations: [] } },
			page_1: { id: 'page_1', type: 'page', body: ['text_1', 'text_2', 'text_3'], keywords: [], daily_visitors: [], created_at: '2025-01-01T00:00:00.000Z' }
		}
	};
}

/** Document with a shared/duplicate node reference. */
export function create_shared_ref_doc() {
	return {
		document_id: 'page_1',
		nodes: {
			text_shared: { id: 'text_shared', type: 'text', layout: 1, content: { text: 'Shared', annotations: [] } },
			text_unique: { id: 'text_unique', type: 'text', layout: 1, content: { text: 'Unique', annotations: [] } },
			page_1: { id: 'page_1', type: 'page', body: ['text_shared', 'text_unique', 'text_shared'], keywords: [], daily_visitors: [], created_at: '2025-01-01T00:00:00.000Z' }
		}
	};
}

export { tick, nanoid, KeyMapper, define_keymap, Command };
