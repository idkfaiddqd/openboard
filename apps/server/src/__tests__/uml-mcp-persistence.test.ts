import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SQLiteBoardRepository } from '@openboard/storage';
import { OpenBoardServer } from '../server.js';

test('HTTP MCP publishes UML changes through SSE and persists them in SQLite', { timeout: 15000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'openboard-uml-http-'));
  const db = path.join(dir, 'board.db');
  const repo = new SQLiteBoardRepository({ dbPath: db });
  const server = new OpenBoardServer({ port: 0, repository: repo });
  const abort = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const { url } = await server.start(0, '127.0.0.1');
    let id = 0;
    const call = async (name: string, args: object) => {
      const response = await fetch(`${url}/api/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } }) });
      assert.equal(response.status, 200);
      const json: any = await response.json();
      assert.equal(json.result.isError, undefined, JSON.stringify(json.result));
      return json.result;
    };
    const board = await call('create_board', { name: 'UML HTTP' });
    const boardId = JSON.parse(board.content[0].text).id;
    const live = await fetch(`${url}/api/boards/${boardId}/live`, { signal: abort.signal });
    assert.equal(live.status, 200);
    reader = live.body!.getReader();
    const initial = await reader.read();
    assert.match(new TextDecoder().decode(initial.value), /connected/);
    await call('create_shapes', { board_id: boardId, shapes: [
      { id: 'order', type: 'uml-class', x: 20, y: 30, name: 'Order', attributes: ['id: UUID'], operations: [] },
      { id: 'line', type: 'uml-class', x: 400, y: 30, name: 'OrderLine', attributes: [], operations: [] },
      { id: 'owns', type: 'uml-relationship', kind: 'composition', from: 'order', to: 'line', toMultiplicity: '0..*' },
    ] });
    const event = await reader.read();
    assert.match(new TextDecoder().decode(event.value), /Order/);
    abort.abort();
    await server.stop();
    repo.close();
    const reopened = new SQLiteBoardRepository({ dbPath: db });
    try {
      const saved = await reopened.getBoard(boardId);
      assert.ok(JSON.stringify(saved?.document).includes('id: UUID'));
      assert.ok(JSON.stringify(saved?.document).includes('composition'));
      const records = saved!.document.records as Record<string, any>;
      const order = records['shape:order'];
      const line = records['shape:line'];
      const relation = records['shape:owns'];
      assert.deepEqual([order.id, order.x, order.y, order.props.w, order.props.h, order.props.name, order.props.attributes, order.props.operations], ['shape:order', 20, 30, 220, 160, 'Order', ['id: UUID'], []]);
      assert.deepEqual([line.id, line.x, line.y, line.props.name], ['shape:line', 400, 30, 'OrderLine']);
      assert.deepEqual([relation.id, relation.props.kind, relation.props.from, relation.props.to, relation.props.toMultiplicity], ['shape:owns', 'composition', 'shape:order', 'shape:line', '0..*']);
    } finally { reopened.close(); }
  } finally {
    abort.abort();
    if (reader) await reader.cancel().catch(() => {});
    await server.stop();
    try { repo.close(); } catch { /* may already be closed */ }
    rmSync(dir, { recursive: true, force: true });
  }
});
