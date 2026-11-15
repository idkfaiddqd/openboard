import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenBoardMcpServer } from '../server.js';
import { BoardService, CanvasService } from '@openboard/core';
import { MemoryBoardRepository } from '@openboard/storage';

const REF = 'terrain/server/internal/locomotion/model#Registry';
const COMMIT = 'f731e9e';

async function setup() {
  const boards = new BoardService(new MemoryBoardRepository());
  const mcp = new OpenBoardMcpServer(boards, new CanvasService(boards));
  const board = await boards.createBoard({ name: 'sourceRef' });
  return { mcp, boardId: board.metadata.id };
}

test('MCP create_shapes stores sourceRef and syncedCommit verbatim', async () => {
  const { mcp, boardId } = await setup();
  const result = await mcp.handleToolCall('create_shapes', { board_id: boardId, shapes: [
    { id: 'order', type: 'uml-class', x: 10, y: 20, name: 'Order', attributes: [], operations: [], sourceRef: REF, syncedCommit: COMMIT },
    { id: 'ctx', type: 'bounded-context', x: 0, y: 300, name: 'Locomotion', sourceRef: 'terrain/server/internal/locomotion', syncedCommit: 'not-a-commit' },
  ] });
  assert.equal(result.isError, undefined, JSON.stringify(result));
  const state = await mcp.handleToolCall('get_canvas_state', { board_id: boardId });
  const shapes = JSON.parse((state.content[0] as any).text).shapes;
  const order = shapes.find((item: any) => item.id === 'shape:order');
  const ctx = shapes.find((item: any) => item.id === 'shape:ctx');
  assert.equal(order.sourceRef, REF);
  assert.equal(order.syncedCommit, COMMIT);
  assert.equal(ctx.sourceRef, 'terrain/server/internal/locomotion');
  assert.equal(ctx.syncedCommit, 'not-a-commit');
});

test('MCP update_shapes replaces and clears link fields', async () => {
  const { mcp, boardId } = await setup();
  await mcp.handleToolCall('create_shapes', { board_id: boardId, shapes: [
    { id: 'order', type: 'uml-class', x: 10, y: 20, name: 'Order', attributes: [], operations: [], sourceRef: REF, syncedCommit: COMMIT },
  ] });
  const updated = await mcp.handleToolCall('update_shapes', { board_id: boardId,
    shapes: [{ id: 'order', sourceRef: 'terrain/server/internal/enetbridge/model#Bridge', syncedCommit: '' }] });
  assert.equal(updated.isError, undefined, JSON.stringify(updated));
  const state = await mcp.handleToolCall('get_canvas_state', { board_id: boardId });
  const order = JSON.parse((state.content[0] as any).text).shapes.find((item: any) => item.id === 'shape:order');
  assert.equal(order.sourceRef, 'terrain/server/internal/enetbridge/model#Bridge');
  assert.equal(order.syncedCommit, undefined);
});

test('published create schema documents sourceRef and syncedCommit without requiring them', async () => {
  const { mcp } = await setup();
  const tool = mcp.getTools().find((item) => item.name === 'create_shapes')!;
  const schema = JSON.stringify(tool.inputSchema);
  for (const field of ['sourceRef', 'syncedCommit']) assert.ok(schema.includes(field), field);
  const { default: Ajv } = await import('ajv');
  const validate = new Ajv().compile(tool.inputSchema as any);
  assert.equal(validate({ shapes: [{ type: 'uml-class', x: 0, y: 0, name: 'A', attributes: [], operations: [] }] }), true);
  assert.equal(validate({ shapes: [{ type: 'uml-class', x: 0, y: 0, name: 'A', attributes: [], operations: [], sourceRef: 42 }] }), false);
});
