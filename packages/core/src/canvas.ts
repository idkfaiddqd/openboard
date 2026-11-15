import { assemblyProps, validateAssemblies } from './assembly-shapes.js';
import { umlProps, validateRealizations } from './uml.js';
import { contextProps, validateContextInteractions } from './context-shapes.js';
import { aggregateProps, validateAggregates } from './aggregate-shapes.js';
import { sequenceProps, validateSequences } from './sequence-shapes.js';
import { createCanvasSchema, contextInteractionPoints } from '@openboard/canvas-schema';
import {
  createTLStore,
  Mat,
  defaultShapeUtils,
  createShapeId,
  getIndexAbove,
  type IndexKey,
  toRichText,
  type TLStore,
  type TLRecord,
  type TLShapeId,
} from 'tldraw';
import type {
  BoardDocument,
  BoardId,
  CanvasBounds,
  CanvasElementSummary,
  CanvasState,
  CreateShapeInput,
  CreateShapesResult,
  DeleteShapesResult,
  UpdateShapeInput,
  UpdateShapesResult,
} from '@openboard/shared';
import { CanvasOperationError, BoardValidationError } from '@openboard/shared';
import type { BoardService } from './service.js';
import type { BoardEventBus } from './events.js';

// Cache shape utilities by type for fast instantiation
const shapeUtilsByType = new Map<string, any>();
for (const util of defaultShapeUtils) {
  try {
    shapeUtilsByType.set(util.type, new (util as any)({}));
  } catch {
    // fallback if no-args constructor
    shapeUtilsByType.set(util.type, new (util as any)());
  }
}

/**
 * Extracts plain text string from tldraw's richText ProseMirror document structure.
 */
export function extractTextFromRichText(richText: unknown): string {
  if (!richText || typeof richText !== 'object') return '';
  const candidate = richText as { content?: unknown[] };
  if (!Array.isArray(candidate.content)) return '';

  const paragraphs: string[] = [];
  for (const block of candidate.content) {
    if (block && typeof block === 'object') {
      const b = block as { content?: unknown[] };
      if (Array.isArray(b.content)) {
        const textParts: string[] = [];
        for (const inline of b.content) {
          if (
            inline &&
            typeof inline === 'object' &&
            typeof (inline as { text?: unknown }).text === 'string'
          ) {
            textParts.push((inline as { text: string }).text);
          }
        }
        paragraphs.push(textParts.join(''));
      } else {
        paragraphs.push('');
      }
    }
  }
  return paragraphs.join('\n');
}

/**
 * Normalizes an arbitrary ID into a valid tldraw Shape ID (`shape:xxx`).
 */
export function normalizeShapeId(id?: string): TLShapeId {
  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    return createShapeId();
  }
  const clean = id.trim();
  return (clean.startsWith('shape:') ? clean : `shape:${clean}`) as TLShapeId;
}

/**
 * Headless document adapter for manipulating whiteboard documents outside the browser.
 */
export class HeadlessCanvasEngine {
  /**
   * Initializes a headless TLStore populated with the given document records.
   */
  static createStore(document: BoardDocument): TLStore {
    const store = createTLStore({ schema: createCanvasSchema() });
    const records: Record<string, unknown> = { ...(document.records || {}) };

    // Ensure baseline document and page exist
    if (!records['document:document']) {
      records['document:document'] = {
        typeName: 'document',
        id: 'document:document',
        gridSize: 10,
        name: '',
        meta: {},
      };
    }

    if (!records['page:page']) {
      records['page:page'] = {
        typeName: 'page',
        id: 'page:page',
        name: 'Page 1',
        index: 'a1',
        meta: {},
      };
    }

    // Ensure all records have valid types, meta, and required tldraw fields
    for (const [key, rawRec] of Object.entries(records)) {
      if (rawRec && typeof rawRec === 'object') {
        const rec: Record<string, any> = { ...(rawRec as Record<string, any>) };
        if (!rec['meta'] || typeof rec['meta'] !== 'object') {
          rec['meta'] = {};
        }

        if (rec['typeName'] === 'shape') {
          if (typeof rec['rotation'] !== 'number') rec['rotation'] = 0;
          if (typeof rec['isLocked'] !== 'boolean') rec['isLocked'] = false;
          if (typeof rec['opacity'] !== 'number') rec['opacity'] = 1;
          if (!rec['parentId']) rec['parentId'] = 'page:page';
          if (!rec['index']) rec['index'] = 'a1';
          const type = rec['type'] || 'geo';
          const util = shapeUtilsByType.get(type);
          const defaultProps = util ? util.getDefaultProps() : {};
          const props = { ...defaultProps, ...(rec['props'] || {}) };
          if (props.text !== undefined && (type === 'geo' || type === 'text' || type === 'note')) {
            props.richText = toRichText(props.text);
            delete props.text;
          }
          if (type === 'text') {
            delete props.h;
            if (props.w !== undefined && props.w !== 8) {
              props.autoSize = false;
            }
          }
          if (type === 'note' || type === 'arrow' || type === 'line' || type === 'draw') {
            delete props.w;
            delete props.h;
          }
          rec['props'] = props;
        }

        if (rec['typeName'] === 'binding' && rec['type'] === 'arrow') {
          const props = { ...(rec['props'] || {}) };
          if (!props.snap) props.snap = 'center';
          if (props.isExact === undefined) props.isExact = false;
          if (props.isPrecise === undefined) props.isPrecise = false;
          if (!props.normalizedAnchor) props.normalizedAnchor = { x: 0.5, y: 0.5 };
          rec['props'] = props;
        }
        records[key] = rec;
      }
    }

    store.loadStoreSnapshot({
      store: records as Record<string, any>,
      schema: store.schema.serialize(),
    });

    return store;
  }

