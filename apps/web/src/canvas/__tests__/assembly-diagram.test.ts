import test from 'node:test';
import assert from 'node:assert/strict';
import { TldrawDocumentAdapter } from '../adapter.js';
const participants=[{id:'builder',name:'Builder',x:20,y:20},{id:'repo',name:'Repo',x:180,y:20},{id:'service',name:'Service',x:340,y:20}];
const relations=[{id:'inject',kind:'inject',from:'repo',to:'service',actor:'builder'},{id:'unknown',kind:'inject',from:'repo',to:'service'}];
const shape={typeName:'shape',id:'shape:assembly',type:'assembly-diagram',x:0,y:0,rotation:0,isLocked:false,opacity:1,parentId:'page:page',meta:{},index:'a1',props:{w:600,h:400,name:'Production',participants,relations}};
test('browser store roundtrips assembly and roles',()=>{const store=TldrawDocumentAdapter.createStoreFromDocument({schemaVersion:1,records:{'shape:assembly':shape}});const records=TldrawDocumentAdapter.extractDocument(store).records as Record<string,any>;assert.deepEqual(records['shape:assembly'].props.participants,participants);assert.deepEqual(records['shape:assembly'].props.relations,relations);});
test('assembly rendering labels participants and named and unknown actor',async()=>{const {renderToStaticMarkup}=await import('react-dom/server');const modulePath='../assembly-shapes.js';const module=await import(modulePath);const util=new module.AssemblyDiagramShapeUtil({} as any);const html=renderToStaticMarkup(util.component(shape));for(const name of ['Builder','Repo','Service','передающий не указан'])assert.ok(html.includes(name));});
test('injection arrow runs from dependency to recipient',async()=>{const modulePath='../assembly-shapes.js';const module=await import(modulePath);const util=new module.AssemblyDiagramShapeUtil({} as any);const element=util.component(shape) as any;const visit=(node:any):any[]=>!node||typeof node!=='object'?[]:[node,...(Array.isArray(node.props?.children)?node.props.children.flatMap(visit):visit(node.props?.children))];const lines=visit(element).filter((node:any)=>node.type==='line');assert.ok(lines.some((line:any)=>line.props.x1<line.props.x2),'expected a rightward dependency arrow');});

test('each relation renders its own label, direction and arrowhead at its recipient',async()=>{
 const {AssemblyDiagramShapeUtil}=await import('../assembly-shapes.js');const {renderToStaticMarkup}=await import('react-dom/server');const util=new AssemblyDiagramShapeUtil({} as any);
 const visit=(node:any):any[]=>!node||typeof node!=='object'?[]:[node,...(Array.isArray(node.props?.children)?node.props.children.flatMap(visit):visit(node.props?.children))];
 const cases=[
  {relation:{id:'r',kind:'create',from:'builder',to:'repo'},label:'создаёт',from:80,to:240},
  {relation:{id:'r',kind:'inject',from:'repo',to:'service',actor:'builder'},label:'передаёт: Builder',from:240,to:400},
  {relation:{id:'r',kind:'inject',from:'service',to:'repo'},label:'передающий не указан',from:400,to:240},
  {relation:{id:'r',kind:'other',from:'service',to:'builder',label:'получает'},label:'получает',from:400,to:80},
 ];
 for(const {relation,label,from,to} of cases){const element=util.component({...shape,props:{...shape.props,relations:[relation]}}) as any;const nodes=visit(element);const line=nodes.find(n=>n.type==='line');const arrow=nodes.find(n=>n.type==='polyline');assert.ok(line);assert.deepEqual([line.props.x1,line.props.y1,line.props.x2,line.props.y2],[from,40,to,40]);assert.ok(renderToStaticMarkup(element).includes(label));const points=arrow.props.points.trim().split(/\s+/).map((p:string)=>p.split(',').map(Number));const [left,tip,right]=points;assert.equal(tip[0],to+(from<to?-60:60));assert.equal(tip[1],40);assert.ok((left[0]-tip[0])*(from-to)>0);assert.ok((right[0]-tip[0])*(from-to)>0);}
});

test('resizing scales the full diagram without changing participant coordinates',async()=>{const {AssemblyDiagramShapeUtil}=await import('../assembly-shapes.js');const util=new AssemblyDiagramShapeUtil({} as any);const resized={...shape,props:{...shape.props,w:300,h:200}};const before=structuredClone(resized.props.participants);const element=util.component(resized) as any;const group=element.props.children[1];assert.equal(group.props.transform,'scale(0.5 0.5)');assert.deepEqual(resized.props.participants,before);});

test('participant handles move only their participant and retain the new coordinates in the document',async()=>{
 const {AssemblyDiagramShapeUtil}=await import('../assembly-shapes.js');const util=new AssemblyDiagramShapeUtil({} as any);const resized={...shape,props:{...shape.props,w:300,h:300}};
 const handles=util.getHandles(resized);assert.equal(handles.length,3);const handle=handles.find((h:any)=>h.id==='repo');assert.ok(handle);assert.deepEqual([handle.x,handle.y],[120,30]);
 const change=util.onHandleDrag(resized,{handle:{...handle,x:150,y:75},isPrecise:false}) as any;
 const moved={...resized,...change,props:{...resized.props,...change.props}};
 assert.deepEqual(moved.props.participants,[participants[0],{...participants[1],x:240,y:80},participants[2]]);assert.deepEqual(moved.props.relations,relations);
 const store=TldrawDocumentAdapter.createStoreFromDocument({schemaVersion:1,records:{'shape:assembly':moved}});const records=TldrawDocumentAdapter.extractDocument(store).records as Record<string,any>;assert.deepEqual(records['shape:assembly'].props.participants,moved.props.participants);
});

