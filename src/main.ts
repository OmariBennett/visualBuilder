import {
  getState, setState, undo, redo, subscribe,
  loadFromStorage, findNode, addNode, removeNode,
  updateNodeStyles, getAncestorPath,
} from './store.ts';
import type { AppState, ElementTag } from './store.ts';
import { createElement, isContainer } from './elements.ts';
import { initCanvas, renderCanvas, patchStyles, updateOverlay } from './canvas.ts';
import { renderProperties } from './properties.ts';
import { renderBreadcrumb } from './layers.ts';

// ─── DOM refs ────────────────────────────────────────────────────────────────
const iframe       = document.getElementById('canvas-iframe') as HTMLIFrameElement;
const selectionBox = document.getElementById('selection-box')!;
const propsPanel   = document.getElementById('props-panel')!;
const breadcrumb   = document.getElementById('breadcrumb')!;
const canvasWrapper = document.getElementById('canvas-wrapper')!;
const wInput       = document.getElementById('canvas-w') as HTMLInputElement;
const hInput       = document.getElementById('canvas-h') as HTMLInputElement;
const codeModal    = document.getElementById('code-modal') as HTMLDialogElement;
const codeOutput   = document.getElementById('code-output')!;

// ─── Debounce ────────────────────────────────────────────────────────────────
function debounce<T extends unknown[]>(fn: (...args: T) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: T) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// ─── Resize handles ──────────────────────────────────────────────────────────
interface ResizeSession {
  corner: string;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  id: string;
}
let _resizing: ResizeSession | null = null;

function startResize(e: MouseEvent, corner: string): void {
  const { selectedId, elements } = getState();
  if (!selectedId) return;
  const node = findNode(elements, selectedId);
  if (!node) return;
  const doc = iframe.contentDocument;
  if (!doc) return;
  const el = doc.querySelector(`[data-id="${selectedId}"]`) as HTMLElement | null;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  _resizing = { corner, startX: e.clientX, startY: e.clientY, startW: rect.width, startH: rect.height, id: selectedId };
  e.preventDefault();
}

document.addEventListener('mousemove', (e: MouseEvent) => {
  if (!_resizing) return;
  const dx = e.clientX - _resizing.startX;
  const dy = e.clientY - _resizing.startY;
  const isRight  = _resizing.corner === 'tr' || _resizing.corner === 'br';
  const isBottom = _resizing.corner === 'bl' || _resizing.corner === 'br';
  const newW = Math.max(20, isRight  ? _resizing.startW + dx : _resizing.startW - dx);
  const newH = Math.max(20, isBottom ? _resizing.startH + dy : _resizing.startH - dy);
  patchStyles(_resizing.id, { width: `${Math.round(newW)}px`, height: `${Math.round(newH)}px` });
  updateOverlay(_resizing.id);
});

document.addEventListener('mouseup', () => {
  if (!_resizing) return;
  const { id } = _resizing;
  const el = iframe.contentDocument?.querySelector(`[data-id="${id}"]`) as HTMLElement | null;
  if (el) {
    setState(s => ({ ...s, elements: updateNodeStyles(s.elements, id, { width: el.style.width, height: el.style.height }) }));
  }
  _resizing = null;
});

// ─── Render ──────────────────────────────────────────────────────────────────
function render(state: AppState): void {
  renderCanvas(state);
  canvasWrapper.style.width  = `${state.canvasWidth}px`;
  canvasWrapper.style.height = `${state.canvasHeight}px`;
  wInput.value = String(state.canvasWidth);
  hInput.value = String(state.canvasHeight);

  const selectedNode = state.selectedId ? findNode(state.elements, state.selectedId) : null;
  renderProperties(selectedNode, propsPanel, onStyleChange, onGradientClick);

  const path = state.selectedId ? getAncestorPath(state.elements, state.selectedId) : [];
  renderBreadcrumb(path, breadcrumb, id => setState(s => ({ ...s, selectedId: id })));
}

// ─── Style change ────────────────────────────────────────────────────────────
const commitStyle = debounce((id: string, prop: string, value: string) => {
  setState(s => ({ ...s, elements: updateNodeStyles(s.elements, id, { [prop]: value }) }));
}, 300);

