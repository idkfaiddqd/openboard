import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MemoryBoardRepository } from '@openboard/storage';
import type { CreateShapeInput, UpdateShapeInput } from '@openboard/shared';
import { BoardService } from '../service.js';
import { CanvasService, HeadlessCanvasEngine } from '../canvas.js';

const input = (value: unknown) => value as CreateShapeInput;
const update = (value: unknown) => value as UpdateShapeInput;

async function setup() {
  const boards = new BoardService(new MemoryBoardRepository());
  const canvas = new CanvasService(boards);
  const board = await boards.createBoard({ name: 'UML contracts' });
  return { canvas, boardId: board.metadata.id };
}

const order = { id: 'order', type: 'uml-class', x: 20, y: 30, w: 220, h: 160,
  name: 'Order', attributes: ['id: UUID'], operations: ['confirm(): void'], role: 'Entity' };
const line = { id: 'line', type: 'uml-class', x: 400, y: 30,
  name: 'OrderLine', attributes: [], operations: [] };

test('headless store loads and roundtrips a pre-UML standard board', () => {
  const source = new URL('../../../../apps/web/src/canvas/__tests__/fixtures/standard-board.json', import.meta.url);
  const fixture = JSON.parse(readFileSync(source, 'utf8'));
  const store = HeadlessCanvasEngine.createStore(fixture);
  const reloaded = HeadlessCanvasEngine.createStore(HeadlessCanvasEngine.extractDocument(store));
  const record = HeadlessCanvasEngine.extractDocument(reloaded).records['shape:legacy'] as any;
  assert.equal(record.type, 'geo');
  assert.equal(record.x, 20);
  assert.equal(record.y, 30);
});

test('UML class contents roundtrip and partial update preserves geometry', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [input(order)]);
  await canvas.updateShapes(boardId, [update({ id: 'order', operations: [], name: 'Purchase' })]);
  const state = await canvas.getCanvasState(boardId);
  const shape = state.shapes.find((item) => item.id === 'shape:order') as any;
  assert.ok(shape);
  assert.equal(shape.name, 'Purchase');
  assert.deepEqual(shape.attributes, ['id: UUID']);
  assert.deepEqual(shape.operations, []);
  assert.equal(shape.role, 'Entity');
  assert.deepEqual([shape.x, shape.y, shape.w, shape.h], [20, 30, 220, 160]);
});

for (const kind of ['association', 'generalization', 'dependency', 'aggregation', 'composition']) {
  test(`UML ${kind} preserves both ends and multiplicities`, async () => {
    const { canvas, boardId } = await setup();
    await canvas.createShapes(boardId, [input(order), input(line), input({ id: 'rel', type: 'uml-relationship', kind,
      from: 'order', to: 'line', fromMultiplicity: '1', toMultiplicity: '0..*' })]);
    const shape = (await canvas.getCanvasState(boardId)).shapes.find((item) => item.id === 'shape:rel') as any;
    assert.ok(shape);
    assert.equal(shape.kind, kind);
    assert.equal(shape.from, 'shape:order');
    assert.equal(shape.to, 'shape:line');
    assert.equal(shape.fromMultiplicity, '1');
    assert.equal(shape.toMultiplicity, '0..*');
  });
}

test('invalid UML batch leaves existing board unchanged', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [input(order)]);
  await assert.rejects(canvas.createShapes(boardId, [input(line), input({ id: 'rel', type: 'uml-relationship',
    kind: 'association', from: 'order', to: 'missing' })]));
  const state = await canvas.getCanvasState(boardId);
  assert.equal(state.shapesCount, 1);
  assert.equal(state.shapes[0]?.id, 'shape:order');
});

test('deleting UML class deletes its relationships and retains other classes', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [input(order), input(line), input({ id: 'rel', type: 'uml-relationship',
    kind: 'composition', from: 'order', to: 'line' })]);
  await canvas.deleteShapes(boardId, ['order']);
  const ids = (await canvas.getCanvasState(boardId)).shapes.map((shape) => shape.id);
  assert.ok(ids.includes('shape:line'));
  assert.ok(!ids.includes('shape:order'));
  assert.ok(!ids.includes('shape:rel'));
});

