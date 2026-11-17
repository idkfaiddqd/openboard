import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBoardRepository } from '@openboard/storage';
import type { CreateShapeInput, UpdateShapeInput } from '@openboard/shared';
import { BoardService } from '../service.js';
import { CanvasService } from '../canvas.js';
import { BoardEventBus } from '../events.js';

// Contract: mapping is an externally authored projection, not a new canvas shape.
const mapping = () => ({
  scope: 'Current implementation',
  sources: [{ locator: 'docs/current-mapping.md', repository: 'model', revision: 'model-revision' }],
  sections: [{ id: 'ports', title: 'Ports', entries: [{
    id: 'storage', responsibility: 'Store the order', explanation: 'Port and its consumer',
    artifacts: [
      { locator: 'pkg/store#Port', repository: 'contracts', revision: 'one', participation: 'provides capability' },
      { locator: 'pkg/service#Service.store', repository: 'app', revision: 'two', participation: 'uses capability' },
    ],
    evidence: [{ locator: 'receipts/port.md', claim: 'Port found in source', method: 'source inspection', limits: 'No runtime execution' }],
    gaps: ['Provider behavior not established'],
  }] }],
});
const cls = (id: string) => ({ id, type: 'uml-class', x: 20, y: 30, name: id, attributes: [], operations: [] });
const context = (id: string) => ({ id, type: 'bounded-context', x: 400, y: 30, name: id });
const cases: Array<[string, Record<string, unknown>[], Record<string, unknown>]> = [
  ['uml-class', [], cls('subject')],
  ['uml-relationship', [cls('a'), cls('b')], { id: 'subject', type: 'uml-relationship', kind: 'association', from: 'a', to: 'b' }],
  ['bounded-context', [], context('subject')],
  ['context-interaction', [context('a'), context('b')], { id: 'subject', type: 'context-interaction', from: 'a', to: 'b' }],
  ['aggregate-boundary', [], { id: 'subject', type: 'aggregate-boundary', x: 0, y: 0, name: 'Order' }],
  ['sequence-diagram', [], { id: 'subject', type: 'sequence-diagram', x: 0, y: 0, name: 'Request', participants: [], messages: [] }],
  ['assembly-diagram', [], { id: 'subject', type: 'assembly-diagram', x: 0, y: 0, name: 'Assembly', participants: [], relations: [] }],
];
async function setup() {
  const events = new BoardEventBus();
  const boards = new BoardService(new MemoryBoardRepository(), events);
  const canvas = new CanvasService(boards, events);
  const board = await boards.createBoard({ name: 'DDD mapping contract' });
  return { boards, canvas, events, id: board.metadata.id };
}
const inputs = (values: unknown[]) => values as CreateShapeInput[];
const updates = (values: unknown[]) => values as UpdateShapeInput[];
async function read(canvas: CanvasService, id: string, includeMapping = false): Promise<any> {
  return (canvas.getCanvasState as any)(id, { includeMapping });
}
const subject = (state: any) => state.shapes.find((shape: any) => shape.id === 'shape:subject');

for (const [type, dependencies, shape] of cases) {
  test(`DDD mapping: ${type} retains the complete projection and exposes it only on explicit read`, async () => {
    const { boards, canvas, id } = await setup();
    const expected = mapping();
    await canvas.createShapes(id, inputs([...dependencies, { ...shape, mapping: expected }]));
    assert.deepEqual(subject(await read(canvas, id, true)).mapping, expected);
    const brief = subject(await read(canvas, id));
    assert.equal(brief.hasMapping, true);
    assert.equal(Object.hasOwn(brief, 'mapping'), false);
    assert.deepEqual(((await boards.getBoard(id)).document.records['shape:subject'] as any).props.mapping, expected);
    assert.equal((await read(canvas, id)).shapesCount, dependencies.length + 1, 'Mapping must not create an extra shape');
  });
  test(`DDD mapping: ${type} distinguishes absent data from an explicitly empty projection`, async () => {
    const { canvas, id } = await setup();
    await canvas.createShapes(id, inputs([...dependencies, shape]));
    assert.equal(subject(await read(canvas, id)).hasMapping, false);
    await canvas.updateShapes(id, updates([{ id: 'subject', mapping: { sources: [], sections: [] } }]));
    const full = subject(await read(canvas, id, true));
    assert.equal(full.hasMapping, true);
    assert.deepEqual(full.mapping, { sources: [], sections: [] });
  });
}

