import { applyMapping } from './mapping.js';
import { CanvasOperationError } from '@openboard/shared';

export function contextProps(type: string, input: Record<string, any>, existing?: Record<string, any>) {
  const props = { ...(existing ?? (type === 'bounded-context' ? { w: 360, h: 240 } : {})) };
  if (type === 'bounded-context') {
    if (input.name !== undefined) {
      if (typeof input.name !== 'string' || !input.name.trim()) throw new CanvasOperationError('Context requires a non-empty name.');
      props.name = input.name.trim();
    }
    if (typeof props.name !== 'string' || !props.name.trim()) throw new CanvasOperationError('Context requires a non-empty name.');
    for (const key of ['w', 'h']) if (input[key] !== undefined) {
      if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || input[key] <= 0) throw new CanvasOperationError(`Invalid ${key}.`);
      props[key] = input[key];
    }
  } else {
    for (const key of ['from', 'to']) if (input[key] !== undefined) {
      if (typeof input[key] !== 'string' || !input[key].trim()) throw new CanvasOperationError(`Invalid ${key}.`);
      const value = input[key].trim(); props[key] = value.startsWith('shape:') ? value : `shape:${value}`;
    }
    if (!props.from || !props.to) throw new CanvasOperationError('Context interaction requires both endpoints.');
    if (input.label !== undefined) {
      if (typeof input.label !== 'string') throw new CanvasOperationError('label must be a string.');
      if (input.label === '') delete props.label; else props.label = input.label;
    }
  }
  for (const key of ['sourceRef', 'syncedCommit']) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'string') throw new CanvasOperationError(`${key} must be a string.`);
      if (input[key] === '') delete props[key];
      else props[key] = input[key];
    }
  }
  for (const key of ['x', 'y']) if (input[key] !== undefined && (typeof input[key] !== 'number' || !Number.isFinite(input[key]))) throw new CanvasOperationError(`Invalid ${key}.`);
  applyMapping(input, props);
  return props;
}

export function validateContextInteractions(records: Iterable<any>, changedIds: ReadonlySet<string>) {
  const byId = new Map<string, any>();
  for (const record of records) byId.set(record.id, record);
  for (const relation of byId.values()) {
    if (relation.typeName !== 'shape' || relation.type !== 'context-interaction') continue;
    const { from, to } = relation.props;
    if (!changedIds.has(relation.id) && !changedIds.has(from) && !changedIds.has(to)) continue;
    if (from === to || byId.get(from)?.type !== 'bounded-context' || byId.get(to)?.type !== 'bounded-context') {
      throw new CanvasOperationError('Context interaction requires two distinct contexts on this board.');
    }
  }
}
