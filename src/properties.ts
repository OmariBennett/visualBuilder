import type { ElementNode } from './store.ts';

interface PropDef {
  label: string;
  prop: string;
  type: 'text' | 'color';
}

interface PropGroup {
  label: string;
  props: PropDef[];
}

const PROP_GROUPS: PropGroup[] = [
  {
    label: 'Spacing',
    props: [
      { label: 'margin', prop: 'margin', type: 'text' },
      { label: 'padding', prop: 'padding', type: 'text' },
    ],
  },
  {
    label: 'Size',
    props: [
      { label: 'width', prop: 'width', type: 'text' },
      { label: 'height', prop: 'height', type: 'text' },
    ],
  },
  {
    label: 'Typography',
    props: [
      { label: 'font-size', prop: 'font-size', type: 'text' },
      { label: 'color', prop: 'color', type: 'color' },
      { label: 'font-weight', prop: 'font-weight', type: 'text' },
      { label: 'text-align', prop: 'text-align', type: 'text' },
    ],
  },
  {
    label: 'Background',
    props: [
      { label: 'background', prop: 'background-color', type: 'color' },
    ],
  },
  {
    label: 'Border',
    props: [
      { label: 'border', prop: 'border', type: 'text' },
      { label: 'radius', prop: 'border-radius', type: 'text' },
    ],
  },
];

export function renderProperties(
  node: ElementNode | null,
  container: HTMLElement,
  onStyleChange: (prop: string, value: string) => void,
  onGradientClick: () => void,
): void {
  if (!node) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'props-header';
  header.innerHTML = `<span>Properties</span><code class="props-tag">&lt;${node.tag}&gt;</code>`;
  container.appendChild(header);

  const body = document.createElement('div');
  body.className = 'props-body';
  container.appendChild(body);

  for (const group of PROP_GROUPS) {
    const groupEl = document.createElement('div');
    groupEl.className = 'props-group';

    const groupLabel = document.createElement('div');
    groupLabel.className = 'props-group-label';
    groupLabel.textContent = group.label;
    groupEl.appendChild(groupLabel);

    for (const def of group.props) {
      const row = document.createElement('div');
      row.className = 'props-row';

      const label = document.createElement('label');
      label.className = 'props-row-label';
      label.textContent = def.label;

      const input = document.createElement('input');
      input.type = def.type;
      input.className = 'props-row-input';
      input.value = node.styles[def.prop] ?? '';
      input.placeholder = def.prop;

      input.addEventListener('input', () => onStyleChange(def.prop, input.value));

      row.appendChild(label);
      row.appendChild(input);
      groupEl.appendChild(row);

      if (def.prop === 'background-color') {
        const gradBtn = document.createElement('button');
        gradBtn.className = 'btn props-gradient-btn';
        gradBtn.textContent = '+ Gradient';
        gradBtn.addEventListener('click', onGradientClick);
        groupEl.appendChild(gradBtn);
      }
    }

    body.appendChild(groupEl);
  }
}
