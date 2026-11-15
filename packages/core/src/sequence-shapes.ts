import { CanvasOperationError } from '@openboard/shared';

function nonempty(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new CanvasOperationError(`${field} must be a non-empty string.`);
  return value.trim();
}
export function sequenceProps(input: Record<string, any>, existing?: Record<string, any>) {
  const props = { ...(existing ?? { w: 520, h: 360 }) };
  if (input.name !== undefined) props.name = nonempty(input.name, 'name');
  if (typeof props.name !== 'string' || !props.name.trim()) throw new CanvasOperationError('Sequence requires a name.');
  if (input.participants !== undefined) {
    if (!Array.isArray(input.participants)) throw new CanvasOperationError('participants must be an array.');
    props.participants = input.participants.map((item: any) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new CanvasOperationError('Invalid participant.');
      return { id: nonempty(item.id, 'participant id'), name: nonempty(item.name, 'participant name') };
    });
  }
  if (input.messages !== undefined) {
    if (!Array.isArray(input.messages)) throw new CanvasOperationError('messages must be an array.');
    props.messages = input.messages.map((item: any) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new CanvasOperationError('Invalid message.');
      const message: Record<string, string> = { id: nonempty(item.id, 'message id'), from: nonempty(item.from, 'from'), to: nonempty(item.to, 'to'), label: nonempty(item.label, 'label') };
      if (item.kind !== undefined) {
        if (typeof item.kind !== 'string') throw new CanvasOperationError('kind must be a string.');
        if (item.kind !== '') message.kind = item.kind;
      }
      return message;
    });
  }
  if (!Array.isArray(props.participants) || !Array.isArray(props.messages)) throw new CanvasOperationError('Sequence requires participants and messages arrays.');
  for (const key of ['sourceRef', 'syncedCommit']) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'string') throw new CanvasOperationError(`${key} must be a string.`);
      if (input[key] === '') delete props[key];
      else props[key] = input[key];
    }
  }
  for (const key of ['x','y','w','h']) if (input[key] !== undefined) {
    if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || (['w','h'].includes(key) && input[key] < 1)) throw new CanvasOperationError(`Invalid ${key}.`);
    if (key === 'w' || key === 'h') props[key] = input[key];
  }
  return props;
}

export function validateSequences(records: Iterable<any>, changedIds: ReadonlySet<string>) {
  const byId = new Map<string, any>(); for (const record of records) byId.set(record.id, record);
  for (const sequence of byId.values()) {
    if (sequence.typeName !== 'shape' || sequence.type !== 'sequence-diagram' || !changedIds.has(sequence.id)) continue;
    const { participants, messages } = sequence.props;
    const participantsIds = new Set<string>(); const messageIds = new Set<string>();
    for (const participant of participants) {
      if (participantsIds.has(participant.id)) throw new CanvasOperationError('Duplicate participant ID.');
      participantsIds.add(participant.id);
    }
    for (const message of messages) {
      if (messageIds.has(message.id) || !participantsIds.has(message.from) || !participantsIds.has(message.to) || message.from === message.to) throw new CanvasOperationError('Invalid sequence message.');
      messageIds.add(message.id);
    }
  }
}
