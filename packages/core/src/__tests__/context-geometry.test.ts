import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBoardRepository } from '@openboard/storage';
import type { CreateShapeInput, UpdateShapeInput } from '@openboard/shared';
import { BoardService } from '../service.js';
import { CanvasService } from '../canvas.js';
const input = (x: unknown) => x as CreateShapeInput;
const update = (x: unknown) => x as UpdateShapeInput;
const ctx = (id: string, x: number, y: number) => input({ id, type: 'bounded-context', x, y, name: id });
const relation = input({ id: 'r', type: 'context-interaction', from: 'a', to: 'b' });
async function setup() { const boards = new BoardService(new MemoryBoardRepository()); const canvas = new CanvasService(boards); const board = await boards.createBoard({ name: 'Context geometry' }); return { boards, canvas, id: board.metadata.id }; }

test('a distant context interaction does not pull board bounds to its record origin', async () => {
  const { canvas, id } = await setup(); await canvas.createShapes(id, [ctx('a',10000,10000),ctx('b',10600,10000)]);
  const before = (await canvas.getCanvasState(id)).bounds;
  await canvas.createShapes(id, [relation]);
  assert.deepEqual((await canvas.getCanvasState(id)).bounds, before);
  await canvas.updateShapes(id, [update({ id:'b', x:11000 })]);
  assert.deepEqual((await canvas.getCanvasState(id)).bounds, { minX:10000,minY:10000,maxX:11360,maxY:10240,width:1360,height:240 });
  await canvas.deleteShapes(id,['r']); assert.deepEqual((await canvas.getCanvasState(id)).bounds, { minX:10000,minY:10000,maxX:11360,maxY:10240,width:1360,height:240 });
});
test('overlapping context centers use an exterior route included in bounds', async () => {
  const { canvas, id } = await setup(); await canvas.createShapes(id,[ctx('a',10000,10000),ctx('b',10000,10000),relation]);
  assert.deepEqual((await canvas.getCanvasState(id)).bounds, { minX:10000,minY:9960,maxX:10400,maxY:10240,width:400,height:280 });
});
test('an orphaned invisible interaction does not add a false origin to bounds', async () => {
  const { boards, canvas, id } = await setup(); await canvas.createShapes(id,[ctx('a',10000,10000),ctx('b',10600,10000),relation]);
  const doc=(await boards.getBoard(id)).document; const records={...doc.records}; delete records['shape:b']; await boards.updateBoard(id,{document:{...doc,records}});
  assert.deepEqual((await canvas.getCanvasState(id)).bounds, { minX:10000,minY:10000,maxX:10360,maxY:10240,width:360,height:240 });
});
test('nested contexts use page coordinates when a parent frame moves', async () => {
  const { boards, canvas, id } = await setup();
  await canvas.createShapes(id,[input({id:'frame',type:'frame',x:10000,y:10000,w:1800,h:800,name:'parent'}),ctx('a',100,100),ctx('b',700,100)]);
  const doc=(await boards.getBoard(id)).document; const records={...doc.records} as Record<string,any>;
  records['shape:a']={...records['shape:a'],parentId:'shape:frame'}; records['shape:b']={...records['shape:b'],parentId:'shape:frame'};
  await boards.updateBoard(id,{document:{...doc,records}});
  const expected={minX:10000,minY:10000,maxX:11800,maxY:10800,width:1800,height:800};
  assert.deepEqual((await canvas.getCanvasState(id)).bounds,expected);
  await canvas.createShapes(id,[relation]); assert.deepEqual((await canvas.getCanvasState(id)).bounds,expected);
  await canvas.updateShapes(id,[update({id:'frame',x:11000})]);
  assert.deepEqual((await canvas.getCanvasState(id)).bounds,{minX:11000,minY:10000,maxX:12800,maxY:10800,width:1800,height:800});
});
test('touching context frames use an external route included in bounds', async () => {
  const {canvas,id}=await setup(); await canvas.createShapes(id,[ctx('a',10000,10000),ctx('b',10360,10000),relation]);
  assert.deepEqual((await canvas.getCanvasState(id)).bounds,{minX:10000,minY:9960,maxX:10760,maxY:10240,width:760,height:280});
});
test('rotated parent transforms nested context geometry into page coordinates', async () => {
  const {boards,canvas,id}=await setup();
  await canvas.createShapes(id,[input({id:'frame',type:'frame',x:10000,y:10000,w:1800,h:800,name:'parent'}),ctx('a',100,100),ctx('b',700,100)]);
  const doc=(await boards.getBoard(id)).document;const records={...doc.records} as Record<string,any>;
  records['shape:frame']={...records['shape:frame'],rotation:Math.PI/2};
  records['shape:a']={...records['shape:a'],parentId:'shape:frame'}; records['shape:b']={...records['shape:b'],parentId:'shape:frame'};
  await boards.updateBoard(id,{document:{...doc,records}});await canvas.createShapes(id,[relation]);
  assert.deepEqual((await canvas.getCanvasState(id)).bounds,{minX:9660,minY:10000,maxX:11800,maxY:11060,width:2140,height:1060});
});
