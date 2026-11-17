import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SQLiteBoardRepository } from '@openboard/storage';
import { OpenBoardServer } from '../server.js';

const mapping = () => ({ sources: [{ locator: 'docs/mapping.md', repository: 'model', revision: 'one' }], sections: [{ id: 'ports', title: 'Ports', entries: [{
  id: 'store', responsibility: 'Store data', artifacts: [
    { locator: 'pkg#Port', repository: 'contracts', revision: 'two', participation: 'provides capability' },
    { locator: 'pkg#Consumer', repository: 'app', revision: 'three', participation: 'uses capability' },
  ], evidence: [{ claim: 'Source inspected', method: 'inspection', limits: 'Not a cloud test' }], gaps: ['Provider not inspected'],
}] }] });
const cls = (id: string) => ({ id, type: 'uml-class', x: 20, y: 30, name: id, attributes: [], operations: [] });
const ctx = (id: string) => ({ id, type: 'bounded-context', x: 300, y: 30, name: id });
function shapes() {
  return [cls('a'), cls('b'), ctx('c1'), ctx('c2'),
    { ...cls('subject'), mapping: mapping() },
    { id: 'relation', type: 'uml-relationship', kind: 'association', from: 'a', to: 'b', mapping: mapping() },
    { ...ctx('context'), mapping: mapping() },
    { id: 'interaction', type: 'context-interaction', from: 'c1', to: 'c2', mapping: mapping() },
    { id: 'aggregate', type: 'aggregate-boundary', x: 0, y: 0, name: 'Order', mapping: mapping() },
    { id: 'sequence', type: 'sequence-diagram', x: 0, y: 0, name: 'Request', participants: [], messages: [], mapping: mapping() },
    { id: 'assembly', type: 'assembly-diagram', x: 0, y: 0, name: 'Assembly', participants: [], relations: [], mapping: mapping() },
  ];
}
const mappedIds = ['subject', 'relation', 'context', 'interaction', 'aggregate', 'sequence', 'assembly'];
function checkRecords(records: Record<string, any>) {
  for (const id of mappedIds) assert.deepEqual(records[`shape:${id}`].props.mapping, mapping(), id);
}
function checkState(state: any) {
  for (const id of mappedIds) {
    const shape = state.shapes.find((item: any) => item.id === `shape:${id}`);
    assert.equal(shape.hasMapping, true, id);
    assert.deepEqual(shape.mapping, mapping(), id);
  }
}
async function httpFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ddd-mapping-http-'));
  const db = path.join(dir, 'board.db');
  const repo = new SQLiteBoardRepository({ dbPath: db });
  const server = new OpenBoardServer({ port: 0, repository: repo });
  const { url } = await server.start(0, '127.0.0.1');
  const raw = async (name: string, args: object) => {
    const response = await fetch(`${url}/api/mcp`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    });
    assert.equal(response.ok, true);
    return (await response.json() as any).result;
  };
  const call = async (name: string, args: object) => {
    const result = await raw(name, args);
    assert.equal(result.isError, undefined, JSON.stringify(result));
    return JSON.parse(result.content[0].text);
  };
  return { dir, db, repo, server, url, raw, call };
}

test('DDD mapping HTTP/SQLite: real transport, complete SSE, brief and full reads, and reopen', { timeout: 30000 }, async t => {
  const f = await httpFixture();
  const abort = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const board = await f.call('create_board', { name: 'DDD mapping persistence' });
    const live = await fetch(`${f.url}/api/boards/${board.id}/live`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20000)]) });
    reader = live.body!.getReader();
    let buffered = '';
    const decoder = new TextDecoder();
    const event = async () => {
      while (true) {
        const boundary = buffered.indexOf('\n\n');
        if (boundary >= 0) {
          const frame = buffered.slice(0, boundary); buffered = buffered.slice(boundary + 2);
          const data = frame.split('\n').find(line => line.startsWith('data: '));
          if (data) return JSON.parse(data.slice(6));
          continue;
        }
        const chunk = await reader!.read();
        assert.equal(chunk.done, false, 'SSE ended before expected data');
        buffered += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
      }
    };
    await event();
    await f.call('create_shapes', { board_id: board.id, shapes: shapes() });
    const created = await event();
    await t.test('SSE delivers complete mapping for all seven DDD types', () => checkRecords((created.document ?? created.board?.document).records));
    await t.test('default read omits content without stripping stored properties', async () => {
      const state = await f.call('get_canvas_state', { board_id: board.id });
      const subject = state.shapes.find((s: any) => s.id === 'shape:subject');
      assert.equal(subject.hasMapping, true);
      assert.equal(Object.hasOwn(subject, 'mapping'), false);
      checkRecords((await f.repo.getBoard(board.id))!.document.records as Record<string, any>);
    });
    await t.test('explicit read returns all mapping records', async () => checkState(await f.call('get_canvas_state', { board_id: board.id, include_mapping: true })));
    abort.abort(); await reader.cancel().catch(() => {});
    await f.server.stop(); f.repo.close();
    assert.equal(readFileSync(f.db).subarray(0, 16).toString(), 'SQLite format 3\u0000', 'Integration uses an actual SQLite file');
    const reopened = new SQLiteBoardRepository({ dbPath: f.db });
    try { await t.test('reopening real SQLite retains all seven nested mappings', async () => checkRecords((await reopened.getBoard(board.id))!.document.records as Record<string, any>)); }
    finally { reopened.close(); }
  } finally {
    abort.abort(); if (reader) await reader.cancel().catch(() => {});
    await f.server.stop(); try { f.repo.close(); } catch {}
    rmSync(f.dir, { recursive: true, force: true });
  }
});

