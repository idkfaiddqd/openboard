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
  let nextId = 0;
  return {
    child,
    async call(name: string, args: object) {
      const id = ++nextId;
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }) + '\n');
      const line = await lines.next();
      assert.equal(line.done, false, 'stdio process closed before response');
      const frame = JSON.parse(line.value!);
      assert.equal(frame.id, id);
      assert.equal(frame.error, undefined);
      assert.equal(frame.result.isError, undefined, JSON.stringify(frame.result));
      return frame.result;
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

test('stdio UML class persists after process restart', { timeout: 15000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'openboard-uml-stdio-'));
  const db = path.join(dir, 'board.db');
  const first = start(db);
  let second: ReturnType<typeof start> | undefined;
  try {
    const board = await first.call('create_board', { name: 'UML stdio' });
    const boardId = JSON.parse(board.content[0].text).id;
    await first.call('create_shapes', { board_id: boardId, shapes: [
      { id: 'order', type: 'uml-class', x: 20, y: 30, name: 'Order', attributes: ['id: UUID'], operations: [] },
      { id: 'line', type: 'uml-class', x: 400, y: 30, name: 'OrderLine', attributes: [], operations: [] },
      { id: 'owns', type: 'uml-relationship', kind: 'composition', from: 'order', to: 'line', toMultiplicity: '0..*' },
    ] });
    await stop(first.child);
    second = start(db);
    const state = await second.call('get_canvas_state', { board_id: boardId });
    assert.ok(JSON.stringify(state.content).includes('id: UUID'));
    assert.ok(JSON.stringify(state.content).includes('composition'));
    assert.ok(JSON.stringify(state.content).includes('0..*'));
    const parsed = JSON.parse(state.content[0].text);
    const order = parsed.shapes.find((s: any) => s.id === 'shape:order');
    const line = parsed.shapes.find((s: any) => s.id === 'shape:line');
    const relation = parsed.shapes.find((s: any) => s.id === 'shape:owns');
    assert.deepEqual([order.id, order.x, order.y, order.w, order.h, order.name, order.attributes, order.operations], ['shape:order', 20, 30, 220, 160, 'Order', ['id: UUID'], []]);
    assert.deepEqual([line.id, line.x, line.y, line.name], ['shape:line', 400, 30, 'OrderLine']);
    assert.deepEqual([relation.id, relation.kind, relation.from, relation.to, relation.toMultiplicity], ['shape:owns', 'composition', 'shape:order', 'shape:line', '0..*']);
  } finally {
    await stop(first.child);
    if (second) await stop(second.child);
    rmSync(dir, { recursive: true, force: true });
  }
});
