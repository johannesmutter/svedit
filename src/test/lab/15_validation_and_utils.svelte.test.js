/**
 * Lab test suite — Validation, doc_utils paths, utility edge cases
 *
 * Covers: validate_node error branches, validate_document_schema,
 * get() deep path resolution, utf16/char offset conversions,
 * get_char_at, traverse edge cases, doc_utils.property_type,
 * inspect at root level, count_references with annotated_text.
 */
import { describe, it, expect } from 'vitest';
import {
	create_session,
	create_text_doc,
	create_annotated_doc,
	create_mixed_doc,
	create_shared_ref_doc,
	document_schema,
	nanoid
} from './helpers.js';
import {
	get_char_length,
	get_char_at,
	char_slice,
	utf16_to_char_offset,
	char_to_utf16_offset,
	traverse,
	snake_to_pascal,
	split_annotated_text,
	join_annotated_text
} from '../../lib/utils.js';
import { define_document_schema } from '../../lib/doc_utils.js';

describe('validate_node — error paths', () => {
	it('create node with empty id throws', () => {
		const session = create_session();
		const tr = session.tr;
		expect(() => {
			tr.create({ id: '', type: 'text', layout: 1, content: { text: '', annotations: [] } });
		}).toThrow('invalid id');
	});

	it('create node with unknown type throws', () => {
		const session = create_session();
		const tr = session.tr;
		expect(() => {
			tr.create({ id: nanoid(), type: 'nonexistent', layout: 1 });
		}).toThrow('invalid type');
	});

	it('create node with wrong property type throws', () => {
		const session = create_session();
		const tr = session.tr;
		expect(() => {
			tr.create({ id: nanoid(), type: 'text', layout: 'not_an_int', content: { text: '', annotations: [] } });
		}).toThrow('invalid property');
	});

	it('create node with invalid annotated_text throws', () => {
		const session = create_session();
		const tr = session.tr;
		expect(() => {
			tr.create({ id: nanoid(), type: 'text', layout: 1, content: 'not_an_object' });
		}).toThrow('invalid property');
	});

	it('create node with invalid node_array (not an array) throws', () => {
		const session = create_session(create_mixed_doc);
		const tr = session.tr;
		expect(() => {
			tr.create({ id: nanoid(), type: 'list', layout: 1, list_items: 'not_an_array' });
		}).toThrow('array of node ids');
	});
});

describe('validate_document_schema', () => {
	it('define_document_schema is an identity passthrough (no validation at define time)', () => {
		const schema = define_document_schema({
			page: {
				kind: 'document',
				properties: {
					body: { type: 'node_array', node_types: ['missing_type'], default_node_type: 'missing_type' }
				}
			}
		});
		expect(schema.page).toBeDefined();
		expect(schema.page.properties.body.node_types).toEqual(['missing_type']);
	});
});

describe('get() — deep path resolution', () => {
	it('get annotated_text.text returns the text string', () => {
		const session = create_session();
		const text = session.get(['page_1', 'body', 0, 'content', 'text']);
		expect(text).toBe('Hello world');
	});

	it('get annotated_text.annotations returns annotations array', () => {
		const session = create_session(create_annotated_doc);
		const annos = session.get(['page_1', 'body', 0, 'content', 'annotations']);
		expect(Array.isArray(annos)).toBe(true);
		expect(annos.length).toBe(3);
	});

	it('get annotation by index returns annotation object', () => {
		const session = create_session(create_annotated_doc);
		const anno = session.get(['page_1', 'body', 0, 'content', 'annotations', 0]);
		expect(anno.node_id).toBe('strong_1');
		expect(anno.start_offset).toBe(6);
	});

	it('get annotation.node_id resolves to annotation node', () => {
		const session = create_session(create_annotated_doc);
		const node = session.get(['page_1', 'body', 0, 'content', 'annotations', 0, 'node_id']);
		expect(node.id).toBe('strong_1');
		expect(node.type).toBe('strong');
	});

	it('get annotation.start_offset returns offset', () => {
		const session = create_session(create_annotated_doc);
		const val = session.get(['page_1', 'body', 0, 'content', 'annotations', 2, 'start_offset']);
		expect(val).toBe(18);
	});

	it('get annotation.end_offset returns offset', () => {
		const session = create_session(create_annotated_doc);
		const val = session.get(['page_1', 'body', 0, 'content', 'annotations', 2, 'end_offset']);
		expect(val).toBe(24);
	});

	it('get node through node property resolves referenced node', () => {
		const session = create_session(create_mixed_doc);
		const items = session.get(['list_1', 'list_items']);
		expect(items).toEqual(['list_item_1', 'list_item_2', 'list_item_3']);
	});
});

