import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBoardRepository } from '@openboard/storage';
import type { CreateShapeInput, UpdateShapeInput } from '@openboard/shared';
import { BoardService } from '../service.js';
import { CanvasService } from '../canvas.js';
const input=(v:unknown)=>v as CreateShapeInput;
const update=(v:unknown)=>v as UpdateShapeInput;
const cls=(id:string,kind='class')=>input({id,type:'uml-class',x:0,y:0,name:id,attributes:[],operations:[],classifierKind:kind});
const aggregate=(v:object={})=>input({id:'agg',type:'aggregate-boundary',x:10,y:20,name:' Order ',rootId:'order',memberIds:['line'],...v});
async function setup(){const boards=new BoardService(new MemoryBoardRepository());const canvas=new CanvasService(boards);const board=await boards.createBoard({name:'Aggregate'});return {boards,canvas,id:board.metadata.id};}

test('aggregate supports forward references, explicit root, members and trimmed name',async()=>{
 const {canvas,id}=await setup();await canvas.createShapes(id,[aggregate(),cls('order'),cls('line')]);
 const a=(await canvas.getCanvasState(id)).shapes.find(s=>s.id==='shape:agg') as any;
 assert.deepEqual([a.type,a.name,a.rootId,a.memberIds,a.w,a.h],['aggregate-boundary','Order','shape:order',['shape:line'],440,300]);
});
test('partial aggregates and repeated names preserve distinct identities',async()=>{
 const {canvas,id}=await setup(); await canvas.createShapes(id,[aggregate({rootId:undefined,memberIds:[]}),aggregate({id:'other',rootId:undefined,memberIds:[]})]);
 const s=(await canvas.getCanvasState(id)).shapes as any[];assert.equal(s.length,2);assert.equal(s.find(x=>x.id==='shape:agg').rootId,undefined);assert.deepEqual(s.find(x=>x.id==='shape:other').memberIds,[]);
});
test('moving class does not change explicit aggregate membership',async()=>{
 const {canvas,id}=await setup();await canvas.createShapes(id,[cls('order'),cls('line'),aggregate()]);await canvas.updateShapes(id,[update({id:'line',x:5000,y:5000})]);
 assert.deepEqual(((await canvas.getCanvasState(id)).shapes.find(s=>s.id==='shape:agg') as any).memberIds,['shape:line']);
});
test('invalid root and members reject whole creation batches atomically',async()=>{
 const {canvas,id}=await setup();await canvas.createShapes(id,[cls('order'),cls('line'),cls('iface','interface')]);const before=await canvas.getCanvasState(id);
 for(const a of [aggregate({rootId:'missing'}),aggregate({rootId:'iface'}),aggregate({memberIds:['line','line']}),aggregate({memberIds:['order']})]){await assert.rejects(canvas.createShapes(id,[a]));assert.deepEqual(await canvas.getCanvasState(id),before);}
});
test('root and members can be explicitly cleared without changing other fields',async()=>{
 const {canvas,id}=await setup();await canvas.createShapes(id,[cls('order'),cls('line'),aggregate()]);await canvas.updateShapes(id,[update({id:'agg',rootId:'',memberIds:[]})]);const a=(await canvas.getCanvasState(id)).shapes.find(s=>s.id==='shape:agg') as any;assert.equal(a.rootId,undefined);assert.deepEqual(a.memberIds,[]);assert.equal(a.name,'Order');
});
test('classification changes and repeated updates validate final references atomically',async()=>{
 const {canvas,id}=await setup();await canvas.createShapes(id,[cls('order'),cls('line'),aggregate()]);const before=await canvas.getCanvasState(id);
 await assert.rejects(canvas.updateShapes(id,[update({id:'line',classifierKind:'interface'})]));assert.deepEqual(await canvas.getCanvasState(id),before);
 await canvas.updateShapes(id,[update({id:'line',classifierKind:'interface'}),update({id:'agg',memberIds:[]}),update({id:'agg',memberIds:['order']}),update({id:'agg',memberIds:[]})]);
 const s=(await canvas.getCanvasState(id)).shapes as any[];assert.equal(s.find(x=>x.id==='shape:line').classifierKind,'interface');assert.deepEqual(s.find(x=>x.id==='shape:agg').memberIds,[]);
});
test('deleting a class clears references; deleting boundary retains classes',async()=>{
 const {canvas,id}=await setup();await canvas.createShapes(id,[cls('order'),cls('line'),aggregate()]);await canvas.deleteShapes(id,['order']);let s=(await canvas.getCanvasState(id)).shapes as any[];assert.equal(s.find(x=>x.id==='shape:agg').rootId,undefined);assert.deepEqual(s.find(x=>x.id==='shape:agg').memberIds,['shape:line']);await canvas.deleteShapes(id,['agg']);s=(await canvas.getCanvasState(id)).shapes as any[];assert.ok(s.some(x=>x.id==='shape:line'));
});
test('old damaged member reference does not block unrelated actions and can be repaired',async()=>{
 const {boards,canvas,id}=await setup();await canvas.createShapes(id,[cls('order'),cls('line'),aggregate()]);const doc=(await boards.getBoard(id)).document;const records={...doc.records};delete records['shape:line'];await boards.updateBoard(id,{document:{...doc,records}});await canvas.createShapes(id,[cls('other')]);let a=(await canvas.getCanvasState(id)).shapes.find(s=>s.id==='shape:agg') as any;assert.deepEqual(a.memberIds,['shape:line']);await canvas.updateShapes(id,[update({id:'agg',memberIds:['other']})]);a=(await canvas.getCanvasState(id)).shapes.find(s=>s.id==='shape:agg') as any;assert.deepEqual(a.memberIds,['shape:other']);
});
