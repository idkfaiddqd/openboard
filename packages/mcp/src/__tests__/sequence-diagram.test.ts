import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenBoardMcpServer } from '../server.js';
import { BoardService,CanvasService } from '@openboard/core';
import { MemoryBoardRepository } from '@openboard/storage';
function setup(){const boards=new BoardService(new MemoryBoardRepository());return {boards,mcp:new OpenBoardMcpServer(boards,new CanvasService(boards))};}
const diagram={id:'seq',type:'sequence-diagram',x:0,y:0,name:'Info',participants:[{id:'a',name:'Bridge'},{id:'b',name:'Server'}],messages:[{id:'q',from:'a',to:'b',label:'GET_INFO(42)'},{id:'r',from:'b',to:'a',label:'INFO(42)'}]};
test('schema accepts sequence data and rejects malformed nested message',async()=>{
 const {default:Ajv}=await import('ajv');const {mcp}=setup();const create=new Ajv().compile(mcp.getTools().find(t=>t.name==='create_shapes')!.inputSchema as any);const update=new Ajv().compile(mcp.getTools().find(t=>t.name==='update_shapes')!.inputSchema as any);
 assert.equal(create({shapes:[diagram]}),true);assert.equal(create({shapes:[{...diagram,messages:[{id:'q',from:'a',label:'missing target'}]}]}),false);assert.equal(update({shapes:[{id:'seq',participants:[{id:'a'}]}]}),false);assert.equal(create({shapes:[{type:'geo',x:0,y:0}]}),true);
});
test('MCP reads structured participants and message order',async()=>{
 const {boards,mcp}=setup();const b=await boards.createBoard({name:'seq'});const board_id=b.metadata.id;const result=await mcp.handleToolCall('create_shapes',{board_id,shapes:[diagram]});assert.equal(result.isError,undefined,JSON.stringify(result));const state=await mcp.handleToolCall('get_canvas_state',{board_id});const data=JSON.parse((state.content[0] as any).text);const s=data.shapes.find((v:any)=>v.id==='shape:seq');assert.deepEqual(s.participants,diagram.participants);assert.deepEqual(s.messages,diagram.messages);
});
test('runtime rejects unknown message endpoint without saving',async()=>{
 const {boards,mcp}=setup();const b=await boards.createBoard({name:'bad seq'});const result=await mcp.handleToolCall('create_shapes',{board_id:b.metadata.id,shapes:[{...diagram,messages:[{id:'q',from:'a',to:'missing',label:'Q'}]}]});assert.equal(result.isError,true);assert.equal((await boards.getBoard(b.metadata.id)).document.records['shape:seq'],undefined);
});
test('published schema and runtime reject sub-unit sequence dimensions',async()=>{
 const {default:Ajv}=await import('ajv');const {boards,mcp}=setup();const create=new Ajv().compile(mcp.getTools().find(t=>t.name==='create_shapes')!.inputSchema as any);
 for(const field of ['w','h']){assert.equal(create({shapes:[{...diagram,[field]:0.5}]}),false);assert.equal(create({shapes:[{...diagram,[field]:1}]}),true);}
 const b=await boards.createBoard({name:'size'});const result=await mcp.handleToolCall('create_shapes',{board_id:b.metadata.id,shapes:[{...diagram,w:0.5}]});assert.equal(result.isError,true);
});
