import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SQLiteBoardRepository } from '@openboard/storage';
import { OpenBoardServer } from '../server.js';

test('HTTP MCP persists interface kind and role through SQLite reopening', { timeout: 15000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'openboard-interface-http-'));
  const dbPath = path.join(dir, 'board.db');
  const repo = new SQLiteBoardRepository({ dbPath });
  const server = new OpenBoardServer({ port: 0, repository: repo });
  try {
    const { url } = await server.start(0, '127.0.0.1');
    const call = async (name: string, args: object) => {
      const response = await fetch(`${url}/api/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
      assert.equal(response.status, 200);
      const body: any = await response.json();
      assert.equal(body.result.isError, undefined, JSON.stringify(body.result));
      return JSON.parse(body.result.content[0].text);
    };
    const board = await call('create_board', { name: 'Interface persistence' });
    await call('create_shapes', { board_id: board.id, shapes: [{ id: 'port', type: 'uml-class', x: 10, y: 20, name: 'Storage', attributes: [], operations: [], classifierKind: 'interface', role: 'Port' }] });
    await server.stop();
    repo.close();
    const reopened = new SQLiteBoardRepository({ dbPath });
    try {
      const saved = await reopened.getBoard(board.id);
      const port = (saved!.document.records as Record<string, any>)['shape:port'];
      assert.equal(port.props.classifierKind, 'interface');
      assert.equal(port.props.role, 'Port');
    } finally { reopened.close(); }
  } finally {
    await server.stop();
    try { repo.close(); } catch { /* already closed */ }
    rmSync(dir, { recursive: true, force: true });
  }
});

test('HTTP MCP preserves realization kind and endpoints in SQLite', { timeout: 15000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'openboard-realization-http-'));
  const dbPath = path.join(dir, 'board.db');
  const repo = new SQLiteBoardRepository({ dbPath });
  const server = new OpenBoardServer({ port: 0, repository: repo });
  try {
    const { url } = await server.start(0, '127.0.0.1');
    const call = async (name: string, args: object) => {
      const response = await fetch(`${url}/api/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
      const body: any = await response.json();
      assert.equal(body.result.isError, undefined, JSON.stringify(body.result));
      return JSON.parse(body.result.content[0].text);
    };
    const board = await call('create_board', { name: 'Realization persistence' });
    await call('create_shapes', { board_id: board.id, shapes: [
      { id: 'adapter', type: 'uml-class', x: 0, y: 0, name: 'Adapter', attributes: [], operations: [] },
      { id: 'port', type: 'uml-class', x: 300, y: 0, name: 'Storage', attributes: [], operations: [], classifierKind: 'interface' },
      { id: 'r', type: 'uml-relationship', kind: 'realization', from: 'adapter', to: 'port' },
    ] });
    await server.stop(); repo.close();
    const reopened = new SQLiteBoardRepository({ dbPath });
    try {
      const boardAfter = await reopened.getBoard(board.id);
      const props = ((boardAfter!.document.records as Record<string, any>)['shape:r']).props;
      assert.deepEqual([props.kind, props.from, props.to], ['realization', 'shape:adapter', 'shape:port']);
    } finally { reopened.close(); }
  } finally { await server.stop(); try { repo.close(); } catch {} rmSync(dir, { recursive: true, force: true }); }
});

test('HTTP MCP publishes the realization and endpoints to a live subscriber', { timeout: 15000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'openboard-realization-sse-'));
  const repo = new SQLiteBoardRepository({ dbPath: path.join(dir, 'board.db') });
  const server = new OpenBoardServer({ port: 0, repository: repo });
  const abort = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const { url } = await server.start(0, '127.0.0.1');
    const call = async (name: string, args: object) => {
      const response = await fetch(`${url}/api/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
      const body: any = await response.json();
      assert.equal(body.result.isError, undefined, JSON.stringify(body.result));
      return JSON.parse(body.result.content[0].text);
    };
    const board = await call('create_board', { name: 'Realization live' });
    const live = await fetch(`${url}/api/boards/${board.id}/live`, { signal: abort.signal });
    reader = live.body!.getReader();
    await reader.read();
    await call('create_shapes', { board_id: board.id, shapes: [
      { id: 'adapter', type: 'uml-class', x: 0, y: 0, name: 'Adapter', attributes: [], operations: [] },
      { id: 'port', type: 'uml-class', x: 300, y: 0, name: 'Storage', attributes: [], operations: [], classifierKind: 'interface' },
      { id: 'r', type: 'uml-relationship', kind: 'realization', from: 'adapter', to: 'port' },
    ] });
    const event = new TextDecoder().decode((await reader.read()).value);
    const data = event.split('\n').find(line => line.startsWith('data: '));
    assert.ok(data, 'SSE event must contain data');
    const payload = JSON.parse(data.slice(6));
    const document = payload.document ?? payload.board?.document;
    const relation = document?.records?.['shape:r'];
    assert.ok(relation, 'SSE document must contain the realization record');
    assert.deepEqual([relation.props.kind, relation.props.from, relation.props.to], ['realization', 'shape:adapter', 'shape:port']);
  } finally { abort.abort(); if (reader) await reader.cancel().catch(() => {}); await server.stop(); repo.close(); rmSync(dir, { recursive: true, force: true }); }
});
