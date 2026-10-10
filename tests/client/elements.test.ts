import { describe, expect, it } from 'vitest';
import { ELEMENT_DEFS, createElement, isContainer } from '../../src/elements';
import type { ElementTag } from '../../src/store';

const ALL_TAGS: ElementTag[] = ['div', 'section', 'p', 'h1', 'h2', 'h3', 'button', 'img', 'input', 'ul', 'li', 'a'];

describe('ELEMENT_DEFS', () => {
	it('has exactly one definition per tag', () => {
		const tags = ELEMENT_DEFS.map((d) => d.tag);
		expect(new Set(tags).size).toBe(tags.length);
	});

	it('defines every palette tag except li (list items are only created inside a list)', () => {
		expect(ELEMENT_DEFS.map((d) => d.tag).sort()).toEqual(ALL_TAGS.filter((t) => t !== 'li').sort());
	});

	it('gives every definition a non-empty label', () => {
		for (const def of ELEMENT_DEFS) expect(def.label.trim()).not.toBe('');
	});

	it('gives void elements (img, input) no default text, since it can never render', () => {
		for (const tag of ['img', 'input']) {
			expect(ELEMENT_DEFS.find((d) => d.tag === tag)!.defaultText).toBe('');
		}
	});

	it('gives images an alt attribute for accessibility', () => {
		expect(ELEMENT_DEFS.find((d) => d.tag === 'img')!.defaultAttrs.alt).toBeTruthy();
	});
});

describe('isContainer', () => {
	it.each(['div', 'section', 'ul'] as ElementTag[])('%s can hold children', (tag) => {
		expect(isContainer(tag)).toBe(true);
	});

	it.each(['p', 'h1', 'h2', 'h3', 'button', 'img', 'input', 'li', 'a'] as ElementTag[])(
		'%s cannot hold children',
		(tag) => {
			expect(isContainer(tag)).toBe(false);
		},
	);
});

describe('createElement', () => {
	it.each(ELEMENT_DEFS.map((d) => [d.tag, d] as const))('builds a %s from its definition', (tag, def) => {
		const node = createElement(tag);
		expect(node.tag).toBe(tag);
		expect(node.styles).toEqual(def.defaultStyles);
		expect(node.attrs).toEqual(def.defaultAttrs);
		expect(node.textContent).toBe(def.defaultText);
		expect(node.id).toMatch(/^el-/);
	});

	it('copies default styles and attrs, so editing a node never changes the definition', () => {
		const node = createElement('img');
		node.styles.width = '999px';
		node.attrs.src = 'hacked.png';
		const def = ELEMENT_DEFS.find((d) => d.tag === 'img')!;
		expect(def.defaultStyles.width).toBe('100px');
		expect(def.defaultAttrs.src).toBe('');
	});

	it('gives each created element a unique id', () => {
		const ids = new Set(Array.from({ length: 200 }, () => createElement('div').id));
		expect(ids.size).toBe(200);
	});

	it('starts non-list elements with no children', () => {
		for (const def of ELEMENT_DEFS.filter((d) => d.tag !== 'ul')) {
			expect(createElement(def.tag).children).toEqual([]);
		}
	});

	it('creates a list pre-filled with three list items', () => {
		const list = createElement('ul');
		expect(list.children).toHaveLength(3);
		list.children.forEach((li, i) => {
			expect(li).toMatchObject({ tag: 'li', textContent: `List item ${i + 1}`, children: [] });
		});
	});

	it('gives the list and each list item distinct ids', () => {
		const list = createElement('ul');
		const ids = [list.id, ...list.children.map((c) => c.id)];
		expect(new Set(ids).size).toBe(4);
	});

	it('throws for tags without a definition', () => {
		expect(() => createElement('li')).toThrow('Unknown tag: li');
		expect(() => createElement('marquee' as ElementTag)).toThrow('Unknown tag: marquee');
	});
});
