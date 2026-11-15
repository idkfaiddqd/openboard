import { BaseBoxShapeUtil, SVGContainer, getIndices, type TLHandle, type TLHandleDragInfo } from 'tldraw';
import { assemblyDiagramProps } from '@openboard/canvas-schema';

type Participant = { id: string; name: string; x: number; y: number };
type Relation = { id: string; kind: 'create' | 'inject' | 'other'; from: string; to: string; actor?: string; label?: string };
export class AssemblyDiagramShapeUtil extends BaseBoxShapeUtil<any> {
  static override type = 'assembly-diagram' as const;
  static override props = assemblyDiagramProps;
  override getDefaultProps() { return { w: 600, h: 400, name: '', participants: [], relations: [] }; }
  override getHandles(shape: any): TLHandle[] {
    const { w, h, participants } = shape.props as { w: number; h: number; participants: Participant[] };
    const indices = getIndices(participants.length);
    return participants.map((participant, index) => ({
      id: participant.id, index: indices[index]!, type: 'vertex',
      x: (participant.x + 60) * w / 600, y: (participant.y + 20) * h / 400,
    }));
  }
  override onHandleDrag(shape: any, { handle }: TLHandleDragInfo<any>) {
    const { w, h, participants } = shape.props as { w: number; h: number; participants: Participant[] };
    return { id: shape.id, type: shape.type, props: {
      participants: participants.map(p => p.id === handle.id
        ? { ...p, x: handle.x * 600 / w - 60, y: handle.y * 400 / h - 20 }
        : p),
    } };
  }
  override component(shape: any) {
    const { w, h, name, participants, relations } = shape.props as { w: number; h: number; name: string; participants: Participant[]; relations: Relation[] };
    const byId = new Map(participants.map(p => [p.id, p]));
    return <SVGContainer style={{ overflow: 'visible' }}>
      <rect width={w} height={h} fill="white" stroke="black" />
      <g transform={`scale(${w / 600} ${h / 400})`}>
        {[<text key="title" x={12} y={20} fontSize="14" fontWeight="bold">{name}</text>,
        ...relations.map(r => {
          const from = byId.get(r.from), to = byId.get(r.to);
          if (!from || !to) return null;
          const x1 = from.x + 60, y1 = from.y + 20, x2 = to.x + 60, y2 = to.y + 20;
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const dx = x2 - x1, dy = y2 - y1;
          const offset = Math.min(dx ? 60 / Math.abs(dx) : Infinity, dy ? 20 / Math.abs(dy) : Infinity);
          const tipX = Number.isFinite(offset) ? x2 - dx * offset : x2, tipY = Number.isFinite(offset) ? y2 - dy * offset : y2;
          const label = r.kind === 'create' ? `создаёт${r.label ? `: ${r.label}` : ''}` : r.kind === 'inject' ? `передаёт: ${r.actor ? byId.get(r.actor)?.name : 'передающий не указан'}${r.label ? ` — ${r.label}` : ''}` : r.label;
          return <g key={r.id}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="black" /><polyline points={`${tipX - 10 * Math.cos(angle - 0.45)},${tipY - 10 * Math.sin(angle - 0.45)} ${tipX},${tipY} ${tipX - 10 * Math.cos(angle + 0.45)},${tipY - 10 * Math.sin(angle + 0.45)}`} fill="none" stroke="black" /><text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} fontSize="14" textAnchor="middle">{label}</text></g>;
        }),
        ...participants.map(p => <g key={p.id}><rect x={p.x} y={p.y} width={120} height={40} fill="white" stroke="black" /><text x={p.x + 60} y={p.y + 25} fontSize="14" textAnchor="middle">{p.name}</text></g>)]}
      </g>
    </SVGContainer>;
  }
  override indicator(shape: any) { return <rect width={shape.props.w} height={shape.props.h} />; }
}
