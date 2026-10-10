import type { ElementNode } from './store.ts';

export function renderBreadcrumb(
  path: ElementNode[],
  container: HTMLElement,
  onSelect: (id: string) => void,
): void {
  container.innerHTML = '';

  if (path.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'breadcrumb-empty';
    empty.textContent = 'No selection';
    container.appendChild(empty);
    return;
  }

  path.forEach((node, i) => {
    const item = document.createElement('span');
    item.className = 'breadcrumb-item' + (i === path.length - 1 ? ' breadcrumb-item--active' : '');
    item.textContent = `<${node.tag}>`;
    item.addEventListener('click', () => onSelect(node.id));
    container.appendChild(item);

    if (i < path.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'breadcrumb-sep';
      sep.textContent = ' › ';
      container.appendChild(sep);
    }
  });
}
