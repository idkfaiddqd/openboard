import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBoardRepository } from '@openboard/storage';
import type { CreateShapeInput, UpdateShapeInput } from '@openboard/shared';
import { BoardService } from '../service.js';
import { CanvasService } from '../canvas.js';
const input = (x: unknown) => x as CreateShapeInput;
const update = (x: unknown) => x as UpdateShapeInput;
const ctx = (id: string, name = id) => input({ id, type: 'bounded-context', x: 10, y: 20, name });
const rel = (from = 'a', to = 'b') => input({ id: 'r', type: 'context-interaction', from, to, label: 'uses storage' });
async function setup() { const boards = new BoardService(new MemoryBoardRepository()); const canvas = new CanvasService(boards); const board = await boards.createBoard({ name: 'Context contracts' }); return { boards, canvas, id: board.metadata.id }; }

test('contexts and a forward-referenced interaction retain identity, direction and label', async () => {
  const { canvas, id } = await setup();
  await canvas.createShapes(id, [rel(), ctx('a', ' Heightmap '), ctx('b', 'Chunkstore')]);
  const state = await canvas.getCanvasState(id);
  const a = state.shapes.find(s => s.id === 'shape:a') as any;
  const r = state.shapes.find(s => s.id === 'shape:r') as any;
  assert.deepEqual([a.type, a.name, a.x, a.y, a.w, a.h], ['bounded-context', 'Heightmap', 10, 20, 360, 240]);
  assert.deepEqual([r.type, r.from, r.to, r.label], ['context-interaction', 'shape:a', 'shape:b', 'uses storage']);
});

test('duplicate names do not merge contexts and renaming preserves identity', async () => {
  const { canvas, id } = await setup();
  await canvas.createShapes(id, [ctx('a', 'Same'), ctx('b', 'Same')]);
  await canvas.updateShapes(id, [update({ id: 'a', name: 'Renamed' })]);
  const s = (await canvas.getCanvasState(id)).shapes;
  assert.equal((s.find(x => x.id === 'shape:a') as any).name, 'Renamed');
  assert.equal((s.find(x => x.id === 'shape:b') as any).name, 'Same');
});

test('empty name and invalid endpoint or self-interaction reject batches atomically', async () => {
  const { canvas, id } = await setup();
  await canvas.createShapes(id, [ctx('a'), ctx('b')]);
  const before = await canvas.getCanvasState(id);
  for (const shapes of [[ctx('bad', '  ')], [rel('a', 'missing')], [rel('a', 'a')]]) {
    await assert.rejects(canvas.createShapes(id, shapes));
    assert.deepEqual(await canvas.getCanvasState(id), before);
  }
});

test('partial updates clear label and preserve other fields', async () => {
  const { canvas, id } = await setup();
  await canvas.createShapes(id, [ctx('a'), ctx('b'), rel()]);
  await canvas.updateShapes(id, [update({ id: 'r', label: '' })]);
  const r = (await canvas.getCanvasState(id)).shapes.find(s => s.id === 'shape:r') as any;
  assert.equal(r.label, undefined); assert.equal(r.from, 'shape:a'); assert.equal(r.to, 'shape:b');
});

test('deleting a context cascades interactions; deleting a relation retains contexts', async () => {
  const first = await setup(); await first.canvas.createShapes(first.id, [ctx('a'), ctx('b'), rel()]);
  await first.canvas.deleteShapes(first.id, ['a']);
  let ids = (await first.canvas.getCanvasState(first.id)).shapes.map(s => s.id);
  assert.ok(!ids.includes('shape:r')); assert.ok(ids.includes('shape:b'));
  const second = await setup(); await second.canvas.createShapes(second.id, [ctx('a'), ctx('b'), rel()]);
  await second.canvas.deleteShapes(second.id, ['r']); ids = (await second.canvas.getCanvasState(second.id)).shapes.map(s => s.id);
  assert.ok(ids.includes('shape:a')); assert.ok(ids.includes('shape:b'));
});

test('final repeated interaction updates respect the last ends and reject invalid final state', async () => {
  const { canvas, id } = await setup();
  await canvas.createShapes(id, [ctx('a'), ctx('b'), ctx('c'), rel()]);
  await canvas.updateShapes(id, [update({ id: 'r', to: 'c' }), update({ id: 'r', to: 'b' })]);
  const before = await canvas.getCanvasState(id);
  assert.equal((before.shapes.find(s => s.id === 'shape:r') as any).to, 'shape:b');
  await assert.rejects(canvas.updateShapes(id, [update({ id: 'r', to: 'c' }), update({ id: 'r', to: 'a' })]));
  assert.deepEqual(await canvas.getCanvasState(id), before);
});

test('preexisting orphan interaction does not block unrelated operations and can be repaired', async () => {
  const { boards, canvas, id } = await setup();
  await canvas.createShapes(id, [ctx('a'), ctx('b'), rel()]);
  const doc = (await boards.getBoard(id)).document; const records = { ...doc.records }; delete records['shape:b'];
  await boards.updateBoard(id, { document: { ...doc, records } });
  await canvas.createShapes(id, [ctx('c')]);
  let r = (await canvas.getCanvasState(id)).shapes.find(s => s.id === 'shape:r') as any;
  assert.equal(r.to, 'shape:b');
  await canvas.updateShapes(id, [update({ id: 'r', to: 'c' })]);
  r = (await canvas.getCanvasState(id)).shapes.find(s => s.id === 'shape:r') as any;
  assert.equal(r.to, 'shape:c');
});