describe('UTF-16 / grapheme offset conversions', () => {
	it('utf16_to_char_offset for ASCII string is identity', () => {
		expect(utf16_to_char_offset('Hello', 3)).toBe(3);
	});

	it('utf16_to_char_offset handles emoji (2 code units)', () => {
		expect(utf16_to_char_offset('a😀b', 3)).toBe(2);
	});

	it('utf16_to_char_offset at 0 returns 0', () => {
		expect(utf16_to_char_offset('a😀b', 0)).toBe(0);
	});

	it('utf16_to_char_offset for empty string returns 0', () => {
		expect(utf16_to_char_offset('', 0)).toBe(0);
	});

	it('char_to_utf16_offset for ASCII is identity', () => {
		expect(char_to_utf16_offset('Hello', 3)).toBe(3);
	});

	it('char_to_utf16_offset handles emoji', () => {
		expect(char_to_utf16_offset('a😀b', 2)).toBe(3);
	});

	it('char_to_utf16_offset at 0 returns 0', () => {
		expect(char_to_utf16_offset('a😀b', 0)).toBe(0);
	});

	it('char_to_utf16_offset for empty string returns 0', () => {
		expect(char_to_utf16_offset('', 0)).toBe(0);
	});

	it('round-trip: char_to_utf16 then utf16_to_char restores original offset', () => {
		const str = 'Hello 🌍 World 🚀!';
		for (let i = 0; i <= get_char_length(str); i++) {
			const utf16 = char_to_utf16_offset(str, i);
			const back = utf16_to_char_offset(str, utf16);
			expect(back).toBe(i);
		}
	});
});

describe('get_char_at', () => {
	it('returns correct character for ASCII', () => {
		expect(get_char_at('Hello', 0)).toBe('H');
		expect(get_char_at('Hello', 4)).toBe('o');
	});

	it('returns full emoji as single character', () => {
		expect(get_char_at('a😀b', 1)).toBe('😀');
	});

	it('returns character after emoji', () => {
		expect(get_char_at('a😀b', 2)).toBe('b');
	});
});

describe('traverse edge cases', () => {
	it('traverse with missing root returns empty array', () => {
		const result = traverse('nonexistent', document_schema, {});
		expect(result).toEqual([]);
	});

	it('traverse handles nodes with empty node_arrays', () => {
		const nodes = {
			page_1: { id: 'page_1', type: 'page', body: [], keywords: [], daily_visitors: [], created_at: '2025-01-01T00:00:00.000Z' }
		};
		const result = traverse('page_1', document_schema, nodes);
		expect(result.length).toBe(1);
		expect(result[0].id).toBe('page_1');
	});

	it('traverse does not infinite-loop on duplicate references', () => {
		const nodes = {
			text_1: { id: 'text_1', type: 'text', layout: 1, content: { text: '', annotations: [] } },
			page_1: { id: 'page_1', type: 'page', body: ['text_1', 'text_1'], keywords: [], daily_visitors: [], created_at: '2025-01-01T00:00:00.000Z' }
		};
		const result = traverse('page_1', document_schema, nodes);
		expect(result.length).toBe(2);
	});

	it('traverse handles missing child node gracefully', () => {
		const nodes = {
			page_1: { id: 'page_1', type: 'page', body: ['nonexistent'], keywords: [], daily_visitors: [], created_at: '2025-01-01T00:00:00.000Z' }
		};
		const result = traverse('page_1', document_schema, nodes);
		expect(result.length).toBe(1);
	});
});

