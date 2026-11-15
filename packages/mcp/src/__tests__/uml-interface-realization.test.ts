import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenBoardMcpServer } from '../server.js';
import { BoardService, CanvasService } from '@openboard/core';
import { MemoryBoardRepository } from '@openboard/storage';

function setup() {
  const boards = new BoardService(new MemoryBoardRepository());
  return { boards, mcp: new OpenBoardMcpServer(boards, new CanvasService(boards)) };
}
const classifier = { id: 'port', type: 'uml-class', x: 0, y: 0, name: 'Storage', attributes: [], operations: [], classifierKind: 'interface', role: 'Port' };

test('MCP create and update schemas expose classifier kinds and realization', async () => {
  const { default: Ajv } = await import('ajv');
  const { mcp } = setup();
  const tools = mcp.getTools();
  const create = tools.find(t => t.name === 'create_shapes')!;
  const update = tools.find(t => t.name === 'update_shapes')!;
  const validateCreate = new Ajv().compile(create.inputSchema as any);
  const validateUpdate = new Ajv().compile(update.inputSchema as any);
  assert.equal(validateCreate({ shapes: [classifier] }), true);
  assert.equal(validateCreate({ shapes: [{ ...classifier, classifierKind: 'invalid' }] }), false);
  assert.equal(validateCreate({ shapes: [{ type: 'uml-relationship', kind: 'realization', from: 'adapter', to: 'port' }] }), true);
  assert.equal(validateUpdate({ shapes: [{ id: 'port', classifierKind: 'invalid' }] }), false);
  assert.equal(validateUpdate({ shapes: [{ id: 'r', kind: 'realization' }] }), true);
});

test('MCP roundtrips interface kind and role and rejects invalid kind at runtime', async () => {
  const { mcp, boards } = setup();
  const board = await boards.createBoard({ name: 'MCP interface' });
  const board_id = board.metadata.id;
  const created = await mcp.handleToolCall('create_shapes', { board_id, shapes: [classifier] });
  assert.equal(created.isError, undefined);
  const state = await mcp.handleToolCall('get_canvas_state', { board_id });
  const contents = JSON.stringify(state.content);
  assert.match(contents, /classifierKind/);
  assert.match(contents, /interface/);
  assert.match(contents, /Port/);
  const invalid = await mcp.handleToolCall('update_shapes', { board_id, shapes: [{ id: 'port', classifierKind: 'invalid' }] });
  assert.equal(invalid.isError, true);
});

test('MCP schemas accept realization on creation and update', async () => {
  const { default: Ajv } = await import('ajv');
  const { mcp } = setup();
  const create = new Ajv().compile(mcp.getTools().find(t => t.name === 'create_shapes')!.inputSchema as any);
  const update = new Ajv().compile(mcp.getTools().find(t => t.name === 'update_shapes')!.inputSchema as any);
  assert.equal(create({ shapes: [{ type: 'uml-relationship', kind: 'realization', from: 'adapter', to: 'port' }] }), true);
  assert.equal(update({ shapes: [{ id: 'r', kind: 'realization' }] }), true);
});

test('MCP runtime rejects invalid classifier kind without saving', async () => {
  const { mcp, boards } = setup();
  const board = await boards.createBoard({ name: 'Invalid classifier' });
  const created = await mcp.handleToolCall('create_shapes', { board_id: board.metadata.id, shapes: [{ ...classifier, classifierKind: 'invalid' }] });
  assert.equal(created.isError, true);
  const state = await mcp.handleToolCall('get_canvas_state', { board_id: board.metadata.id });
  assert.doesNotMatch(JSON.stringify(state.content), /Storage/);
});
