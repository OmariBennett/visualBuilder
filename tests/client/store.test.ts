import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, ElementNode } from '../../src/store';

const STORAGE_KEY = 'toolbox-v1';

type Store = typeof import('../../src/store');
let store: Store;

beforeEach(async () => {
	localStorage.clear();
	vi.resetModules(); // store.ts keeps its state (and history) at module level
	store = await import('../../src/store');
});

function node(id: string, children: ElementNode[] = [], extra: Partial<ElementNode> = {}): ElementNode {
	return { id, tag: 'div', styles: {}, attrs: {}, textContent: '', children, ...extra };
}

/**
 *   a
 *   ├─ b
 *   │  └─ c
 *   └─ d
 *   e
 */
function tree(): ElementNode[] {
	return [node('a', [node('b', [node('c')]), node('d')]), node('e')];
}

describe('initial state', () => {
	it('starts empty on a mobile-sized canvas', () => {
		expect(store.getState()).toEqual({ elements: [], selectedId: null, canvasWidth: 375, canvasHeight: 812 });
	});

	it('has nothing to undo or redo', () => {
		const listener = vi.fn();
		store.subscribe(listener);
		store.undo();
		store.redo();
		expect(listener).not.toHaveBeenCalled();
	});
});

describe('setState', () => {
	it('replaces the state with the updater’s result', () => {
		store.setState((s) => ({ ...s, canvasWidth: 1024 }));
		expect(store.getState().canvasWidth).toBe(1024);
	});

	it('passes the updater a copy, so mutating it cannot alter the previous state', () => {
		const previous = store.getState();
		store.setState((s) => {
			expect(s).not.toBe(previous);
			s.canvasWidth = 999;
			return s;
		});
		expect(previous.canvasWidth).toBe(375);
	});

	it('notifies every subscriber with the new state', () => {
		const a = vi.fn();
		const b = vi.fn();
		store.subscribe(a);
		store.subscribe(b);
		store.setState((s) => ({ ...s, selectedId: 'x' }));
		expect(a).toHaveBeenCalledWith(expect.objectContaining({ selectedId: 'x' }));
		expect(b).toHaveBeenCalledTimes(1);
	});

	it('persists the new state to localStorage', () => {
		store.setState((s) => ({ ...s, canvasHeight: 600 }));
		expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({ canvasHeight: 600 });
	});

	it('still updates and notifies if localStorage throws (e.g. quota exceeded)', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('full', 'QuotaExceededError');
		});
		const listener = vi.fn();
		store.subscribe(listener);
		expect(() => store.setState((s) => ({ ...s, canvasWidth: 1 }))).not.toThrow();
		expect(store.getState().canvasWidth).toBe(1);
		expect(listener).toHaveBeenCalled();
	});
});

describe('subscribe', () => {
	it('returns an unsubscribe function', () => {
		const listener = vi.fn();
		const unsubscribe = store.subscribe(listener);
		unsubscribe();
		store.setState((s) => s);
		expect(listener).not.toHaveBeenCalled();
	});

	it('only registers the same listener once', () => {
		const listener = vi.fn();
		store.subscribe(listener);
		store.subscribe(listener);
		store.setState((s) => s);
		expect(listener).toHaveBeenCalledTimes(1);
	});
});

describe('undo / redo', () => {
	const width = () => store.getState().canvasWidth;
	const setWidth = (w: number) => store.setState((s) => ({ ...s, canvasWidth: w }));

	it('undo restores the previous state and notifies', () => {
		setWidth(500);
		const listener = vi.fn();
		store.subscribe(listener);
		store.undo();
		expect(width()).toBe(375);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('redo re-applies an undone change', () => {
		setWidth(500);
		store.undo();
		store.redo();
		expect(width()).toBe(500);
	});

	it('walks back and forth through several steps', () => {
		setWidth(1);
		setWidth(2);
		setWidth(3);
		store.undo();
		store.undo();
		expect(width()).toBe(1);
		store.redo();
		expect(width()).toBe(2);
	});

	it('a new change after undo discards the redo branch', () => {
		setWidth(1);
		setWidth(2);
		store.undo();
		setWidth(9);
		store.redo();
		expect(width()).toBe(9);
		store.undo();
		expect(width()).toBe(1);
	});

	it('undo stops at the initial state', () => {
		setWidth(1);
		store.undo();
		store.undo();
		store.undo();
		expect(width()).toBe(375);
		store.redo();
		expect(width()).toBe(1);
	});

	it('persists the state it moves to', () => {
		setWidth(500);
		store.undo();
		expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).canvasWidth).toBe(375);
	});

	it('returns copies: mutating getState() after undo does not alter history', () => {
		setWidth(500);
		store.undo();
		store.getState().canvasWidth = 12345;
		store.redo();
		store.undo();
		expect(width()).toBe(375);
	});

	it('keeps at most 50 undo steps', () => {
		for (let i = 1; i <= 60; i++) setWidth(i);
		let undos = 0;
		let last = width();
		for (;;) {
			store.undo();
			if (width() === last) break;
			last = width();
			undos++;
		}
		expect(undos).toBe(50);
		expect(width()).toBe(10); // the oldest 10 changes (and the initial state) fell off
	});

	it('can still redo all the way forward after hitting the history cap', () => {
		for (let i = 1; i <= 60; i++) setWidth(i);
		for (let i = 0; i < 50; i++) store.undo();
		for (let i = 0; i < 50; i++) store.redo();
		expect(width()).toBe(60);
	});
});

