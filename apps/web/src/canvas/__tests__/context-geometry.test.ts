import test from 'node:test';
import assert from 'node:assert/strict';
import { Mat } from 'tldraw';
import { ContextInteractionShapeUtil } from '../context-shapes.js';

const box = (x:number,y:number,w=360,h=240) => ({ minX:x,minY:y,maxX:x+w,maxY:y+h,w,h,center:{x:x+w/2,y:y+h/2} });
function points(a: ReturnType<typeof box>, b: ReturnType<typeof box>) {
  const util = new ContextInteractionShapeUtil({ getShapePageBounds: (id:string) => id === 'shape:a' ? a : b, getShapePageTransform: () => Mat.Identity() } as any);
  const geometry = util.getGeometry({ x:0,y:0,props:{from:'shape:a',to:'shape:b'} }) as any;
  return geometry.vertices.map((p:any)=>[p.x,p.y]);
}
test('coincident centers route outside both contexts towards the target', () => {
  assert.deepEqual(points(box(10000,10000),box(10000,10000)), [[10360,10120],[10400,10120],[10400,9960],[10180,9960],[10180,10000]]);
});
test('separate contexts retain a direct line from source to target', () => {
  assert.deepEqual(points(box(10000,10000),box(10600,10000)), [[10360,10120],[10600,10120]]);
});
test('touching frames use an exterior route towards the target', () => {
  assert.deepEqual(points(box(10000,10000),box(10360,10000)), [[10360,10120],[10760,10120],[10760,9960],[10540,9960],[10540,10000]]);
});

test('interaction under a transformed parent uses local vertices that map to page endpoints', () => {
  const transform = Mat.Translate(10000, 10000).rotate(Math.PI / 2);
  const util = new ContextInteractionShapeUtil({ getShapePageBounds: (id:string) => id === 'shape:a' ? box(10100,10100) : box(10700,10100), getShapePageTransform: () => transform } as any);
  const geometry = util.getGeometry({ id:'shape:r', x:0, y:0, props:{from:'shape:a',to:'shape:b'} }) as any;
  const page = geometry.vertices.map((p:any) => Mat.applyToPoint(transform, p));
  const expected = [[10460,10220],[10700,10220]];
  page.forEach((p:any,i:number)=>{ assert.ok(Math.abs(p.x-expected[i]![0]!)<0.001); assert.ok(Math.abs(p.y-expected[i]![1]!)<0.001); });
});
test('label sits above the longest segment of an exterior route', () => {
  const area = box(10000,10000);
  const util = new ContextInteractionShapeUtil({ getShapePageBounds: () => area, getShapePageTransform: () => Mat.Identity() } as any);
  const element = util.component({ id:'shape:r', x:0, y:0, props:{from:'shape:a',to:'shape:b',label:'uses'} }) as any;
  const label = element.props.children.find((child:any) => child?.type === 'text');
  assert.ok(label);
  assert.equal(label.props.x, 10290);
  assert.equal(label.props.y, 9952);
  assert.equal(label.props.children, 'uses');
});
test('label is offset to the right of a vertical longest segment', () => {
  const area = box(0,0,100,600);
  const util = new ContextInteractionShapeUtil({ getShapePageBounds: () => area, getShapePageTransform: () => Mat.Identity() } as any);
  const element = util.component({ id:'shape:r', x:0, y:0, props:{from:'shape:a',to:'shape:b',label:'uses'} }) as any;
  const label = element.props.children.find((child:any) => child?.type === 'text');
  assert.ok(label); assert.equal(label.props.x, 148); assert.equal(label.props.y, 130); assert.equal(label.props.textAnchor, 'start');
});
test('label uses page orientation and offset when interaction is rotated', () => {
  const transform = Mat.Translate(1000,1000).rotate(Math.PI / 2);
  const util = new ContextInteractionShapeUtil({ getShapePageBounds: (id:string) => id === 'shape:a' ? box(0,0) : box(600,0), getShapePageTransform: () => transform } as any);
  const element = util.component({ id:'shape:r', x:0, y:0, props:{from:'shape:a',to:'shape:b',label:'uses'} }) as any;
  const label = element.props.children.find((child:any) => child?.type === 'text');
  const page = Mat.applyToPoint(transform, {x:label.props.x,y:label.props.y});
  assert.ok(Math.abs(page.x-480)<0.001); assert.ok(Math.abs(page.y-112)<0.001);
  assert.equal(label.props.textAnchor,'middle'); assert.match(label.props.transform,/^rotate\(-90(?:\.0+)?[ ,]/);
});
test('diagonal page label keeps the same side under a rotated interaction', () => {
  const transform = Mat.Translate(1000,1000).rotate(0.5);
  const util = new ContextInteractionShapeUtil({ getShapePageBounds: (id:string) => id === 'shape:a' ? box(0,0,100,100) : box(300,300,100,100), getShapePageTransform: () => transform } as any);
  const element = util.component({ id:'shape:r', x:0, y:0, props:{from:'shape:a',to:'shape:b',label:'uses'} }) as any;
  const label = element.props.children.find((child:any) => child?.type === 'text');
  const page = Mat.applyToPoint(transform, {x:label.props.x,y:label.props.y});
  assert.ok(Math.abs(page.x-200)<0.001); assert.ok(Math.abs(page.y-192)<0.001);
  assert.equal(label.props.textAnchor,'middle');
});
