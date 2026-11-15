import test from 'node:test';
import assert from 'node:assert/strict';
import { TldrawDocumentAdapter } from '../adapter.js';

const record = (id: string, props: Record<string, unknown>) => ({ id: `shape:${id}`, typeName: 'shape', type: 'uml-class', x: 20, y: 30,
  rotation: 0, isLocked: false, opacity: 1, parentId: 'page:page', index: 'a1', meta: {},
  props: { w: 220, h: 160, name: 'Storage', attributes: [], operations: [], role: 'Port', ...props } });

test('browser store loads and preserves an older UML class without classifier kind', () => {
  const doc = { schemaVersion: 1, records: { 'shape:legacy': record('legacy', {}) } };
  const store = TldrawDocumentAdapter.createStoreFromDocument(doc);
  const saved = TldrawDocumentAdapter.extractDocument(store);
  const reopened = TldrawDocumentAdapter.createStoreFromDocument(saved);
  const legacy = TldrawDocumentAdapter.extractDocument(reopened).records['shape:legacy'] as any;
  assert.equal(legacy.props.name, 'Storage');
  assert.equal(legacy.props.role, 'Port');
  assert.deepEqual(legacy.props.operations, []);
});

test('browser store preserves interface kind separately from its role', () => {
  const doc = { schemaVersion: 1, records: { 'shape:port': record('port', { classifierKind: 'interface' }) } };
  const store = TldrawDocumentAdapter.createStoreFromDocument(doc);
  const saved = TldrawDocumentAdapter.extractDocument(store);
  const reopened = TldrawDocumentAdapter.createStoreFromDocument(saved);
  const port = TldrawDocumentAdapter.extractDocument(reopened).records['shape:port'] as any;
  assert.equal(port.props.classifierKind, 'interface');
  assert.equal(port.props.role, 'Port');
});

test('browser store retains realization type and both endpoints', () => {
  const adapter = record('adapter', {});
  const port = { ...record('port', {}), index: 'a2' };
  const relation = { id: 'shape:r', typeName: 'shape', type: 'uml-relationship', x: 0, y: 0,
    rotation: 0, isLocked: false, opacity: 1, parentId: 'page:page', index: 'a3', meta: {},
    props: { kind: 'realization', from: 'shape:adapter', to: 'shape:port' } };
  const doc = { schemaVersion: 1, records: { 'shape:adapter': adapter, 'shape:port': port, 'shape:r': relation } };
  const store = TldrawDocumentAdapter.createStoreFromDocument(doc);
  const reopened = TldrawDocumentAdapter.createStoreFromDocument(TldrawDocumentAdapter.extractDocument(store));
  const result = TldrawDocumentAdapter.extractDocument(reopened).records['shape:r'] as any;
  assert.deepEqual([result.props.kind, result.props.from, result.props.to], ['realization', 'shape:adapter', 'shape:port']);
});

test('browser store roundtrips an extracted saved pre-classifier UML document', async () => {
  const { readFileSync } = await import('node:fs');
  const doc = JSON.parse(readFileSync(new URL('./fixtures/saved-uml-before-classifier-kind.json', import.meta.url), 'utf8'));
  const store = TldrawDocumentAdapter.createStoreFromDocument(doc);
  const reopened = TldrawDocumentAdapter.createStoreFromDocument(TldrawDocumentAdapter.extractDocument(store));
  const saved = TldrawDocumentAdapter.extractDocument(reopened).records as Record<string, any>;
  assert.equal(saved['shape:map'].props.name, doc.records['shape:map'].props.name);
  assert.deepEqual(saved['shape:storage'].props, doc.records['shape:storage'].props);
  assert.deepEqual(saved['shape:WKbDM_rlQEHOVD5u9yaNd'].props, doc.records['shape:WKbDM_rlQEHOVD5u9yaNd'].props);
});
