import { useLayoutEffect, useRef } from 'react';
import { BaseBoxShapeUtil, ShapeUtil, Polyline2d, Vec, HTMLContainer, SVGContainer, useEditor, useValue, type TLShapeId } from 'tldraw';
import { umlClassProps, umlRelationshipProps } from '@openboard/canvas-schema';

function UmlClassContent({ shape }: { shape: any }) {
  const editor = useEditor();
  const contentRef = useRef<HTMLDivElement>(null);
  const aggregateRoot = useValue('aggregate root', () => editor.store.allRecords().some((record: any) => record.typeName === 'shape' && record.type === 'aggregate-boundary' && record.props.rootId === shape.id), [editor, shape.id]);
  const { w, h, name, attributes, operations, role, classifierKind } = shape.props;

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const fitContent = () => {
      const current = editor.getShape(shape.id) as any;
      if (!current || current.type !== 'uml-class') return;
      const container = content.parentElement;
      if (!container) return;
      // scrollWidth/clientWidth are rounded; compare them before adjusting so a
      // fitting shape with fractional geometry is not rounded up on every load.
      const overflowX = Math.max(0, content.scrollWidth - content.clientWidth);
      const overflowY = Math.max(0, content.scrollHeight - container.clientHeight);
      const width = current.props.w + (overflowX > 0 ? overflowX + 1 : 0);
      const height = current.props.h + (overflowY > 0 ? overflowY + 1 : 0);
      if (overflowX > 0 || overflowY > 0) {
        editor.updateShape({ id: current.id, type: 'uml-class', props: { w: width, h: height } } as any);
      }
    };
    fitContent();
    const observer = new ResizeObserver(fitContent);
    observer.observe(content);
    return () => observer.disconnect();
  }, [editor, shape.id, shape.props]);

  return <HTMLContainer style={{ width: w, height: h, background: 'white', border: '1px solid black', overflow: 'hidden', font: '14px sans-serif' }}>
    <div ref={contentRef}>
      <div style={{ textAlign: 'center', padding: 4 }}>{classifierKind === 'interface' && <div>«interface»</div>}{aggregateRoot && role !== 'Aggregate Root' && <div>«Aggregate Root»</div>}{role && <div>«{role}»</div>}<strong>{name}</strong></div>
      <div style={{ borderTop: '1px solid black', padding: 4 }}>{attributes.map((v: string, i: number) => <div key={i}>{v}</div>)}</div>
      <div style={{ borderTop: '1px solid black', padding: 4 }}>{operations.map((v: string, i: number) => <div key={i}>{v}</div>)}</div>
    </div>
  </HTMLContainer>;
}

export class UmlClassShapeUtil extends BaseBoxShapeUtil<any> {
  static override type = 'uml-class' as const;
  static override props = umlClassProps;
  override getDefaultProps() { return { w: 220, h: 160, name: '', attributes: [], operations: [] }; }
  override component(shape: any) { return <UmlClassContent shape={shape} />; }
  override indicator(shape: any) { return <rect width={shape.props.w} height={shape.props.h} />; }
}

