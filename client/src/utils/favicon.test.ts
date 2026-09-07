import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { applyChurchFavicon, restoreDefaultFavicon } from './favicon.ts';

function createDocument() {
  const nodes: Array<{
    rel: string;
    href: string;
    attrs: Record<string, string>;
    setAttribute: (name: string, value: string) => void;
    remove: () => void;
  }> = [];
  const doc = {
    head: {
      appendChild(node: (typeof nodes)[number]) {
        nodes.push(node);
      },
    },
    createElement() {
      const node = {
        rel: '',
        href: '',
        attrs: {} as Record<string, string>,
        setAttribute(name: string, value: string) {
          node.attrs[name] = value;
        },
        remove() {
          const index = nodes.indexOf(node);
          if (index >= 0) nodes.splice(index, 1);
        },
      };
      return node;
    },
    querySelector(selector: string) {
      if (!selector.includes('data-church-favicon')) return null;
      return nodes.find((node) => node.attrs['data-church-favicon'] === 'true') || null;
    },
  };
  return { doc, nodes };
}

describe('favicon da igreja', () => {
  test('usa o logotipo depois que a igreja é identificada e restaura ao sair', () => {
    const { doc, nodes } = createDocument();
    const previous = globalThis.document;
    (globalThis as { document: typeof doc }).document = doc;

    applyChurchFavicon('https://blob.test/logo.png');
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].rel, 'icon');
    assert.equal(nodes[0].href, 'https://blob.test/logo.png');

    applyChurchFavicon('https://blob.test/novo.png');
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].href, 'https://blob.test/novo.png');

    restoreDefaultFavicon();
    assert.equal(nodes.length, 0);
    applyChurchFavicon(undefined);
    assert.equal(nodes.length, 0);

    (globalThis as { document: typeof previous }).document = previous;
  });
});
