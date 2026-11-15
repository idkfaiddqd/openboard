import { CanvasOperationError } from '@openboard/shared';

function nonempty(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new CanvasOperationError(`${field} must be a non-empty string.`);
  return value.trim();
}
export function assemblyProps(input: Record<string, any>, existing?: Record<string, any>) {
  const props = { ...(existing ?? { w: 600, h: 400, participants: [], relations: [] }) };
  if (input.name !== undefined) props.name = nonempty(input.name, 'name');
  if (!props.name) throw new CanvasOperationError('Assembly requires a name.');
  for (const key of ['x', 'y', 'w', 'h']) if (input[key] !== undefined) {
    if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || (['w', 'h'].includes(key) && input[key] < 1)) throw new CanvasOperationError(`Invalid ${key}.`);
    if (key === 'w' || key === 'h') props[key] = input[key];
  }
  if (input.participants !== undefined) {
    if (!Array.isArray(input.participants)) throw new CanvasOperationError('participants must be an array.');
    props.participants = input.participants.map((p: any) => {
      if (!p || typeof p !== 'object' || Array.isArray(p) || typeof p.x !== 'number' || !Number.isFinite(p.x) || typeof p.y !== 'number' || !Number.isFinite(p.y)) throw new CanvasOperationError('Invalid participant.');
      return { id: nonempty(p.id, 'participant id'), name: nonempty(p.name, 'participant name'), x: p.x, y: p.y };
    });
  }
  if (input.relations !== undefined) {
    if (!Array.isArray(input.relations)) throw new CanvasOperationError('relations must be an array.');
    props.relations = input.relations.map((r: any) => {
      if (!r || typeof r !== 'object' || Array.isArray(r) || !['create', 'inject', 'other'].includes(r.kind)) throw new CanvasOperationError('Invalid relation.');
      if (r.kind !== 'inject' && r.actor !== undefined) throw new CanvasOperationError('actor is only valid for inject.');
      const relation: Record<string, string> = { id: nonempty(r.id, 'relation id'), kind: r.kind, from: nonempty(r.from, 'from'), to: nonempty(r.to, 'to') };
      if (r.kind === 'other') relation.label = nonempty(r.label, 'label');
      else if (r.label !== undefined) { if (typeof r.label !== 'string') throw new CanvasOperationError('Invalid label.'); relation.label = r.label; }
      if (r.kind === 'inject' && r.actor !== undefined) { if (typeof r.actor !== 'string') throw new CanvasOperationError('Invalid actor.'); if (r.actor.trim()) relation.actor = r.actor.trim(); }
      return relation;
    });
  }
  for (const key of ['sourceRef', 'syncedCommit']) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'string') throw new CanvasOperationError(`${key} must be a string.`);
      if (input[key] === '') delete props[key];
      else props[key] = input[key];
    }
  }
  return props;
}
export function validateAssemblies(records: Iterable<any>, changedIds: ReadonlySet<string>) {
  const byId = new Map<string, any>(); for (const record of records) byId.set(record.id, record);
  for (const shape of byId.values()) {
    if (shape.typeName !== 'shape' || shape.type !== 'assembly-diagram' || !changedIds.has(shape.id)) continue;
    const ids = new Set<string>(); const relations = new Set<string>();
    for (const p of shape.props.participants) { if (ids.has(p.id)) throw new CanvasOperationError('Duplicate participant ID.'); ids.add(p.id); }
    for (const r of shape.props.relations) {
      if (relations.has(r.id) || !ids.has(r.from) || !ids.has(r.to) || (r.actor !== undefined && !ids.has(r.actor))) throw new CanvasOperationError('Invalid assembly relation.');
      relations.add(r.id);
    }
  }
}
