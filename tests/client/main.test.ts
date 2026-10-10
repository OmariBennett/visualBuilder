import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, ElementTag } from '../../src/store';

const STORAGE_KEY = 'toolbox-v1';

// The DOM main.ts expects (ids/classes it looks up at import + init time).
const FIXTURE = `
	<div id="palette">
		${['div', 'section', 'p', 'h1', 'img', 'ul'].map((t) => `<button data-add-element="${t}">${t}</button>`).join('')}
	</div>
	<button id="preset-mobile"></button>
	<button id="preset-tablet"></button>
	<button id="preset-desktop"></button>
	<input id="canvas-w" /><input id="canvas-h" />
	<nav id="breadcrumb"></nav>
	<div id="canvas-wrapper">
		<iframe id="canvas-iframe"></iframe>
		<div id="selection-box"></div>
		${['tl', 'tr', 'bl', 'br'].map((c) => `<div class="rh" data-corner="${c}"></div>`).join('')}
	</div>
	<aside id="props-panel"></aside>
	<button id="btn-view-code"></button>
	<dialog id="code-modal">
		<pre id="code-output"></pre>
		<button id="btn-copy-code"></button>
		<button id="btn-close-modal"></button>
	</dialog>
`;

type Store = typeof import('../../src/store');
let store: Store;
const registered: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const iframe = () => $<HTMLIFrameElement>('#canvas-iframe');
const canvasEl = (id: string) => iframe().contentDocument!.querySelector<HTMLElement>(`[data-id="${id}"]`);
const state = () => store.getState();

/** Imports a fresh copy of main.ts (and its store) and runs its DOMContentLoaded init. */
async function boot(saved?: Partial<AppState>) {
	localStorage.clear();
	if (saved) {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ elements: [], selectedId: null, canvasWidth: 375, canvasHeight: 812, ...saved }),
		);
	}
	document.body.innerHTML = FIXTURE;
	vi.resetModules();
	await import('../../src/main');
	store = await import('../../src/store');
	document.dispatchEvent(new Event('DOMContentLoaded'));
	iframe().dispatchEvent(new Event('load')); // jsdom never loads srcdoc on its own
}

function allNodes(nodes = state().elements): AppState['elements'] {
	return nodes.flatMap((n) => [n, ...allNodes(n.children)]);
}

/** Clicks a palette button and returns the node it created (wherever it was placed). */
function add(tag: ElementTag) {
	const before = new Set(allNodes().map((n) => n.id));
	$(`[data-add-element="${tag}"]`).click();
	return allNodes().find((n) => !before.has(n.id) && n.tag === tag)!;
}

function select(id: string | null) {
	window.dispatchEvent(new MessageEvent('message', { data: { type: 'element-select', id } }));
}

function key(k: string, mods: KeyboardEventInit = {}) {
	const e = new KeyboardEvent('keydown', { key: k, cancelable: true, bubbles: true, ...mods });
	document.dispatchEvent(e);
	return e;
}

beforeEach(() => {
	// Track listeners main.ts adds to document/window so each test can boot a clean copy.
	for (const target of [document, window] as EventTarget[]) {
		const original = target.addEventListener.bind(target);
		vi.spyOn(target, 'addEventListener').mockImplementation((type, fn, opts) => {
			registered.push([target, type, fn!]);
			original(type, fn, opts);
		});
	}
	vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
		cb(0);
		return 0;
	});
	HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
		this.open = true;
	};
	HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
		this.open = false;
	};
});

afterEach(() => {
	for (const [target, type, fn] of registered.splice(0)) target.removeEventListener(type, fn);
	vi.useRealTimers();
});

describe('startup', () => {
	it('renders the default mobile canvas', async () => {
		await boot();
		expect($<HTMLInputElement>('#canvas-w').value).toBe('375');
		expect($<HTMLInputElement>('#canvas-h').value).toBe('812');
		expect($('#canvas-wrapper').style.width).toBe('375px');
		expect($('#breadcrumb').textContent).toBe('No selection');
		expect($('#props-panel').hidden).toBe(true);
	});

	it('restores the last saved design from localStorage', async () => {
		await boot({
			canvasWidth: 1440,
			canvasHeight: 900,
			elements: [{ id: 'saved', tag: 'p', styles: {}, attrs: {}, textContent: 'Saved!', children: [] }],
		});
		expect($<HTMLInputElement>('#canvas-w').value).toBe('1440');
		expect(canvasEl('saved')!.textContent).toBe('Saved!');
	});
});