export class UmlRelationshipShapeUtil extends ShapeUtil<any> {
  static override type = 'uml-relationship' as const;
  static override props = umlRelationshipProps;
  override getDefaultProps() { return { kind: 'association', from: '', to: '' }; }
  private points(shape: any): Vec[] {
    const a = this.editor.getShapePageBounds(shape.props.from);
    const b = this.editor.getShapePageBounds(shape.props.to);
    if (!a || !b) return [new Vec(0, 0), new Vec(1, 0)];
    const relative = (x: number, y: number) => new Vec(x - shape.x, y - shape.y);
    if (shape.props.from === shape.props.to) {
      return [relative(a.maxX, a.center.y), relative(a.maxX + 45, a.center.y), relative(a.maxX + 45, a.minY - 45), relative(a.center.x, a.minY - 45), relative(a.center.x, a.minY)];
    }
    const dx = b.center.x - a.center.x;
    const dy = b.center.y - a.center.y;
    const edge = (box: typeof a, vx: number, vy: number) => {
      const scale = Math.min(vx === 0 ? Infinity : box.w / 2 / Math.abs(vx), vy === 0 ? Infinity : box.h / 2 / Math.abs(vy));
      return relative(box.center.x + vx * (Number.isFinite(scale) ? scale : 0), box.center.y + vy * (Number.isFinite(scale) ? scale : 0));
    };
    return [edge(a, dx, dy), edge(b, -dx, -dy)];
  }
  override getGeometry(shape: any) { return new Polyline2d({ points: this.points(shape) }); }
  override component(shape: any) {
    const points = this.points(shape);
    const start = points[0]!;
    const end = points[points.length - 1]!;
    const marker = (tip: Vec, toward: Vec, kind: string) => {
      const dx = toward.x - tip.x, dy = toward.y - tip.y;
      const length = Math.hypot(dx, dy) || 1;
      const ux = dx / length, uy = dy / length, px = -uy, py = ux;
      const point = (along: number, side: number) => `${tip.x + ux * along + px * side},${tip.y + uy * along + py * side}`;
      if (kind === 'dependency') return <polyline points={`${point(12, -6)} ${point(0, 0)} ${point(12, 6)}`} fill="none" stroke="black" />;
      if (kind === 'generalization' || kind === 'realization') return <polygon points={`${point(0, 0)} ${point(16, -7)} ${point(16, 7)}`} fill="white" stroke="black" />;
      return <polygon points={`${point(0, 0)} ${point(9, -6)} ${point(18, 0)} ${point(9, 6)}`} fill={kind === 'composition' ? 'black' : 'white'} stroke="black" />;
    };
    const multiplicityPosition = (point: Vec, classId: string) => {
      const bounds = this.editor.getShapePageBounds(classId as TLShapeId);
      if (!bounds) return { x: point.x + 8, y: point.y - 8, textAnchor: 'start' as const };
      const x = point.x + shape.x;
      const y = point.y + shape.y;
      const distances = [Math.abs(x - bounds.minX), Math.abs(x - bounds.maxX), Math.abs(y - bounds.minY), Math.abs(y - bounds.maxY)];
      const side = distances.indexOf(Math.min(...distances));
      if (side === 0) return { x: point.x - 8, y: point.y - 8, textAnchor: 'end' as const };
      if (side === 1) return { x: point.x + 8, y: point.y - 8, textAnchor: 'start' as const };
      if (side === 2) return { x: point.x, y: point.y - 8, textAnchor: 'middle' as const };
      return { x: point.x, y: point.y + 18, textAnchor: 'middle' as const };
    };
    const { kind, fromMultiplicity, toMultiplicity, label } = shape.props;
    const middle = points[Math.floor((points.length - 1) / 2)]!;
    const next = points[Math.ceil((points.length - 1) / 2)]!;
    return <SVGContainer style={{ overflow: 'visible', pointerEvents: 'none' }}>
      <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="black" strokeDasharray={(kind === 'dependency' || kind === 'realization') ? '6 4' : undefined} />
      {(kind === 'aggregation' || kind === 'composition') && marker(start, points[1]!, kind)}
      {(kind === 'generalization' || kind === 'dependency' || kind === 'realization') && marker(end, points[points.length - 2]!, kind)}
      {fromMultiplicity && <text {...multiplicityPosition(start, shape.props.from)} fontSize="14">{fromMultiplicity}</text>}
      {toMultiplicity && <text {...multiplicityPosition(end, shape.props.to)} fontSize="14">{toMultiplicity}</text>}
      {label && <text x={(middle.x + next.x) / 2} y={(middle.y + next.y) / 2 - 8} fontSize="14" textAnchor="middle">{label}</text>}
    </SVGContainer>;
  }
  override indicator(shape: any) { return <polyline points={this.points(shape).map((p) => `${p.x},${p.y}`).join(' ')} fill="none" />; }
}

export const umlShapeUtils = [UmlClassShapeUtil, UmlRelationshipShapeUtil];