describe('Session.inspect edge cases', () => {
	it('inspect root node returns node info', () => {
		const session = create_session();
		const info = session.inspect(['page_1']);
		expect(info.kind).toBe('node');
		expect(info.id).toBe('page_1');
		expect(info.type).toBe('page');
	});

	it('inspect property returns property definition', () => {
		const session = create_session();
		const info = session.inspect(['page_1', 'body']);
		expect(info.kind).toBe('property');
		expect(info.name).toBe('body');
		expect(info.type).toBe('node_array');
	});

	it('inspect nested node property returns correct info', () => {
		const session = create_session(create_mixed_doc);
		const info = session.inspect(['list_1', 'list_items']);
		expect(info.type).toBe('node_array');
		expect(info.node_types).toContain('list_item');
	});
});

describe('count_references with annotations', () => {
	it('annotation nodes are not counted as regular references', () => {
		const session = create_session(create_annotated_doc);
		const count = session.count_references('strong_1');
		expect(count).toBe(0);
	});

	it('regular node references are counted', () => {
		const session = create_session(create_shared_ref_doc);
		expect(session.count_references('text_shared')).toBe(2);
		expect(session.count_references('text_unique')).toBe(1);
	});
});

describe('property_type', () => {
	it('returns correct types for known properties', () => {
		const session = create_session();
		expect(session.property_type('page', 'body')).toBe('node_array');
		expect(session.property_type('page', 'keywords')).toBe('string_array');
		expect(session.property_type('text', 'content')).toBe('annotated_text');
		expect(session.property_type('text', 'layout')).toBe('integer');
	});

	it('returns string for implicit id/type properties', () => {
		const session = create_session();
		expect(session.property_type('text', 'id')).toBe('string');
		expect(session.property_type('text', 'type')).toBe('string');
	});
});

describe('split/join annotated_text — additional edge cases', () => {
	it('split empty text returns two empty parts', () => {
		const [left, right] = split_annotated_text({ text: '', annotations: [] }, 0);
		expect(left.text).toBe('');
		expect(right.text).toBe('');
		expect(left.annotations.length).toBe(0);
		expect(right.annotations.length).toBe(0);
	});

	it('split with multiple annotations distributes correctly', () => {
		const text = {
			text: 'ABCDEFGH',
			annotations: [
				{ start_offset: 0, end_offset: 3, node_id: 'a1' },
				{ start_offset: 5, end_offset: 8, node_id: 'a2' }
			]
		};
		const [left, right] = split_annotated_text(text, 4);

		expect(left.annotations.length).toBe(1);
		expect(left.annotations[0]).toEqual({ start_offset: 0, end_offset: 3, node_id: 'a1' });
		expect(right.annotations.length).toBe(1);
		expect(right.annotations[0]).toEqual({ start_offset: 1, end_offset: 4, node_id: 'a2' });
	});

	it('join two empty annotated texts returns empty', () => {
		const result = join_annotated_text(
			{ text: '', annotations: [] },
			{ text: '', annotations: [] }
		);
		expect(result.text).toBe('');
		expect(result.annotations.length).toBe(0);
	});

	it('join preserves non-adjacent annotations separately', () => {
		const first = { text: 'AB', annotations: [{ start_offset: 0, end_offset: 1, node_id: 'a1' }] };
		const second = { text: 'CD', annotations: [{ start_offset: 0, end_offset: 1, node_id: 'a2' }] };
		const result = join_annotated_text(first, second);

		expect(result.text).toBe('ABCD');
		expect(result.annotations.length).toBe(2);
		expect(result.annotations[1]).toEqual({ start_offset: 2, end_offset: 3, node_id: 'a2' });
	});
});
