import { CanvasOperationError } from '@openboard/shared';

const kinds = new Set(['association', 'generalization', 'dependency', 'aggregation', 'composition', 'realization']);
const strings = ['name', 'role', 'kind', 'from', 'to', 'fromMultiplicity', 'toMultiplicity', 'label', 'sourceRef', 'syncedCommit'];
const lists = ['attributes', 'operations'];
const clearable = ['role', 'fromMultiplicity', 'toMultiplicity', 'label', 'sourceRef', 'syncedCommit'];

export function umlProps(type: string, input: Record<string, any>, existing?: Record<string, any>) {
  const props = { ...(existing ?? (type === 'uml-class' ? { w: 220, h: 160 } : {})) };
  for (const key of strings) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'string') throw new CanvasOperationError(`${key} must be a string.`);
      if (clearable.includes(key) && input[key] === '') delete props[key];
      else props[key] = input[key];
    }
  }
  for (const key of lists) {
    if (input[key] !== undefined) {
      if (!Array.isArray(input[key]) || !input[key].every((v: unknown) => typeof v === 'string')) throw new CanvasOperationError(`${key} must be an array of strings.`);
      props[key] = input[key];
    }
  }
  for (const key of ['x', 'y', 'w', 'h']) {
    if (input[key] !== undefined && (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || (['w', 'h'].includes(key) && input[key] <= 0))) throw new CanvasOperationError(`Invalid ${key}.`);
    if (['w', 'h'].includes(key) && input[key] !== undefined && type === 'uml-class') props[key] = input[key];
  }
  if (type === 'uml-class') {
    if (input.classifierKind !== undefined) {
      if (input.classifierKind !== 'class' && input.classifierKind !== 'interface') throw new CanvasOperationError('Invalid classifierKind.');
      props.classifierKind = input.classifierKind;
    } else if (!existing) props.classifierKind = 'class';
    if (typeof props.name !== 'string' || !Array.isArray(props.attributes) || !Array.isArray(props.operations)) throw new CanvasOperationError('UML class requires name, attributes and operations.');
  } else {
    if (!kinds.has(props.kind) || !props.from?.trim() || !props.to?.trim()) throw new CanvasOperationError('UML relationship requires a valid kind and endpoints.');
    for (const key of ['from', 'to']) props[key] = props[key].trim().startsWith('shape:') ? props[key].trim() : `shape:${props[key].trim()}`;
  }
  return props;
}

/** Validates semantic realization endpoints against the final state of a batch. */
export function validateRealizations(records: Iterable<any>, changedIds: ReadonlySet<string>) {
  const byId = new Map<string, any>();
  for (const record of records) byId.set(record.id, record);
  for (const relation of byId.values()) {
    if (relation.typeName !== 'shape' || relation.type !== 'uml-relationship' || relation.props.kind !== 'realization') continue;
    if (!changedIds.has(relation.id) && !changedIds.has(relation.props.from) && !changedIds.has(relation.props.to)) continue;
    const from = byId.get(relation.props.from);
    const to = byId.get(relation.props.to);
    if (from?.type !== 'uml-class' || (from.props.classifierKind ?? 'class') !== 'class' ||
        to?.type !== 'uml-class' || (to.props.classifierKind ?? 'class') !== 'interface') {
      throw new CanvasOperationError('Realization requires a class source and an interface target on this board.');
    }
  }
}
