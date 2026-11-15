import { T, createTLSchema, defaultShapeSchemas } from 'tldraw';

/** Stable link to a code element (sourceRef) and the commit the figure was last verified against (syncedCommit). Stored verbatim, never validated server-side. Part of every DDD primitive's props, both in the store schema and in web shape utils. */
const linkProps = {
  sourceRef: T.optional(T.string),
  syncedCommit: T.optional(T.string),
};

export const umlClassProps = {
  w: T.number,
  h: T.number,
  name: T.string,
  attributes: T.arrayOf(T.string),
  operations: T.arrayOf(T.string),
  role: T.optional(T.string),
  classifierKind: T.optional(T.literalEnum('class', 'interface')),
  ...linkProps,
};

export const umlRelationshipProps = {
  kind: T.literalEnum('association', 'generalization', 'dependency', 'aggregation', 'composition', 'realization'),
  from: T.string,
  to: T.string,
  fromMultiplicity: T.optional(T.string),
  toMultiplicity: T.optional(T.string),
  label: T.optional(T.string),
  ...linkProps,
};

export const assemblyDiagramProps = { w: T.number, h: T.number, name: T.string, participants: T.arrayOf(T.object({ id: T.string, name: T.string, x: T.number, y: T.number })), relations: T.arrayOf(T.object({ id: T.string, kind: T.literalEnum('create', 'inject', 'other'), from: T.string, to: T.string, actor: T.optional(T.string), label: T.optional(T.string) })), ...linkProps };
export const sequenceDiagramProps = { w: T.number, h: T.number, name: T.string, participants: T.arrayOf(T.object({ id: T.string, name: T.string })), messages: T.arrayOf(T.object({ id: T.string, from: T.string, to: T.string, label: T.string, kind: T.optional(T.string) })), ...linkProps };
export const aggregateBoundaryProps = { w: T.number, h: T.number, name: T.string, rootId: T.optional(T.string), memberIds: T.arrayOf(T.string), ...linkProps };
export const boundedContextProps = { w: T.number, h: T.number, name: T.string, ...linkProps };
export const contextInteractionProps = { from: T.string, to: T.string, label: T.optional(T.string), ...linkProps };

export function createCanvasSchema() {
  return createTLSchema({
    shapes: {
      ...defaultShapeSchemas,
      'assembly-diagram': { props: assemblyDiagramProps },
      'sequence-diagram': { props: sequenceDiagramProps },
      'aggregate-boundary': { props: aggregateBoundaryProps },
      'bounded-context': { props: boundedContextProps },
      'context-interaction': { props: contextInteractionProps },
      'uml-class': { props: umlClassProps },
      'uml-relationship': { props: umlRelationshipProps },
    },
  });
}

/** Axis-aligned page bounds of a context, shared by rendering and canvas summaries. */
export interface ContextPageBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function contextInteractionPoints(a: ContextPageBounds, b: ContextPageBounds): Array<{ x: number; y: number }> {
  const ac = { x: (a.minX + a.maxX) / 2, y: (a.minY + a.maxY) / 2 };
  const bc = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  const dx = bc.x - ac.x, dy = bc.y - ac.y;
  if (a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY) {
    const outsideX = Math.max(a.maxX, b.maxX) + 40;
    const outsideY = Math.min(a.minY, b.minY) - 40;
    return [{ x: a.maxX, y: ac.y }, { x: outsideX, y: ac.y }, { x: outsideX, y: outsideY }, { x: bc.x, y: outsideY }, { x: bc.x, y: b.minY }];
  }
  const edge = (box: ContextPageBounds, center: { x: number; y: number }, vx: number, vy: number) => {
    const scale = Math.min(vx === 0 ? Infinity : (box.maxX - box.minX) / 2 / Math.abs(vx), vy === 0 ? Infinity : (box.maxY - box.minY) / 2 / Math.abs(vy));
    return { x: center.x + vx * scale, y: center.y + vy * scale };
  };
  return [edge(a, ac, dx, dy), edge(b, bc, -dx, -dy)];
}
