import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBoardRepository } from '@openboard/storage';
import type { CreateShapeInput, UpdateShapeInput } from '@openboard/shared';
import { BoardService } from '../service.js';
import { CanvasService } from '../canvas.js';

const input = (value: unknown) => value as CreateShapeInput;
const update = (value: unknown) => value as UpdateShapeInput;
const REF = 'terrain/server/internal/locomotion/model#Registry.SetDestination';
const CTX_REF = 'terrain/server/internal/locomotion';
const COMMIT = 'f731e9e';

async function setup() {
  const boards = new BoardService(new MemoryBoardRepository());
  const canvas = new CanvasService(boards);
  const board = await boards.createBoard({ name: 'sourceRef' });
  return { canvas, boardId: board.metadata.id };
}

const classA = { id: 'a', type: 'uml-class', x: 0, y: 0, name: 'A', attributes: [], operations: [] };
const classB = { id: 'b', type: 'uml-class', x: 300, y: 0, name: 'B', attributes: [], operations: [] };

// [type, shapes to create, id of the shape expected to carry the link fields, expected sourceRef]
const cases: Array<[string, unknown[], string, string]> = [
  ['uml-class', [{ ...classA, sourceRef: REF, syncedCommit: COMMIT }], 'a', REF],
  ['uml-relationship', [classA, classB, { id: 'rel', type: 'uml-relationship', kind: 'association', from: 'a', to: 'b', sourceRef: REF, syncedCommit: COMMIT }], 'rel', REF],
  ['bounded-context', [{ id: 'ctx', type: 'bounded-context', x: 0, y: 0, name: 'Locomotion', sourceRef: CTX_REF, syncedCommit: COMMIT }], 'ctx', CTX_REF],
  ['context-interaction', [
    { id: 'c1', type: 'bounded-context', x: 0, y: 0, name: 'C1' },
    { id: 'c2', type: 'bounded-context', x: 400, y: 0, name: 'C2' },
    { id: 'link', type: 'context-interaction', from: 'c1', to: 'c2', sourceRef: REF, syncedCommit: COMMIT },
  ], 'link', REF],
  ['aggregate-boundary', [{ id: 'agg', type: 'aggregate-boundary', x: 0, y: 0, name: 'Agg', sourceRef: REF, syncedCommit: COMMIT }], 'agg', REF],
  ['sequence-diagram', [{ id: 'seq', type: 'sequence-diagram', x: 0, y: 0, name: 'S', participants: [{ id: 'p', name: 'P' }], messages: [], sourceRef: REF, syncedCommit: COMMIT }], 'seq', REF],
  ['assembly-diagram', [{ id: 'asm', type: 'assembly-diagram', x: 0, y: 0, name: 'Asm', sourceRef: REF, syncedCommit: COMMIT }], 'asm', REF],
];

for (const [type, shapes, id, expectedRef] of cases) {
  test(`${type} round-trips sourceRef and syncedCommit verbatim`, async () => {
    const { canvas, boardId } = await setup();
    await canvas.createShapes(boardId, shapes.map(input));
    const shape = (await canvas.getCanvasState(boardId)).shapes.find((item) => item.id === `shape:${id}`) as any;
    assert.ok(shape, `shape:${id}`);
    assert.equal(shape.sourceRef, expectedRef);
    assert.equal(shape.syncedCommit, COMMIT);
  });
}

test('link fields are absent by default and stored without content validation', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [input(classA), input({ id: 'junk', type: 'uml-class', x: 0, y: 200, name: 'J', attributes: [], operations: [], sourceRef: 'not-a-ref', syncedCommit: 'any-string' })]);
  const plain = (await canvas.getCanvasState(boardId)).shapes.find((item) => item.id === 'shape:a') as any;
  assert.equal(plain.sourceRef, undefined);
  assert.equal(plain.syncedCommit, undefined);
  const junk = (await canvas.getCanvasState(boardId)).shapes.find((item) => item.id === 'shape:junk') as any;
  assert.equal(junk.sourceRef, 'not-a-ref');
  assert.equal(junk.syncedCommit, 'any-string');
});

test('update replaces sourceRef and clears syncedCommit with an empty string', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [input({ ...classA, sourceRef: REF, syncedCommit: COMMIT })]);
  await canvas.updateShapes(boardId, [update({ id: 'a', sourceRef: 'terrain/server/internal/enetbridge/model#Bridge' })]);
  let shape = (await canvas.getCanvasState(boardId)).shapes.find((item) => item.id === 'shape:a') as any;
  assert.equal(shape.sourceRef, 'terrain/server/internal/enetbridge/model#Bridge');
  assert.equal(shape.syncedCommit, COMMIT);
  await canvas.updateShapes(boardId, [update({ id: 'a', syncedCommit: '' })]);
  shape = (await canvas.getCanvasState(boardId)).shapes.find((item) => item.id === 'shape:a') as any;
  assert.equal(shape.syncedCommit, undefined);
  assert.equal(shape.sourceRef, 'terrain/server/internal/enetbridge/model#Bridge');
});

test('update rejects non-string link fields', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [input(classA)]);
  await assert.rejects(canvas.updateShapes(boardId, [update({ id: 'a', sourceRef: 42 })]));
  await assert.rejects(canvas.updateShapes(boardId, [update({ id: 'a', syncedCommit: ['abc'] })]));
  const shape = (await canvas.getCanvasState(boardId)).shapes.find((item) => item.id === 'shape:a') as any;
  assert.equal(shape.sourceRef, undefined);
  assert.equal(shape.syncedCommit, undefined);
});
