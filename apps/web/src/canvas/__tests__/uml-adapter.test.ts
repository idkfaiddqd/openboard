import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TldrawDocumentAdapter } from '../adapter.js';

test('browser store preserves a structured UML class', () => {
  const doc = { schemaVersion: 1, records: {
    'shape:order': { id: 'shape:order', typeName: 'shape', type: 'uml-class', x: 20, y: 30,
      rotation: 0, isLocked: false, opacity: 1, parentId: 'page:page', index: 'a1', meta: {},
      props: { w: 220, h: 160, name: 'Order', attributes: ['id: UUID'], operations: [] } },
  } };
  const store = TldrawDocumentAdapter.createStoreFromDocument(doc);
  const record = TldrawDocumentAdapter.extractDocument(store).records['shape:order'] as any;
  assert.equal(record.props.name, 'Order');
  assert.deepEqual(record.props.attributes, ['id: UUID']);
});

test('browser store loads and roundtrips a pre-UML standard board', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/standard-board.json', import.meta.url), 'utf8'));
  const store = TldrawDocumentAdapter.createStoreFromDocument(fixture);
  const saved = TldrawDocumentAdapter.extractDocument(store);
  const reloaded = TldrawDocumentAdapter.createStoreFromDocument(saved);
  const record = TldrawDocumentAdapter.extractDocument(reloaded).records['shape:legacy'] as any;
  assert.equal(record.type, 'geo');
  assert.equal(record.x, 20);
  assert.equal(record.y, 30);
});
