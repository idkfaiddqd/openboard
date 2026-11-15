import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenBoardMcpServer } from '../server.js';
import { BoardService, CanvasService } from '@openboard/core';
import { MemoryBoardRepository } from '@openboard/storage';

test('MCP publishes and accepts structured UML class inputs', async () => {
  const boards = new BoardService(new MemoryBoardRepository());
  const mcp = new OpenBoardMcpServer(boards, new CanvasService(boards));
  const board = await boards.createBoard({ name: 'UML MCP' });
  const createTool = mcp.getTools().find((tool) => tool.name === 'create_shapes');
  assert.ok(createTool);
  const schema = JSON.stringify(createTool.inputSchema);
  for (const field of ['uml-class', 'attributes', 'operations']) assert.ok(schema.includes(field), field);
  const result = await mcp.handleToolCall('create_shapes', { board_id: board.metadata.id, shapes: [
    { id: 'order', type: 'uml-class', x: 10, y: 20, name: 'Order', attributes: ['id: UUID'], operations: [] },
  ] });
  assert.equal(result.isError, undefined);
  const state = await mcp.handleToolCall('get_canvas_state', { board_id: board.metadata.id });
  const body = JSON.stringify(state.content);
  assert.ok(body.includes('id: UUID'));
});

test('MCP rejects malformed UML fields and preserves the existing class', async () => {
  const boards = new BoardService(new MemoryBoardRepository());
  const mcp = new OpenBoardMcpServer(boards, new CanvasService(boards));
  const board = await boards.createBoard({ name: 'UML input validation' });
  const create = await mcp.handleToolCall('create_shapes', { board_id: board.metadata.id, shapes: [
    { id: 'order', type: 'uml-class', x: 10, y: 20, name: 'Order', attributes: ['id: UUID'], operations: [] },
  ] });
  assert.equal(create.isError, undefined);
  const result = await mcp.handleToolCall('update_shapes', { board_id: board.metadata.id,
    shapes: [{ id: 'order', attributes: [42] }] });
  assert.equal(result.isError, true);
  const state = await mcp.handleToolCall('get_canvas_state', { board_id: board.metadata.id });
  assert.ok(JSON.stringify(state.content).includes('id: UUID'));
});

test('published create schema describes required UML and ordinary shape fields', async () => {
  const { default: Ajv } = await import('ajv');
  const boards = new BoardService(new MemoryBoardRepository());
  const mcp = new OpenBoardMcpServer(boards, new CanvasService(boards));
  const tool = mcp.getTools().find((item) => item.name === 'create_shapes')!;
  const validate = new Ajv().compile(tool.inputSchema as any);
  const valid = (shape: object) => Boolean(validate({ shapes: [shape] }));
  assert.equal(valid({ type: 'uml-class', x: 0, y: 0, name: 'A', attributes: [], operations: [] }), true);
  assert.equal(valid({ type: 'uml-relationship', kind: 'association', from: 'a', to: 'b' }), true);
  assert.equal(valid({ type: 'geo', x: 0, y: 0 }), true);
  assert.equal(valid({ type: 'uml-class', x: 0, y: 0, attributes: [], operations: [] }), false);
  assert.equal(valid({ type: 'uml-relationship', kind: 'association', from: 'a' }), false);
  assert.equal(valid({ type: 'geo', x: 0 }), false);
  assert.equal(valid({ id: ' ', type: 'uml-class', x: 0, y: 0, name: 'A', attributes: [], operations: [] }), false);
  assert.equal(valid({ type: 'uml-relationship', kind: 'association', from: ' ', to: 'b' }), false);
  assert.equal(valid({ id: ' a ', type: 'uml-class', x: 0, y: 0, name: 'A', attributes: [], operations: [] }), true);
  const board = await boards.createBoard({ name: 'Schema validation' });
  const badId = await mcp.handleToolCall('create_shapes', { board_id: board.metadata.id, shapes: [{ id: ' ', type: 'uml-class', x: 0, y: 0, name: 'A', attributes: [], operations: [] }] });
  const badEnd = await mcp.handleToolCall('create_shapes', { board_id: board.metadata.id, shapes: [{ type: 'uml-relationship', kind: 'association', from: ' ', to: 'b' }] });
  assert.equal(badId.isError, true);
  assert.equal(badEnd.isError, true);
});
