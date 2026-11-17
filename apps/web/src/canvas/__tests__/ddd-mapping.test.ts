import test from 'node:test';
import assert from 'node:assert/strict';
import { TldrawDocumentAdapter } from '../adapter.js';
import { BoardCanvasController } from '../controller.js';

// A real TLStore checks document compatibility; this is not a DOM or autosave test.
const mapping = () => ({ sources: [{ locator: 'docs/current-mapping.md' }], sections: [{ id: 'implementation', title: 'Implementation', entries: [{
  id: 'port', responsibility: 'Expose a port', artifacts: [{ locator: 'pkg#Port', repository: 'app', participation: 'provides capability', revision: 'abc' }],
  evidence: [{ claim: 'Source inspected', limits: 'Not runtime evidence' }], gaps: ['Consumer not inspected'],
}] }] });
const cases: Array<[string, object]> = [
  ['uml-class', { w: 220, h: 160, name: 'Order', attributes: [], operations: [] }],
  ['uml-relationship', { from: 'shape:a', to: 'shape:b', kind: 'association' }],
  ['bounded-context', { w: 360, h: 240, name: 'Sales' }],
  ['context-interaction', { from: 'shape:a', to: 'shape:b', label: 'uses' }],
  ['aggregate-boundary', { w: 440, h: 300, name: 'Order', memberIds: [] }],
  ['sequence-diagram', { w: 520, h: 360, name: 'Request', participants: [], messages: [] }],
  ['assembly-diagram', { w: 600, h: 400, name: 'Assembly', participants: [], relations: [] }],
];
function document(type: string, props: object, withMapping = true) {
  return { schemaVersion: 1, records: { 'shape:subject': {
    id: 'shape:subject', typeName: 'shape', type, x: 20, y: 30, rotation: 0,
    isLocked: false, opacity: 1, parentId: 'page:page', index: 'a1', meta: {},
    props: { ...props, ...(withMapping ? { mapping: mapping() } : {}) },
  } } };
}
for (const [type, props] of cases) {
  test(`DDD mapping browser store: ${type} loads and round-trips its full projection`, () => {
    const store = TldrawDocumentAdapter.createStoreFromDocument(document(type, props));
    const saved = TldrawDocumentAdapter.extractDocument(store);
    const reopened = TldrawDocumentAdapter.createStoreFromDocument(saved);
    assert.deepEqual((TldrawDocumentAdapter.extractDocument(reopened).records['shape:subject'] as any).props.mapping, mapping());
  });
  test(`DDD mapping browser store: old ${type} document without mapping remains compatible`, () => {
    const store = TldrawDocumentAdapter.createStoreFromDocument(document(type, props, false));
    const reopened = TldrawDocumentAdapter.createStoreFromDocument(TldrawDocumentAdapter.extractDocument(store));
    assert.equal(Object.hasOwn((reopened.get('shape:subject' as any) as any).props, 'mapping'), false);
  });
}
test('DDD mapping browser store: user geometry change and serialization retain mapping', () => {
  const store = TldrawDocumentAdapter.createStoreFromDocument(document('uml-class', cases[0]![1]));
  const record = store.get('shape:subject' as any) as any;
  store.put([{ ...record, x: 300, y: 400, props: { ...record.props, w: 500, h: 350 } }]);
  const reopened = TldrawDocumentAdapter.createStoreFromDocument(TldrawDocumentAdapter.extractDocument(store));
  const result = reopened.get('shape:subject' as any) as any;
  assert.deepEqual(result.props.mapping, mapping());
  assert.deepEqual([result.x, result.y, result.props.w, result.props.h], [300, 400, 500, 350]);
});
test('DDD mapping browser store: remote full snapshot updates and clears the projection', () => {
  const store = TldrawDocumentAdapter.createStoreFromDocument(document('uml-class', cases[0]![1], false));
  const controller = new BoardCanvasController({ store } as any);
  try {
    controller.mergeRemoteDocument(document('uml-class', cases[0]![1]));
    assert.deepEqual((store.get('shape:subject' as any) as any).props.mapping, mapping());
    controller.mergeRemoteDocument(document('uml-class', cases[0]![1], false));
    assert.equal(Object.hasOwn((store.get('shape:subject' as any) as any).props, 'mapping'), false);
  } finally { controller.dispose(); }
});
