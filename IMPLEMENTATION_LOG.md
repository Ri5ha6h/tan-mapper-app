# Mapper Revamp — Implementation Log

## Phase 1: Data Model & Type System

**Status:** Completed  
**Date:** 2026-02-21

### Summary

Replaced and extended `src/lib/mapper/types.ts` with a full TypeScript representation of the `MapperState` model. Created all new utility and serialization files.

### What Was Built

**Files Modified:**

- `src/lib/mapper/types.ts` — Added `MapperNodeType`, `MapperTreeNode`, `SourceReference`, `LoopReference`, `LoopCondition`, `NodeCondition`, `GlobalVariable`, `LookupEntry`, `LookupTable`, `TransformFunction`, `MapperContext`, `MapperPreferences`, `InputType`, `FlatReference`, `MapperState` — all existing types preserved for backward compat.

**Files Created:**

- `src/lib/mapper/node-utils.ts` — Tree traversal, node manipulation, `fromParserTreeNode`, `createEmptyMapperState`, `mergeTrees`, etc.
- `src/lib/mapper/reference-utils.ts` — Variable naming, reference sync, loop ancestor detection, etc.
- `src/lib/mapper/serialization.ts` — JSON round-trip (`serializeMapperState` / `deserializeMapperState`), type guards, `SerializationError`.
- `src/lib/mapper/migration.ts` — Old Vaadin `.jtmap` → v1 migration (`migrateFromJtmap`).

**Test Files Created:**

- `src/lib/mapper/__tests__/node-utils.test.ts`
- `src/lib/mapper/__tests__/reference-utils.test.ts`
- `src/lib/mapper/__tests__/serialization.test.ts`

**Packages Installed:**

- `uuid@13.0.0`
- `zustand@5.0.11`
- `xlsx@0.18.5`
- `@types/uuid@11.0.0`

### Definition of Done Checklist

- [x] All new interfaces compile cleanly with `tsc --strict`
- [x] `createEmptyMapperState()` returns a valid `MapperState`
- [x] `getFullPath()` returns correct paths for element, attribute, arrayChild node types
- [x] `suggestVariableName()` produces unique, valid JS identifier names with collision handling
- [x] `serializeMapperState()` + `deserializeMapperState()` is a perfect round-trip
- [x] `migrateFromJtmap()` handles old `.jtmap` format conversion
- [x] All existing tests still pass (`bun test`)
- [x] New tests pass (`bun test`)
- [x] No changes to `parsers.ts`, `engine.ts`, `context.tsx`

---

## Phase 2: DSL Extension

**Status:** Completed  
**Date:** 2026-02-21

### Summary

Extended `src/lib/mapper/dsl.ts` with full support for the new DSL grammar (LOOP, UNDER, LOOKUP, AS LITERAL/EXPR, standalone IF conditions). Added the bidirectional bridge functions that keep DSL text and the `MapperState` visual model in sync.

### What Was Built

**Files Modified:**

- `src/lib/mapper/types.ts` — Extended `Mapping` interface with 6 new optional fields: `valueType`, `loopName`, `underLoop`, `lookupTable`, `nodeCondition`, `isLoopDeclaration`.

- `src/lib/mapper/dsl.ts` — Complete rewrite with:
    - **Extended `parseDSL`** — new `LINE_REGEX` captures all new clauses (LOOP, UNDER, WHERE, THEN, LOOKUP, AS, IF). Standalone `target.path IF condition` lines handled separately. All existing tests preserved.
    - **Extended `generateDSL`** — emits `[*]` suffix for loop declarations, `UNDER` for nested mappings, `AS LITERAL`/`AS EXPR`, `LOOKUP`, standalone node condition lines.
    - **`mapperStateToDSL(state)`** — traverses target tree and produces canonical DSL from `MapperState`. Emits name comment, global variable comments, loop declarations, source references, literal/expression values, node conditions.
    - **`applyDSLToState(dsl, state)`** — parses DSL and applies it to an existing `MapperState` (immutable). Clears existing refs, applies loop declarations, node conditions, and simple mappings. Rebuilds flat references.
    - **`findLoopReferenceById`** — exported helper for the bridge and Phase 6 engine.
    - Internal utilities: `findNodeByPath`, `updateNodeInTree`, `getSourcePathFromTree`, `findLoopReferenceByName`.

**Test Files Modified:**

- `src/lib/mapper/__tests__/dsl.test.ts` — Added 41 new tests across:
    - `parseDSL - LOOP declaration`
    - `parseDSL - UNDER clause`
    - `parseDSL - AS LITERAL / AS EXPR`
    - `parseDSL - LOOKUP clause`
    - `parseDSL - standalone node condition (IF)`
    - `parseDSL - combined LOOP + UNDER + WHERE + LOOKUP`
    - `generateDSL - new clauses` (with round-trip tests)
    - `mapperStateToDSL` (7 tests)
    - `applyDSLToState` (5 tests)

### Definition of Done Checklist

- [x] `parseDSL` handles all new grammar constructs without errors
- [x] `generateDSL` produces valid DSL from mappings (round-trip for simple cases)
- [x] `mapperStateToDSL` converts a full `MapperState` with loops to correct DSL
- [x] `applyDSLToState` applies DSL to an existing state without corrupting tree structure
- [x] All existing DSL tests still pass (209 → 250 total, 0 failures)
- [x] New DSL tests pass (41 new tests added)
- [x] No changes to `engine.ts` in this phase

---

## Phase 3: State Management & Undo/Redo

**Status:** Completed  
**Date:** 2026-02-21

### Summary

Built the Zustand-based global store (`src/lib/mapper/store.ts`) that replaces the React context reducer pattern for mapper state management. The store handles all mapper mutations, undo/redo via JSON snapshots (max 8), clipboard, selection, loop/condition management, context mutations, and UI state flags. Updated `context.tsx` to preserve backward compatibility while re-exporting the new store hook.

### What Was Built

**Files Created:**

