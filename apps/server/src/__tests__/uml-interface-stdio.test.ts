import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function start(db: string) {
  const child = spawn(process.execPath, [path.resolve('../../cli/dist/index.js'), 'mcp', '--db', db]);
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  let id = 0;
  return { child, async call(name: string, args: object) {
    const current = ++id;
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: current, method: 'tools/call', params: { name, arguments: args } }) + '\n');
    const line = await lines.next();
    assert.equal(line.done, false);
    const frame = JSON.parse(line.value!);
    assert.equal(frame.id, current);
    assert.equal(frame.error, undefined);
    assert.equal(frame.result.isError, undefined, JSON.stringify(frame.result));
    return JSON.parse(frame.result.content[0].text);
  } };
}
function stop(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once('exit', () => resolve()); child.kill('SIGTERM'); });
}
test('stdio MCP preserves interface kind and role after process restart', { timeout: 15000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'openboard-interface-stdio-'));
  const first = start(path.join(dir, 'board.db'));
  let second: ReturnType<typeof start> | undefined;
  try {
    const board = await first.call('create_board', { name: 'Interface stdio' });
    await first.call('create_shapes', { board_id: board.id, shapes: [{ id: 'port', type: 'uml-class', x: 10, y: 20, name: 'Storage', attributes: [], operations: [], classifierKind: 'interface', role: 'Port' }] });
    await stop(first.child);
    second = start(path.join(dir, 'board.db'));
    const state = await second.call('get_canvas_state', { board_id: board.id });
    const port = state.shapes.find((s: any) => s.id === 'shape:port');
    assert.equal(port.classifierKind, 'interface');
    assert.equal(port.role, 'Port');
  } finally {
    await stop(first.child);
    if (second) await stop(second.child);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('stdio MCP preserves realization and endpoints after process restart', { timeout: 15000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'openboard-realization-stdio-'));
  const first = start(path.join(dir, 'board.db'));
  let second: ReturnType<typeof start> | undefined;
  try {
    const board = await first.call('create_board', { name: 'Realization stdio' });
    await first.call('create_shapes', { board_id: board.id, shapes: [
      { id: 'adapter', type: 'uml-class', x: 0, y: 0, name: 'Adapter', attributes: [], operations: [] },
      { id: 'port', type: 'uml-class', x: 300, y: 0, name: 'Storage', attributes: [], operations: [], classifierKind: 'interface' },
      { id: 'r', type: 'uml-relationship', kind: 'realization', from: 'adapter', to: 'port' },
    ] });
    await stop(first.child);
    second = start(path.join(dir, 'board.db'));
    const state = await second.call('get_canvas_state', { board_id: board.id });
    const r = state.shapes.find((s: any) => s.id === 'shape:r');
    assert.deepEqual([r.kind, r.from, r.to], ['realization', 'shape:adapter', 'shape:port']);
  } finally { await stop(first.child); if (second) await stop(second.child); rmSync(dir, { recursive: true, force: true }); }
});