test('UML IDs reject collisions without replacing the existing class', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [input(order)]);
  await assert.rejects(canvas.createShapes(boardId, [input({ ...order, id: 'shape:order', name: 'Replacement' })]));
  const shape = (await canvas.getCanvasState(boardId)).shapes.find((item) => item.id === 'shape:order') as any;
  assert.equal(shape.name, 'Order');
});

test('invalid UML attributes are rejected without changing an existing class', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [input(order)]);
  await assert.rejects(canvas.updateShapes(boardId, [update({ id: 'order', attributes: [42] })]));
  const shape = (await canvas.getCanvasState(boardId)).shapes.find((item) => item.id === 'shape:order') as any;
  assert.deepEqual(shape.attributes, ['id: UUID']);
});

test('content update keeps previously changed class position and dimensions', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [input(order)]);
  await canvas.updateShapes(boardId, [update({ id: 'order', x: 140, y: 170, w: 300, h: 200 })]);
  await canvas.updateShapes(boardId, [update({ id: 'order', name: 'Purchase' })]);
  const shape = (await canvas.getCanvasState(boardId)).shapes.find((item) => item.id === 'shape:order') as any;
  assert.equal(shape.name, 'Purchase');
  assert.deepEqual([shape.x, shape.y, shape.w, shape.h], [140, 170, 300, 200]);
  assert.deepEqual(shape.attributes, ['id: UUID']);
});

test('deleting a UML relationship leaves both classes intact', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [input(order), input(line), input({ id: 'rel', type: 'uml-relationship',
    kind: 'association', from: 'order', to: 'line' })]);
  await canvas.deleteShapes(boardId, ['rel']);
  const ids = (await canvas.getCanvasState(boardId)).shapes.map((shape) => shape.id);
  assert.ok(ids.includes('shape:order'));
  assert.ok(ids.includes('shape:line'));
  assert.ok(!ids.includes('shape:rel'));
});

test('UML relation supports forward references to explicitly identified classes in a batch', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [input({ id: 'rel', type: 'uml-relationship', kind: 'association',
    from: 'order', to: 'line' }), input(line), input(order)]);
  const relation = (await canvas.getCanvasState(boardId)).shapes.find((item) => item.id === 'shape:rel') as any;
  assert.equal(relation.from, 'shape:order');
  assert.equal(relation.to, 'shape:line');
});

test('duplicate IDs in a mixed batch do not save either shape', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [input(order)]);
  await assert.rejects(canvas.createShapes(boardId, [input({ id: 'same', type: 'geo', x: 0, y: 0 }),
    input({ ...line, id: 'shape:same' })]));
  const state = await canvas.getCanvasState(boardId);
  assert.equal(state.shapesCount, 1);
  assert.equal(state.shapes[0]?.id, 'shape:order');
});

test('moving a class keeps its UML relation bound to both classes', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [input(order), input(line), input({ id: 'rel', type: 'uml-relationship',
    kind: 'composition', from: 'order', to: 'line', toMultiplicity: '0..*' })]);
  await canvas.updateShapes(boardId, [update({ id: 'order', x: 130, y: 180, w: 300, h: 200 })]);
  const state = await canvas.getCanvasState(boardId);
  const relation = state.shapes.find((item) => item.id === 'shape:rel') as any;
  assert.equal(relation.from, 'shape:order');
  assert.equal(relation.to, 'shape:line');
  assert.equal(relation.toMultiplicity, '0..*');
});

test('deleting a UML class does not delete an ordinary bound arrow', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [input(order), input(line)]);
  await canvas.createShapes(boardId, [input({ id: 'arrow', type: 'arrow', x: 20, y: 30, from: 'order', to: 'line' })]);
  await canvas.deleteShapes(boardId, ['order']);
  const ids = (await canvas.getCanvasState(boardId)).shapes.map((shape) => shape.id);
  assert.ok(ids.includes('shape:arrow'));
  assert.ok(ids.includes('shape:line'));
});

test('partial relationship update preserves its endpoints and replaces multiplicity', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [input(order), input(line), input({ id: 'rel', type: 'uml-relationship',
    kind: 'association', from: 'order', to: 'line', toMultiplicity: '0..*' })]);
  await canvas.updateShapes(boardId, [update({ id: 'rel', toMultiplicity: '1', label: 'contains' })]);
  const relation = (await canvas.getCanvasState(boardId)).shapes.find((item) => item.id === 'shape:rel') as any;
  assert.equal(relation.from, 'shape:order');
  assert.equal(relation.to, 'shape:line');
  assert.equal(relation.toMultiplicity, '1');
  assert.equal(relation.label, 'contains');
});

