import { uid } from './store.ts';
import type { ElementNode, ElementTag } from './store.ts';

export interface ElementDef {
  tag: ElementTag;
  label: string;
  defaultText: string;
  defaultStyles: Record<string, string>;
  defaultAttrs: Record<string, string>;
}

export const ELEMENT_DEFS: ElementDef[] = [
  {
    tag: 'div', label: 'Div', defaultText: '',
    defaultStyles: { display: 'block', 'min-height': '40px', 'background-color': '#f0f0f0', padding: '8px' },
    defaultAttrs: {},
  },
  {
    tag: 'section', label: 'Section', defaultText: '',
    defaultStyles: { display: 'block', 'min-height': '60px', padding: '16px' },
    defaultAttrs: {},
  },
  {
    tag: 'p', label: 'Paragraph', defaultText: 'Paragraph text',
    defaultStyles: { 'font-size': '16px', margin: '0' },
    defaultAttrs: {},
  },
  {
    tag: 'h1', label: 'Heading 1', defaultText: 'Heading 1',
    defaultStyles: { 'font-size': '32px', 'font-weight': 'bold', margin: '0' },
    defaultAttrs: {},
  },
  {
    tag: 'h2', label: 'Heading 2', defaultText: 'Heading 2',
    defaultStyles: { 'font-size': '24px', 'font-weight': 'bold', margin: '0' },
    defaultAttrs: {},
  },
  {
    tag: 'h3', label: 'Heading 3', defaultText: 'Heading 3',
    defaultStyles: { 'font-size': '20px', 'font-weight': 'bold', margin: '0' },
    defaultAttrs: {},
  },
  {
    tag: 'button', label: 'Button', defaultText: 'Button',
    defaultStyles: { padding: '8px 16px', cursor: 'pointer', display: 'inline-block' },
    defaultAttrs: {},
  },
  {
    tag: 'img', label: 'Image', defaultText: '',
    defaultStyles: { width: '100px', height: '100px', display: 'block', 'object-fit': 'cover', 'background-color': '#cccccc' },
    defaultAttrs: { src: '', alt: 'Image' },
  },
  {
    tag: 'input', label: 'Input', defaultText: '',
    defaultStyles: { padding: '6px 10px', border: '1px solid #ccc', 'border-radius': '4px', display: 'block', width: '200px' },
    defaultAttrs: { type: 'text', placeholder: 'Input' },
  },
  {
    tag: 'ul', label: 'List', defaultText: '',
    defaultStyles: { 'padding-left': '20px' },
    defaultAttrs: {},
  },
  {
    tag: 'a', label: 'Link', defaultText: 'Link',
    defaultStyles: { color: '#0066cc', 'text-decoration': 'underline' },
    defaultAttrs: { href: '#' },
  },
];

const CONTAINER_TAGS: ElementTag[] = ['div', 'section', 'ul'];

export function isContainer(tag: ElementTag): boolean {
  return CONTAINER_TAGS.includes(tag);
}

export function createElement(tag: ElementTag): ElementNode {
  const def = ELEMENT_DEFS.find(d => d.tag === tag);
  if (!def) throw new Error(`Unknown tag: ${tag}`);

  const node: ElementNode = {
    id: uid(),
    tag,
    styles: { ...def.defaultStyles },
    attrs: { ...def.defaultAttrs },
    textContent: def.defaultText,
    children: [],
  };

  if (tag === 'ul') {
    node.children = [
      { id: uid(), tag: 'li', styles: {}, attrs: {}, textContent: 'List item 1', children: [] },
      { id: uid(), tag: 'li', styles: {}, attrs: {}, textContent: 'List item 2', children: [] },
      { id: uid(), tag: 'li', styles: {}, attrs: {}, textContent: 'List item 3', children: [] },
    ];
  }

  return node;
}
