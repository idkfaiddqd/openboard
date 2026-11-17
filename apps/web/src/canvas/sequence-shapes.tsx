import { SvgMappingButton } from './mapping-button.js';
import { BaseBoxShapeUtil } from 'tldraw';
import { sequenceDiagramProps } from '@openboard/canvas-schema';

type Participant = { id: string; name: string };
type Message = { id: string; from: string; to: string; label: string; kind?: string };

export class SequenceDiagramShapeUtil extends BaseBoxShapeUtil<any> {
  static override type = 'sequence-diagram' as const;
  static override props = sequenceDiagramProps;
  override getDefaultProps() { return { w: 520, h: 360, name: '', participants: [], messages: [] }; }
  override component(shape: any) {
    const { w, h, name, participants, messages } = shape.props as { w: number; h: number; name: string; participants: Participant[]; messages: Message[] };
    const lastMessageY = messages.length ? 115 + (messages.length - 1) * 48 : 80;
    const verticalScale = Math.min(1, h / Math.max(100, lastMessageY + 20));
    const lifelineEnd = Math.min(h, Math.max(h - 20 * verticalScale, lastMessageY * verticalScale));
    const margin = Math.min(90, w / (2 * Math.max(1, participants.length)));
    const spacing = participants.length > 1 ? (w - 2 * margin) / (participants.length - 1) : w;
    const participantWidth = Math.min(140, spacing * 0.8);
    const positions = new Map(participants.map((participant, i) => [participant.id, participants.length === 1 ? w / 2 : margin + spacing * i]));
    return <svg className="tl-svg-container" style={{ overflow: 'visible' }}>
      <rect width={w} height={h} fill="white" stroke="black" />
      <text x={12} y={20 * verticalScale} fontSize="14" fontWeight="bold">{name}</text>
      {participants.map((participant) => {
        const x = positions.get(participant.id)!;
        return <g key={participant.id}>
          <rect x={x - participantWidth / 2} y={35 * verticalScale} width={participantWidth} height={36 * verticalScale} fill="white" stroke="black" />
          <text x={x} y={58 * verticalScale} fontSize="14" textAnchor="middle">{participant.name}</text>
          <line x1={x} y1={71 * verticalScale} x2={x} y2={lifelineEnd} stroke="black" strokeDasharray="6 4" />
        </g>;
      })}
      {messages.map((message, i) => {
        const from = positions.get(message.from), to = positions.get(message.to);
        if (from === undefined || to === undefined) return null;
        const y = (115 + i * 48) * verticalScale, direction = Math.sign(to - from);
        return <g key={message.id}>
          <line x1={from} y1={y} x2={to} y2={y} stroke="black" />
          <polyline points={`${to - direction * 10},${y - 5 * verticalScale} ${to},${y} ${to - direction * 10},${y + 5 * verticalScale}`} fill="none" stroke="black" />
          <text x={(from + to) / 2} y={y - 8 * verticalScale} fontSize="14" textAnchor="middle">{message.kind ? `«${message.kind}» ` : ''}{message.label}</text>
        </g>;
      })}
      <SvgMappingButton shape={shape} x={Math.max(0, w - 36)} y={4} />
    </svg>;
  }
  override indicator(shape: any) { return <rect width={shape.props.w} height={shape.props.h} />; }
}
