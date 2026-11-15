import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SQLiteBoardRepository } from '@openboard/storage';
import { OpenBoardServer } from '../server.js';

const REF = 'terrain/server/internal/locomotion/model#Registry';
const COMMIT = 'f731e9e';
const shapes = [{ id: 'order', type: 'uml-class', x: 20, y: 30, name: 'Order', attributes: ['id: UUID'], operations: [], sourceRef: REF, syncedCommit: COMMIT }];

function check(records: Record<string, any>) {
  const record = records['shape:order'];
  assert.equal(record.type, 'uml-class');
  assert.equal(record.props.sourceRef, REF);
  assert.equal(record.props.syncedCommit, COMMIT);
}

async function nextSse(reader: ReadableStreamDefaultReader<Uint8Array>) {
  let data = '';
  const decoder = new TextDecoder();
  while (!data.includes('\n\n')) {
    const chunk = await reader.read();
    assert.equal(chunk.done, false);
    data += decoder.decode(chunk.value, { stream: true });
  }
  return JSON.parse(data.split('\n').find((line) => line.startsWith('data: '))!.slice(6));
}

test('HTTP MCP stores link fields and SQLite retains them across reopen', { timeout: 15000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'source-ref-http-'));
  const dbPath = path.join(dir, 'board.db');
  const repo = new SQLiteBoardRepository({ dbPath });
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
    const board = await call('create_board', { name: 'sourceRef' });
    const live = await fetch(`${url}/api/boards/${board.id}/live`, { signal: abort.signal });
    reader = live.body!.getReader();
    await nextSse(reader);
    await call('create_shapes', { board_id: board.id, shapes });
    const event = await nextSse(reader);
    check((event.document ?? event.board?.document).records);
    abort.abort();
    await server.stop();
    repo.close();
    const reopened = new SQLiteBoardRepository({ dbPath });
    try {
      check(((await reopened.getBoard(board.id))!.document.records) as Record<string, any>);
    } finally {
      reopened.close();
    }
  } finally {
    abort.abort();
    if (reader) await reader.cancel().catch(() => {});
    await server.stop();
    try { repo.close(); } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
});

function start(db: string) {
  const child = spawn(process.execPath, [path.resolve('../../cli/dist/index.js'), 'mcp', '--db', db]);
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  let id = 0;
  return {
    child,
    async call(name: string, args: object) {
      const n = ++id;
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method: 'tools/call', params: { name, arguments: args } }) + '\n');
      const line = await lines.next();
      assert.equal(line.done, false, 'stdio process closed before response');
      const frame = JSON.parse(line.value!);
      assert.equal(frame.id, n);
      assert.equal(frame.error, undefined);
      assert.equal(frame.result.isError, undefined, JSON.stringify(frame.result));
      return JSON.parse(frame.result.content[0].text);
    },
  };
}

function stop(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
  });
}

test('stdio MCP preserves link fields after process restart', { timeout: 15000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'source-ref-stdio-'));
  const db = path.join(dir, 'board.db');
  const first = start(db);
  let second: ReturnType<typeof start> | undefined;
  try {
    const board = await first.call('create_board', { name: 'sourceRef' });
    await first.call('create_shapes', { board_id: board.id, shapes });
    await stop(first.child);
    second = start(db);
    const state = await second.call('get_canvas_state', { board_id: board.id });
    const shape = state.shapes.find((item: any) => item.id === 'shape:order');
    assert.equal(shape.sourceRef, REF);
    assert.equal(shape.syncedCommit, COMMIT);
  } finally {
    await stop(first.child);
    if (second) await stop(second.child);
    rmSync(dir, { recursive: true, force: true });
  }
});