test('relationship to an ordinary shape is rejected', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [input(order), input({ id: 'box', type: 'geo', x: 400, y: 30 })]);
  await assert.rejects(canvas.createShapes(boardId, [input({ id: 'rel', type: 'uml-relationship',
    kind: 'association', from: 'order', to: 'box' })]));
  const ids = (await canvas.getCanvasState(boardId)).shapes.map((shape) => shape.id);
  assert.ok(!ids.includes('shape:rel'));
  assert.ok(ids.includes('shape:order'));
  assert.ok(ids.includes('shape:box'));
});

test('generated UML class ID can be read and used for an update', async () => {
  const { canvas, boardId } = await setup();
  const { id: _unused, ...withoutId } = order;
  const result = await canvas.createShapes(boardId, [input(withoutId)]);
  const id = result.shapes[0]?.id;
  assert.ok(id);
  await canvas.updateShapes(boardId, [update({ id, name: 'Purchase' })]);
  const shape = (await canvas.getCanvasState(boardId)).shapes.find((item) => item.id === id) as any;
  assert.equal(shape.name, 'Purchase');
});

test('repeated UML updates apply in order and invalid later updates leave the board unchanged', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [input(order)]);
  await canvas.updateShapes(boardId, [update({ id: 'order', name: 'Purchase' }), update({ id: 'shape:order', attributes: ['changed'] }), update({ id: 'order', name: 'Final' })]);
  const after = (await canvas.getCanvasState(boardId)).shapes.find((s) => s.id === 'shape:order') as any;
  assert.equal(after.name, 'Final');
  assert.deepEqual(after.attributes, ['changed']);
  await assert.rejects(canvas.updateShapes(boardId, [update({ id: 'order', name: 'Lost' }), update({ id: 'shape:order', attributes: [42] })]));
  const unchanged = (await canvas.getCanvasState(boardId)).shapes.find((s) => s.id === 'shape:order') as any;
  assert.equal(unchanged.name, 'Final');
  assert.deepEqual(unchanged.attributes, ['changed']);
});

test('new standard and UML shapes are stacked above existing siblings across large batches', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [input({ id: 'frame', type: 'frame', x: 0, y: 0 })]);
  await canvas.createShapes(boardId, Array.from({ length: 15 }, (_, i) => input({ ...order, id: `c${i}` })));
  await canvas.createShapes(boardId, [input({ id: 'geo', type: 'geo', x: 0, y: 0 })]);
  const board = await (canvas as any).boardService.getBoard(boardId);
  const records = board.document.records as Record<string, any>;
  let previous = records['shape:frame'].index as string;
  for (let i = 0; i < 15; i++) { const current = records[`shape:c${i}`].index as string; assert.ok(current > previous); previous = current; }
  assert.ok(records['shape:geo'].index > previous);
});

test('mixed UML batches apply repeated ordinary arrow binding changes in order and reject invalid batches atomically', async () => {
  const { canvas, boardId } = await setup();
  await canvas.createShapes(boardId, [input(order), input(line), input({ id: 'arrow', type: 'arrow', x: 0, y: 0 })]);
  await canvas.updateShapes(boardId, [update({ id: 'order', name: 'Purchase' }), update({ id: 'arrow', from: 'order' }), update({ id: 'shape:arrow', from: '' })]);
  let state = await canvas.getCanvasState(boardId);
  assert.equal(state.shapes.find((s) => s.id === 'shape:arrow')?.from, undefined);
  await canvas.updateShapes(boardId, [update({ id: 'order', name: 'Final' }), update({ id: 'arrow', from: '' }), update({ id: 'shape:arrow', from: 'line' })]);
  state = await canvas.getCanvasState(boardId);
  assert.equal(state.shapes.find((s) => s.id === 'shape:arrow')?.from, 'shape:line');
  await assert.rejects(canvas.updateShapes(boardId, [update({ id: 'arrow', from: '' }), update({ id: 'order', attributes: [42] })]));
  state = await canvas.getCanvasState(boardId);
  assert.equal(state.shapes.find((s) => s.id === 'shape:arrow')?.from, 'shape:line');
});