  /**
   * Serializes a headless TLStore back into an OpenBoard BoardDocument.
   */
  static extractDocument(store: TLStore): BoardDocument {
    const snapshot = store.getStoreSnapshot('document');
    return {
      schemaVersion: snapshot.schema.schemaVersion ?? 1,
      records: snapshot.store,
    };
  }

  /**
   * Extracts clean, semantic summaries of all shapes in the store.
   */
  static extractShapeSummaries(store: TLStore): CanvasElementSummary[] {
    const records = store.allRecords();
    const shapeRecords = records.filter((r) => r.typeName === 'shape') as Array<
      Record<string, any>
    >;
    const bindingRecords = records.filter((r) => r.typeName === 'binding') as Array<
      Record<string, any>
    >;

    const summaries: CanvasElementSummary[] = [];

    for (const shape of shapeRecords) {
      const type = shape.type || 'geo';
      const props = shape.props || {};

      let text: string | undefined;
      if (props.richText) {
        text = extractTextFromRichText(props.richText);
      } else if (typeof props.text === 'string') {
        text = props.text;
      } else if (typeof props.name === 'string') {
        text = props.name;
      }

      // Check for arrow / connector bindings
      let fromShapeId: string | undefined;
      let toShapeId: string | undefined;
      if (type === 'arrow') {
        const startBinding = bindingRecords.find(
          (b) => b.fromId === shape.id && b.props?.terminal === 'start',
        );
        const endBinding = bindingRecords.find(
          (b) => b.fromId === shape.id && b.props?.terminal === 'end',
        );
        if (startBinding?.toId) fromShapeId = String(startBinding.toId);
        if (endBinding?.toId) toShapeId = String(endBinding.toId);
      }

      let summaryW = props.w;
      let summaryH = props.h;
      if (type === 'text') {
        summaryW = props.w;
        if (text) {
          const lines = text.split('\n');
          summaryH = lines.length * 24;
          if (props.autoSize || !props.w || props.w === 8) {
            const maxLineLen = Math.max(...lines.map((l) => l.length), 1);
            summaryW = Math.max(summaryW ?? 0, maxLineLen * 10);
          }
        }
      } else if (type === 'note') {
        summaryW = props.w ?? 200;
        summaryH = props.h ?? 200;
      }

      const summary: CanvasElementSummary = {
        id: shape.id,
        type,
        x: shape.x,
        y: shape.y,
        rotation: shape.rotation,
        isLocked: shape.isLocked,
        opacity: shape.opacity,
        parentId: shape.parentId,
        text: text !== undefined && text.length > 0 ? text : undefined,
        color: props.color,
        fill: props.fill,
        geo: props.geo,
        w: summaryW,
        h: summaryH,
        start: props.start ? { x: props.start.x, y: props.start.y } : undefined,
        end: props.end ? { x: props.end.x, y: props.end.y } : undefined,
        name: type === 'frame' ? props.name : undefined,
        from: fromShapeId,
        to: toShapeId,
        meta: shape.meta && Object.keys(shape.meta).length > 0 ? shape.meta : undefined,
      };

      if (type === 'assembly-diagram') Object.assign(summary, { name: props.name, participants: props.participants, relations: props.relations, sourceRef: props.sourceRef, syncedCommit: props.syncedCommit });
      if (type === 'sequence-diagram') Object.assign(summary, { name: props.name, participants: props.participants, messages: props.messages, sourceRef: props.sourceRef, syncedCommit: props.syncedCommit });
      if (type === 'aggregate-boundary') Object.assign(summary, { name: props.name, rootId: props.rootId, memberIds: props.memberIds, sourceRef: props.sourceRef, syncedCommit: props.syncedCommit });
      if (type === 'bounded-context') Object.assign(summary, { name: props.name, sourceRef: props.sourceRef, syncedCommit: props.syncedCommit });
      if (type === 'context-interaction') Object.assign(summary, { from: props.from, to: props.to, label: props.label, sourceRef: props.sourceRef, syncedCommit: props.syncedCommit });
      if (type === 'uml-class') Object.assign(summary, { name: props.name, attributes: props.attributes, operations: props.operations, role: props.role, classifierKind: props.classifierKind ?? 'class', sourceRef: props.sourceRef, syncedCommit: props.syncedCommit });
      if (type === 'uml-relationship') Object.assign(summary, { kind: props.kind, from: props.from, to: props.to, fromMultiplicity: props.fromMultiplicity, toMultiplicity: props.toMultiplicity, label: props.label, sourceRef: props.sourceRef, syncedCommit: props.syncedCommit });
      summaries.push(summary);
    }

    return summaries;
  }