- `src/lib/mapper/store.ts` — Full `useMapperStore` Zustand store with `subscribeWithSelector` + `immer` middleware, covering:
    - **Undo/Redo** — `snapshot()`, `undo()`, `redo()`, `canUndo()`, `canRedo()` with max-8 JSON snapshot stacks
    - **Load/Reset** — `loadState()`, `resetState()`
    - **Tree mutations** — `setSourceTree`, `setTargetTree`, `addChildNode`, `deleteNodes`, `updateNodeFields`, `moveNode`, `groupNodes`
    - **Clipboard** — `copyNode`, `pasteNode` (deep copy with new UUIDs)
    - **Mapping mutations** — `addMapping`, `removeReference`, `clearNodeMappings`, `clearAllMappings`, `renameVariable`, `setCustomPath`
    - **Loop mutations** — `setLoopReference`, `setLoopIterator`, `setLoopStatement`, `addLoopCondition`, `removeLoopCondition`, `updateLoopCondition`, `setLoopConditionsConnective`
    - **Node condition** — `setNodeCondition`
    - **Context mutations** — `addGlobalVariable`, `updateGlobalVariable`, `removeGlobalVariable`, `addLookupTable`, `updateLookupTable`, `removeLookupTable`, `addLookupEntry`, `updateLookupEntry`, `removeLookupEntry`, `addFunction`, `updateFunction`, `removeFunction`, `setPrologScript`, `setEpilogScript`
    - **Preferences** — `updatePreferences`
    - **Auto-map** — `autoMap` (name-based leaf matching)
    - **Selection** — `selectSourceNode`, `selectTargetNode`
    - **UI state** — `setDirty`, `setResourceName`, `setResourceId`, `toggleExecutePanel`, `setDSLMode`
    - **Selector hooks** — `useSource`, `useTarget`, `useMappings`, `useMapperContext`, `usePreferences`, `useSelectedTargetNode`, `useCanUndo`, `useCanRedo`, `useIsDirty`

**Files Modified:**

- `src/lib/mapper/context.tsx` — Preserved original reducer shim (backward compat for existing components). Added `export { useMapperStore } from './store'` at the bottom for gradual migration.

**Test Files Created:**

- `src/lib/mapper/__tests__/store.test.ts` — 37 tests across 9 describe blocks covering all key store behaviors.

**Packages Installed:**

- `immer@11.1.4`

### Definition of Done Checklist

- [x] `useMapperStore` is importable from `@/lib/mapper/store`
- [x] `addMapping()` creates a `SourceReference` with correct variable name and `loopOverId`
- [x] `undo()`/`redo()` correctly cycle through max 8 snapshots
- [x] `deleteNodes()` on source side cleans up all references in target tree
- [x] `autoMap()` correctly matches leaf nodes by name
- [x] Existing `context.tsx` still exports `MapperProvider` (shim) without breaking existing components
- [x] All store tests pass (37 new tests, 287 total across 7 files, 0 failures)
- [x] TypeScript strict mode: no `any` types

---

## Phase 4: Core UI Components

**Status:** Completed  
**Date:** 2026-02-21

### Summary

Rebuilt all core mapper UI components to use `MapperState` and the Zustand store. Delivered the complete mapper canvas: dual tree views with type icons and mapped indicators, toolbar, enhanced SVG connection lines, references panel, auto-map dialog, preferences dialog, environment editor, and tab-based layout (Mapper / References / Environment). Added two new shadcn-style UI primitives (Tabs, Dialog) wrapping `@base-ui/react`.

### What Was Built

**New UI Primitive Components:**

- `src/components/ui/tabs.tsx` — `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` wrapping `@base-ui/react/tabs` with pill-style trigger design
- `src/components/ui/dialog.tsx` — `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose` wrapping `@base-ui/react/dialog` with glass-morphism + `animate-modal-enter`

**New Mapper Components:**

- `src/components/mapper/mapper-toolbar.tsx` — Toolbar reading directly from `useMapperStore`: New, Open (stub), Save (stub), Save As (stub), Execute (toggles panel), Undo, Redo, Auto-Map, Preferences. Dirty indicator dot.
- `src/components/mapper/references-panel.tsx` — Flat reference grid showing all `state.references[]` with color-coded rows (loop=mint, broken=red, healthy=mapped), Source/Target path columns, Variable, Type badge, Loop Over, Delete button.
- `src/components/mapper/auto-map-dialog.tsx` — Auto-map dialog with three checkbox options (match by name, one-to-many, include sub-nodes), live preview list of candidate matches, applies via `store.snapshot()` + `store.autoMap()`.
- `src/components/mapper/preferences-dialog.tsx` — Preferences editor for all 5 `MapperPreferences` fields with descriptions, each toggle via `store.updatePreferences()`.
- `src/components/mapper/environment-editor.tsx` — Full Environment tab: Global Variables table (add/edit/delete/plainText toggle), Lookup Tables (accordion per table, inline entry editing), Functions (Monaco-like textarea per function), Prolog/Epilog script editors. All wired to store context mutations.

**Updated Mapper Components:**

- `src/components/mapper/tree-node.tsx` — Complete rewrite: now accepts `MapperTreeNode` (UUID-based). Added `NodeTypeIcon` colored pill (lavender=element, mint=array, mint-dim=arrayChild, amber=attribute, peach=code), mapped glow dot, loop chain-link icon, selection highlight (source=peach, target=lavender), depth-based padding without `node.depth` field dependency.
- `src/components/mapper/tree-view.tsx` — Rewritten to use `MapperTreeNode`. Manages `expandedNodes: Set<string>` locally, auto-expands first 2 levels on tree load (matching Vaadin `expandRecursively(..., 2)`), Expand All / Collapse All controls, `traverseDown` for full tree collection.
- `src/components/mapper/connection-lines.tsx` — Enhanced: now reads from `useMapperStore` references (not old `useMapper()` mappings). Three line styles: regular gradient (peach→lavender), loop (mint dashed), broken (red). Separate glow filters per style. `buildConnections()` validates source/target node existence.
- `src/components/mapper/file-upload.tsx` — Rewritten to use `store.setSourceTree()` / `store.setTargetTree()` + `fromParserTreeNode()` for conversion from old parser `TreeNode` to `MapperTreeNode` with new UUIDs.
- `src/components/mapper/mapper-flow.tsx` — Full rewrite: tab-based layout (Mapper / References / Environment via new `Tabs` component), `useMapperStore` for all state, drag-end calls `store.snapshot()` then `store.addMapping()`, right pane placeholder for Phase 5 Node Editor, `AutoMapDialog` + `PreferencesDialog` mounted in flow.

