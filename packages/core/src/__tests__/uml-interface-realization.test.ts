import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBoardRepository } from '@openboard/storage';
import type { CreateShapeInput, UpdateShapeInput } from '@openboard/shared';
import { BoardService } from '../service.js';
import { CanvasService } from '../canvas.js';

async function setup() {
  const boards = new BoardService(new MemoryBoardRepository());
  const canvas = new CanvasService(boards);
  const board = await boards.createBoard({ name: 'Interface realization contracts' });
  return { canvas, boardId: board.metadata.id };
}
const input = (value: unknown) => value as CreateShapeInput;
const update = (value: unknown) => value as UpdateShapeInput;
const classifier = (id: string, classifierKind?: string) => input({ id, type: 'uml-class', x: 0, y: 0,
  name: id, attributes: [], operations: [], ...(classifierKind ? { classifierKind } : {}) });
const realization = (to: string) => input({ id: 'r', type: 'uml-relationship', kind: 'realization', from: 'adapter', to });

test('classifier kind and role survive reading independently; omitted kind means class', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [classifier('adapter'), input({ ...classifier('port', 'interface'), role: 'Port' })]);
  const shapes = (await canvas.getCanvasState(boardId)).shapes as any[];
  assert.equal(shapes.find(s => s.id === 'shape:adapter').classifierKind, 'class');
  const port = shapes.find(s => s.id === 'shape:port');
  assert.equal(port.classifierKind, 'interface');
  assert.equal(port.role, 'Port');
});

test('realization supports forward references and retains direction and kind', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [realization('port'), classifier('adapter'), classifier('port', 'interface')]);
  const relation = (await canvas.getCanvasState(boardId)).shapes.find(s => s.id === 'shape:r') as any;
  assert.deepEqual([relation.kind, relation.from, relation.to], ['realization', 'shape:adapter', 'shape:port']);
});

test('realization to a class is rejected without saving any part of the batch', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [classifier('adapter'), classifier('port', 'interface')]);
  await canvas.createShapes(boardId, [realization('port')]);
  const before = await canvas.getCanvasState(boardId);
  await assert.rejects(canvas.updateShapes(boardId, [update({ id: 'port', classifierKind: 'class' })]));
  assert.deepEqual(await canvas.getCanvasState(boardId), before);
});

for (const reverse of [false, true]) {
  test(`final batch state permits replacing an interface target (${reverse ? 'target first' : 'relation first'})`, async () => {
    const { canvas, boardId } = await setup();
    await canvas.createShapes(boardId, [classifier('adapter'), classifier('port', 'interface'), classifier('other', 'interface'), realization('port')]);
    const changes = [update({ id: 'r', to: 'other' }), update({ id: 'port', classifierKind: 'class' })];
    await canvas.updateShapes(boardId, reverse ? changes.reverse() : changes);
    const shapes = (await canvas.getCanvasState(boardId)).shapes as any[];
    assert.equal(shapes.find(s => s.id === 'shape:r').to, 'shape:other');
    assert.equal(shapes.find(s => s.id === 'shape:port').classifierKind, 'class');
  });
}

test('unknown classifier kind is rejected without persisting a shape', async () => {
  const { canvas, boardId } = await setup();
  await assert.rejects(canvas.createShapes(boardId, [classifier('bad', 'invalid')]));
  assert.equal((await canvas.getCanvasState(boardId)).shapesCount, 0);
});

test('realization targeting a class rejects the entire create batch', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [classifier('adapter'), classifier('port', 'interface')]);
  await canvas.createShapes(boardId, [realization('port')]);
  const before = await canvas.getCanvasState(boardId);
  await assert.rejects(canvas.createShapes(boardId, [classifier('other'), input({ id: 'bad', type: 'uml-relationship', kind: 'realization', from: 'adapter', to: 'other' })]));
  assert.deepEqual(await canvas.getCanvasState(boardId), before);
});

for (const endpoint of ['adapter', 'port']) {
  test(`deleting ${endpoint} cascades to realization and preserves the other end`, async () => {
    const { canvas, boardId } = await setup();
    await canvas.createShapes(boardId, [classifier('adapter'), classifier('port', 'interface'), realization('port')]);
    await canvas.deleteShapes(boardId, [endpoint]);
    const ids = (await canvas.getCanvasState(boardId)).shapes.map(s => s.id);
    assert.ok(!ids.includes('shape:r'));
    assert.ok(ids.includes(`shape:${endpoint === 'adapter' ? 'port' : 'adapter'}`));
  });
}

test('saved pre-classifier UML document reads legacy classes and retains their relationship', async () => {
  const { readFileSync } = await import('node:fs');
  const fixture = JSON.parse(readFileSync(new URL('../../../../apps/web/src/canvas/__tests__/fixtures/saved-uml-before-classifier-kind.json', import.meta.url), 'utf8'));
  const boards = new BoardService(new MemoryBoardRepository());
  const board = await boards.createBoard({ name: 'Saved legacy UML' });
  await boards.updateBoard(board.metadata.id, { document: fixture });
  const canvas = new CanvasService(boards);
  const state = await canvas.getCanvasState(board.metadata.id);
  const map = state.shapes.find(s => s.id === 'shape:map') as any;
  const port = state.shapes.find(s => s.id === 'shape:storage') as any;
  const rel = state.shapes.find(s => s.id === 'shape:WKbDM_rlQEHOVD5u9yaNd') as any;
  assert.equal(map.classifierKind, 'class');
  assert.equal(port.classifierKind, 'class');
  assert.equal(rel.kind, 'dependency');
  assert.equal(rel.from, 'shape:map');
  assert.equal(rel.to, 'shape:storage');
  await canvas.updateShapes(board.metadata.id, [update({ id: 'map', name: map.name })]);
  const after = await canvas.getCanvasState(board.metadata.id);
  assert.equal((after.shapes.find(s => s.id === 'shape:storage') as any).role, port.role);
});

test('realization cannot originate at an interface and rejects the entire batch', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [classifier('adapter'), classifier('port', 'interface'), realization('port')]);
  const before = await canvas.getCanvasState(boardId);
  await assert.rejects(canvas.updateShapes(boardId, [update({ id: 'r', from: 'port', to: 'adapter' })]));
  assert.deepEqual(await canvas.getCanvasState(boardId), before);
});

test('repeated updates use final classifier and relationship state', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [classifier('adapter'), classifier('port', 'interface'), classifier('other', 'interface'), realization('port')]);
  await canvas.updateShapes(boardId, [update({ id: 'port', classifierKind: 'class' }), update({ id: 'r', to: 'other' }), update({ id: 'port', classifierKind: 'interface' }), update({ id: 'port', classifierKind: 'class' })]);
  const state = await canvas.getCanvasState(boardId);
  assert.equal((state.shapes.find(s => s.id === 'shape:port') as any).classifierKind, 'class');
  assert.equal((state.shapes.find(s => s.id === 'shape:r') as any).to, 'shape:other');
});

test('deleting realization preserves both classifiers', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [classifier('adapter'), classifier('port', 'interface'), realization('port')]);
  await canvas.deleteShapes(boardId, ['r']);
  const ids = (await canvas.getCanvasState(boardId)).shapes.map(s => s.id);
  assert.ok(!ids.includes('shape:r'));
  assert.ok(ids.includes('shape:adapter'));
  assert.ok(ids.includes('shape:port'));
});
