import test from 'node:test';
import assert from 'node:assert/strict';
import { TldrawDocumentAdapter } from '../adapter.js';
const participants=[{id:'bridge',name:'Bridge'},{id:'server',name:'Server'}];
const messages=[{id:'q',from:'bridge',to:'server',label:'GET_INFO(42)'},{id:'r',from:'server',to:'bridge',label:'INFO(42)'}];
const base={typeName:'shape',x:0,y:0,rotation:0,isLocked:false,opacity:1,parentId:'page:page',meta:{}};
const shape={...base,id:'shape:seq',type:'sequence-diagram',index:'a1',props:{w:520,h:360,name:'Info',participants,messages}};
test('browser store roundtrips sequence and preserves an ordinary frame',()=>{
 const frame={...base,id:'shape:frame',type:'frame',index:'a2',props:{w:500,h:400,name:'old',color:'black'}};
 const store=TldrawDocumentAdapter.createStoreFromDocument({schemaVersion:1,records:{'shape:seq':shape,'shape:frame':frame}});const reopened=TldrawDocumentAdapter.createStoreFromDocument(TldrawDocumentAdapter.extractDocument(store));const r=TldrawDocumentAdapter.extractDocument(reopened).records as Record<string,any>;
 assert.equal(r['shape:frame'].type,'frame');assert.deepEqual(r['shape:seq'].props.participants,participants);assert.deepEqual(r['shape:seq'].props.messages,messages);
});
test('diagram rendering includes participants and ordered message labels',async()=>{
 const {renderToStaticMarkup}=await import('react-dom/server');const modulePath='../sequence-shapes.js';const module=await import(modulePath);const util=new module.SequenceDiagramShapeUtil({} as any);
 const html=renderToStaticMarkup(util.component(shape));assert.match(html,/Bridge/);assert.match(html,/Server/);assert.ok(html.indexOf('>GET_INFO(42)<')>=0);assert.ok(html.indexOf('>INFO(42)<')>html.indexOf('>GET_INFO(42)<'));
});
test('narrow diagram keeps participant order and forward message direction',async()=>{
 const modulePath='../sequence-shapes.js';const module=await import(modulePath);const util=new module.SequenceDiagramShapeUtil({} as any);
 const element=util.component({...shape,props:{...shape.props,w:100,messages:[messages[0]]}}) as any;
 const participantGroups=element.props.children[2] as any[];const messageGroups=element.props.children[3] as any[];
 const first=participantGroups[0].props.children[0].props;const second=participantGroups[1].props.children[0].props;
 const firstCenter=first.x+first.width/2,secondCenter=second.x+second.width/2;
 assert.ok(firstCenter<secondCenter,'participants must stay left to right');
 const line=messageGroups[0].props.children[0].props;assert.ok(line.x1<line.x2,'forward message must point right');
});
test('short diagram keeps messages on both lifelines inside its height',async()=>{
 const modulePath='../sequence-shapes.js';const module=await import(modulePath);const util=new module.SequenceDiagramShapeUtil({} as any);
 const element=util.component({...shape,props:{...shape.props,h:100}}) as any;
 const frame=element.props.children[0].props;const participantGroups=element.props.children[2] as any[];const messageGroups=element.props.children[3] as any[];
 const lifelines=participantGroups.map(group=>group.props.children[2].props);const lines=messageGroups.map(group=>group.props.children[0].props);
 assert.equal(lines.length,2);assert.ok(lines[0].y1<lines[1].y1);
 for(const line of lines){assert.ok(line.y1>=0&&line.y1<=frame.height);for(const life of lifelines)assert.ok(line.y1>=life.y1&&line.y1<=life.y2);}
});
test('one-unit width preserves three participant centers and message direction',async()=>{
 const modulePath='../sequence-shapes.js';const module=await import(modulePath);const util=new module.SequenceDiagramShapeUtil({} as any);
 const three=[...participants,{id:'other',name:'Other'}];const element=util.component({...shape,props:{...shape.props,w:1,participants:three,messages:[messages[0]]}}) as any;
 const groups=element.props.children[2] as any[];const centers=groups.map(group=>{const r=group.props.children[0].props;return r.x+r.width/2;});
 assert.ok(centers[0]<centers[1]&&centers[1]<centers[2]);const line=(element.props.children[3] as any[])[0].props.children[0].props;assert.ok(line.x1<line.x2);
});