**Updated Routes / Exports:**

- `src/routes/index.tsx` — Removed `<MapperProvider>` wrapper (store is now global Zustand singleton)
- `src/components/mapper/index.ts` — Updated barrel to export all new components

### Definition of Done Checklist

- [x] `MapperToolbar` renders all buttons; New/Undo/Redo wire to store
- [x] `TreeView` renders `MapperTreeNode` with type icons and mapped indicators
- [x] Drag from source node → drop onto target node calls `store.snapshot()` + `store.addMapping()`
- [x] `ConnectionLines` renders SVG connections for all `state.references` (loop=mint, regular=gradient, broken=red)
- [x] `ReferencesPanel` shows all flat references with correct colors and delete action
- [x] `AutoMapDialog` previews and applies auto-map by name
- [x] `PreferencesDialog` reads/writes all preferences from store
- [x] `EnvironmentEditor` reads/writes global variables, lookup tables, functions, scripts from store
- [x] All three tabs (Mapper, References, Environment) render without errors
- [x] `MapperProvider` wrapper removed from route — store is global
- [x] `file-upload.tsx` converts parsed `TreeNode` → `MapperTreeNode` via `fromParserTreeNode()`
- [x] 287 existing tests still pass (`bun test`) — 0 failures
- [x] No new TypeScript errors in any Phase 4 files (LSP clean)

---

## Phase 5: Node Editor Side Panel

**Status:** Completed  
**Date:** 2026-02-21

### Summary

Built the complete collapsible right-side Node Editor panel that appears when any node is selected in the source or target tree. For target nodes: a 5-tab editor (Value, Source Refs, Loop, Filter/Loop Conditions, Condition). For source nodes: a read-only metadata editor. Replaced the Phase 5 placeholder in `mapper-flow.tsx` with the live `NodeEditorPanel`. Added 6 new store actions required by the panel editors.

### What Was Built

**Store Additions (`src/lib/mapper/store.ts`):**

- `updateTargetNode(nodeId, patch)` — direct partial patch to any target node field (with flat reference sync)
- `updateSourceNode(nodeId, patch)` — direct partial patch to any source node field
- `addSourceReferences(targetNodeId, sourceNodes[])` — bulk-add source references with auto variable name generation + loop ancestor detection
- `updateSourceReference(targetNodeId, refId, patch)` — inline edit of variable name, textReference flag, etc.
- `deleteSourceReference(targetNodeId, refId)` — remove a single source reference
- `clearSourceReferences(targetNodeId)` — remove all source references from a node

**New Files Created:**

- `src/components/mapper/node-editor/node-editor-panel.tsx` — Outer container; reads `selectedTargetNodeId` / `selectedSourceNodeId` from store; routes to `TargetNodeEditorTabs`, `SourceNodeEditor`, or `DropPlaceholder`. Tab bar has active-state indicators (count badges + glow dots) for refs, loop, loop conditions, and condition.
- `src/components/mapper/node-editor/value-editor.tsx` — Value tab; handles both code nodes (Monaco `vs-dark` editor) and regular nodes (value field + Insert menu, Plain Text / Debug Comment / Non-Empty / Quote checkboxes, Comment textarea, Format + Label + Error Message inputs). All fields auto-save on blur; one snapshot per edit session.
- `src/components/mapper/node-editor/source-refs-editor.tsx` — Source Refs tab; CSS grid table showing source path, editable variable name, text-reference checkbox, loop-over badge, and delete button per reference. Footer has Add Reference (opens SourceTreePicker) and Clear All actions.
- `src/components/mapper/node-editor/loop-editor.tsx` — Loop tab; lists all `LoopReference` objects collected from the target tree, selectable as the loop source; shows current source path; auto-suggests iterator name from source node name; Set / Clear actions.
- `src/components/mapper/node-editor/loop-conditions-editor.tsx` — Loop Conditions (Filter) tab; AND/OR connective toggle; rows with source path (read-only), condition expression input, text-reference checkbox, delete. Add Condition opens `SourceTreePicker` in single-select mode.
- `src/components/mapper/node-editor/condition-editor.tsx` — Condition tab; single textarea for the `NodeCondition.condition` JS expression; active-state indicator; Clear link; examples panel. Saves on blur via `store.setNodeCondition()`.
- `src/components/mapper/node-editor/source-node-editor.tsx` — Source node view; editable Name, Default Value, Comment, Label, Format fields; full path breadcrumb; saves via `store.updateSourceNode()`.
- `src/components/mapper/node-editor/source-tree-picker.tsx` — Dialog for selecting source tree nodes; flat list with depth indentation and type icons; search filter; multi or single-select mode.
- `src/components/mapper/node-editor/insert-value-menu.tsx` — Dropdown button in the Value tab; categorized submenus for Global Variables, Lookup Tables, Functions, System Variables, and current node's Source References. Calls `onInsert(value)` callback.

**Files Modified:**

- `src/components/mapper/mapper-flow.tsx` — Replaced the "(Phase 5)" placeholder div with `<NodeEditorPanel />` (live component); removed placeholder label.
- `src/components/mapper/index.ts` — Added barrel exports for all 9 new Phase 5 components.

### Definition of Done Checklist

