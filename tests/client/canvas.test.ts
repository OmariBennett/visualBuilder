import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, ElementNode } from '../../src/store';

type Canvas = typeof import('../../src/canvas');
let canvas: Canvas;
let iframe: HTMLIFrameElement;
let selectionBox: HTMLElement;
let onSelect: ReturnType<typeof vi.fn>;

function node(id: string, extra: Partial<ElementNode> = {}): ElementNode {
	return { id, tag: 'div', styles: {}, attrs: {}, textContent: '', children: [], ...extra };
}

function state(elements: ElementNode[], extra: Partial<AppState> = {}): AppState {
	return { elements, selectedId: null, canvasWidth: 375, canvasHeight: 812, ...extra };
}

const doc = () => iframe.contentDocument!;
const byId = (id: string) => doc().querySelector<HTMLElement>(`[data-id="${id}"]`);

/** jsdom ignores srcdoc and never fires `load`, so tests fire it to simulate the iframe being ready. */
function loadIframe() {
	iframe.dispatchEvent(new Event('load'));
}

beforeEach(async () => {
	vi.resetModules(); // canvas.ts keeps its iframe + "initialized" flag at module level
	canvas = await import('../../src/canvas');
	vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
		cb(0);
		return 0;
	});

	document.body.innerHTML = '';
	iframe = document.createElement('iframe');
	selectionBox = document.createElement('div');
	document.body.append(iframe, selectionBox);
	onSelect = vi.fn();
	canvas.initCanvas(iframe, selectionBox, onSelect);
});

describe('initCanvas', () => {
	it('points the iframe at a minimal HTML document', () => {
		expect(iframe.srcdoc).toContain('<!doctype html>');
		expect(iframe.srcdoc).toContain('box-sizing: border-box');
	});

	it('injects a click-to-select script into the iframe once it loads', () => {
		loadIframe();
		const script = doc().head.querySelector('script');
		expect(script?.textContent).toContain("closest('[data-id]')");
		expect(script?.textContent).toContain('element-select');
	});

	it('forwards element-select messages from the iframe to onSelect', () => {
		window.dispatchEvent(new MessageEvent('message', { data: { type: 'element-select', id: 'el-1' } }));
		expect(onSelect).toHaveBeenCalledExactlyOnceWith('el-1');
	});

	it('forwards a null id when the canvas background is clicked', () => {
		window.dispatchEvent(new MessageEvent('message', { data: { type: 'element-select', id: null } }));
		expect(onSelect).toHaveBeenCalledWith(null);
	});

	it.each([
		['other message types', { type: 'resize' }],
		['string payloads', 'element-select'],
		['null payloads', null],
		['undefined payloads', undefined],
	])('ignores %s', (_label, data) => {
		window.dispatchEvent(new MessageEvent('message', { data }));
		expect(onSelect).not.toHaveBeenCalled();
	});
});

describe('renderCanvas before the iframe has loaded', () => {
	it('defers rendering', () => {
		canvas.renderCanvas(state([node('a')]));
		expect(byId('a')).toBeNull();
	});

	it('renders the most recent pending state once loaded', () => {
		canvas.renderCanvas(state([node('old')]));
		canvas.renderCanvas(state([node('new')]));
		loadIframe();
		expect(byId('old')).toBeNull();
		expect(byId('new')).not.toBeNull();
	});
});

