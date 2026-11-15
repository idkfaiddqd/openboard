import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardCanvasController } from '../controller.js';
import { TldrawDocumentAdapter } from '../adapter.js';
const base={typeName:'shape',x:0,y:0,rotation:0,isLocked:false,opacity:1,parentId:'page:page',meta:{}};
function setup(){
 const records:Record<string,any>={
  'shape:order':{...base,id:'shape:order',type:'uml-class',index:'a1',props:{w:220,h:160,name:'Order',attributes:[],operations:[]}},
  'shape:line':{...base,id:'shape:line',type:'uml-class',index:'a2',props:{w:220,h:160,name:'Line',attributes:[],operations:[]}},
  'shape:agg':{...base,id:'shape:agg',type:'aggregate-boundary',index:'a3',props:{w:440,h:300,name:'Order',rootId:'shape:order',memberIds:['shape:line']}},
  'shape:frame':{...base,id:'shape:frame',type:'frame',index:'a4',props:{w:440,h:300,name:'old',color:'black'}},
 };
 const store=TldrawDocumentAdapter.createStoreFromDocument({schemaVersion:1,records});return {store,controller:new BoardCanvasController({store} as any)};
}
test('browser store roundtrips aggregate references and keeps ordinary frames',()=>{
 const {store,controller}=setup();try{const reopened=TldrawDocumentAdapter.createStoreFromDocument(TldrawDocumentAdapter.extractDocument(store));const r=TldrawDocumentAdapter.extractDocument(reopened).records as Record<string,any>;assert.equal(r['shape:frame'].type,'frame');assert.deepEqual([r['shape:agg'].props.rootId,r['shape:agg'].props.memberIds],['shape:order',['shape:line']]);}finally{controller.dispose();}
});
test('local class deletion clears references while aggregate and other classes remain',()=>{
 const {store,controller}=setup();try{store.remove(['shape:order' as any,'shape:line' as any]);const a=store.get('shape:agg' as any) as any;assert.ok(a);assert.equal(a.props.rootId,undefined);assert.deepEqual(a.props.memberIds,[]);}finally{controller.dispose();}
});
test('remote deletion does not silently edit aggregate references',()=>{
 const {store,controller}=setup();try{store.mergeRemoteChanges(()=>store.remove(['shape:order' as any]));const a=store.get('shape:agg' as any) as any;assert.equal(a.props.rootId,'shape:order');}finally{controller.dispose();}
});
test('deleting aggregate leaves classes intact',()=>{
 const {store,controller}=setup();try{store.remove(['shape:agg' as any]);assert.ok(store.get('shape:order' as any));assert.ok(store.get('shape:line' as any));}finally{controller.dispose();}
});
test('class rendering marks an explicitly referenced aggregate root without overwriting role', async () => {
 const React = await import('react'); const { renderToStaticMarkup } = await import('react-dom/server');
 const { EditorContext } = await import('tldraw'); const { UmlClassShapeUtil } = await import('../uml-shapes.js');
 const records = [{typeName:'shape',type:'aggregate-boundary',props:{rootId:'shape:order',memberIds:['shape:line']}}];
 const editor = {store:{allRecords:()=>records}} as any;
 const util = new UmlClassShapeUtil(editor);
 const shape = {id:'shape:order',props:{w:220,h:160,name:'Order',role:'Entity',attributes:[],operations:[]}};
 const html = renderToStaticMarkup(React.createElement(EditorContext.Provider,{value:editor},util.component(shape)));
 assert.match(html,/Aggregate Root/); assert.match(html,/Entity/); assert.match(html,/Order/);
});

test('aggregate boundary has a hollow interior and selectable edge', async () => {
 const { AggregateBoundaryShapeUtil } = await import('../aggregate-shapes.js');
 const geometry = new AggregateBoundaryShapeUtil({} as any).getGeometry({props:{w:440,h:300}} as any);
 assert.equal(geometry.isFilled,false);
 assert.equal(geometry.hitTestPoint({x:220,y:150},5),false);
 assert.equal(geometry.hitTestPoint({x:0,y:150},5),true);
});
