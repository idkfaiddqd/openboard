import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { BoardService, CanvasService } from '@openboard/core';
import { MemoryBoardRepository } from '@openboard/storage';
import { OpenBoardMcpServer } from '../server.js';

const mapping = () => ({ sources: [{ locator: 'docs/mapping.md' }], sections: [{ id: 'model', title: 'Model', entries: [{
  id: 'identity', responsibility: 'Identity', artifacts: [{ locator: 'app/pkg#Order.id', participation: 'represents identity', repository: 'app', revision: 'abc' }],
  evidence: [{ claim: 'Field found', method: 'source inspection', limits: 'Not an executed test' }], gaps: [],
}] }] });
const shape = (extra: object = {}) => ({ id: 'subject', type: 'uml-class', x: 10, y: 20, name: 'Order', attributes: [], operations: [], ...extra });
async function setup() {
  const boards = new BoardService(new MemoryBoardRepository());
  const mcp = new OpenBoardMcpServer(boards, new CanvasService(boards));
  const board = await boards.createBoard({ name: 'Mapping MCP contract' });
  return { mcp, boards, id: board.metadata.id };
}
async function call(mcp: OpenBoardMcpServer, id: string, name: string, args: object = {}) {
  const result = await mcp.handleToolCall(name, { board_id: id, ...args });
  assert.equal(result.isError, undefined, JSON.stringify(result));
  return JSON.parse((result.content[0] as any).text);
}

test('DDD mapping MCP: default and explicit false reads are brief, explicit true returns the full projection', async () => {
  const { mcp, id } = await setup();
  await call(mcp, id, 'create_shapes', { shapes: [shape({ mapping: mapping() })] });
  for (const args of [{}, { include_mapping: false }]) {
    const state = await call(mcp, id, 'get_canvas_state', args);
    assert.equal(state.shapes[0].hasMapping, true);
    assert.equal(Object.hasOwn(state.shapes[0], 'mapping'), false);
  }
  const full = await call(mcp, id, 'get_canvas_state', { include_mapping: true });
  assert.deepEqual(full.shapes[0].mapping, mapping());
});
test('DDD mapping MCP: omitted fields preserve, objects replace, null clears without changing geometry', async () => {
  const { mcp, id } = await setup();
  await call(mcp, id, 'create_shapes', { shapes: [shape({ mapping: mapping() })] });
  await call(mcp, id, 'update_shapes', { shapes: [{ id: 'subject', x: 90 }] });
  let result = (await call(mcp, id, 'get_canvas_state', { include_mapping: true })).shapes[0];
  assert.deepEqual(result.mapping, mapping());
  const replacement = { sources: [], sections: [] };
  await call(mcp, id, 'update_shapes', { shapes: [{ id: 'subject', mapping: replacement }] });
  result = (await call(mcp, id, 'get_canvas_state', { include_mapping: true })).shapes[0];
  assert.deepEqual(result.mapping, replacement);
  assert.deepEqual([result.x, result.y], [90, 20]);
  await call(mcp, id, 'update_shapes', { shapes: [{ id: 'subject', mapping: null }] });
  result = (await call(mcp, id, 'get_canvas_state', { include_mapping: true })).shapes[0];
  assert.equal(result.hasMapping, false);
  assert.equal(Object.hasOwn(result, 'mapping'), false);
});
test('DDD mapping MCP: runtime refuses invalid mapping and does not persist the valid prefix', async () => {
  const { mcp, boards, id } = await setup();
  await call(mcp, id, 'create_shapes', { shapes: [shape()] });
  const before = structuredClone((await boards.getBoard(id)).document);
  const result = await mcp.handleToolCall('update_shapes', { board_id: id, shapes: [{ id: 'subject', x: 999 }, { id: 'subject', mapping: { sources: [], sections: [], typo: true } }] });
  assert.equal(result.isError, true);
  assert.deepEqual((await boards.getBoard(id)).document, before);
});
for (const include_mapping of ['true', 1, null]) {
  test(`DDD mapping MCP: include_mapping rejects ${JSON.stringify(include_mapping)} at runtime`, async () => {
    const { mcp, id } = await setup();
    const result = await mcp.handleToolCall('get_canvas_state', { board_id: id, include_mapping });
    assert.equal(result.isError, true);
  });
}
test('DDD mapping MCP: published read schema declares a boolean include_mapping', async () => {
  const { mcp, id } = await setup();
  const schema = mcp.getTools().find(tool => tool.name === 'get_canvas_state')!.inputSchema as any;
  assert.equal(schema.properties.include_mapping?.type, 'boolean', 'The option must be published, not just accepted as an unknown key');
  const validate = new Ajv().compile(schema);
  for (const flag of [true, false]) assert.equal(validate({ board_id: id, include_mapping: flag }), true);
  assert.equal(validate({ board_id: id, include_mapping: 'true' }), false);
});
for (const name of ['create_shapes', 'update_shapes']) {
  test(`DDD mapping MCP: published ${name} schema validates mapping structure instead of treating it as an unknown field`, async () => {
    const { mcp, id } = await setup();
    const schema = mcp.getTools().find(tool => tool.name === name)!.inputSchema;
    assert.ok(JSON.stringify(schema).includes('mapping'), 'Published schema must explicitly declare the new field');
    const validate = new Ajv().compile(schema as any);
    const request = (value: unknown) => ({ board_id: id, shapes: [name === 'create_shapes' ? shape({ mapping: value }) : { id: 'subject', mapping: value }] });
    assert.equal(validate(request(mapping())), true, JSON.stringify(validate.errors));
    assert.equal(validate(request(null)), true);
    assert.equal(validate(request({ sources: [], sections: [] })), true);
    for (const invalid of [42, {}, { ...mapping(), typo: true }]) assert.equal(validate(request(invalid)), false, JSON.stringify(invalid));
    const noRole: any = mapping(); delete noRole.sections[0].entries[0].artifacts[0].participation;
    assert.equal(validate(request(noRole)), false);
  });
}
