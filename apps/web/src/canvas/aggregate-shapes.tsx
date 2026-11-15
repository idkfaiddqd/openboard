import { BaseBoxShapeUtil, HTMLContainer, Rectangle2d } from 'tldraw';
import { aggregateBoundaryProps } from '@openboard/canvas-schema';

export class AggregateBoundaryShapeUtil extends BaseBoxShapeUtil<any> {
  static override type = 'aggregate-boundary' as const;
  static override props = aggregateBoundaryProps;
  override getDefaultProps() { return { w: 440, h: 300, name: '', memberIds: [] }; }
  override getGeometry(shape: any) { return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: false }); }
  override component(shape: any) {
    return <HTMLContainer style={{ width: shape.props.w, height: shape.props.h, border: '1px dashed black', background: 'transparent', font: '14px sans-serif' }}>
      <div style={{ display: 'inline-block', padding: '4px 8px', borderBottom: '1px solid black', borderRight: '1px solid black', background: 'white' }}>«Aggregate» {shape.props.name}</div>
    </HTMLContainer>;
  }
  override indicator(shape: any) { return <rect width={shape.props.w} height={shape.props.h} />; }
}
