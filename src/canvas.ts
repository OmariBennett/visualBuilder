import type { AppState, ElementNode } from './store.ts';

let _iframe: HTMLIFrameElement;
let _selectionBox: HTMLElement;
let _initialized = false;
let _pendingState: AppState | null = null;

const INIT_HTML = `<!doctype html><html><head>
<meta charset="UTF-8">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; }
</style>
</head><body></body></html>`;

const CLICK_SCRIPT = `
document.addEventListener('click', function(e) {
  var el = e.target.closest('[data-id]');
  parent.postMessage({ type: 'element-select', id: el ? el.dataset.id : null }, '*');
});
`;

export function initCanvas(
  iframe: HTMLIFrameElement,
  selectionBox: HTMLElement,
  onSelect: (id: string | null) => void,
): void {
  _iframe = iframe;
  _selectionBox = selectionBox;

  window.addEventListener('message', (e: MessageEvent) => {
    if ((e.data as { type?: string })?.type === 'element-select') {
      onSelect((e.data as { id: string | null }).id);
    }
  });

  _iframe.addEventListener('load', () => {
    _injectScript();
    _initialized = true;
    if (_pendingState) {
      _doRender(_pendingState);
      _pendingState = null;
    }
  });

  _iframe.srcdoc = INIT_HTML;
}

function _injectScript(): void {
  const doc = _iframe.contentDocument!;
  const s = doc.createElement('script');
  s.textContent = CLICK_SCRIPT;
  doc.head.appendChild(s);
}

export function renderCanvas(state: AppState): void {
  if (!_initialized) {
    _pendingState = state;
    return;
  }
  _doRender(state);
}

function _doRender(state: AppState): void {
  const doc = _iframe.contentDocument!;
  const body = doc.body;

  body.innerHTML = '';
  body.style.width = `${state.canvasWidth}px`;
  body.style.minHeight = `${state.canvasHeight}px`;
  _iframe.style.width = `${state.canvasWidth}px`;
  _iframe.style.height = `${state.canvasHeight}px`;

  for (const node of state.elements) {
    body.appendChild(_buildDOMElement(doc, node));
  }

  requestAnimationFrame(() => _updateOverlay(state.selectedId));
}

function _buildDOMElement(doc: Document, node: ElementNode): Element {
  const el = doc.createElement(node.tag);
  (el as HTMLElement).dataset['id'] = node.id;

  for (const [prop, value] of Object.entries(node.styles)) {
    (el as HTMLElement).style.setProperty(prop, value);
  }
  for (const [attr, value] of Object.entries(node.attrs)) {
    el.setAttribute(attr, value);
  }
  if (node.textContent && node.children.length === 0) {
    el.textContent = node.textContent;
  }
  for (const child of node.children) {
    el.appendChild(_buildDOMElement(doc, child));
  }
  return el;
}

export function patchStyles(id: string, styles: Record<string, string>): void {
  if (!_iframe.contentDocument) return;
  const el = _iframe.contentDocument.querySelector(`[data-id="${id}"]`) as HTMLElement | null;
  if (!el) return;
  for (const [prop, value] of Object.entries(styles)) {
    el.style.setProperty(prop, value);
  }
  _updateOverlay(id);
}

export function updateOverlay(selectedId: string | null): void {
  _updateOverlay(selectedId);
}

function _updateOverlay(selectedId: string | null): void {
  if (!selectedId || !_iframe.contentDocument) {
    _selectionBox.style.display = 'none';
    return;
  }
  const el = _iframe.contentDocument.querySelector(`[data-id="${selectedId}"]`);
  if (!el) {
    _selectionBox.style.display = 'none';
    return;
  }
  const rect = el.getBoundingClientRect();
  _selectionBox.style.display = 'block';
  _selectionBox.style.left = `${rect.left}px`;
  _selectionBox.style.top = `${rect.top}px`;
  _selectionBox.style.width = `${rect.width}px`;
  _selectionBox.style.height = `${rect.height}px`;
}
