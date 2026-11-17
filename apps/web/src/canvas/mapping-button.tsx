import { createContext, useContext } from 'react';
import type { CSSProperties } from 'react';
import { IconMapping } from '../components/icons/Icons.js';

export const mappingPanelId = 'ddd-mapping-panel';
export const MappingSelectionContext = createContext<{
  selectedId: string | null;
  toggle: (id: string, button: HTMLButtonElement) => void;
} | null>(null);

type MappingSubject = { id: string; props: { name?: string; label?: string } };

export function MappingButton({ shape, style }: { shape: MappingSubject; style?: CSSProperties }) {
  const selection = useContext(MappingSelectionContext);
  return <button
    type="button"
    className="ddd-mapping-button"
    style={style}
    aria-label={`Отобразить маппинг ${shape.props.name || shape.props.label || shape.id}`}
    title="Отобразить маппинг"
    aria-controls={mappingPanelId}
    aria-expanded={selection?.selectedId === shape.id}
    onPointerDown={(event) => event.stopPropagation()}
    onPointerUp={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => { if (event.key !== 'Escape') event.stopPropagation(); }}
    onKeyUp={(event) => event.stopPropagation()}
    onClick={(event) => { event.stopPropagation(); selection?.toggle(shape.id, event.currentTarget); }}
  ><IconMapping size={16} aria-hidden="true" /></button>;
}

export function SvgMappingButton({ shape, x, y }: { shape: MappingSubject; x: number; y: number }) {
  return <foreignObject x={x} y={y} width={32} height={32} className="ddd-mapping-control">
    <MappingButton shape={shape} style={{ position: 'static' }} />
  </foreignObject>;
}

/** Half the visible route's length, with space below the line for the control. */
export function mappingRoutePosition(points: readonly { x: number; y: number }[]) {
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index]!;
    if (remaining <= length) {
      const a = points[index]!, b = points[index + 1]!;
      const ratio = length ? remaining / length : 0;
      return { x: a.x + (b.x - a.x) * ratio - 16, y: a.y + (b.y - a.y) * ratio + 14 };
    }
    remaining -= length;
  }
  return { x: 0, y: 14 };
}