  /**
   * Computes the bounding box covering all shapes on the canvas.
   */
  static computeBounds(shapes: CanvasElementSummary[]): CanvasBounds {
    if (shapes.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const byId = new Map(shapes.map((shape) => [shape.id, shape]));
    const contextBounds = (shape: CanvasElementSummary) => {
      const width = shape.w ?? 360, height = shape.h ?? 240;
      const chain: CanvasElementSummary[] = []; const seen = new Set<string>();
      let current: CanvasElementSummary | undefined = shape;
      while (current && !seen.has(current.id)) {
        seen.add(current.id); chain.push(current);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      const transform = Mat.Identity();
      for (const element of chain.reverse()) transform.translate(element.x, element.y).rotate(element.rotation ?? 0);
      const corners = transform.applyToPoints([{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }]);
      return { minX: Math.min(...corners.map((p) => p.x)), minY: Math.min(...corners.map((p) => p.y)), maxX: Math.max(...corners.map((p) => p.x)), maxY: Math.max(...corners.map((p) => p.y)) };
    };
    const include = (x: number, y: number) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
    for (const shape of shapes) {
      if (shape.type === 'bounded-context' || shape.type === 'aggregate-boundary' || shape.type === 'sequence-diagram' || shape.type === 'assembly-diagram') {
        const bounds = contextBounds(shape); include(bounds.minX, bounds.minY); include(bounds.maxX, bounds.maxY);
      } else if (shape.type === 'context-interaction') {
        const from = shape.from ? byId.get(shape.from) : undefined, to = shape.to ? byId.get(shape.to) : undefined;
        if (from?.type === 'bounded-context' && to?.type === 'bounded-context') {
          for (const point of contextInteractionPoints(contextBounds(from), contextBounds(to))) include(point.x, point.y);
        }
      } else if (shape.type === 'arrow') {
        const startOffsetX =
          typeof shape.start?.x === 'number' && !isNaN(shape.start.x) ? shape.start.x : 0;
        const startOffsetY =
          typeof shape.start?.y === 'number' && !isNaN(shape.start.y) ? shape.start.y : 0;
        const endOffsetX =
          typeof shape.end?.x === 'number' && !isNaN(shape.end.x)
            ? shape.end.x
            : shape.end?.x !== undefined
              ? Number(shape.end.x) || 0
              : 120;
        const endOffsetY =
          typeof shape.end?.y === 'number' && !isNaN(shape.end.y)
            ? shape.end.y
            : Number(shape.end?.y) || 0;

        const startX = shape.x + startOffsetX;
        const startY = shape.y + startOffsetY;
        const endX = shape.x + endOffsetX;
        const endY = shape.y + endOffsetY;

        minX = Math.min(minX, startX, endX);
        minY = Math.min(minY, startY, endY);
        maxX = Math.max(maxX, startX, endX);
        maxY = Math.max(maxY, startY, endY);
      } else {
        const x1 = shape.x;
        const y1 = shape.y;
        const x2 = x1 + (shape.w ?? 100);
        const y2 = y1 + (shape.h ?? 100);

        if (x1 < minX) minX = x1;
        if (y1 < minY) minY = y1;
        if (x2 > maxX) maxX = x2;
        if (y2 > maxY) maxY = y2;
      }
    }

    if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    return {
      minX: Math.round(minX),
      minY: Math.round(minY),
      maxX: Math.round(maxX),
      maxY: Math.round(maxY),
      width: Math.round(maxX - minX),
      height: Math.round(maxY - minY),
    };
  }
}

/**
 * CanvasService is the deep domain module for all whiteboard canvas operations.
 *
 * Responsibilities:
 * - Operates headlessly on BoardDocuments using tldraw schemas and headless TLStore.
 * - Programmatic creation, update, and deletion of shapes with validation.
 * - Translating raw tldraw records into semantic CanvasState representations.
 * - Automatically formatting plain text into tldraw richText structures.
 * - Cascade cleanup of bindings when shapes are deleted.
 * - Dispatching real-time update notifications via BoardEventBus.
 * - Zero knowledge of SQLite or HTTP transport.
 */
export class CanvasService {
  private readonly boardService: BoardService;
  private readonly eventBus?: BoardEventBus;

  constructor(boardService: BoardService, eventBus?: BoardEventBus) {
    this.boardService = boardService;
    this.eventBus = eventBus;
  }

  /**
   * Reads and summarizes the canvas state for an AI agent.
   */
  async getCanvasState(boardId: BoardId): Promise<CanvasState> {
    const board = await this.boardService.getBoard(boardId);
    const store = HeadlessCanvasEngine.createStore(board.document);
    const shapes = HeadlessCanvasEngine.extractShapeSummaries(store);
    const bounds = HeadlessCanvasEngine.computeBounds(shapes);

    return {
      boardId: board.metadata.id,
      name: board.metadata.name,
      shapesCount: shapes.length,
      bounds,
      shapes,
    };
  }

  /**
   * Generates a visual screenshot representation of the whiteboard canvas.
   */
  async getCanvasScreenshot(
    boardId: BoardId,
    options?: import('@openboard/shared').CanvasScreenshotOptions,
  ): Promise<import('@openboard/shared').CanvasScreenshotResult> {
    const { HeadlessSvgRenderer } = await import('./renderer.js');
    const board = await this.boardService.getBoard(boardId);
    return HeadlessSvgRenderer.render(board.document, boardId, options);
  }

  /**
   * Creates one or more shapes on a board's canvas.
   */
  async createShapes(boardId: BoardId, inputs: CreateShapeInput[]): Promise<CreateShapesResult> {
    if (!Array.isArray(inputs) || inputs.length === 0) {
      throw new BoardValidationError('At least one shape must be provided for creation.');
    }

    const board = await this.boardService.getBoard(boardId);
    const store = HeadlessCanvasEngine.createStore(board.document);

    const createdRecords: Record<string, any>[] = [];
    const bindingRecords: Record<string, any>[] = [];
    // Indices are scoped to siblings; allocate above both existing and newly created shapes.
    const highestIndexByParent = new Map<string, IndexKey>();
    for (const record of store.allRecords()) {
      if (record.typeName !== 'shape') continue;
      const highest = highestIndexByParent.get(record.parentId);
      if (!highest || record.index > highest) highestIndexByParent.set(record.parentId, record.index);
    }
    const nextIndex = (parentId: string): IndexKey => {
      const index = getIndexAbove(highestIndexByParent.get(parentId));
      highestIndexByParent.set(parentId, index);
      return index;
    };

    const hasUml = inputs.some((input) => ['uml-class', 'uml-relationship', 'bounded-context', 'context-interaction', 'aggregate-boundary', 'sequence-diagram', 'assembly-diagram'].includes(input.type ?? ''));
    const batchIds = new Set<string>();
    const classIds = new Set(store.allRecords().filter((r: any) => r.typeName === 'shape' && r.type === 'uml-class').map((r) => String(r.id)));
    if (hasUml) {
      for (const input of inputs) {
        if (input.id !== undefined) {
          if (typeof input.id !== 'string' || !input.id.trim()) throw new CanvasOperationError('Invalid shape ID.');
          const id = normalizeShapeId(input.id);
          if (batchIds.has(id) || store.get(id)) throw new CanvasOperationError(`Shape ID ${id} already exists.`);
          batchIds.add(id);
          if (input.type === 'uml-class') classIds.add(id);
        }
      }
    }
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i]!;
      const umlType = input.type === 'uml-class' || input.type === 'uml-relationship';
      if (input.type === 'assembly-diagram') {
        const props = assemblyProps(input as any);
        if (input.x === undefined || input.y === undefined) throw new CanvasOperationError('Assembly requires x and y.');
        const shapeId = normalizeShapeId(input.id);
        if (store.get(shapeId) || createdRecords.some((r) => r.id === shapeId)) throw new CanvasOperationError(`Shape ID ${shapeId} already exists.`);
        createdRecords.push({ id: shapeId, typeName: 'shape', type: input.type, x: input.x, y: input.y, rotation: 0, isLocked: false, opacity: 1, parentId: 'page:page', index: nextIndex('page:page'), props, meta: {} });
        continue;
      }
      if (input.type === 'sequence-diagram') {
        const props = sequenceProps(input as any);
        if (input.x === undefined || input.y === undefined) throw new CanvasOperationError('Sequence requires x and y.');
        const shapeId = normalizeShapeId(input.id);
        if (store.get(shapeId) || createdRecords.some((r) => r.id === shapeId)) throw new CanvasOperationError(`Shape ID ${shapeId} already exists.`);
        createdRecords.push({ id: shapeId, typeName: 'shape', type: input.type, x: input.x, y: input.y, rotation: 0, isLocked: false, opacity: 1, parentId: 'page:page', index: nextIndex('page:page'), props, meta: {} });
        continue;
      }
      if (input.type === 'aggregate-boundary') {
        const props = aggregateProps(input as any);
        if (input.x === undefined || input.y === undefined) throw new CanvasOperationError('Aggregate requires x and y.');
        const shapeId = normalizeShapeId(input.id);
        if (store.get(shapeId) || createdRecords.some((r) => r.id === shapeId)) throw new CanvasOperationError(`Shape ID ${shapeId} already exists.`);
        createdRecords.push({ id: shapeId, typeName: 'shape', type: input.type, x: input.x, y: input.y, rotation: 0, isLocked: false, opacity: 1, parentId: 'page:page', index: nextIndex('page:page'), props, meta: {} });
        continue;
      }
      if (input.type === 'bounded-context' || input.type === 'context-interaction') {
        const props = contextProps(input.type, input as any);
        if (input.type === 'bounded-context' && (input.x === undefined || input.y === undefined)) throw new CanvasOperationError('Context requires x and y.');
        const shapeId = normalizeShapeId(input.id);
        if (store.get(shapeId) || createdRecords.some((r) => r.id === shapeId)) throw new CanvasOperationError(`Shape ID ${shapeId} already exists.`);
        createdRecords.push({ id: shapeId, typeName: 'shape', type: input.type, x: input.x ?? 0, y: input.y ?? 0, rotation: 0, isLocked: false, opacity: 1, parentId: 'page:page', index: nextIndex('page:page'), props, meta: {} });
        continue;
      }
      if (umlType) {
        const props = umlProps(input.type!, input as any);
        if (input.type === 'uml-class' && (input.x === undefined || input.y === undefined)) throw new CanvasOperationError('UML class requires x and y.');
        if (input.type === 'uml-relationship' && (!classIds.has(props.from) || !classIds.has(props.to))) throw new CanvasOperationError('UML relationship endpoints must be classes on this board.');
        const shapeId = normalizeShapeId(input.id);
        if (store.get(shapeId) || createdRecords.some((r) => r.id === shapeId)) throw new CanvasOperationError(`Shape ID ${shapeId} already exists.`);
        createdRecords.push({ id: shapeId, typeName: 'shape', type: input.type, x: input.x ?? 0, y: input.y ?? 0, rotation: 0, isLocked: false, opacity: 1, parentId: 'page:page', index: nextIndex('page:page'), props, meta: {} });
        continue;
      }
      if (
        typeof input.x !== 'number' ||
        isNaN(input.x) ||
        typeof input.y !== 'number' ||
        isNaN(input.y)
      ) {
        throw new CanvasOperationError(
          `Shape at index ${i} requires valid numeric "x" and "y" coordinates.`,
        );
      }

      const type = input.type || 'geo';
      const util = shapeUtilsByType.get(type);
      if (!util) {
        throw new CanvasOperationError(
          `Unsupported shape type "${type}". Supported types: geo, text, note, arrow, line, frame, draw, highlight.`,
        );
      }

      const defaultProps = util.getDefaultProps();
      const shapeId = normalizeShapeId(input.id);

      const props: Record<string, any> = {
        ...defaultProps,
        ...(input.props || {}),
      };

      if (input.w !== undefined) {
        if (type === 'geo' || type === 'frame') {
          props.w = Number(input.w);
        } else if (type === 'text') {
          props.w = Number(input.w);
          props.autoSize = false;
        }
      }
      if (input.h !== undefined) {
        if (type === 'geo' || type === 'frame') {
          props.h = Number(input.h);
        }
      }
      if (input.geo !== undefined && type === 'geo') props.geo = String(input.geo);
      if (input.color !== undefined) props.color = String(input.color);
      if (input.fill !== undefined && (type === 'geo' || type === 'arrow' || type === 'draw')) {
        props.fill = String(input.fill);
      }

      if (input.text !== undefined) {
        if (type === 'geo' || type === 'text' || type === 'note') {
          props.richText = toRichText(input.text);
        } else if (type === 'arrow') {
          props.text = input.text;
        } else if (type === 'frame') {
          props.name = input.text;
        }
      }

      if (input.name !== undefined && type === 'frame') {
        props.name = input.name;
      }

      if (input.start && type === 'arrow') {
        props.start = {
          x: typeof input.start.x === 'number' && !isNaN(input.start.x) ? input.start.x : Number(input.start.x) || 0,
          y: typeof input.start.y === 'number' && !isNaN(input.start.y) ? input.start.y : Number(input.start.y) || 0,
        };
      }
      if (input.end && type === 'arrow') {
        props.end = {
          x: typeof input.end.x === 'number' && !isNaN(input.end.x) ? input.end.x : Number(input.end.x) || 0,
          y: typeof input.end.y === 'number' && !isNaN(input.end.y) ? input.end.y : Number(input.end.y) || 0,
        };
      }

      // Handle arrow bindings if "from" or "to" are specified
      if (type === 'arrow') {
        if (input.from) {
          const fromShapeId = normalizeShapeId(input.from);
          bindingRecords.push({
            id: `binding:${shapeId}_start`,
            typeName: 'binding',
            type: 'arrow',
            fromId: shapeId,
            toId: fromShapeId,
            props: {
              terminal: 'start',
              isExact: false,
              normalizedAnchor: { x: 0.5, y: 0.5 },
              isPrecise: false,
              snap: 'center',
            },
            meta: {},
          });
        }
        if (input.to) {
          const toShapeId = normalizeShapeId(input.to);
          bindingRecords.push({
            id: `binding:${shapeId}_end`,
            typeName: 'binding',
            type: 'arrow',
            fromId: shapeId,
            toId: toShapeId,
            props: {
              terminal: 'end',
              isExact: false,
              normalizedAnchor: { x: 0.5, y: 0.5 },
              isPrecise: false,
              snap: 'center',
            },
            meta: {},
          });
        }
      }

      const shapeRecord = {
        id: shapeId,
        typeName: 'shape',
        type,
        x: input.x,
        y: input.y,
        rotation: input.rotation ?? 0,
        isLocked: false,
        opacity: 1,
        parentId: input.parentId || 'page:page',
        index: nextIndex(input.parentId || 'page:page'),
        props,
        meta: input.meta || {},
      };

      createdRecords.push(shapeRecord);
    }

    // Apply creations to headless store
    if (hasUml) {
      const records = [...store.allRecords(), ...createdRecords]; const changed = new Set(createdRecords.map((r) => r.id));
      validateRealizations(records, changed); validateContextInteractions(records, changed); validateAggregates(records, changed); validateSequences(records, changed); validateAssemblies(records, changed);
    }
    store.put([...createdRecords, ...bindingRecords] as TLRecord[]);

    // Extract serialized document and persist to SQLite
    const updatedDocument = HeadlessCanvasEngine.extractDocument(store);
    await this.boardService.updateBoard(boardId, { document: updatedDocument });

    // Emit live update event
    this.eventBus?.emit('canvas:updated', {
      boardId,
      document: updatedDocument,
      reason: `Created ${inputs.length} shapes`,
    });

    const createdSummaries = HeadlessCanvasEngine.extractShapeSummaries(store).filter((s) =>
      createdRecords.some((r) => r.id === s.id),
    );

    return {
      boardId,
      createdCount: createdRecords.length,
      shapes: createdSummaries,
    };
  }