- [x] Selecting a target node shows the NodeEditorPanel with all 5 tabs
- [x] Selecting a source node shows the SourceNodeEditor (name, value, comment, label, format)
- [x] Selecting no node shows the DropPlaceholder
- [x] Value tab: all fields save to store on blur; code nodes show Monaco editor
- [x] Source Refs tab: add/delete/edit variable names; text reference checkbox works
- [x] Loop tab: selecting a loop reference sets it on the node with auto-suggested iterator name
- [x] Loop Conditions tab: add/delete conditions; AND/OR connective selector works
- [x] Condition tab: condition expression saves to store on blur
- [x] InsertValueMenu shows global vars, lookup tables, functions, system vars, source refs
- [x] SourceTreePicker opens, filters by search, confirms selection
- [x] All mutations go through `store.snapshot()` before the mutation
- [x] 6 new store actions added and TypeScript-clean
- [x] All 287 existing tests still pass (`bun test`) — 0 failures
- [x] No new TypeScript/LSP errors in any Phase 5 files

---

## Phase 6: Transformation Engine

**Status:** Completed  
**Date:** 2026-02-21

### Summary

Extended `src/lib/mapper/engine.ts` with the full `MapperState`-aware transformation engine. The engine generates a self-contained JavaScript function body from a `MapperState` (analogous to `MapperWriter.createScript()` in the Vaadin/Groovy system) and executes it via `new Function()`. All existing exports are preserved for backward compatibility.

### What Was Built

**Files Modified:**

- `src/lib/mapper/engine.ts` — Extended with Phase 6 exports while keeping all existing functions intact:

    **New Types:**
    - `ScriptExecutionResult` — `{ output, error, scriptBody, durationMs }` interface
    - `TemplateType` — `'json_to_json' | 'json_to_xml' | 'xml_to_json' | 'xml_to_xml'`

    **New Exports:**
    - `generateScript(state, inputType, outputType)` — Generates a JS function body string from a `MapperState`. Produces 9 ordered sections: parse input → global variables → lookup tables → user functions → prolog → top-level source ref declarations → output construction → epilog → return output.
    - `executeScript(scriptBody, input, context)` — Executes a generated script body via `new Function('input', 'parseXML', 'toXML', ...)`. Returns `Promise<ScriptExecutionResult>`, never throws. Captures errors into `result.error`.
    - `detectTemplateType(state)` — Detects `json_to_json`, `xml_to_json`, etc. from `state.sourceInputType` / `state.targetInputType`.

    **Internal helpers (non-exported):**
    - `encodePath(rawPath)` — Converts dot-path from `getFullPath()` to valid JS accessor string; strips leading `root` segment; handles `[]` arrayChild markers, `@attribute` notation, and special chars.
    - `buildSourceAccessPath(ref, sourceTree, activeLoopRef, iterVar)` — Builds `sourceData.path.to.field` or `iterVar.field` for loop-scoped refs. Respects `customPath` override.
    - `buildLoopSourcePath(loopRef, sourceTree)` — Builds the iterable expression for a `for...of` loop. If loopRef points to an `arrayChild` node, uses parent array path.
    - `buildLoopConditionPath(lc, iterVar, sourceTree, loopRef)` — Builds relative path for loop filter conditions.
    - `buildValueExpression(node)` — Returns the RHS JS expression: quoted literal (`plainTextValue=true`), raw expression, single ref variable, or multi-ref template literal.
    - `buildOutputPath(node, outputVar, targetTree)` — Builds the LHS output accessor. Walks the ancestor chain; array nodes with `loopReference` trigger `[arr.length - 1]` indexing for the next child element (loop push pattern).
    - `getAncestorChain(nodeId, tree)` — Returns ordered ancestor list from root's children to the node (used by `buildOutputPath`).
    - `collectLoopScopedRefs(node, loopId)` — Recursively collects all `SourceReference` objects in a subtree whose `loopOverId` matches the given loop id. Used to declare all loop-scoped variables at the top of a `for` loop body.
    - `generateGlobalVariables(context)` — Emits `const NAME = value` declarations; plain text values are JSON-quoted.
    - `generateLookupTables(context)` — Emits `const TABLE_NAME = { "key": value, ... }` objects.
    - `generateFunctions(context)` — Emits user function bodies verbatim.
    - `generateSourceRefVariables(state)` — Emits top-level `const varName = sourceData.path` for all refs without a `loopOverId`.
    - `generateOutputSection(state)` — Initializes `const output = {}` and recursively generates all target node assignments.
    - `generateTargetNode(node, state, outputVar, indentLevel, activeLoopRef, activeIterVar)` — Core recursive code generator. Handles: code nodes (verbatim), node conditions (outer if), loop for-blocks, loop filter conditions, array initialization + push, loop-scoped ref declarations, value assignments, children recursion, closing braces.
    - `parseXMLInput(xmlString)` — Internal XML parser using `fast-xml-parser` (injected as `parseXML` parameter to generated functions).

- `src/lib/mapper/__tests__/engine.test.ts` — Added 39 new Phase 6 tests across 12 describe blocks:
    - `generateScript - simple JSON→JSON mapping` (5 tests)
    - `generateScript - XML source` (1 test)
    - `generateScript - XML output` (1 test)
    - `generateScript - loops` (4 tests)
    - `generateScript - loop conditions` (1 test)
    - `generateScript - node conditions` (1 test)
    - `generateScript - plain text value` (2 tests)
    - `generateScript - global variables` (2 tests)
    - `generateScript - lookup tables` (1 test)
    - `generateScript - user functions` (1 test)
    - `generateScript - prolog and epilog` (2 tests)
    - `generateScript - code nodes` (1 test)
    - `generateScript - debug comments` (2 tests)
    - `generateScript - multiple source refs` (1 test)
    - `detectTemplateType` (4 tests)
    - `executeScript` (7 tests)
    - `generateScript + executeScript integration` (3 tests)

### Key Implementation Notes

- **Root node stripping**: `getFullPath()` includes the root node name in the path (e.g., `root.order.id`). The engine strips the leading `root` segment in `encodePath()` and `buildOutputPath()` so generated paths are `sourceData.order.id` and `output.order.id`.
- **Array push pattern**: When a target array node has a `loopReference`, the engine generates `output.arr = output.arr || []` + `output.arr.push({})` at the start of the loop, and uses `output.arr[output.arr.length - 1].field` for child node assignments.
- **Loop-scoped refs**: All `SourceReference` objects with a matching `loopOverId` are collected recursively from the entire loop subtree and declared at the top of the `for` loop body (before any child assignments).
- **Backward compat**: All 7 original engine exports (`evaluateCondition`, `applyTransform`, `applyMappings`, `generateJSONOutput`, `generateXMLOutput`, `treeToData`, `parseInput`) are completely unchanged.

