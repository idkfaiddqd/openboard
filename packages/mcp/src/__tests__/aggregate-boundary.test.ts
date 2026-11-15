import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenBoardMcpServer } from '../server.js';
import { BoardService, CanvasService } from '@openboard/core';
import { MemoryBoardRepository } from '@openboard/storage';
function setup(){const boards=new BoardService(new MemoryBoardRepository());return {boards,mcp:new OpenBoardMcpServer(boards,new CanvasService(boards))};}
const boundary={id:'agg',type:'aggregate-boundary',x:0,y:0,name:'Order',rootId:'order',memberIds:['line']};
const cls=(id:string)=>({id,type:'uml-class',x:0,y:0,name:id,attributes:[],operations:[]});
test('published schema represents aggregate root and member IDs',async()=>{
 const {default:Ajv}=await import('ajv');const {mcp}=setup();const schema=new Ajv().compile(mcp.getTools().find(t=>t.name==='create_shapes')!.inputSchema as any);
 assert.equal(schema({shapes:[boundary]}),true);assert.equal(schema({shapes:[{...boundary,name:' '}]}),false);assert.equal(schema({shapes:[{...boundary,memberIds:[7]}]}),false);assert.equal(schema({shapes:[{type:'geo',x:0,y:0}]}),true);
});
test('MCP roundtrips explicit aggregate membership',async()=>{
 const {boards,mcp}=setup();const b=await boards.createBoard({name:'aggregate'});const result=await mcp.handleToolCall('create_shapes',{board_id:b.metadata.id,shapes:[boundary,cls('order'),cls('line')]});assert.equal(result.isError,undefined,JSON.stringify(result));const state=await mcp.handleToolCall('get_canvas_state',{board_id:b.metadata.id});const data=JSON.parse((state.content[0] as any).text);const a=data.shapes.find((s:any)=>s.id==='shape:agg');assert.deepEqual([a.type,a.rootId,a.memberIds],['aggregate-boundary','shape:order',['shape:line']]);
});
test('MCP runtime rejects invalid root reference without saving',async()=>{
 const {boards,mcp}=setup();const b=await boards.createBoard({name:'invalid'});const result=await mcp.handleToolCall('create_shapes',{board_id:b.metadata.id,shapes:[boundary,cls('order')]});assert.equal(result.isError,true);assert.equal((await boards.getBoard(b.metadata.id)).document.records['shape:agg'],undefined);
});

test('root ID schema agrees with runtime about empty, whitespace and padded IDs',async()=>{
 const {default:Ajv}=await import('ajv');const {boards,mcp}=setup();
 const createSchema=new Ajv().compile(mcp.getTools().find(t=>t.name==='create_shapes')!.inputSchema as any);
 const updateSchema=new Ajv().compile(mcp.getTools().find(t=>t.name==='update_shapes')!.inputSchema as any);
 for(const value of ['', ' order ']){assert.equal(createSchema({shapes:[{...boundary,rootId:value}]}),true);assert.equal(updateSchema({shapes:[{id:'agg',rootId:value}]}),true);}
 for(const value of ['   ',7]){assert.equal(createSchema({shapes:[{...boundary,rootId:value}]}),false);assert.equal(updateSchema({shapes:[{id:'agg',rootId:value}]}),false);}
 const board=await boards.createBoard({name:'root schema'});const board_id=board.metadata.id;
 const created=await mcp.handleToolCall('create_shapes',{board_id,shapes:[{...boundary,rootId:' order '},cls('order'),cls('line')]});assert.equal(created.isError,undefined);
 let state=await mcp.handleToolCall('get_canvas_state',{board_id});let parsed=JSON.parse((state.content[0] as any).text);assert.equal(parsed.shapes.find((s:any)=>s.id==='shape:agg').rootId,'shape:order');
 const cleared=await mcp.handleToolCall('update_shapes',{board_id,shapes:[{id:'agg',rootId:''}]});assert.equal(cleared.isError,undefined);
 state=await mcp.handleToolCall('get_canvas_state',{board_id});parsed=JSON.parse((state.content[0] as any).text);assert.equal(parsed.shapes.find((s:any)=>s.id==='shape:agg').rootId,undefined);
});
