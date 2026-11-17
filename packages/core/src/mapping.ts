import { dddMappingValidator } from '@openboard/canvas-schema';
import { CanvasOperationError } from '@openboard/shared';

export const dddShapeTypes: ReadonlySet<string> = new Set([
  'uml-class', 'uml-relationship', 'bounded-context', 'context-interaction',
  'aggregate-boundary', 'sequence-diagram', 'assembly-diagram',
]);

export function rejectOrdinaryMapping(type: string, input: { mapping?: unknown }) {
  if (!dddShapeTypes.has(type) && Object.hasOwn(input, 'mapping')) {
    throw new CanvasOperationError('mapping is only supported on DDD shapes.');
  }
}

/** Omission preserves; an object replaces in full; null removes the persisted property. */
export function applyMapping(input: { mapping?: unknown }, props: Record<string, unknown>) {
  if (input.mapping === undefined) return;
  if (input.mapping === null) {
    delete props.mapping;
    return;
  }
  try {
    props.mapping = dddMappingValidator.validate(input.mapping);
  } catch (error) {
    throw new CanvasOperationError(`Invalid mapping: ${error instanceof Error ? error.message : String(error)}`);
  }
}