describe('adding elements', () => {
	beforeEach(() => boot());

	it('adds the clicked palette element to the canvas root', () => {
		const p = add('p');
		expect(p.tag).toBe('p');
		expect(state().elements).toHaveLength(1);
		expect(canvasEl(p.id)!.textContent).toBe('Paragraph text');
	});

	it('nests new elements inside the selected container', () => {
		const section = add('section');
		select(section.id);
		const child = add('h1');
		expect(state().elements).toHaveLength(1);
		expect(state().elements[0].children.map((c) => c.id)).toEqual([child.id]);
		expect(canvasEl(child.id)!.parentElement).toBe(canvasEl(section.id));
	});

	it('adds to the root when the selected element cannot hold children', () => {
		const p = add('p');
		select(p.id);
		add('h1');
		expect(state().elements.map((e) => e.tag)).toEqual(['p', 'h1']);
	});

	it('persists every change', () => {
		add('div');
		expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).elements).toHaveLength(1);
	});
});

describe('selection', () => {
	beforeEach(() => boot());

	it('shows the properties panel and breadcrumb for the selected element', () => {
		const section = add('section');
		select(section.id);
		const h1 = add('h1');
		select(h1.id);
		expect($('#props-panel').hidden).toBe(false);
		expect($('#props-panel').querySelector('.props-tag')!.textContent).toBe('<h1>');
		expect($('#breadcrumb').textContent).toBe('<section> › <h1>');
	});

	it('selects an ancestor when its breadcrumb is clicked', () => {
		const section = add('section');
		select(section.id);
		select(add('p').id);
		($('#breadcrumb').querySelector('.breadcrumb-item') as HTMLElement).click();
		expect(state().selectedId).toBe(section.id);
	});

	it('clears the selection when the canvas background is clicked', () => {
		select(add('p').id);
		select(null);
		expect(state().selectedId).toBeNull();
		expect($('#props-panel').hidden).toBe(true);
	});
});

describe('editing styles', () => {
	beforeEach(() => boot());

	function editProp(prop: string, value: string) {
		const input = $('#props-panel').querySelector<HTMLInputElement>(`input[placeholder="${prop}"]`)!;
		input.value = value;
		input.dispatchEvent(new Event('input'));
	}

	it('previews the change on the canvas immediately', () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const p = add('p');
		select(p.id);
		editProp('padding', '12px');
		expect(canvasEl(p.id)!.style.padding).toBe('12px');
		expect(state().elements[0].styles.padding).toBeUndefined(); // not committed yet
	});

	it('commits to the store 300ms after the last keystroke', () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const p = add('p');
		select(p.id);
		editProp('padding', '1px');
		vi.advanceTimersByTime(299);
		expect(state().elements[0].styles.padding).toBeUndefined();
		vi.advanceTimersByTime(1);
		expect(state().elements[0].styles.padding).toBe('1px');
	});

	it('coalesces rapid typing into a single undo step', () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const p = add('p');
		select(p.id);
		for (const v of ['1', '12', '12p', '12px']) {
			editProp('padding', v);
			vi.advanceTimersByTime(100);
		}
		vi.advanceTimersByTime(300);
		expect(state().elements[0].styles.padding).toBe('12px');
		key('z', { ctrlKey: true });
		expect(state().elements[0].styles.padding).toBeUndefined();
	});

	it('opens the gradient generator in a new tab', () => {
		const open = vi.spyOn(window, 'open').mockReturnValue(null);
		select(add('div').id);
		$('#props-panel').querySelector<HTMLButtonElement>('.props-gradient-btn')!.click();
		expect(open).toHaveBeenCalledWith('https://cssgradient.io/', '_blank', 'noopener');
	});
});