### Definition of Done Checklist

- [x] `generateScript(state, 'json', 'json')` produces a valid JS function body for a simple mapping
- [x] Generated script handles: source refs, loops, loop conditions, node conditions, code nodes
- [x] Generated script injects: global vars, lookup tables, functions, prolog, epilog
- [x] `executeScript()` runs the generated script and returns output without throwing
- [x] Error in script execution is captured in `result.error`, not thrown
- [x] All existing engine.ts exports still work (backward compat)
- [x] XML→JSON and JSON→XML template types both produce correct parse/serialize calls
- [x] `bun test` passes — 326 total tests, 0 failures (39 new tests added)
- [x] `bun run lint` passes — 0 ESLint errors

---

## Phase 7: File Upload Wizards

**Status:** Completed  
**Date:** 2026-02-21

### Summary

Built the model import wizard dialogs. Created a 3-step `UploadModelDialog` for importing JSON/XML/XSD source and target models, added `applySourceModel` and `applyTargetModel` store actions, and rewrote `FileUpload` to use the wizard and show a model badge with Change/Clear buttons.

### What Was Built

**Files Modified:**

- `src/lib/mapper/store.ts` — Added `applySourceModel` and `applyTargetModel` store actions with full REPLACE / ADD_ONLY / DELETE_ONLY / MERGE / RESET logic using `mergeTrees()`. Also imported `mergeTrees` from `node-utils` and `ApplyMethod` type. REPLACE and RESET both clear all source references from the target tree.

- `src/components/mapper/file-upload.tsx` — Complete rewrite: now opens `UploadModelDialog` on click (no direct file input). When a tree is loaded, shows a glass-morphism file badge with node count, an Upload (Change) icon button, and an X (Clear) button. Clear uses `applySourceModel/applyTargetModel` with REPLACE to wipe the model cleanly.

- `src/components/mapper/index.ts` — Added barrel export for `UploadModelDialog`.

**Files Created:**

- `src/components/mapper/upload-model-dialog.tsx` — 3-step wizard modal dialog:
    - **Step 1 — Select Method**: 2×2 method card grid. "File Upload" is active; REST API, Database, EDI Standard are shown disabled with "Soon" badge and tooltip.
    - **Step 2 — File Upload**: Drag-and-drop zone + click-to-browse. Accepts `.json`, `.xml`, `.xsd`. Auto-detects format (JSON/XML). Shows inline error for parse failures, empty files, unsupported extensions. After successful parse: shows format badge + `ModelPreview` (first 2 levels of tree, node count).
    - **Step 3 — Select Apply Method**: RadioGroup with all 5 `ApplyMethod` values (REPLACE default), each with a description. Shows summary of new vs. existing node counts.
    - **`StepIndicator`** — Pill row with check-mark for completed steps and connector lines.
    - **`ModelPreview`** + `PreviewNode` — Mini tree read-only view with `NodeTypeIcon`.
    - Dialog resets state on every open. Apply calls `store.snapshot()` before mutation.

### Definition of Done Checklist

- [x] `UploadModelDialog` opens as a glass-morphism 3-step wizard
- [x] Step 1: only File Upload method is active; REST/DB/EDI shown as disabled with "Soon" badge
- [x] Step 2: file drop zone accepts .json, .xml, .xsd; auto-detects format; shows preview tree
- [x] Step 2: error shown inline for invalid/empty files
- [x] Step 3: all 5 apply methods shown with descriptions; REPLACE is default
- [x] Apply button calls correct store action with new model + apply method
- [x] `store.applySourceModel()` with REPLACE clears all references and source refs from target tree
- [x] `store.applySourceModel()` with ADD_ONLY / MERGE / DELETE_ONLY uses `mergeTrees()`
- [x] `FileUpload` component shows file badge with Change/Clear buttons after model loaded
- [x] All 326 existing tests still pass (`bun test`) — 0 failures

---

## Phase 8: Execute / Test Panel

**Status:** Completed  
**Date:** 2026-02-21

### Summary

Built the full-screen Execute / Test modal dialog (`ExecuteDialog`) that lets users paste input data, view the generated JavaScript transformation script, run it in-browser, and inspect the output — all within a three-pane Monaco-powered interface. Wired the [Execute] button in the toolbar to open the dialog. Created a stub `ExecutePanel` for the future inline-panel stretch goal.

### What Was Built

**Files Created:**

- `src/components/mapper/execute-dialog.tsx` — Full-screen execute modal (`92vw × 88vh`) with:
    - **Header**: Dialog title, `TypeSelector` (JSON→JSON / XML→JSON / JSON→XML / XML→XML), missing-model warning badge, [View Script] + [Run] buttons
    - **Input pane**: Monaco editor (`vs-dark`, editable, language auto-detected from template type) with glass-morphism pane header showing type badge
    - **Script pane** (collapsible): Read-only Monaco editor showing the generated JS transformation body; toggle with `ChevronLeft/Right` button; auto-collapses to `w-8` slim rail when hidden; auto-shows on execution error for debugging
    - **Output pane**: Read-only Monaco editor showing transformation result or `ERROR:\n...` on failure
    - **Footer**: Color-coded `StatusLabel` (idle/running/success/error states with timing), [Close] button
    - **State invalidation**: `useEffect` + `useRef` to detect `MapperState` reference changes and clear cached script text
    - **Template type sync**: `useEffect` re-detects template type from `state.sourceInputType` / `state.targetInputType` changes
    - **Error handling**: All errors captured into output pane + status label; never thrown; script pane auto-shown on error
    - **Disabled states**: [Run] disabled when no input text, no source tree, or no target tree; [View Script] disabled without both trees

- `src/components/mapper/execute-panel.tsx` — Stub file for future inline execution panel (returns `null`; placeholder for Phase 8+ stretch goal)

