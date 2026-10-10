import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderProperties } from '../../src/properties';
import type { ElementNode } from '../../src/store';

const EXPECTED_PROPS = [
	['Spacing', ['margin', 'padding']],
	['Size', ['width', 'height']],
	['Typography', ['font-size', 'color', 'font-weight', 'text-align']],
	['Background', ['background-color']],
	['Border', ['border', 'border-radius']],
] as const;

function node(styles: Record<string, string> = {}): ElementNode {
	return { id: 'el-1', tag: 'section', styles, attrs: {}, textContent: '', children: [] };
}

function inputFor(container: HTMLElement, prop: string) {
	const input = container.querySelector<HTMLInputElement>(`input[placeholder="${prop}"]`);
	if (!input) throw new Error(`no input for ${prop}`);
	return input;
}

let container: HTMLElement;

beforeEach(() => {
	container = document.createElement('aside');
});

describe('renderProperties with no selection', () => {
	it('hides the panel', () => {
		renderProperties(null, container, vi.fn(), vi.fn());
		expect(container.hidden).toBe(true);
	});

	it('un-hides the panel once something is selected again', () => {
		renderProperties(null, container, vi.fn(), vi.fn());
		renderProperties(node(), container, vi.fn(), vi.fn());
		expect(container.hidden).toBe(false);
	});
});

describe('renderProperties with a selected node', () => {
	it('shows a header naming the element’s tag', () => {
		renderProperties(node(), container, vi.fn(), vi.fn());
		expect(container.querySelector('.props-header')!.textContent).toBe('Properties<section>');
		expect(container.querySelector('.props-tag')!.textContent).toBe('<section>');
	});

	it('renders the property groups in order with their labels', () => {
		renderProperties(node(), container, vi.fn(), vi.fn());
		const labels = [...container.querySelectorAll('.props-group-label')].map((l) => l.textContent);
		expect(labels).toEqual(EXPECTED_PROPS.map(([group]) => group));
	});

	it('renders one input per CSS property, in group order', () => {
		renderProperties(node(), container, vi.fn(), vi.fn());
		const props = [...container.querySelectorAll<HTMLInputElement>('.props-row-input')].map((i) => i.placeholder);
		expect(props).toEqual(EXPECTED_PROPS.flatMap(([, p]) => p));
	});

	it('uses colour pickers for colour properties and text boxes for the rest', () => {
		renderProperties(node(), container, vi.fn(), vi.fn());
		expect(inputFor(container, 'color').type).toBe('color');
		expect(inputFor(container, 'background-color').type).toBe('color');
		expect(inputFor(container, 'margin').type).toBe('text');
		expect(inputFor(container, 'border-radius').type).toBe('text');
	});

	it('pre-fills inputs from the node’s current styles', () => {
		renderProperties(node({ margin: '4px', color: '#ff0000' }), container, vi.fn(), vi.fn());
		expect(inputFor(container, 'margin').value).toBe('4px');
		expect(inputFor(container, 'color').value).toBe('#ff0000');
	});

	it('leaves text inputs empty for unset styles', () => {
		renderProperties(node(), container, vi.fn(), vi.fn());
		expect(inputFor(container, 'padding').value).toBe('');
	});

	it('reports each edit with the CSS property name and new value', () => {
		const onStyleChange = vi.fn();
		renderProperties(node(), container, onStyleChange, vi.fn());
		const input = inputFor(container, 'border-radius');
		input.value = '8px';
		input.dispatchEvent(new Event('input'));
		expect(onStyleChange).toHaveBeenCalledExactlyOnceWith('border-radius', '8px');
	});

	it('uses the CSS property (not the display label) for "background"', () => {
		const onStyleChange = vi.fn();
		renderProperties(node(), container, onStyleChange, vi.fn());
		const row = [...container.querySelectorAll('.props-row')].find(
			(r) => r.querySelector('label')!.textContent === 'background',
		)!;
		const input = row.querySelector('input')!;
		input.value = '#00ff00';
		input.dispatchEvent(new Event('input'));
		expect(onStyleChange).toHaveBeenCalledWith('background-color', '#00ff00');
	});

	it('renders a single "+ Gradient" button in the Background group', () => {
		const onGradientClick = vi.fn();
		renderProperties(node(), container, vi.fn(), onGradientClick);
		const buttons = container.querySelectorAll<HTMLButtonElement>('.props-gradient-btn');
		expect(buttons).toHaveLength(1);
		expect(buttons[0].textContent).toBe('+ Gradient');
		expect(buttons[0].closest('.props-group')!.querySelector('.props-group-label')!.textContent).toBe('Background');
		buttons[0].click();
		expect(onGradientClick).toHaveBeenCalledOnce();
	});

	it('replaces the previous render instead of appending', () => {
		renderProperties(node(), container, vi.fn(), vi.fn());
		renderProperties(node(), container, vi.fn(), vi.fn());
		expect(container.querySelectorAll('.props-header')).toHaveLength(1);
		expect(container.querySelectorAll('.props-group')).toHaveLength(EXPECTED_PROPS.length);
	});
});