describe('canvas size', () => {
	beforeEach(() => boot());

	it.each([
		['#preset-mobile', 375, 812],
		['#preset-tablet', 768, 1024],
		['#preset-desktop', 1440, 900],
	])('%s sets %sx%s', (sel, w, h) => {
		$('#preset-desktop').click(); // start from a non-default size
		$(sel).click();
		expect(state()).toMatchObject({ canvasWidth: w, canvasHeight: h });
		expect($('#canvas-wrapper').style.height).toBe(`${h}px`);
	});

	it('applies typed width and height', () => {
		const w = $<HTMLInputElement>('#canvas-w');
		const h = $<HTMLInputElement>('#canvas-h');
		w.value = '500';
		w.dispatchEvent(new Event('change'));
		h.value = '600';
		h.dispatchEvent(new Event('change'));
		expect(state()).toMatchObject({ canvasWidth: 500, canvasHeight: 600 });
	});

	it.each([
		['empty', ''],
		['non-numeric', 'abc'],
		['zero', '0'],
	])('falls back to the default for %s input', (_label, value) => {
		$('#preset-desktop').click();
		const w = $<HTMLInputElement>('#canvas-w');
		w.value = value;
		w.dispatchEvent(new Event('change'));
		expect(state().canvasWidth).toBe(375);
	});

	// BUG: parseInt('-100') is truthy, so negative sizes slip past the `|| 375` fallback.
	it.fails('rejects negative sizes', () => {
		const w = $<HTMLInputElement>('#canvas-w');
		w.value = '-100';
		w.dispatchEvent(new Event('change'));
		expect(state().canvasWidth).toBeGreaterThan(0);
	});
});

describe('keyboard shortcuts', () => {
	beforeEach(() => boot());

	it.each(['Delete', 'Backspace'])('%s removes the selected element and its children', (k) => {
		const section = add('section');
		select(section.id);
		add('p');
		key(k);
		expect(state().elements).toEqual([]);
		expect(state().selectedId).toBeNull();
		expect(canvasEl(section.id)).toBeNull();
	});

	it('Delete does nothing without a selection', () => {
		add('p');
		key('Delete');
		expect(state().elements).toHaveLength(1);
	});

	it('shortcuts are ignored while typing in an input', () => {
		const p = add('p');
		select(p.id);
		$<HTMLInputElement>('#canvas-w').focus();
		key('Backspace');
		key('z', { ctrlKey: true });
		expect(state().elements).toHaveLength(1);
	});

	it('Ctrl+Z undoes and prevents the browser default', () => {
		add('p');
		const e = key('z', { ctrlKey: true });
		expect(state().elements).toEqual([]);
		expect(e.defaultPrevented).toBe(true);
	});

	it.each([
		['Ctrl+Shift+Z', 'Z', { ctrlKey: true, shiftKey: true }],
		['Ctrl+Y', 'y', { ctrlKey: true }],
	])('%s redoes', (_label, k, mods) => {
		add('p');
		key('z', { ctrlKey: true });
		const e = key(k, mods);
		expect(state().elements).toHaveLength(1);
		expect(e.defaultPrevented).toBe(true);
	});

	it('plain z / y without Ctrl do nothing', () => {
		add('p');
		key('z');
		key('y');
		expect(state().elements).toHaveLength(1);
	});
});