**Files Modified:**

- `src/components/mapper/mapper-toolbar.tsx` — Replaced `toggleExecutePanel` store action with local `useState(false)` + `ExecuteDialog` mounted directly in the toolbar. The Execute button now opens the full-screen dialog instead of toggling the (not-yet-built) inline panel.

- `src/components/mapper/index.ts` — Added barrel exports for `ExecuteDialog` and `ExecutePanel`.

### Definition of Done Checklist

- [x] Clicking [Execute] in toolbar opens the full-screen execute dialog
- [x] Template type is auto-detected from state; can be overridden via Select
- [x] [View Script] generates and displays the script in the center pane
- [x] [Run] button executes the script against the input and shows output
- [x] Execution errors shown in output pane (not thrown)
- [x] Status label shows running/done/error state with timing
- [x] Script pane toggles show/hide smoothly (CSS transition)
- [x] All three Monaco editors use `vs-dark` theme and `Geist Mono Variable` font
- [x] Run is disabled when no input text is entered
- [x] Run is disabled when source or target tree is not loaded
- [x] Missing model warning shown inline in dialog header
- [x] Script pane auto-shows on execution error for debugging
- [x] `bun run lint` passes — 0 ESLint errors

---

## Phase 9: Excel Import/Export

**Status:** Completed  
**Date:** 2026-02-21

### Summary

Implemented full Excel-based import and export of `MapperState` using the `xlsx` npm library (TypeScript equivalent of `JTSheetStateWriter.java` / `ExcelStateReader.java` from the Vaadin system). Added a 3-step import wizard dialog, integrated download and upload buttons into the mapper toolbar, and wired two new bulk store actions required by the import workflow.

### What Was Built

**Files Created:**

- `src/lib/mapper/excel-export.ts` — Workbook builder with 6 sheets:
    - **Source Nodes** — Flattened source tree (UUID, name, value, parent UUID, metadata columns) for machine-importable tree reconstruction.
    - **Target Nodes** — Flattened target tree with full mapping metadata (loop ref path, iterator, source refs, node condition) — human-readable audit view.
    - **References** — Flat reference list keyed by UUIDs (not XPaths). Includes `isLoop` + `loopIterator` columns. This is the machine-import sheet.
    - **Global Variables** — Name / Value / Is Plain Text rows.
    - **Lookup Tables** — Table name header rows + key/value/isPlainText entry rows with blank separators.
    - **Functions** — Function Name / Body rows.
    - Public exports: `downloadAsExcel(state, filename?)` (triggers browser download via `XLSX.writeFile`), `stateToExcelBlob(state)` (returns `Blob` for testing).

- `src/lib/mapper/excel-import.ts` — Sheet parser returning `ExcelImportResult`:
    - `readExcelFile(file: File): Promise<ExcelImportResult>` — reads `ArrayBuffer`, parses all 6 known sheets, reconstructs trees from UUID + parent UUID, wires `SourceReference` / `LoopReference` objects onto parsed target nodes, builds flat `FlatReference[]` list.
    - `ExcelImportResult` — includes `state: Partial<MapperState>`, `errors: ExcelImportError[]`, `sheetNames: string[]`, and `counts` (per-section item counts for preview step).
    - Presence-checking via `sheetNames.includes(...)` to avoid false positives on missing sheets.
    - Never throws — all parse errors collected into `errors[]`.

- `src/components/mapper/upload-excel-dialog.tsx` — 3-step glass-morphism wizard dialog:
    - **Step 1 — Upload**: Drag-and-drop drop zone + click-to-browse (`.xlsx` / `.xls`). Shows file name + sheet list after successful parse. Shows inline error on parse failure.
    - **Step 2 — Options**: Override vs. Merge radio toggle (2-card selector). Six section checkboxes (Source Nodes, Target Nodes, References, Global Variables, Lookup Tables, Functions) with auto-disabled state when section not found in file and item count descriptions.
    - **Step 3 — Preview**: `CountBadge` summary grid per section. Warnings panel (scrollable, destructive tint) for any `ExcelImportError[]`. [Import] blocked if no parseable data found.
    - Import action calls `store.snapshot()` then applies selected sections via `applySourceModel`, `applyTargetModel`, `setReferences`, `updateContext`.

**Files Modified:**

- `src/lib/mapper/store.ts` — Added two new bulk actions for Phase 9:
    - `setReferences(references: FlatReference[])` — replaces the entire `state.references` array (used by Excel import to restore mappings).
    - `updateContext(patch: Partial<MapperContext>)` — merges a partial `localContext` patch (used to bulk-restore global variables, lookup tables, functions from Excel).
    - Added `FlatReference` and `MapperContext` to the top-level type imports.

- `src/components/mapper/mapper-toolbar.tsx` — Added Excel export + import buttons between Execute and Undo/Redo:
    - **Sheet icon button** — calls `downloadAsExcel(mapperState)` directly; always enabled (exports whatever state is loaded).
    - **Upload icon button** — opens `UploadExcelDialog`.
    - Imports `downloadAsExcel` from `@/lib/mapper/excel-export`; mounts `<UploadExcelDialog>` locally.

- `src/components/mapper/index.ts` — Added `UploadExcelDialog` barrel export.

### Definition of Done Checklist

- [x] `downloadAsExcel(state)` generates a valid xlsx file and triggers browser download
- [x] Downloaded file has sheets: Source Nodes, Target Nodes, References, Global Variables, Lookup Tables, Functions
- [x] `readExcelFile(file)` parses the exported format back into a partial `MapperState`
- [x] References sheet uses UUIDs for node lookup (not XPaths) to avoid path collision issues
- [x] `UploadExcelDialog` wizard: 3 steps (upload → options → preview/confirm)
- [x] Import preview shows node counts and any errors/warnings
- [x] Import respects checkboxes — only selected sections are applied
- [x] Error cells/rows are reported in `ExcelImportError[]` without crashing
- [x] `setReferences` and `updateContext` store actions added and TypeScript-clean
- [x] Toolbar has Excel download (Sheet icon) and import (Upload icon) buttons
- [x] All 326 existing tests still pass (`bun test`) — 0 failures
- [x] `bun run lint` passes — 0 ESLint errors

