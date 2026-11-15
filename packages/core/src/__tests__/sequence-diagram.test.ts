import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBoardRepository } from '@openboard/storage';
import type { CreateShapeInput, UpdateShapeInput } from '@openboard/shared';
import { BoardService } from '../service.js';
import { CanvasService } from '../canvas.js';
const input=(v:unknown)=>v as CreateShapeInput; const update=(v:unknown)=>v as UpdateShapeInput;
const participants=[{id:'bridge',name:'Bridge'},{id:'server',name:'Server'}];
const messages=[{id:'request',from:'bridge',to:'server',label:'GET_INFO(id=42)'},{id:'response',from:'server',to:'bridge',label:'INFO(id=42)',kind:'answer'}];
const diagram=(v:object={})=>input({id:'seq',type:'sequence-diagram',x:10,y:20,name:'Map info',participants,messages,...v});
async function setup(){const boards=new BoardService(new MemoryBoardRepository());const canvas=new CanvasService(boards);const board=await boards.createBoard({name:'Sequence'});return {boards,canvas,id:board.metadata.id};}

test('sequence roundtrips participants, directed messages and explicit order',async()=>{
 const {canvas,id}=await setup();await canvas.createShapes(id,[diagram()]);const s=(await canvas.getCanvasState(id)).shapes.find(x=>x.id==='shape:seq') as any;
 assert.deepEqual([s.type,s.name,s.w,s.h],['sequence-diagram','Map info',520,360]);assert.deepEqual(s.participants,participants);assert.deepEqual(s.messages,messages);
});
test('empty diagram and equal display names retain distinct local IDs',async()=>{
 const {canvas,id}=await setup();await canvas.createShapes(id,[diagram({participants:[],messages:[]})]);await canvas.updateShapes(id,[update({id:'seq',participants:[{id:'a',name:'same'},{id:'b',name:'same'}]})]);
 const s=(await canvas.getCanvasState(id)).shapes.find(x=>x.id==='shape:seq') as any;assert.deepEqual(s.participants,[{id:'a',name:'same'},{id:'b',name:'same'}]);assert.deepEqual(s.messages,[]);
});
test('invalid nested identities, endpoints and self messages reject atomically',async()=>{
 const {canvas,id}=await setup();await canvas.createShapes(id,[diagram()]);const before=await canvas.getCanvasState(id);
 const bad=[{participants:[{id:'bridge',name:'A'},{id:'bridge',name:'B'}]}, {messages:[{id:'x',from:'bridge',to:'unknown',label:'x'}]}, {messages:[{id:'x',from:'bridge',to:'bridge',label:'x'}]}, {messages:[{id:'x',from:'bridge',to:'server',label:' '}]}, {messages:[messages[0],messages[0]]}];
 for(const change of bad){await assert.rejects(canvas.updateShapes(id,[update({id:'seq',name:'lost',...change})]));assert.deepEqual(await canvas.getCanvasState(id),before);}
});
test('message replacement changes order but preserves IDs and participants',async()=>{
 const {canvas,id}=await setup();await canvas.createShapes(id,[diagram()]);await canvas.updateShapes(id,[update({id:'seq',messages:[messages[1],messages[0]]})]);const s=(await canvas.getCanvasState(id)).shapes.find(x=>x.id==='shape:seq') as any;assert.deepEqual(s.participants,participants);assert.deepEqual(s.messages,[messages[1],messages[0]]);
});
test('removing a referenced participant requires a valid final batch and is atomic',async()=>{
 const {canvas,id}=await setup();await canvas.createShapes(id,[diagram()]);const before=await canvas.getCanvasState(id);await assert.rejects(canvas.updateShapes(id,[update({id:'seq',participants:[participants[0]]})]));assert.deepEqual(await canvas.getCanvasState(id),before);
 await canvas.updateShapes(id,[update({id:'seq',participants:[participants[0]]}),update({id:'seq',messages:[]})]);const s=(await canvas.getCanvasState(id)).shapes.find(x=>x.id==='shape:seq') as any;assert.deepEqual(s.participants,[participants[0]]);assert.deepEqual(s.messages,[]);
});
test('message endpoints cannot refer to a participant of another diagram',async()=>{
 const {canvas,id}=await setup();await canvas.createShapes(id,[diagram(),diagram({id:'other',participants:[{id:'external',name:'External'}],messages:[]})]);const before=await canvas.getCanvasState(id);
 await assert.rejects(canvas.updateShapes(id,[update({id:'seq',messages:[{id:'x',from:'bridge',to:'external',label:'x'}]})]));assert.deepEqual(await canvas.getCanvasState(id),before);
});
test('deleting a sequence leaves unrelated ordinary and UML figures',async()=>{
 const {canvas,id}=await setup();await canvas.createShapes(id,[diagram(),input({id:'box',type:'geo',x:0,y:0}),input({id:'class',type:'uml-class',x:0,y:0,name:'X',attributes:[],operations:[]})]);await canvas.deleteShapes(id,['seq']);const ids=(await canvas.getCanvasState(id)).shapes.map(s=>s.id);assert.ok(!ids.includes('shape:seq'));assert.ok(ids.includes('shape:box'));assert.ok(ids.includes('shape:class'));
});
test('sequence dimensions below one unit are rejected and one unit is allowed',async()=>{
 const {canvas,id}=await setup();const before=await canvas.getCanvasState(id);
 for(const value of [Number.MIN_VALUE,0.5,0]){
  await assert.rejects(canvas.createShapes(id,[diagram({w:value})]));assert.deepEqual(await canvas.getCanvasState(id),before);
  await assert.rejects(canvas.createShapes(id,[diagram({h:value})]));assert.deepEqual(await canvas.getCanvasState(id),before);
 }
 await canvas.createShapes(id,[diagram({w:1,h:1})]);const s=(await canvas.getCanvasState(id)).shapes.find(x=>x.id==='shape:seq') as any;assert.equal(s.w,1);assert.equal(s.h,1);
});
