# Assembly diagram

An `assembly-diagram` is one canvas shape with a name, local participants and relations. Create it with `x`, `y`, `name` and optional `participants` and `relations` arrays. Its default size is 600 × 400; `w` and `h` must be at least 1.

Participants have local `id`, `name`, `x`, and `y`. IDs are unique within the diagram; names need not be. Coordinates are local to the diagram. Relations have unique local `id`, `kind`, `from`, and `to`, referencing participants in the same diagram:

- `create`: creator → created participant; optional `label`.
- `inject`: dependency → recipient; optional `actor` identifies the participant passing it. An absent or empty actor means unknown. An optional `label` describes the relation.
- `other`: `from` → `to`, with a non-empty `label`.

Updates replace supplied arrays in full, while omitted fields remain unchanged. A batch is validated as a final state before it is saved: removing a participant requires removing or redirecting every reference, including an actor. On the canvas, select the diagram and drag a participant's center handle to reposition it; drag the diagram itself to move it as a whole, or use the resize handles. Individual positions can also be changed through an update. The picture describes a variant and does not establish execution order or prove execution.

Participant coordinates must be finite numbers. Wait for `Saved` before reloading or making the next edit. Automatic overlap avoidance, concurrent unsaved edits and SVG output are outside this slice.

Executable examples cover [core](../packages/core/src/__tests__/assembly-diagram.test.ts), [MCP](../packages/mcp/src/__tests__/assembly-diagram.test.ts), [browser store and rendering](../apps/web/src/canvas/__tests__/assembly-diagram.test.ts), and [HTTP/stdio with SQLite](../apps/server/src/__tests__/assembly-diagram.test.ts). They cover specific cases; browser-store tests do not exercise actual gestures or autosave.