---

## Phase 10: Persistence & File I/O

**Status:** Completed  
**Date:** 2026-02-21

### Summary

Implemented the full save/load/open cycle for mapper states: localStorage persistence with an index, `.jtmap` file download and upload (supporting both new v1 and old Vaadin formats via migration), named Save As dialog, and complete wiring of all toolbar file actions. Added `beforeunload` guard to protect unsaved work.

### What Was Built

**Files Created:**

- `src/lib/mapper/persistence.ts` — All persistence logic, store-agnostic:
    - `SavedMapEntry` interface (id, name, savedAt, sourceInputType, targetInputType, nodeCount)
    - `listSavedMaps()` — reads the `jtmapper:index` array from localStorage, sorted newest-first
    - `saveToLocal(state, name, id?)` — stores full MapperState JSON under `jtmapper:map:{id}` and updates the index; guards against quota exceeded via `saveWithQuotaCheck()`
    - `loadFromLocal(id)` — loads and deserializes a single map by ID; returns null on miss/error
    - `deleteFromLocal(id)` — removes map data and index entry
    - `downloadAsJtmap(state, filename?)` — triggers browser download of state as a `.jtmap` JSON file via `URL.createObjectURL`
    - `loadFromJtmapFile(file)` — async `File` → `MapperState | null` with error string; handles both v1 and legacy Vaadin `.jtmap` formats via `parseJtmapJson`
    - `parseJtmapJson(json)` — detects format via `isMapperState` / `isLegacyJtmap` guards, delegates to `deserializeMapperState` or `migrateFromJtmap` accordingly

- `src/components/mapper/open-map-dialog.tsx` — "Open Mapper" glass-morphism dialog (`max-w-lg`):
    - Two tabs: **Saved Maps** and **Open File**
    - Saved Maps tab: search-filter input, scrollable `MapListRow` list (name, relative time badge, type+count badges, Open/Delete buttons per row), empty state
    - Open File tab: `FileDropZone` component accepting `.jtmap` (drag-drop or browse), parse result feedback, [Open] button enabled only after successful parse
    - `formatRelativeTime()` helper for human-friendly timestamps ("just now", "3h ago", "2d ago")
    - Delete action uses `window.confirm` before `deleteFromLocal()`
    - On open: calls `store.loadState(state, name, id)` then closes dialog

- `src/components/mapper/save-as-dialog.tsx` — Compact "Save Map As" dialog (`max-w-sm`):
    - Pre-fills input with current `currentResourceName`
    - [Save] calls `saveToLocal()`, then `store.setCurrentResource(name, id)` + `store.setDirty(false)`
    - Inline error display for empty name or quota errors
    - `Enter` key submits; auto-focuses input on open

**Files Modified:**

- `src/lib/mapper/store.ts` — Two targeted changes:
    - `loadState` signature extended to `loadState(state, name?, id?)` — optional `name`/`id` args set `currentResourceName` / `currentResourceId` when provided (used when loading saved maps or files)
    - `setCurrentResource(name, id)` action added — updates both `currentResourceName` and `currentResourceId` (used after Save As)

- `src/components/mapper/mapper-toolbar.tsx` — All toolbar actions fully wired:
    - **New** — `handleNew()` with `isDirty` confirm guard → `store.resetState()`
    - **Open** — opens `OpenMapDialog`
    - **Save** — `handleSave()`: saves to localStorage if `currentResourceId` exists, else opens `SaveAsDialog`
    - **Save As** — opens `SaveAsDialog` directly
    - **Download** button (new, Download icon) — calls `downloadAsJtmap(mapperState)`
    - Resource name area moved to `ml-auto` trailing position with dirty dot
    - Imports: `OpenMapDialog`, `SaveAsDialog`, `downloadAsJtmap`, `saveToLocal`

- `src/components/mapper/mapper-flow.tsx` — Added `useEffect` `beforeunload` guard:
    - Attaches `window.addEventListener('beforeunload', handler)` on mount
    - Handler calls `e.preventDefault()` + sets `e.returnValue = ""` if `useMapperStore.getState().isDirty`
    - Cleans up listener on unmount

- `src/components/mapper/index.ts` — Added barrel exports for `OpenMapDialog` and `SaveAsDialog`

### Definition of Done Checklist

- [x] [New] button resets state (with dirty check)
- [x] [Open] button opens `OpenMapDialog` with list of saved maps + file tab
- [x] [Save] saves to localStorage (or opens SaveAs if no current ID)
- [x] [Save As] opens `SaveAsDialog`, saves with new name
- [x] [Download .jtmap] triggers browser download of state as JSON
- [x] Opening a `.jtmap` file (new v1 format) loads correctly
- [x] Opening an old Vaadin `.jtmap` file (via migration) loads correctly
- [x] Dirty dot indicator appears after any change; disappears after save
- [x] `beforeunload` warns when closing tab with unsaved changes
- [x] Deleting a saved map from `OpenMapDialog` removes it from localStorage
- [x] All 326 existing tests still pass (`bun test`) — 0 failures
- [x] All new components bundle cleanly (bun build)

---

## Phase 11: Map Chains

**Status:** Completed  
**Date:** 2026-02-21

### Summary

Built the complete Map Chain feature at route `/map-chain`. A Map Chain is an ordered sequence of steps (JT Maps from localStorage and inline JavaScript scripts) where each step's output becomes the next step's input. Supports creating chains, reordering steps via drag-drop, executing chains step-by-step with intermediate output display, and saving/loading chains to localStorage or as `.jtchain` files.

Also added app-wide navigation: moved the root layout (background, header) to `__root.tsx`, added a `NavLink` component with Mapper / Map Chains tabs in the header, and updated `index.tsx` to just render `MapperFlow` directly.

### What Was Built

**New Library Files:**

- `src/lib/mapchain/types.ts` — `MapChainLinkType`, `MapChainLink`, `MapChain`, `ChainStepResult` type definitions.