  /**
   * Updates properties of existing shapes on a board.
   */
  async updateShapes(boardId: BoardId, updates: UpdateShapeInput[]): Promise<UpdateShapesResult> {
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new BoardValidationError('At least one shape update must be provided.');
    }

    const board = await this.boardService.getBoard(boardId);
    const store = HeadlessCanvasEngine.createStore(board.document);

    const updatedRecords: Record<string, any>[] = [];
    const bindingUpdates: Record<string, any>[] = [];
    const hasUml = updates.some((update) => {
      const shape = store.get(normalizeShapeId(update.id)) as Record<string, any> | undefined;
      return ['uml-class', 'uml-relationship', 'bounded-context', 'context-interaction', 'aggregate-boundary', 'sequence-diagram', 'assembly-diagram'].includes(shape?.type as string);
    });

    for (const update of updates) {
      const shapeId = normalizeShapeId(update.id);
      const existing = (hasUml ? [...updatedRecords].reverse().find((record) => record.id === shapeId) : undefined)
        ?? store.get(shapeId) as Record<string, any> | undefined;

      if (!existing || existing.typeName !== 'shape') {
        throw new CanvasOperationError(
          `Shape with ID "${update.id}" was not found on board "${boardId}". Call get_canvas_state to inspect available shape IDs.`,
        );
      }

      const type = existing.type || 'geo';
      if (type === 'assembly-diagram') {
        const props = assemblyProps(update as any, existing.props);
        updatedRecords.push({ ...existing, x: update.x ?? existing.x, y: update.y ?? existing.y, props });
        continue;
      }
      if (type === 'sequence-diagram') {
        const props = sequenceProps(update as any, existing.props);
        updatedRecords.push({ ...existing, x: update.x ?? existing.x, y: update.y ?? existing.y, props });
        continue;
      }
      if (type === 'aggregate-boundary') {
        const props = aggregateProps(update as any, existing.props);
        updatedRecords.push({ ...existing, x: update.x ?? existing.x, y: update.y ?? existing.y, props });
        continue;
      }
      if (type === 'bounded-context' || type === 'context-interaction') {
        const props = contextProps(type, update as any, existing.props);
        updatedRecords.push({ ...existing, x: update.x ?? existing.x, y: update.y ?? existing.y, props });
        continue;
      }
      if (type === 'uml-class' || type === 'uml-relationship') {
        const props = umlProps(type, update as any, existing.props);
        if (type === 'uml-relationship' && [props.from, props.to].some((id) => (store.get(id as TLShapeId) as any)?.type !== 'uml-class')) throw new CanvasOperationError('UML relationship endpoints must be classes on this board.');
        updatedRecords.push({ ...existing, x: update.x ?? existing.x, y: update.y ?? existing.y, props });
        continue;
      }
      const updatedProps = { ...existing.props, ...(update.props || {}) };

      if (update.w !== undefined) {
        if (type === 'geo' || type === 'frame') {
          updatedProps.w = Number(update.w);
        } else if (type === 'text') {
          updatedProps.w = Number(update.w);
          updatedProps.autoSize = false;
        }
      }
      if (update.h !== undefined) {
        if (type === 'geo' || type === 'frame') {
          updatedProps.h = Number(update.h);
        }
      }
      if (update.geo !== undefined && type === 'geo') updatedProps.geo = String(update.geo);
      if (update.color !== undefined) updatedProps.color = String(update.color);
      if (update.fill !== undefined && (type === 'geo' || type === 'arrow' || type === 'draw')) {
        updatedProps.fill = String(update.fill);
      }

      if (update.text !== undefined) {
        if (type === 'geo' || type === 'text' || type === 'note') {
          updatedProps.richText = toRichText(update.text);
        } else if (type === 'arrow') {
          updatedProps.text = update.text;
        } else if (type === 'frame') {
          updatedProps.name = update.text;
        }
      }

      if (update.start && type === 'arrow') {
        updatedProps.start = {
          x: typeof update.start.x === 'number' && !isNaN(update.start.x) ? update.start.x : Number(update.start.x) || 0,
          y: typeof update.start.y === 'number' && !isNaN(update.start.y) ? update.start.y : Number(update.start.y) || 0,
        };
      }
      if (update.end && type === 'arrow') {
        updatedProps.end = {
          x: typeof update.end.x === 'number' && !isNaN(update.end.x) ? update.end.x : Number(update.end.x) || 0,
          y: typeof update.end.y === 'number' && !isNaN(update.end.y) ? update.end.y : Number(update.end.y) || 0,
        };
      }

      // Handle arrow bindings update
      if (type === 'arrow') {
        if (update.from !== undefined) {
          if (update.from) {
            const fromShapeId = normalizeShapeId(update.from);
            bindingUpdates.push({
              id: `binding:${shapeId}_start`,
              typeName: 'binding',
              type: 'arrow',
              fromId: shapeId,
              toId: fromShapeId,
              props: {
                terminal: 'start',
                isExact: false,
                normalizedAnchor: { x: 0.5, y: 0.5 },
                isPrecise: false,
                snap: 'center',
              },
              meta: {},
            });
          } else {
            if (hasUml) {
              for (let i = bindingUpdates.length - 1; i >= 0; i--) {
                if (bindingUpdates[i]?.id === `binding:${shapeId}_start`) bindingUpdates.splice(i, 1);
              }
            }
            const existingStart = store.get(`binding:${shapeId}_start` as any);
            if (existingStart) {
              store.remove([`binding:${shapeId}_start` as any]);
            }
          }
        }
        if (update.to !== undefined) {
          if (update.to) {
            const toShapeId = normalizeShapeId(update.to);
            bindingUpdates.push({
              id: `binding:${shapeId}_end`,
              typeName: 'binding',
              type: 'arrow',
              fromId: shapeId,
              toId: toShapeId,
              props: {
                terminal: 'end',
                isExact: false,
                normalizedAnchor: { x: 0.5, y: 0.5 },
                isPrecise: false,
                snap: 'center',
              },
              meta: {},
            });
          } else {
            if (hasUml) {
              for (let i = bindingUpdates.length - 1; i >= 0; i--) {
                if (bindingUpdates[i]?.id === `binding:${shapeId}_end`) bindingUpdates.splice(i, 1);
              }
            }
            const existingEnd = store.get(`binding:${shapeId}_end` as any);
            if (existingEnd) {
              store.remove([`binding:${shapeId}_end` as any]);
            }
          }
        }
      }

      const updatedShape = {
        ...existing,
        x: update.x !== undefined ? Number(update.x) : existing.x,
        y: update.y !== undefined ? Number(update.y) : existing.y,
        rotation: update.rotation !== undefined ? Number(update.rotation) : existing.rotation,
        isLocked: update.isLocked !== undefined ? Boolean(update.isLocked) : existing.isLocked,
        opacity: update.opacity !== undefined ? Number(update.opacity) : existing.opacity,
        props: updatedProps,
        meta: update.meta ? { ...existing.meta, ...update.meta } : existing.meta,
      };

      updatedRecords.push(updatedShape);
    }

