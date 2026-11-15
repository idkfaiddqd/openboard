import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardCanvasController } from '../controller.js';
import { TldrawDocumentAdapter } from '../adapter.js';

const base = { typeName: 'shape', x: 0, y: 0, rotation: 0, isLocked: false, opacity: 1, parentId: 'page:page', meta: {} };
function setup() {
  const records: Record<string, any> = {
    'shape:a': { ...base, id: 'shape:a', type: 'uml-class', index: 'a1', props: { w: 220, h: 160, name: 'A', attributes: [], operations: [] } },
    'shape:b': { ...base, id: 'shape:b', type: 'uml-class', index: 'a2', props: { w: 220, h: 160, name: 'B', attributes: [], operations: [], classifierKind: 'interface' } },
    'shape:c': { ...base, id: 'shape:c', type: 'uml-class', index: 'a3', props: { w: 220, h: 160, name: 'C', attributes: [], operations: [] } },
    'shape:r': { ...base, id: 'shape:r', type: 'uml-relationship', index: 'a4', props: { kind: 'realization', from: 'shape:a', to: 'shape:b' } },
    'shape:self': { ...base, id: 'shape:self', type: 'uml-relationship', index: 'a5', props: { kind: 'association', from: 'shape:b', to: 'shape:b' } },
    'shape:arrow': { ...base, id: 'shape:arrow', type: 'arrow', index: 'a6', props: { kind: 'arc', elbowMidPoint: 0.5, dash: 'draw', size: 'm', fill: 'none', color: 'black', labelColor: 'black', bend: 0, start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, arrowheadStart: 'none', arrowheadEnd: 'arrow', text: '', labelPosition: 0.5, font: 'draw', scale: 1 } },
  };
  const store = TldrawDocumentAdapter.createStoreFromDocument({ schemaVersion: 1, records });
  const controller = new BoardCanvasController({ store } as any);
  return { store, controller };
}
test('local deletion cascades to connected UML relationships and preserves unrelated shapes', () => {
  const { store, controller } = setup();
  try {
    store.remove(['shape:b' as any]);
    assert.equal(store.get('shape:r' as any), undefined);
    assert.equal(store.get('shape:self' as any), undefined);
    assert.ok(store.get('shape:a' as any));
    assert.ok(store.get('shape:c' as any));
    assert.ok(store.get('shape:arrow' as any));
  } finally { controller.dispose(); }
});
test('deleting both endpoints is safe and deleting relationship preserves endpoints', () => {
  const first = setup();
  try { first.store.remove(['shape:a' as any, 'shape:b' as any]); assert.equal(first.store.get('shape:r' as any), undefined); }
  finally { first.controller.dispose(); }
  const second = setup();
  try { second.store.remove(['shape:r' as any]); assert.ok(second.store.get('shape:a' as any)); assert.ok(second.store.get('shape:b' as any)); }
  finally { second.controller.dispose(); }
});
test('remote snapshot deletion does not silently cascade into a local edit', () => {
  const { store, controller } = setup();
  try {
    store.mergeRemoteChanges(() => store.remove(['shape:b' as any]));
    assert.ok(store.get('shape:r' as any));
  } finally { controller.dispose(); }
});