- `src/lib/mapchain/store.ts` — `useMapChainStore` Zustand store with `immer` middleware:
    - Chain mutations: `setChainName`, `setTestInput`, `addLink`, `removeLink`, `moveLink`, `reorderLinks`, `updateLink`, `toggleLinkEnabled`, `setLinkMap`
    - Persistence actions: `loadChain`, `resetChain`, `setDirty`, `setCurrentChain`
    - Default chain factory: `createDefaultChain()` with UUID id + empty links

- `src/lib/mapchain/chain-engine.ts` — Chain execution engine:
    - `isChainExecutable(links)` — validates all enabled links are fully configured before execution
    - `executeChain(links, input, options)` — sequential execution with real-time callbacks: `onStepStart`, `onStepComplete`, `onChainComplete`, `onChainError`. JT_MAP links load from localStorage via `loadFromLocal()` + `generateScript()` + `executeScript()`. JT_SCRIPT links run via `new Function("input", ...)`. Disabled steps pass through input unchanged with "skipped" status. Stops chain on first error.

- `src/lib/mapchain/persistence.ts` — localStorage persistence with `jtchain:` key prefix:
    - `listSavedChains()` — reads `jtchain:index`, sorted newest-first
    - `saveChainToLocal(chain, name, id?)` — upserts chain JSON + updates index
    - `loadChainFromLocal(id)` — loads + parses chain JSON, strips `version` field
    - `deleteChainFromLocal(id)` — removes chain data + index entry
    - `downloadAsJtchain(chain, filename?)` — browser download as `.jtchain` JSON
    - `loadFromJtchainFile(file)` — async `File` → `MapChain | null` with error string

**New Component Files:**

- `src/components/mapchain/chain-script-editor.tsx` — Monaco editor (`vs-dark`, JavaScript, Geist Mono, no minimap, word wrap) used for inline JT_SCRIPT step editing.

- `src/components/mapchain/chain-link-row.tsx` — Single chain step row with `useSortable` DnD handle. Header row: step number circle, drag handle, type badge (peach=Map, lavender=Script), name, enable/disable + up/down/delete action buttons. Content area: `MapLinkContent` (Base UI Select with saved map list) or `ScriptLinkContent` (script name input + collapsible Monaco editor).

- `src/components/mapchain/chain-grid.tsx` — DnD-Kit `DndContext` + `SortableContext` (vertical list strategy). Maps links to `ChainLinkRow` components. Shows `EmptyChainState` when no links.

- `src/components/mapchain/chain-execute-dialog.tsx` — Full-screen execution dialog (`90vw × 85vh`):
    - Left 40% pane: Input Monaco editor (editable, auto-saved as `testInput`) + Output Monaco editor (read-only)
    - Right 60% pane: Scrollable `StepRow` list — each shows step number, type badge, name, status icon (Clock/Loader2/CheckCircle/XCircle/MinusCircle), duration, and expandable output Monaco editor
    - Footer: [Run] button (disabled when no input or no steps) + [Close] button
    - `handleRun()` resets all steps to pending then calls `executeChain()` with reactive `setStepResults` callbacks
    - Test input is persisted to `chain.testInput` via `setTestInput`

- `src/components/mapchain/chain-toolbar.tsx` — Glass-morphism toolbar matching mapper toolbar style:
    - File group: New (with dirty guard), Open (opens `ChainOpenDialog`), Save, Save As (opens `ChainSaveAsDialog`), Download
    - Add steps: `+ Add Map` (peach tint), `+ Add Script` (lavender tint)
    - Execute: Disabled if `!isChainExecutable(chain.links)`, opens `ChainExecuteDialog`
    - Resource name + dirty dot (right side)
    - Inline `ChainOpenDialog`: search-filter list of saved chains + `.jtchain` file drop zone + delete with confirm
    - Inline `ChainSaveAsDialog`: name input, auto-fills from current name

- `src/components/mapchain/chain-view.tsx` — Top-level layout: `ChainToolbar` + scrollable `ChainGrid` pane.

**New Route:**

- `src/routes/map-chain.tsx` — `createFileRoute('/map-chain')({ component: ChainView })`
- `src/routeTree.gen.ts` — Updated to include `MapChainRoute` with all type declarations

**Modified Files:**

- `src/routes/__root.tsx` — Moved app shell (background gradient, header) here. Added `RootLayout` component with shared `<header>` containing a `NavLink` component for Mapper / Map Chains tabs. Added `Outlet` for child routes. `RootDocument` shell unchanged.

- `src/routes/index.tsx` — Simplified to just `component: MapperFlow` (shell now in root layout).

**Packages Installed:**

- `@dnd-kit/sortable@10.0.0`
- `@dnd-kit/utilities@3.2.2`

### Definition of Done Checklist

- [x] Route `/map-chain` renders `ChainView` (no errors)
- [x] [New] creates an empty chain
- [x] [+ Add Map] adds a JT_MAP link; map selector dropdown shows all localStorage-saved maps
- [x] [+ Add Script] adds a JT_SCRIPT link with Monaco editor
- [x] Links can be reordered via drag-drop (DnD Kit sortable)
- [x] Links can be moved up/down via arrow buttons
- [x] Links can be removed (with confirmation)
- [x] Links can be disabled/enabled via toggle
- [x] [Execute] opens `ChainExecuteDialog` with input/output panes and step-by-step grid
- [x] Execution runs steps sequentially, updating status icons in real-time
- [x] Intermediate output visible per step (via expandable row)
- [x] Errors in a step stop the chain and show the error on that step row
- [x] [Save] / [Save As] save chain to localStorage; [Download] downloads as `.jtchain`
- [x] Dirty indicator appears on unsaved changes
- [x] Disabled steps are visually dimmed and show "Skipped" status during execution
- [x] Navigation header added to root layout (Mapper / Map Chains tabs)
- [x] All 326 existing tests still pass (`bun test`) — 0 failures
- [x] `bun run lint` passes — 0 ESLint errors
- [x] TypeScript strict mode: no errors (`bun x tsc --noEmit`)