describe('renderCanvas after load', () => {
	beforeEach(loadIframe);

	it('sizes the iframe and body to the canvas dimensions', () => {
		canvas.renderCanvas(state([], { canvasWidth: 768, canvasHeight: 1024 }));
		expect(iframe.style.width).toBe('768px');
		expect(iframe.style.height).toBe('1024px');
		expect(doc().body.style.width).toBe('768px');
		expect(doc().body.style.minHeight).toBe('1024px');
	});

	it('creates one DOM element per root node, tagged with data-id', () => {
		canvas.renderCanvas(state([node('a', { tag: 'section' }), node('b', { tag: 'p' })]));
		const children = [...doc().body.children];
		expect(children.map((c) => c.tagName)).toEqual(['SECTION', 'P']);
		expect(children.map((c) => (c as HTMLElement).dataset.id)).toEqual(['a', 'b']);
	});

	it('applies inline styles (including hyphenated properties)', () => {
		canvas.renderCanvas(state([node('a', { styles: { 'background-color': 'red', 'min-height': '40px' } })]));
		expect(byId('a')!.style.backgroundColor).toBe('red');
		expect(byId('a')!.style.minHeight).toBe('40px');
	});

	it('applies attributes', () => {
		canvas.renderCanvas(state([node('i', { tag: 'img', attrs: { src: 'cat.png', alt: 'A cat' } })]));
		expect(byId('i')!.getAttribute('src')).toBe('cat.png');
		expect(byId('i')!.getAttribute('alt')).toBe('A cat');
	});

	it('sets text content on leaf nodes', () => {
		canvas.renderCanvas(state([node('p', { tag: 'p', textContent: 'Hello' })]));
		expect(byId('p')!.textContent).toBe('Hello');
	});

	it('renders text as text, never as HTML', () => {
		canvas.renderCanvas(state([node('p', { tag: 'p', textContent: '<img src=x onerror=alert(1)>' })]));
		expect(byId('p')!.querySelector('img')).toBeNull();
		expect(byId('p')!.textContent).toBe('<img src=x onerror=alert(1)>');
	});

	it('renders nested children recursively', () => {
		const tree = node('outer', { children: [node('mid', { tag: 'section', children: [node('leaf', { tag: 'p' })] })] });
		canvas.renderCanvas(state([tree]));
		expect(byId('leaf')!.parentElement).toBe(byId('mid'));
		expect(byId('mid')!.parentElement).toBe(byId('outer'));
	});

	it('ignores a node’s own text when it has children', () => {
		const list = node('ul', { tag: 'ul', textContent: 'IGNORED', children: [node('li', { tag: 'li', textContent: 'item' })] });
		canvas.renderCanvas(state([list]));
		expect(byId('ul')!.textContent).toBe('item');
	});

	it('replaces the previous render entirely', () => {
		canvas.renderCanvas(state([node('a'), node('b')]));
		canvas.renderCanvas(state([node('c')]));
		expect(doc().body.children).toHaveLength(1);
		expect(byId('a')).toBeNull();
	});
});

describe('selection overlay', () => {
	beforeEach(loadIframe);

	function fakeRect(id: string, rect: { left: number; top: number; width: number; height: number }) {
		byId(id)!.getBoundingClientRect = () => ({ ...rect, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }) as DOMRect;
	}

	it('is hidden when nothing is selected', () => {
		canvas.renderCanvas(state([node('a')]));
		expect(selectionBox.style.display).toBe('none');
	});

	it('is shown over the selected element after render', () => {
		canvas.renderCanvas(state([node('a')], { selectedId: 'a' }));
		expect(selectionBox.style.display).toBe('block');
	});

	it('is hidden when the selected id is not on the canvas', () => {
		canvas.renderCanvas(state([node('a')], { selectedId: 'ghost' }));
		expect(selectionBox.style.display).toBe('none');
	});

	it('matches the selected element’s bounding box', () => {
		canvas.renderCanvas(state([node('a')]));
		fakeRect('a', { left: 10, top: 20, width: 30, height: 40 });
		canvas.updateOverlay('a');
		expect(selectionBox.style).toMatchObject({ display: 'block', left: '10px', top: '20px', width: '30px', height: '40px' });
	});

	it('updateOverlay(null) hides it', () => {
		canvas.renderCanvas(state([node('a')], { selectedId: 'a' }));
		canvas.updateOverlay(null);
		expect(selectionBox.style.display).toBe('none');
	});
});

describe('patchStyles', () => {
	beforeEach(loadIframe);

	it('updates the live element’s styles without a full re-render', () => {
		canvas.renderCanvas(state([node('a', { styles: { color: 'red' } })]));
		const el = byId('a');
		canvas.patchStyles('a', { color: 'blue', width: '50px' });
		expect(byId('a')).toBe(el);
		expect(el!.style.color).toBe('blue');
		expect(el!.style.width).toBe('50px');
	});

	it('moves the selection overlay onto the patched element', () => {
		canvas.renderCanvas(state([node('a')]));
		canvas.patchStyles('a', { width: '50px' });
		expect(selectionBox.style.display).toBe('block');
	});

	it('is a no-op for an unknown id', () => {
		canvas.renderCanvas(state([node('a')]));
		expect(() => canvas.patchStyles('ghost', { color: 'blue' })).not.toThrow();
		expect(byId('a')!.style.color).toBe('');
	});
});