function onStyleChange(prop: string, value: string): void {
  const { selectedId } = getState();
  if (!selectedId) return;
  patchStyles(selectedId, { [prop]: value });
  commitStyle(selectedId, prop, value);
}

// ─── Gradient shortcut ───────────────────────────────────────────────────────
function onGradientClick(): void {
  window.open('https://cssgradient.io/', '_blank', 'noopener');
}

// ─── Add / delete elements ───────────────────────────────────────────────────
function addElement(tag: ElementTag): void {
  const node = createElement(tag);
  const { selectedId, elements } = getState();
  const selectedNode = selectedId ? findNode(elements, selectedId) : null;
  const parentId = (selectedNode && isContainer(selectedNode.tag)) ? selectedId : null;
  setState(s => ({ ...s, elements: addNode(s.elements, node, parentId) }));
}

function deleteSelected(): void {
  const { selectedId } = getState();
  if (!selectedId) return;
  setState(s => ({ ...s, selectedId: null, elements: removeNode(s.elements, selectedId) }));
}

// ─── Canvas size ─────────────────────────────────────────────────────────────
function setCanvasSize(w: number, h: number): void {
  setState(s => ({ ...s, canvasWidth: w, canvasHeight: h }));
}

// ─── Code export ─────────────────────────────────────────────────────────────
function serializeNode(node: ReturnType<typeof findNode>): string {
  if (!node) return '';
  const styleStr = Object.entries(node.styles).map(([k, v]) => `${k}:${v}`).join(';');
  const attrStr  = Object.entries(node.attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
  const s = styleStr ? ` style="${styleStr}"` : '';
  const a = attrStr  ? ` ${attrStr}` : '';
  const voidTags = ['img', 'input'];
  if (voidTags.includes(node.tag)) return `  <${node.tag}${s}${a}>`;
  const children = node.children.map(c => serializeNode(c)).join('\n');
  const inner = node.textContent || children;
  return `  <${node.tag}${s}${a}>${inner}</${node.tag}>`;
}

function buildExportHTML(): string {
  const { elements, canvasWidth, canvasHeight } = getState();
  const body = elements.map(n => serializeNode(n)).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; width: ${canvasWidth}px; min-height: ${canvasHeight}px; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init(): void {
  loadFromStorage();

  initCanvas(iframe, selectionBox, id => setState(s => ({ ...s, selectedId: id })));
  subscribe(render);

  // Element palette
  document.querySelectorAll<HTMLButtonElement>('[data-add-element]').forEach(btn => {
    btn.addEventListener('click', () => addElement(btn.dataset['addElement'] as ElementTag));
  });

  // Canvas size presets
  document.getElementById('preset-mobile')  ?.addEventListener('click', () => setCanvasSize(375,  812));
  document.getElementById('preset-tablet')  ?.addEventListener('click', () => setCanvasSize(768,  1024));
  document.getElementById('preset-desktop') ?.addEventListener('click', () => setCanvasSize(1440, 900));

  wInput.addEventListener('change', () => setCanvasSize(parseInt(wInput.value) || 375, getState().canvasHeight));
  hInput.addEventListener('change', () => setCanvasSize(getState().canvasWidth, parseInt(hInput.value) || 812));

  // Resize handles
  document.querySelectorAll<HTMLElement>('.rh').forEach(handle => {
    handle.addEventListener('mousedown', e => startResize(e, handle.dataset['corner'] ?? 'br'));
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (isInputFocused()) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); return; }
    if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); return; }
    if (e.ctrlKey && (e.shiftKey && e.key === 'Z' || e.key === 'y')) { e.preventDefault(); redo(); }
  });

  // Code modal
  document.getElementById('btn-view-code')?.addEventListener('click', () => {
    codeOutput.textContent = buildExportHTML();
    codeModal.showModal();
  });
  document.getElementById('btn-copy-code')?.addEventListener('click', () => {
    navigator.clipboard.writeText(codeOutput.textContent ?? '').catch(() => {});
  });
  document.getElementById('btn-close-modal')?.addEventListener('click', () => codeModal.close());

  // Initial render
  render(getState());
}

function isInputFocused(): boolean {
  const tag = document.activeElement?.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea';
}

document.addEventListener('DOMContentLoaded', init);
