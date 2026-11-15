import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenBoardMcpServer } from '../server.js';
import { BoardService, CanvasService } from '@openboard/core';
import { MemoryBoardRepository } from '@openboard/storage';
function setup() { const boards = new BoardService(new MemoryBoardRepository()); return { boards, mcp: new OpenBoardMcpServer(boards, new CanvasService(boards)) }; }
const context = { id: 'a', type: 'bounded-context', x: 0, y: 0, name: 'Heightmap' };
const relation = { id: 'r', type: 'context-interaction', from: 'a', to: 'b', label: 'uses' };

test('published schema accepts context interaction without coordinates and rejects blank context names', async () => {
  const { default: Ajv } = await import('ajv'); const { mcp } = setup();
  const validate = new Ajv().compile(mcp.getTools().find(t => t.name === 'create_shapes')!.inputSchema as any);
  assert.equal(validate({ shapes: [relation] }), true);
  assert.equal(validate({ shapes: [{ ...context, name: '  ' }] }), false);
  assert.equal(validate({ shapes: [{ type: 'geo', x: 0, y: 0 }] }), true);
});
test('MCP returns structured context and interaction with directed endpoints', async () => {
  const { boards, mcp } = setup(); const board = await boards.createBoard({ name: 'contexts' });
  const result = await mcp.handleToolCall('create_shapes', { board_id: board.metadata.id, shapes: [relation, context, { ...context, id: 'b', name: 'Storage' }] });
  assert.equal(result.isError, undefined, JSON.stringify(result));
  const state = await mcp.handleToolCall('get_canvas_state', { board_id: board.metadata.id });
  const parsed = JSON.parse((state.content[0] as any).text); const r = parsed.shapes.find((s: any) => s.id === 'shape:r');
  assert.deepEqual([r.type, r.from, r.to, r.label], ['context-interaction', 'shape:a', 'shape:b', 'uses']);
});
test('runtime rejects empty context name before saving', async () => {
  const { boards, mcp } = setup(); const board = await boards.createBoard({ name: 'invalid' });
  const result = await mcp.handleToolCall('create_shapes', { board_id: board.metadata.id, shapes: [{ ...context, name: ' ' }] });
  assert.equal(result.isError, true);
  assert.equal((await boards.getBoard(board.metadata.id)).document.records['shape:a'], undefined);
});
