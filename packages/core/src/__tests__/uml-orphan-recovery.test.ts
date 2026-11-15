import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBoardRepository } from '@openboard/storage';
import type { CreateShapeInput, UpdateShapeInput } from '@openboard/shared';
import { BoardService } from '../service.js';
import { CanvasService } from '../canvas.js';
const create = (x: unknown) => x as CreateShapeInput;
const update = (x: unknown) => x as UpdateShapeInput;
const cls = (id: string, kind = 'class') => create({ id, type: 'uml-class', x: 0, y: 0, name: id, attributes: [], operations: [], classifierKind: kind });
async function brokenBoard() {
  const boards = new BoardService(new MemoryBoardRepository());
  const canvas = new CanvasService(boards);
  const board = await boards.createBoard({ name: 'orphaned realization' });
  const id = board.metadata.id;
  await canvas.createShapes(id, [cls('adapter'), cls('port', 'interface'), cls('other'), create({ id: 'r', type: 'uml-relationship', kind: 'realization', from: 'adapter', to: 'port' })]);
  const snapshot = (await boards.getBoard(id)).document;
  const records = { ...snapshot.records };
  delete records['shape:port'];
  await boards.updateBoard(id, { document: { ...snapshot, records } });
  return { boards, canvas, id };
}
test('preexisting orphan does not block unrelated create or update and is not silently removed', async () => {
  const { canvas, id } = await brokenBoard();
  await canvas.createShapes(id, [cls('new')]);
  await canvas.updateShapes(id, [update({ id: 'other', name: 'changed' })]);
  const state = await canvas.getCanvasState(id);
  assert.equal((state.shapes.find(s => s.id === 'shape:other') as any).name, 'changed');
  const r = state.shapes.find(s => s.id === 'shape:r') as any;
  assert.deepEqual([r.from, r.to], ['shape:adapter', 'shape:port']);
});
test('new invalid realization remains rejected atomically on a board with an existing orphan', async () => {
  const { canvas, id } = await brokenBoard();
  const before = await canvas.getCanvasState(id);
  await assert.rejects(canvas.createShapes(id, [cls('new'), create({ id: 'bad', type: 'uml-relationship', kind: 'realization', from: 'new', to: 'other' })]));
  assert.deepEqual(await canvas.getCanvasState(id), before);
});
test('invalid changes to orphan or its remaining endpoint are rejected atomically', async () => {
  const { canvas, id } = await brokenBoard();
  const before = await canvas.getCanvasState(id);
  await assert.rejects(canvas.updateShapes(id, [update({ id: 'r', to: 'other' })]));
  assert.deepEqual(await canvas.getCanvasState(id), before);
  await assert.rejects(canvas.updateShapes(id, [update({ id: 'adapter', classifierKind: 'interface' })]));
  assert.deepEqual(await canvas.getCanvasState(id), before);
});
test('an orphan can be repaired explicitly or deleted', async () => {
  const { canvas, id } = await brokenBoard();
  await canvas.createShapes(id, [cls('replacement', 'interface')]);
  await canvas.updateShapes(id, [update({ id: 'r', to: 'replacement' })]);
  assert.equal((await canvas.getCanvasState(id)).shapes.find(s => s.id === 'shape:r')?.to, 'shape:replacement');
  await canvas.deleteShapes(id, ['r']);
  assert.ok(!(await canvas.getCanvasState(id)).shapes.some(s => s.id === 'shape:r'));
});