test('DDD mapping: omitted update preserves mapping while geometry changes', async () => {
  const { canvas, id } = await setup();
  await canvas.createShapes(id, inputs([{ ...cls('subject'), mapping: mapping() }]));
  await canvas.updateShapes(id, updates([{ id: 'subject', x: 125, y: 175, w: 310, h: 240 }]));
  const result = subject(await read(canvas, id, true));
  assert.deepEqual(result.mapping, mapping());
  assert.deepEqual([result.x, result.y, result.w, result.h], [125, 175, 310, 240]);
});
test('DDD mapping: replacement removes old fields and preserves geometry and primary code link', async () => {
  const { canvas, id } = await setup();
  await canvas.createShapes(id, inputs([{ ...cls('subject'), w: 300, h: 220, sourceRef: 'app/pkg#Order', syncedCommit: 'old', mapping: mapping() }]));
  const replacement = { sources: [], sections: [] };
  await canvas.updateShapes(id, updates([{ id: 'subject', mapping: replacement }]));
  const result = subject(await read(canvas, id, true));
  assert.deepEqual(result.mapping, replacement);
  assert.deepEqual([result.x, result.y, result.w, result.h, result.sourceRef, result.syncedCommit], [20, 30, 300, 220, 'app/pkg#Order', 'old']);
});
test('DDD mapping: null clears persisted data without changing the subject', async () => {
  const { boards, canvas, id } = await setup();
  await canvas.createShapes(id, inputs([{ ...cls('subject'), mapping: mapping() }]));
  await canvas.updateShapes(id, updates([{ id: 'subject', mapping: null }]));
  const result = subject(await read(canvas, id, true));
  assert.equal(result.hasMapping, false);
  assert.equal(Object.hasOwn(result, 'mapping'), false);
  assert.equal(Object.hasOwn(((await boards.getBoard(id)).document.records['shape:subject'] as any).props, 'mapping'), false);
  assert.deepEqual([result.name, result.x, result.y], ['subject', 20, 30]);
});
test('DDD mapping: deleting a subject removes its nested projection and creates no orphan shape', async () => {
  const { boards, canvas, id } = await setup();
  await canvas.createShapes(id, inputs([{ ...cls('subject'), mapping: mapping() }, cls('other')]));
  await canvas.deleteShapes(id, ['subject']);
  const state = await read(canvas, id, true);
  assert.deepEqual(state.shapes.map((s: any) => s.id), ['shape:other']);
  assert.equal(state.shapes[0].hasMapping, false);
  assert.equal((await boards.getBoard(id)).document.records['shape:subject'], undefined);
});
test('DDD mapping: repeated locators with different roles and repeated entry IDs across sections are valid', async () => {
  const { canvas, id } = await setup();
  const expected = mapping();
  const entry = expected.sections[0]!.entries[0]!;
  entry.artifacts.push({ ...entry.artifacts[0]!, participation: 'shared mechanism' });
  expected.sections.push({ ...structuredClone(expected.sections[0]!), id: 'another-section' });
  await canvas.createShapes(id, inputs([{ ...cls('subject'), mapping: expected }]));
  assert.deepEqual(subject(await read(canvas, id, true)).mapping, expected);
});
test('DDD mapping: string locators and revisions are preserved without symbol resolution', async () => {
  const { canvas, id } = await setup();
  const expected = mapping();
  expected.sections[0]!.entries[0]!.artifacts[0]!.locator = 'not a resolvable code symbol';
  expected.sections[0]!.entries[0]!.artifacts[0]!.revision = 'not-a-commit';
  await canvas.createShapes(id, inputs([{ ...cls('subject'), mapping: expected }]));
  assert.deepEqual(subject(await read(canvas, id, true)).mapping, expected);
});

const invalid: Array<[string, () => unknown]> = [
  ['non-object', () => 42],
  ['missing required arrays', () => ({})],
  ['unknown field', () => ({ ...mapping(), typo: true })],
  ['duplicate section ID', () => { const m = mapping(); m.sections.push(structuredClone(m.sections[0]!)); return m; }],
  ['duplicate entry ID', () => { const m = mapping(); m.sections[0]!.entries.push(structuredClone(m.sections[0]!.entries[0]!)); return m; }],
  ['blank ID', () => { const m = mapping(); m.sections[0]!.id = ' '; return m; }],
  ['non-string role', () => { const m: any = mapping(); m.sections[0].entries[0].artifacts[0].participation = 7; return m; }],
  ['unknown nested field', () => { const m: any = mapping(); m.sections[0].entries[0].artifacts[0].participaton = 'typo'; return m; }],
];
for (const [reason, bad] of invalid) {
  for (const operation of ['create', 'update'] as const) {
    test(`DDD mapping: ${operation} rejects ${reason} without saving any part of the batch`, async () => {
      const { boards, canvas, events, id } = await setup();
      await canvas.createShapes(id, inputs([cls('subject'), cls('other')]));
      const before = structuredClone((await boards.getBoard(id)).document);
      const successes: string[] = [];
      const off = events.on('canvas:updated', () => successes.push('canvas'));
      const offBoard = events.on('board:updated', () => successes.push('board'));
      try {
        const request = operation === 'create'
          ? canvas.createShapes(id, inputs([cls('new-valid'), { ...cls('new-bad'), mapping: bad() }]))
          : canvas.updateShapes(id, updates([{ id: 'other', x: 900 }, { id: 'subject', mapping: bad() }]));
        await assert.rejects(request, 'Malformed mapping must reject the entire operation');
        assert.deepEqual((await boards.getBoard(id)).document, before, 'No valid prefix of the batch may be persisted');
        assert.deepEqual(successes, [], 'No successful update event on validation failure');
      } finally { off(); offBoard(); }
    });
  }
}
test('DDD mapping: ordinary shapes reject mapping rather than silently discarding it', async () => {
  const { boards, canvas, id } = await setup();
  // Positive control: geo is a supported ordinary type, so failure must be due to mapping.
  await canvas.createShapes(id, inputs([{ id: 'control', type: 'geo', x: 0, y: 0 }]));
  const before = structuredClone((await boards.getBoard(id)).document);
  await assert.rejects(canvas.createShapes(id, inputs([{ id: 'plain', type: 'geo', x: 0, y: 0, mapping: mapping() }])));
  assert.deepEqual((await boards.getBoard(id)).document, before);
});
