import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderBreadcrumb } from '../../src/layers';
import type { ElementNode, ElementTag } from '../../src/store';

function node(id: string, tag: ElementTag): ElementNode {
	return { id, tag, styles: {}, attrs: {}, textContent: '', children: [] };
}

let container: HTMLElement;

beforeEach(() => {
	container = document.createElement('nav');
});

describe('renderBreadcrumb', () => {
	it('shows "No selection" for an empty path', () => {
		renderBreadcrumb([], container, vi.fn());
		expect(container.children).toHaveLength(1);
		expect(container.firstElementChild!.className).toBe('breadcrumb-empty');
		expect(container.textContent).toBe('No selection');
	});

	it('renders one item per node, labelled with its tag', () => {
		renderBreadcrumb([node('a', 'section'), node('b', 'div'), node('c', 'p')], container, vi.fn());
		const items = [...container.querySelectorAll('.breadcrumb-item')].map((el) => el.textContent);
		expect(items).toEqual(['<section>', '<div>', '<p>']);
	});

	it('separates items with › and has no trailing separator', () => {
		renderBreadcrumb([node('a', 'div'), node('b', 'p')], container, vi.fn());
		expect(container.textContent).toBe('<div> › <p>');
		expect(container.querySelectorAll('.breadcrumb-sep')).toHaveLength(1);
		expect(container.lastElementChild!.classList.contains('breadcrumb-sep')).toBe(false);
	});

	it('marks only the last item (the selected element) as active', () => {
		renderBreadcrumb([node('a', 'div'), node('b', 'div'), node('c', 'p')], container, vi.fn());
		const active = container.querySelectorAll('.breadcrumb-item--active');
		expect(active).toHaveLength(1);
		expect(active[0].textContent).toBe('<p>');
	});

	it('marks a single-item path as active with no separator', () => {
		renderBreadcrumb([node('a', 'h1')], container, vi.fn());
		expect(container.querySelector('.breadcrumb-item--active')!.textContent).toBe('<h1>');
		expect(container.querySelector('.breadcrumb-sep')).toBeNull();
	});

	it('selects the clicked ancestor by id', () => {
		const onSelect = vi.fn();
		renderBreadcrumb([node('outer', 'div'), node('inner', 'p')], container, onSelect);
		(container.querySelector('.breadcrumb-item') as HTMLElement).click();
		expect(onSelect).toHaveBeenCalledExactlyOnceWith('outer');
	});

	it('clears previous content on every render', () => {
		renderBreadcrumb([node('a', 'div'), node('b', 'p')], container, vi.fn());
		renderBreadcrumb([node('x', 'h2')], container, vi.fn());
		expect(container.textContent).toBe('<h2>');
		renderBreadcrumb([], container, vi.fn());
		expect(container.textContent).toBe('No selection');
	});

	it('does not keep click handlers from a previous render', () => {
		const first = vi.fn();
		renderBreadcrumb([node('a', 'div')], container, first);
		const second = vi.fn();
		renderBreadcrumb([node('b', 'div')], container, second);
		(container.querySelector('.breadcrumb-item') as HTMLElement).click();
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledWith('b');
	});
});