describe('loadFromStorage', () => {
	it('restores a previously saved state', () => {
		const saved: AppState = { elements: [node('a')], selectedId: 'a', canvasWidth: 768, canvasHeight: 1024 };
		localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
		store.loadFromStorage();
		expect(store.getState()).toEqual(saved);
	});

	it('resets history so the loaded state cannot be undone', () => {
		store.setState((s) => ({ ...s, canvasWidth: 1 }));
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...store.getState(), canvasWidth: 2 }));
		store.loadFromStorage();
		store.undo();
		expect(store.getState().canvasWidth).toBe(2);
	});

	it('keeps the defaults when nothing is saved', () => {
		store.loadFromStorage();
		expect(store.getState().canvasWidth).toBe(375);
	});

	it('ignores corrupted JSON', () => {
		localStorage.setItem(STORAGE_KEY, '{oops');
		expect(() => store.loadFromStorage()).not.toThrow();
		expect(store.getState().elements).toEqual([]);
	});

	it('ignores storage that throws on read (e.g. blocked cookies)', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new DOMException('denied', 'SecurityError');
		});
		expect(() => store.loadFromStorage()).not.toThrow();
		expect(store.getState().elements).toEqual([]);
	});

	// BUG: valid-but-wrong JSON (e.g. "null", or an old/foreign schema) replaces the state
	// wholesale, and the app then crashes reading `state.elements`. Remove `.fails` once
	// loadFromStorage validates the shape.
	it.fails('ignores saved data that is valid JSON but not an AppState', () => {
		localStorage.setItem(STORAGE_KEY, 'null');
		store.loadFromStorage();
		expect(store.getState().elements).toEqual([]);
	});
});

describe('uid', () => {
	it('returns ids of the form el-xxxxxx', () => {
		expect(store.uid()).toMatch(/^el-[a-z0-9]{1,6}$/);
	});

	it('returns distinct ids across many calls', () => {
		const ids = new Set(Array.from({ length: 1000 }, () => store.uid()));
		expect(ids.size).toBe(1000);
	});
});

describe('findNode', () => {
	it.each(['a', 'b', 'c', 'd', 'e'])('finds node %s at any depth', (id) => {
		expect(store.findNode(tree(), id)?.id).toBe(id);
	});

	it('returns null for a missing id or an empty tree', () => {
		expect(store.findNode(tree(), 'zzz')).toBeNull();
		expect(store.findNode([], 'a')).toBeNull();
	});

	it('returns the node object itself (not a copy)', () => {
		const t = tree();
		expect(store.findNode(t, 'c')).toBe(t[0].children[0].children[0]);
	});
});

describe('addNode', () => {
	it('appends to the root when parentId is null', () => {
		const result = store.addNode(tree(), node('new'), null);
		expect(result.map((n) => n.id)).toEqual(['a', 'e', 'new']);
	});

	it('appends as the last child of the given parent, at any depth', () => {
		const result = store.addNode(tree(), node('new'), 'b');
		expect(store.findNode(result, 'b')!.children.map((n) => n.id)).toEqual(['c', 'new']);
	});

	it('does not mutate the input tree', () => {
		const t = tree();
		const before = structuredClone(t);
		store.addNode(t, node('new'), 'c');
		store.addNode(t, node('new2'), null);
		expect(t).toEqual(before);
	});

	it('leaves the tree unchanged when the parent does not exist', () => {
		expect(store.addNode(tree(), node('new'), 'ghost')).toEqual(tree());
	});
});

describe('removeNode', () => {
	it('removes a root node', () => {
		expect(store.removeNode(tree(), 'e').map((n) => n.id)).toEqual(['a']);
	});

	it('removes a nested node and its whole subtree', () => {
		const result = store.removeNode(tree(), 'b');
		expect(store.findNode(result, 'b')).toBeNull();
		expect(store.findNode(result, 'c')).toBeNull();
		expect(store.findNode(result, 'd')).not.toBeNull();
	});

	it('does not mutate the input tree', () => {
		const t = tree();
		store.removeNode(t, 'c');
		expect(t).toEqual(tree());
	});

	it('is a no-op for a missing id', () => {
		expect(store.removeNode(tree(), 'ghost')).toEqual(tree());
	});
});

describe('updateNodeStyles', () => {
	it('merges new styles over the existing ones', () => {
		const t = [node('a', [], { styles: { color: 'red', margin: '0' } })];
		const result = store.updateNodeStyles(t, 'a', { color: 'blue', padding: '4px' });
		expect(result[0].styles).toEqual({ color: 'blue', margin: '0', padding: '4px' });
	});

	it('updates a deeply nested node', () => {
		const result = store.updateNodeStyles(tree(), 'c', { width: '10px' });
		expect(store.findNode(result, 'c')!.styles).toEqual({ width: '10px' });
	});

	it('does not touch other nodes or mutate the input', () => {
		const t = tree();
		const result = store.updateNodeStyles(t, 'c', { width: '10px' });
		expect(store.findNode(result, 'd')!.styles).toEqual({});
		expect(t).toEqual(tree());
	});
});

describe('getAncestorPath', () => {
	it('returns the path from the root down to the node, inclusive', () => {
		expect(store.getAncestorPath(tree(), 'c').map((n) => n.id)).toEqual(['a', 'b', 'c']);
	});

	it('returns just the node for a root node', () => {
		expect(store.getAncestorPath(tree(), 'e').map((n) => n.id)).toEqual(['e']);
	});

	it('does not include siblings visited along the way', () => {
		expect(store.getAncestorPath(tree(), 'd').map((n) => n.id)).toEqual(['a', 'd']);
	});

	it('returns an empty array for a missing id', () => {
		expect(store.getAncestorPath(tree(), 'ghost')).toEqual([]);
	});
});