describe('resizing the selected element', () => {
	beforeEach(() => boot());

	function prepare(tag: ElementTag = 'div', rect = { width: 100, height: 50 }) {
		const node = add(tag);
		select(node.id);
		canvasEl(node.id)!.getBoundingClientRect = () => ({ ...rect, left: 0, top: 0 }) as DOMRect;
		return node;
	}

	function drag(corner: string, dx: number, dy: number) {
		$(`.rh[data-corner="${corner}"]`).dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
		document.dispatchEvent(new MouseEvent('mousemove', { clientX: dx, clientY: dy }));
		document.dispatchEvent(new MouseEvent('mouseup'));
	}

	it.each([
		['br', 30, 10, '130px', '60px'],
		['tr', 30, 10, '130px', '40px'],
		['bl', 30, 10, '70px', '60px'],
		['tl', 30, 10, '70px', '40px'],
	])('dragging the %s handle by (%s, %s) gives %s × %s', (corner, dx, dy, w, h) => {
		const node = prepare();
		drag(corner, dx, dy);
		expect(state().elements[0].styles).toMatchObject({ width: w, height: h });
		expect(canvasEl(node.id)!.style.width).toBe(w);
	});

	it('never shrinks below 20px', () => {
		prepare();
		drag('br', -1000, -1000);
		expect(state().elements[0].styles).toMatchObject({ width: '20px', height: '20px' });
	});

	it('rounds fractional sizes to whole pixels', () => {
		prepare('div', { width: 100.4, height: 50.6 });
		drag('br', 0, 0);
		expect(state().elements[0].styles).toMatchObject({ width: '100px', height: '51px' });
	});

	it('the whole drag is a single undo step', () => {
		prepare();
		const beforeDrag = structuredClone(state());
		const handle = $('.rh[data-corner="br"]');
		handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));
		for (let x = 1; x <= 20; x++) document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: 0 }));
		document.dispatchEvent(new MouseEvent('mouseup'));
		expect(state().elements[0].styles.width).toBe('120px');
		key('z', { ctrlKey: true });
		expect(state()).toEqual(beforeDrag);
	});

	it('does nothing when no element is selected', () => {
		add('div');
		drag('br', 30, 30);
		expect(state().elements[0].styles.width).toBeUndefined();
	});

	it('stops tracking the mouse after mouseup', () => {
		const node = prepare();
		drag('br', 30, 10);
		document.dispatchEvent(new MouseEvent('mousemove', { clientX: 500, clientY: 500 }));
		expect(canvasEl(node.id)!.style.width).toBe('130px');
	});

	// BUG: a click on a handle (mousedown + mouseup, no move) commits the element's *inline*
	// width/height, which are '' for elements without explicit sizes. That writes empty
	// styles into the node and adds a pointless undo step.
	it.fails('clicking a handle without dragging leaves the styles untouched', () => {
		prepare('p');
		const before = structuredClone(state().elements[0].styles);
		$('.rh[data-corner="br"]').dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));
		document.dispatchEvent(new MouseEvent('mouseup'));
		expect(state().elements[0].styles).toEqual(before);
	});
});

describe('code export', () => {
	beforeEach(() => boot());

	function exportCode() {
		$('#btn-view-code').click();
		return $('#code-output').textContent!;
	}

	it('opens the modal with a complete HTML document', () => {
		const html = exportCode();
		expect($<HTMLDialogElement>('#code-modal').open).toBe(true);
		expect(html).toMatch(/^<!doctype html>/);
		expect(html).toContain('<meta charset="UTF-8">');
		expect(html).toContain('</html>');
	});

	it('bakes the canvas size into the body styles', () => {
		$('#preset-tablet').click();
		expect(exportCode()).toContain('body { margin: 0; width: 768px; min-height: 1024px;');
	});

	it('serialises styles inline and text as content', () => {
		add('p');
		expect(exportCode()).toContain('<p style="font-size:16px;margin:0">Paragraph text</p>');
	});

	it('serialises void elements without a closing tag, with attributes', () => {
		add('img');
		const html = exportCode();
		expect(html).toMatch(/<img style="[^"]*width:100px[^"]*" src="" alt="Image">/);
		expect(html).not.toContain('</img>');
	});

	it('serialises nested children', () => {
		add('ul');
		const html = exportCode();
		expect(html).toContain('<ul style="padding-left:20px">');
		expect(html).toContain('<li>List item 1</li>');
		expect(html).toContain('<li>List item 3</li></ul>');
	});

	it('omits the style attribute for unstyled elements', () => {
		add('ul');
		expect(exportCode()).not.toContain('<li style=');
	});

	it('reflects committed style edits', () => {
		const p = add('p');
		store.setState((s) => ({ ...s, elements: store.updateNodeStyles(s.elements, p.id, { color: 'red' }) }));
		expect(exportCode()).toContain('color:red');
	});

	it('copies the code to the clipboard', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
		const html = exportCode();
		$('#btn-copy-code').click();
		expect(writeText).toHaveBeenCalledWith(html);
	});

	it('swallows clipboard failures (e.g. permission denied)', async () => {
		const writeText = vi.fn().mockRejectedValue(new Error('denied'));
		Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
		exportCode();
		$('#btn-copy-code').click();
		await Promise.resolve(); // an unhandled rejection would fail the run
		expect(writeText).toHaveBeenCalled();
	});

	it('closes the modal', () => {
		exportCode();
		$('#btn-close-modal').click();
		expect($<HTMLDialogElement>('#code-modal').open).toBe(false);
	});
});
