export type ElementTag =
  | 'div' | 'section' | 'p' | 'h1' | 'h2' | 'h3'
  | 'button' | 'img' | 'input' | 'ul' | 'li' | 'a';

export interface ElementNode {
  id: string;
  tag: ElementTag;
  styles: Record<string, string>;
  attrs: Record<string, string>;
  children: ElementNode[];
  textContent: string;
}

export interface AppState {
  elements: ElementNode[];
  selectedId: string | null;
  canvasWidth: number;
  canvasHeight: number;
}

type Listener = (state: AppState) => void;

const STORAGE_KEY = 'toolbox-v1';
const MAX_HISTORY = 50;

function defaultState(): AppState {
  return { elements: [], selectedId: null, canvasWidth: 375, canvasHeight: 812 };
}

let _state: AppState = defaultState();
let _history: AppState[] = [structuredClone(_state)];
let _historyIndex = 0;
const _listeners = new Set<Listener>();

export function getState(): AppState {
  return _state;
}

function _notify(): void {
  _listeners.forEach(l => l(_state));
}

function _pushHistory(): void {
  _history = _history.slice(0, _historyIndex + 1);
  _history.push(structuredClone(_state));
  if (_history.length > MAX_HISTORY + 1) { _history.shift(); }
  else { _historyIndex++; }
}

function _persist(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_state)); } catch { /* quota */ }
}

export function setState(updater: (s: AppState) => AppState): void {
  _state = updater(structuredClone(_state));
  _pushHistory();
  _persist();
  _notify();
}

export function undo(): void {
  if (_historyIndex <= 0) return;
  _historyIndex--;
  _state = structuredClone(_history[_historyIndex]);
  _persist();
  _notify();
}

export function redo(): void {
  if (_historyIndex >= _history.length - 1) return;
  _historyIndex++;
  _state = structuredClone(_history[_historyIndex]);
  _persist();
  _notify();
}

export function subscribe(listener: Listener): () => void {
  _listeners.add(listener);
  return () => { _listeners.delete(listener); };
}

export function loadFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    _state = JSON.parse(raw) as AppState;
    _history = [structuredClone(_state)];
    _historyIndex = 0;
  } catch { /* corrupted */ }
}

export function uid(): string {
  return `el-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Tree operations ────────────────────────────────────────────────────────

export function findNode(nodes: ElementNode[], id: string): ElementNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

export function addNode(
  nodes: ElementNode[],
  node: ElementNode,
  parentId: string | null,
): ElementNode[] {
  if (parentId === null) return [...nodes, node];
  return nodes.map(n => {
    if (n.id === parentId) return { ...n, children: [...n.children, node] };
    return { ...n, children: addNode(n.children, node, parentId) };
  });
}

export function removeNode(nodes: ElementNode[], id: string): ElementNode[] {
  return nodes
    .filter(n => n.id !== id)
    .map(n => ({ ...n, children: removeNode(n.children, id) }));
}

export function updateNodeStyles(
  nodes: ElementNode[],
  id: string,
  styles: Record<string, string>,
): ElementNode[] {
  return nodes.map(n => {
    if (n.id === id) return { ...n, styles: { ...n.styles, ...styles } };
    return { ...n, children: updateNodeStyles(n.children, id, styles) };
  });
}

export function getAncestorPath(
  nodes: ElementNode[],
  id: string,
  path: ElementNode[] = [],
): ElementNode[] {
  for (const node of nodes) {
    const current = [...path, node];
    if (node.id === id) return current;
    const found = getAncestorPath(node.children, id, current);
    if (found.length > 0) return found;
  }
  return [];
}