    if (hasUml) {
      const records = [...store.allRecords(), ...updatedRecords]; const changed = new Set(updatedRecords.map((r) => r.id));
      validateRealizations(records, changed); validateContextInteractions(records, changed); validateAggregates(records, changed); validateSequences(records, changed); validateAssemblies(records, changed);
    }
    store.put([...updatedRecords, ...bindingUpdates] as TLRecord[]);

    const updatedDocument = HeadlessCanvasEngine.extractDocument(store);
    await this.boardService.updateBoard(boardId, { document: updatedDocument });

    this.eventBus?.emit('canvas:updated', {
      boardId,
      document: updatedDocument,
      reason: `Updated ${updates.length} shapes`,
    });

    const updatedSummaries = HeadlessCanvasEngine.extractShapeSummaries(store).filter((s) =>
      updatedRecords.some((r) => r.id === s.id),
    );

    return {
      boardId,
      updatedCount: updatedRecords.length,
      shapes: updatedSummaries,
    };
  }

  /**
   * Deletes shapes from a board and cascades to clean up orphan arrow/line bindings.
   */
  async deleteShapes(boardId: BoardId, shapeIds: string[]): Promise<DeleteShapesResult> {
    if (!Array.isArray(shapeIds) || shapeIds.length === 0) {
      throw new BoardValidationError('At least one shape ID must be provided for deletion.');
    }

    const board = await this.boardService.getBoard(boardId);
    const store = HeadlessCanvasEngine.createStore(board.document);

    const targetIds = shapeIds.map((id) => normalizeShapeId(id));
    const toDelete: TLShapeId[] = [];

    for (const id of targetIds) {
      if (store.get(id)) {
        toDelete.push(id);
      }
    }

    if (toDelete.length === 0) {
      return {
        boardId,
        deletedCount: 0,
        deletedShapeIds: [],
      };
    }

    for (const record of store.allRecords() as any[]) {
      if (record.typeName === 'shape' && (record.type === 'uml-relationship' || record.type === 'context-interaction') && (toDelete.includes(record.props.from) || toDelete.includes(record.props.to)) && !toDelete.includes(record.id)) toDelete.push(record.id);
    }

    const aggregatesToUpdate = (store.allRecords() as any[]).filter((record) => record.typeName === 'shape' && record.type === 'aggregate-boundary' && !toDelete.includes(record.id) && (toDelete.includes(record.props.rootId) || record.props.memberIds.some((id: TLShapeId) => toDelete.includes(id)))).map((record) => {
      const props = { ...record.props };
      if (props.rootId && toDelete.includes(props.rootId)) delete props.rootId;
      props.memberIds = props.memberIds.filter((id: TLShapeId) => !toDelete.includes(id));
      return { ...record, props };
    });
    if (aggregatesToUpdate.length) store.put(aggregatesToUpdate as TLRecord[]);

    // Also remove any binding records referencing these shapes to preserve consistency
    const allRecords = store.allRecords();
    const bindingRecordsToDelete = allRecords
      .filter((r) => r.typeName === 'binding')
      .filter((b: any) => toDelete.includes(b.fromId) || toDelete.includes(b.toId))
      .map((b) => b.id);

    store.remove([...toDelete, ...bindingRecordsToDelete]);

    const updatedDocument = HeadlessCanvasEngine.extractDocument(store);
    await this.boardService.updateBoard(boardId, { document: updatedDocument });

    this.eventBus?.emit('canvas:updated', {
      boardId,
      document: updatedDocument,
      reason: `Deleted ${toDelete.length} shapes`,
    });

    return {
      boardId,
      deletedCount: toDelete.length,
      deletedShapeIds: toDelete.map(String),
    };
  }
}