for (const operation of ['create_shapes', 'update_shapes']) {
  test(`DDD mapping HTTP/SQLite: malformed ${operation} does not persist a valid batch prefix across reopen`, { timeout: 20000 }, async () => {
    const f = await httpFixture();
    try {
      const board = await f.call('create_board', { name: 'Mapping atomic failure' });
      await f.call('create_shapes', { board_id: board.id, shapes: [cls('subject'), cls('other')] });
      const before = structuredClone((await f.repo.getBoard(board.id))!.document);
      const changes = operation === 'create_shapes'
        ? [cls('valid-new'), { ...cls('invalid-new'), mapping: { sources: [], sections: [], typo: true } }]
        : [{ id: 'other', x: 999 }, { id: 'subject', mapping: { sources: [], sections: [], typo: true } }];
      const result = await f.raw(operation, { board_id: board.id, shapes: changes });
      // Check disk state even if the old implementation incorrectly reports success.
      await f.server.stop(); f.repo.close();
      const reopened = new SQLiteBoardRepository({ dbPath: f.db });
      try { assert.deepEqual((await reopened.getBoard(board.id))!.document, before); }
      finally { reopened.close(); }
      assert.equal(result.isError, true);
    } finally {
      await f.server.stop(); try { f.repo.close(); } catch {}
      rmSync(f.dir, { recursive: true, force: true });
    }
  });
}

function start(db: string) {
  const child = spawn(process.execPath, [path.resolve('../../cli/dist/index.js'), 'mcp', '--db', db]);
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  let sequence = 0, stderr = '';
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  return {
    child,
    async call(name: string, args: object) {
      const id = ++sequence;
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }) + '\n');
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const line = await Promise.race([lines.next(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`stdio response timeout: ${stderr}`)), 8000); })]);
        assert.equal(line.done, false, `stdio closed: ${stderr}`);
        const frame = JSON.parse(line.value!);
        assert.equal(frame.id, id); assert.equal(frame.error, undefined, JSON.stringify(frame));
        assert.equal(frame.result.isError, undefined, JSON.stringify(frame.result));
        return JSON.parse(frame.result.content[0].text);
      } finally { clearTimeout(timer); }
    },
  };
}
async function stop(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>(resolve => { child.once('exit', () => resolve()); child.kill('SIGTERM'); });
}
test('DDD mapping stdio/SQLite: fresh processes retain, preserve, replace and clear nested mappings', { timeout: 30000 }, async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ddd-mapping-stdio-'));
  const db = path.join(dir, 'board.db');
  let process = start(db);
  try {
    const board = await process.call('create_board', { name: 'Mapping process restart' });
    await process.call('create_shapes', { board_id: board.id, shapes: shapes() });
    await stop(process.child); process = start(db);
    await t.test('fresh process reads complete projections for all seven DDD types', async () => checkState(await process.call('get_canvas_state', { board_id: board.id, include_mapping: true })));
    await process.call('update_shapes', { board_id: board.id, shapes: [{ id: 'subject', x: 150 }] });
    await t.test('unrelated geometry update retains mapping in a separate stdio process', async () => {
      const state = await process.call('get_canvas_state', { board_id: board.id, include_mapping: true });
      const subject = state.shapes.find((s: any) => s.id === 'shape:subject');
      assert.deepEqual(subject.mapping, mapping()); assert.equal(subject.x, 150);
    });
    const replacement = { sources: [], sections: [] };
    await process.call('update_shapes', { board_id: board.id, shapes: [{ id: 'subject', mapping: replacement }] });
    await stop(process.child); process = start(db);
    await t.test('full replacement and geometry survive another restart', async () => {
      const state = await process.call('get_canvas_state', { board_id: board.id, include_mapping: true });
      const subject = state.shapes.find((s: any) => s.id === 'shape:subject');
      assert.deepEqual(subject.mapping, replacement); assert.equal(subject.hasMapping, true); assert.equal(subject.x, 150);
    });
    await process.call('update_shapes', { board_id: board.id, shapes: [{ id: 'subject', mapping: null }] });
    await stop(process.child); process = start(db);
    await t.test('explicit clear remains absent after restart', async () => {
      const state = await process.call('get_canvas_state', { board_id: board.id, include_mapping: true });
      const subject = state.shapes.find((s: any) => s.id === 'shape:subject');
      assert.equal(subject.hasMapping, false); assert.equal(Object.hasOwn(subject, 'mapping'), false);
    });
    assert.equal(readFileSync(db).subarray(0, 16).toString(), 'SQLite format 3\u0000');
  } finally { await stop(process.child); rmSync(dir, { recursive: true, force: true }); }
});
