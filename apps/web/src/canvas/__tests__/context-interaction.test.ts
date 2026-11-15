import test from 'node:test';
import assert from 'node:assert/strict';
import { TldrawDocumentAdapter } from '../adapter.js';
import { BoardCanvasController } from '../controller.js';
const base = { typeName: 'shape', x: 0, y: 0, rotation: 0, isLocked: false, opacity: 1, parentId: 'page:page', meta: {} };
function setup() {
  const records: Record<string, any> = {
    'shape:a': { ...base, id: 'shape:a', type: 'bounded-context', index: 'a1', props: { w: 360, h: 240, name: 'Heightmap' } },
    'shape:b': { ...base, id: 'shape:b', type: 'bounded-context', index: 'a2', props: { w: 360, h: 240, name: 'Chunkstore' } },
    'shape:r': { ...base, id: 'shape:r', type: 'context-interaction', index: 'a3', props: { from: 'shape:a', to: 'shape:b', label: 'uses' } },
    'shape:frame': { ...base, id: 'shape:frame', type: 'frame', index: 'a4', props: { w: 400, h: 300, name: 'old frame', color: 'black' } },
  };
  const store = TldrawDocumentAdapter.createStoreFromDocument({ schemaVersion: 1, records });
  return { store, controller: new BoardCanvasController({ store } as any) };
}
test('browser store roundtrips semantic contexts while retaining ordinary frames', () => {
  const { store, controller } = setup();
  try { const saved = TldrawDocumentAdapter.extractDocument(store); const reopened = TldrawDocumentAdapter.createStoreFromDocument(saved); const records = TldrawDocumentAdapter.extractDocument(reopened).records as Record<string, any>;
    assert.equal(records['shape:a'].type, 'bounded-context'); assert.equal(records['shape:frame'].type, 'frame');
    assert.deepEqual([records['shape:r'].props.from, records['shape:r'].props.to, records['shape:r'].props.label], ['shape:a','shape:b','uses']);
  } finally { controller.dispose(); }
});
test('local context deletion removes interactions but not other contexts and ordinary frames', () => {
  const { store, controller } = setup();
  try { store.remove(['shape:a' as any]); assert.equal(store.get('shape:r' as any), undefined); assert.ok(store.get('shape:b' as any)); assert.ok(store.get('shape:frame' as any)); }
  finally { controller.dispose(); }
});
test('remote context deletion is not silently turned into a local cascade', () => {
  const { store, controller } = setup();
  try { store.mergeRemoteChanges(() => store.remove(['shape:a' as any])); assert.ok(store.get('shape:r' as any)); }
  finally { controller.dispose(); }
});
test('deleting interaction preserves contexts', () => {
  const { store, controller } = setup();
  try { store.remove(['shape:r' as any]); assert.ok(store.get('shape:a' as any)); assert.ok(store.get('shape:b' as any)); }
  finally { controller.dispose(); }
});
