import { BaseBoxShapeUtil, ShapeUtil, Polyline2d, Vec, Mat, HTMLContainer, SVGContainer } from 'tldraw';
import { boundedContextProps, contextInteractionProps, contextInteractionPoints } from '@openboard/canvas-schema';

export class BoundedContextShapeUtil extends BaseBoxShapeUtil<any> {
  static override type = 'bounded-context' as const;
  static override props = boundedContextProps;
  override getDefaultProps() { return { w: 360, h: 240, name: '' }; }
  override component(shape: any) {
    return <HTMLContainer style={{ width: shape.props.w, height: shape.props.h, border: '1px solid black', background: 'transparent', font: '14px sans-serif' }}>
      <div style={{ display: 'inline-block', padding: '4px 8px', borderBottom: '1px solid black', borderRight: '1px solid black', background: 'white' }}>
        «bounded context» {shape.props.name}
      </div>
    </HTMLContainer>;
  }
  override indicator(shape: any) { return <rect width={shape.props.w} height={shape.props.h} />; }
}

export class ContextInteractionShapeUtil extends ShapeUtil<any> {
  static override type = 'context-interaction' as const;
  static override props = contextInteractionProps;
  override getDefaultProps() { return { from: '', to: '' }; }
  private points(shape: any): Vec[] {
    const a = this.editor.getShapePageBounds(shape.props.from);
    const b = this.editor.getShapePageBounds(shape.props.to);
    if (!a || !b) return [new Vec(0, 0), new Vec(1, 0)];
    const pageToLocal = Mat.Inverse(this.editor.getShapePageTransform(shape));
    return contextInteractionPoints(a, b).map((point) => Mat.applyToPoint(pageToLocal, point));
  }
  override getGeometry(shape: any) { return new Polyline2d({ points: this.points(shape) }); }
  override component(shape: any) {
    const points = this.points(shape); const b = points[points.length - 1]!, previous = points[points.length - 2]!;
    const dx = b.x - previous.x, dy = b.y - previous.y;
    const length = Math.hypot(dx, dy) || 1, ux = dx / length, uy = dy / length;
    const x = b!.x - ux * 12, y = b!.y - uy * 12;
    const localToPage = this.editor.getShapePageTransform(shape);
    const sourceBounds = this.editor.getShapePageBounds(shape.props.from);
    const targetBounds = this.editor.getShapePageBounds(shape.props.to);
    const pagePoints = sourceBounds && targetBounds
      ? contextInteractionPoints(sourceBounds, targetBounds)
      : points.map((point) => Mat.applyToPoint(localToPage, point));
    let labelStart = pagePoints[0]!, labelEnd = pagePoints[1]!, longest = -1;
    for (let i = 1; i < pagePoints.length; i++) {
      const start = pagePoints[i - 1]!, end = pagePoints[i]!;
      const distance = Math.hypot(end.x - start.x, end.y - start.y);
      if (distance > longest) { longest = distance; labelStart = start; labelEnd = end; }
    }
    const verticalLabel = Math.abs(labelEnd.y - labelStart.y) > Math.abs(labelEnd.x - labelStart.x);
    const labelPage = { x: (labelStart.x + labelEnd.x) / 2 + (verticalLabel ? 8 : 0), y: (labelStart.y + labelEnd.y) / 2 - (verticalLabel ? 0 : 8) };
    const labelLocal = Mat.applyToPoint(Mat.Inverse(localToPage), labelPage);
    const labelRotation = -Mat.Rotation(localToPage) * 180 / Math.PI;
    return <SVGContainer style={{ overflow: 'visible', pointerEvents: 'none' }}>
      <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="black" />
      <polyline points={`${x - uy * 6},${y + ux * 6} ${b!.x},${b!.y} ${x + uy * 6},${y - ux * 6}`} fill="none" stroke="black" />
      {shape.props.label && <text x={labelLocal.x} y={labelLocal.y} fontSize="14" textAnchor={verticalLabel ? 'start' : 'middle'} transform={`rotate(${labelRotation} ${labelLocal.x} ${labelLocal.y})`}>{shape.props.label}</text>}
    </SVGContainer>;
  }
  override indicator(shape: any) { return <polyline points={this.points(shape).map((p) => `${p.x},${p.y}`).join(' ')} fill="none" />; }
}
export const contextShapeUtils = [BoundedContextShapeUtil, ContextInteractionShapeUtil];
