import { applyMapping } from './mapping.js';
import { CanvasOperationError } from '@openboard/shared';

function shapeId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new CanvasOperationError('Aggregate references must be non-empty IDs.');
  const id = value.trim(); return id.startsWith('shape:') ? id : `shape:${id}`;
}
export function aggregateProps(input: Record<string, any>, existing?: Record<string, any>) {
  const props = { ...(existing ?? { w: 440, h: 300, memberIds: [] }) };
  if (input.name !== undefined) {
    if (typeof input.name !== 'string' || !input.name.trim()) throw new CanvasOperationError('Aggregate requires a non-empty name.');
    props.name = input.name.trim();
  }
  if (typeof props.name !== 'string' || !props.name.trim()) throw new CanvasOperationError('Aggregate requires a non-empty name.');
  if (input.rootId !== undefined) {
    if (input.rootId === '') delete props.rootId;
    else props.rootId = shapeId(input.rootId);
  }
  if (input.memberIds !== undefined) {
    if (!Array.isArray(input.memberIds)) throw new CanvasOperationError('memberIds must be an array of IDs.');
    props.memberIds = input.memberIds.map(shapeId);
  }
  for (const key of ['sourceRef', 'syncedCommit']) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'string') throw new CanvasOperationError(`${key} must be a string.`);
      if (input[key] === '') delete props[key];
      else props[key] = input[key];
    }
  }
  for (const key of ['x', 'y', 'w', 'h']) if (input[key] !== undefined) {
    if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || (['w', 'h'].includes(key) && input[key] <= 0)) throw new CanvasOperationError(`Invalid ${key}.`);
    if (key === 'w' || key === 'h') props[key] = input[key];
  }
  applyMapping(input, props);
  return props;
}

export function validateAggregates(records: Iterable<any>, changedIds: ReadonlySet<string>) {
  const byId = new Map<string, any>();
  for (const record of records) byId.set(record.id, record);
  for (const aggregate of byId.values()) {
    if (aggregate.typeName !== 'shape' || aggregate.type !== 'aggregate-boundary') continue;
    const { rootId, memberIds } = aggregate.props;
    const references = [...(rootId ? [rootId] : []), ...memberIds];
    if (!changedIds.has(aggregate.id) && !references.some((id: string) => changedIds.has(id))) continue;
    if (new Set(references).size !== references.length || references.some((id: string) => {
      const target = byId.get(id);
      return target?.type !== 'uml-class' || (target.props.classifierKind ?? 'class') !== 'class';
    })) throw new CanvasOperationError('Aggregate requires distinct UML class references on this board.');
  }
}
