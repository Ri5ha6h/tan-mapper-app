import { v4 as uuidv4 } from "uuid"
import { create } from "zustand"
import { immer } from "zustand/middleware/immer"
import { subscribeWithSelector } from "zustand/middleware"
import type {
    ApplyMethod,
    FlatReference,
    GlobalVariable,
    InputType,
    LookupEntry,
    LookupTable,
    LoopCondition,
    LoopReference,
    MapperContext,
    MapperNodeType,
    MapperPreferences,
    MapperState,
    MapperTreeNode,
    NodeCondition,
    SourceReference,
    TransformFunction,
} from "./types"
import {
    createEmptyMapperState,
    deepCopyNode,
    findNodeById,
    groupNodes as groupNodesUtil,
    insertChild,
    insertSibling,
    isLeaf,
    mergeTrees,
    moveNodeDown,
    moveNodeUp,
    removeNode,
    traverseDown,
    updateNode,
} from "./node-utils"
import {
    collectUsedVariableNames,
    createLoopReference,
    findNearestLoopAncestor,
    removeReferencesForSourceNode,
    suggestVariableName,
    syncFlatReferences,
} from "./reference-utils"
import { deserializeMapperState, serializeMapperState } from "./serialization"

const MAX_UNDO_HISTORY = 8

// ============================================================
// Store shape
// ============================================================

interface SelectionState {
    selectedSourceNodeId: string | null
    selectedTargetNodeId: string | null
}

interface UndoRedoState {
    undoStack: string[] // JSON snapshots of MapperState, newest first
    redoStack: string[] // JSON snapshots for redo
}

interface ClipboardState {
    copiedNode: MapperTreeNode | null
    copiedNodeSide: "source" | "target" | null
}

interface UIState {
    isDirty: boolean
    currentResourceName: string | null
    currentResourceId: string | null // localStorage key or future server ID
    isExecutePanelOpen: boolean
    isDSLMode: boolean // true = show DSL panel; false = show visual tree panel
}

export interface MapperStore extends SelectionState, UndoRedoState, ClipboardState, UIState {
    // ─── State ─────────────────────────────────────────────────────────────────
    mapperState: MapperState

    // ─── Computed helpers ──────────────────────────────────────────────────────
    canUndo: () => boolean
    canRedo: () => boolean

    // ─── Undo / Redo ───────────────────────────────────────────────────────────
    snapshot: () => void
    undo: () => void
    redo: () => void

    // ─── Load / Reset ──────────────────────────────────────────────────────────
    loadState: (state: MapperState, name?: string | null, id?: string | null) => void
    resetState: () => void
    setCurrentResource: (name: string, id: string) => void

    // ─── Tree mutations ────────────────────────────────────────────────────────
    setSourceTree: (tree: MapperTreeNode, inputType: InputType) => void
    setTargetTree: (tree: MapperTreeNode, inputType: InputType) => void
    applySourceModel: (
        newRoot: MapperTreeNode,
        inputType: InputType,
        applyMethod: ApplyMethod,
        originalContent?: string | null,
    ) => void
    applyTargetModel: (
        newRoot: MapperTreeNode,
        inputType: InputType,
        applyMethod: ApplyMethod,
    ) => void

    addChildNode: (
        parentId: string,
        side: "source" | "target",
        type: MapperNodeType,
        name: string,
    ) => void
    addSiblingNode: (
        siblingId: string,
        side: "source" | "target",
        type: MapperNodeType,
        name: string,
        position: "above" | "below",
    ) => void
    deleteNodes: (nodeIds: string[], side: "source" | "target") => void
    updateNodeFields: (
        nodeId: string,
        side: "source" | "target",
        patch: Partial<MapperTreeNode>,
    ) => void
    moveNode: (nodeId: string, side: "source" | "target", direction: "up" | "down") => void
    groupNodes: (nodeIds: string[], side: "source" | "target", groupName: string) => void

    // ─── Clipboard ─────────────────────────────────────────────────────────────
    copyNode: (nodeId: string, side: "source" | "target") => void
    pasteNode: (parentId: string, side: "source" | "target") => void

    // ─── Node field mutations ──────────────────────────────────────────────────
    updateTargetNode: (nodeId: string, patch: Partial<MapperTreeNode>) => void
    updateSourceNode: (nodeId: string, patch: Partial<MapperTreeNode>) => void

    // ─── Source reference mutations ────────────────────────────────────────────
    addSourceReferences: (targetNodeId: string, sourceNodes: MapperTreeNode[]) => void
    updateSourceReference: (
        targetNodeId: string,
        refId: string,
        patch: Partial<SourceReference>,
    ) => void
    deleteSourceReference: (targetNodeId: string, refId: string) => void
    clearSourceReferences: (targetNodeId: string) => void

    // ─── Mapping mutations ─────────────────────────────────────────────────────
    addMapping: (sourceNodeId: string, targetNodeId: string) => void
    removeReference: (referenceId: string) => void
    clearNodeMappings: (targetNodeId: string) => void
    clearAllMappings: (targetNodeId: string) => void
    renameVariable: (referenceId: string, newName: string) => void
    setCustomPath: (referenceId: string, customPath: string | null) => void

    // ─── Loop mutations ────────────────────────────────────────────────────────
    setLoopReference: (targetNodeId: string, loopRef: LoopReference | null) => void
    setLoopIterator: (targetNodeId: string, iteratorName: string) => void
    setLoopStatement: (targetNodeId: string, statement: string | null) => void
    addLoopCondition: (targetNodeId: string, condition: LoopCondition) => void
    removeLoopCondition: (targetNodeId: string, conditionId: string) => void
    updateLoopCondition: (
        targetNodeId: string,
        conditionId: string,
        patch: Partial<LoopCondition>,
    ) => void
    setLoopConditionsConnective: (targetNodeId: string, connective: "AND" | "OR") => void

    // ─── Node condition ────────────────────────────────────────────────────────
    setNodeCondition: (targetNodeId: string, condition: NodeCondition | null) => void

    // ─── Context mutations ─────────────────────────────────────────────────────
    addGlobalVariable: (variable: GlobalVariable) => void
    updateGlobalVariable: (id: string, patch: Partial<GlobalVariable>) => void
    removeGlobalVariable: (id: string) => void

    addLookupTable: (table: LookupTable) => void
    updateLookupTable: (id: string, patch: Partial<LookupTable>) => void
    removeLookupTable: (id: string) => void
    addLookupEntry: (tableId: string, entry: LookupEntry) => void
    updateLookupEntry: (tableId: string, entryId: string, patch: Partial<LookupEntry>) => void
    removeLookupEntry: (tableId: string, entryId: string) => void

    addFunction: (fn: TransformFunction) => void
    updateFunction: (id: string, patch: Partial<TransformFunction>) => void
    removeFunction: (id: string) => void

    setPrologScript: (script: string | null) => void
    setEpilogScript: (script: string | null) => void

    // ─── Bulk context / reference replacement (Phase 9 — Excel import) ─────────
    /** Replace the entire flat references array (used by Excel import). */
    setReferences: (references: FlatReference[]) => void
    /** Bulk-replace the entire localContext (or a partial subset). */
    updateContext: (patch: Partial<MapperContext>) => void

    // ─── Preferences ───────────────────────────────────────────────────────────
    updatePreferences: (patch: Partial<MapperPreferences>) => void

    // ─── Auto-map ──────────────────────────────────────────────────────────────
    autoMap: (options: {
        matchByName: boolean
        oneToMany: boolean
        includeSubNodes: boolean
    }) => void

    // ─── Selection ─────────────────────────────────────────────────────────────
    selectSourceNode: (nodeId: string | null) => void
    selectTargetNode: (nodeId: string | null) => void

    // ─── UI state ──────────────────────────────────────────────────────────────
    setDirty: (dirty: boolean) => void
    setResourceName: (name: string | null) => void
    setResourceId: (id: string | null) => void
    toggleExecutePanel: () => void
    setDSLMode: (enabled: boolean) => void
}

// ============================================================
// Internal helpers
// ============================================================

/** Remove a reference by ID from a target node's sourceReferences array (immutable).
 *  Also clears the node's value if removing the last source reference. */
function removeRefFromNode(node: MapperTreeNode, referenceId: string): MapperTreeNode {
    if (!node.sourceReferences && !node.loopReference) {
        if (node.children) {
            return {
                ...node,
                children: node.children.map((c) => removeRefFromNode(c, referenceId)),
            }
        }
        return node
    }
    const updates: Partial<MapperTreeNode> = {}
    if (node.loopReference?.id === referenceId) {
        updates.loopReference = undefined
        updates.loopIterator = undefined
    }
    if (node.sourceReferences) {
        const filtered = node.sourceReferences.filter((r) => r.id !== referenceId)
        if (filtered.length !== node.sourceReferences.length) {
            updates.sourceReferences = filtered
            // Clear value when last reference is removed
            if (filtered.length === 0) {
                updates.value = undefined
            }
        }
    }
    const updated = { ...node, ...updates }
    if (node.children) {
        updated.children = node.children.map((c) => removeRefFromNode(c, referenceId))
    }
    return updated
}

/** Remove all sourceReferences from a specific target node (not descendants), and clear its value. */
function clearRefsFromNode(tree: MapperTreeNode, targetNodeId: string): MapperTreeNode {
    if (tree.id === targetNodeId) {
        const updated = { ...tree }
        delete updated.sourceReferences
        delete updated.value
        return updated
    }
    if (tree.children) {
        return { ...tree, children: tree.children.map((c) => clearRefsFromNode(c, targetNodeId)) }
    }
    return tree
}

/** Remove all sourceReferences from a target node AND all its descendants. */
function clearRefsRecursive(tree: MapperTreeNode, targetNodeId: string): MapperTreeNode {
    function clearSubtree(node: MapperTreeNode): MapperTreeNode {
        const updated = { ...node }
        delete updated.sourceReferences
        if (node.children) {
            updated.children = node.children.map(clearSubtree)
        }
        return updated
    }

    if (tree.id === targetNodeId) {
        return clearSubtree(tree)
    }
    if (tree.children) {
        return { ...tree, children: tree.children.map((c) => clearRefsRecursive(c, targetNodeId)) }
    }
    return tree
}

/** Update a SourceReference by ID in a target tree. */
function updateRefInTree(
    tree: MapperTreeNode,
    referenceId: string,
    updater: (ref: SourceReference) => SourceReference,
): MapperTreeNode {
    function visit(node: MapperTreeNode): MapperTreeNode {
        if (node.loopReference?.id === referenceId) {
            return {
                ...node,
                loopReference: updater(node.loopReference) as LoopReference,
            }
        }
        if (node.sourceReferences) {
            const idx = node.sourceReferences.findIndex((r) => r.id === referenceId)
            if (idx !== -1) {
                const newRefs = [...node.sourceReferences]
                newRefs[idx] = updater(newRefs[idx])
                return { ...node, sourceReferences: newRefs }
            }
        }
        if (node.children) {
            return { ...node, children: node.children.map(visit) }
        }
        return node
    }
    return visit(tree)
}

/** Move a child node up or down within its parent's children array. */
function moveNodeInTree(
    tree: MapperTreeNode,
    nodeId: string,
    direction: "up" | "down",
): MapperTreeNode {
    if (tree.children) {
        const idx = tree.children.findIndex((c) => c.id === nodeId)
        if (idx !== -1) {
            const newChildren =
                direction === "up"
                    ? moveNodeUp(tree.children, nodeId)
                    : moveNodeDown(tree.children, nodeId)
            return { ...tree, children: newChildren }
        }
        return { ...tree, children: tree.children.map((c) => moveNodeInTree(c, nodeId, direction)) }
    }
    return tree
}

// ============================================================
// Store creation
// ============================================================

export const useMapperStore = create<MapperStore>()(
    subscribeWithSelector(
        immer((set, get) => ({
            // ─── Initial state ──────────────────────────────────────────────────
            mapperState: createEmptyMapperState(),
            undoStack: [],
            redoStack: [],
            copiedNode: null,
            copiedNodeSide: null,
            selectedSourceNodeId: null,
            selectedTargetNodeId: null,
            isDirty: false,
            currentResourceName: null,
            currentResourceId: null,
            isExecutePanelOpen: false,
            isDSLMode: false,

            // ─── Computed ───────────────────────────────────────────────────────
            canUndo: () => get().undoStack.length > 0,
            canRedo: () => get().redoStack.length > 0,

            // ─── Undo / Redo ────────────────────────────────────────────────────
            snapshot: () => {
                set((state) => {
                    const json = serializeMapperState(state.mapperState)
                    state.undoStack = [json, ...state.undoStack].slice(0, MAX_UNDO_HISTORY)
                    state.redoStack = []
                })
            },

            undo: () => {
                set((state) => {
                    if (state.undoStack.length === 0) return
                    const [top, ...rest] = state.undoStack
                    const currentJson = serializeMapperState(state.mapperState)
                    state.redoStack = [currentJson, ...state.redoStack].slice(0, MAX_UNDO_HISTORY)
                    state.undoStack = rest
                    state.mapperState = deserializeMapperState(top)
                    state.isDirty = true
                })
            },

            redo: () => {
                set((state) => {
                    if (state.redoStack.length === 0) return
                    const [top, ...rest] = state.redoStack
                    const currentJson = serializeMapperState(state.mapperState)
                    state.undoStack = [currentJson, ...state.undoStack].slice(0, MAX_UNDO_HISTORY)
                    state.redoStack = rest
                    state.mapperState = deserializeMapperState(top)
                    state.isDirty = true
                })
            },

            // ─── Load / Reset ───────────────────────────────────────────────────
            loadState: (newState: MapperState, name?: string | null, id?: string | null) => {
                set((state) => {
                    state.mapperState = newState
                    state.undoStack = []
                    state.redoStack = []
                    state.isDirty = false
                    state.selectedSourceNodeId = null
                    state.selectedTargetNodeId = null
                    if (name !== undefined) state.currentResourceName = name ?? null
                    if (id !== undefined) state.currentResourceId = id ?? null
                })
            },

            setCurrentResource: (name: string, id: string) => {
                set((state) => {
                    state.currentResourceName = name
                    state.currentResourceId = id
                })
            },

            resetState: () => {
                set((state) => {
                    state.mapperState = createEmptyMapperState()
                    state.undoStack = []
                    state.redoStack = []
                    state.isDirty = false
                    state.selectedSourceNodeId = null
                    state.selectedTargetNodeId = null
                    state.currentResourceName = null
                    state.currentResourceId = null
                })
            },

            // ─── Tree mutations ─────────────────────────────────────────────────
            setSourceTree: (tree: MapperTreeNode, inputType: InputType) => {
                set((state) => {
                    state.mapperState.sourceTreeNode = tree
                    state.mapperState.sourceInputType = inputType
                    state.mapperState.references = syncFlatReferences(state.mapperState)
                    state.isDirty = true
                })
            },

            setTargetTree: (tree: MapperTreeNode, inputType: InputType) => {
                set((state) => {
                    state.mapperState.targetTreeNode = tree
                    state.mapperState.targetInputType = inputType
                    state.mapperState.references = syncFlatReferences(state.mapperState)
                    state.isDirty = true
                })
            },

            applySourceModel: (
                newRoot: MapperTreeNode,
                inputType: InputType,
                applyMethod: ApplyMethod,
                originalContent?: string | null,
            ) => {
                set((state) => {
                    const existing = state.mapperState.sourceTreeNode
                    // Store the raw uploaded file content for use in Execute dialog
                    if (originalContent !== undefined) {
                        state.mapperState.sourceOriginalContent = originalContent
                    }
                    if (applyMethod === "REPLACE") {
                        state.mapperState.sourceTreeNode = newRoot
                        state.mapperState.sourceInputType = inputType
                        // Clear all references — source changed means all refs invalid
                        state.mapperState.references = []
                        function clearAllSourceRefs(node: MapperTreeNode): MapperTreeNode {
                            const updated = { ...node }
                            delete updated.sourceReferences
                            delete updated.loopReference
                            delete updated.loopIterator
                            if (node.children) {
                                updated.children = node.children.map(clearAllSourceRefs)
                            }
                            return updated
                        }
                        if (state.mapperState.targetTreeNode) {
                            state.mapperState.targetTreeNode = clearAllSourceRefs(
                                state.mapperState.targetTreeNode,
                            )
                        }
                    } else if (applyMethod === "RESET") {
                        state.mapperState.sourceTreeNode = newRoot
                        state.mapperState.sourceInputType = inputType
                        state.mapperState.references = []
                        state.mapperState.localContext = {
                            globalVariables: [],
                            lookupTables: [],
                            functions: [],
                            prologScript: null,
                            epilogScript: null,
                        }
                        function clearAllRefs(node: MapperTreeNode): MapperTreeNode {
                            const updated = { ...node }
                            delete updated.sourceReferences
                            delete updated.loopReference
                            delete updated.loopIterator
                            if (node.children) {
                                updated.children = node.children.map(clearAllRefs)
                            }
                            return updated
                        }
                        if (state.mapperState.targetTreeNode) {
                            state.mapperState.targetTreeNode = clearAllRefs(
                                state.mapperState.targetTreeNode,
                            )
                        }
                    } else {
                        // ADD_ONLY, DELETE_ONLY, MERGE
                        if (existing) {
                            state.mapperState.sourceTreeNode = mergeTrees(
                                existing,
                                newRoot,
                                applyMethod,
                            )
                        } else {
                            state.mapperState.sourceTreeNode = newRoot
                        }
                        state.mapperState.sourceInputType = inputType
                        state.mapperState.references = syncFlatReferences(state.mapperState)
                    }
                    state.isDirty = true
                })
            },

            applyTargetModel: (
                newRoot: MapperTreeNode,
                inputType: InputType,
                applyMethod: ApplyMethod,
            ) => {
                set((state) => {
                    const existing = state.mapperState.targetTreeNode
                    if (applyMethod === "REPLACE") {
                        state.mapperState.targetTreeNode = newRoot
                        state.mapperState.targetInputType = inputType
                        state.mapperState.references = []
                    } else if (applyMethod === "RESET") {
                        state.mapperState.targetTreeNode = newRoot
                        state.mapperState.targetInputType = inputType
                        state.mapperState.references = []
                        state.mapperState.localContext = {
                            globalVariables: [],
                            lookupTables: [],
                            functions: [],
                            prologScript: null,
                            epilogScript: null,
                        }
                    } else {
                        // ADD_ONLY, DELETE_ONLY, MERGE
                        if (existing) {
                            state.mapperState.targetTreeNode = mergeTrees(
                                existing,
                                newRoot,
                                applyMethod,
                            )
                        } else {
                            state.mapperState.targetTreeNode = newRoot
                        }
                        state.mapperState.targetInputType = inputType
                        state.mapperState.references = syncFlatReferences(state.mapperState)
                    }
                    state.isDirty = true
                })
            },

            addChildNode: (
                parentId: string,
                side: "source" | "target",
                type: MapperNodeType,
                name: string,
            ) => {
                set((state) => {
                    const tree =
                        side === "source"
                            ? state.mapperState.sourceTreeNode
                            : state.mapperState.targetTreeNode
                    if (!tree) return

                    const newNode: MapperTreeNode = {
                        id: uuidv4(),
                        name,
                        type,
                    }
                    const updated = insertChild(tree, parentId, newNode)

                    if (side === "source") {
                        state.mapperState.sourceTreeNode = updated
                    } else {
                        state.mapperState.targetTreeNode = updated
                        state.mapperState.references = syncFlatReferences(state.mapperState)
                    }
                    state.isDirty = true
                })
            },

            addSiblingNode: (
                siblingId: string,
                side: "source" | "target",
                type: MapperNodeType,
                name: string,
                position: "above" | "below",
            ) => {
                set((state) => {
                    const tree =
                        side === "source"
                            ? state.mapperState.sourceTreeNode
                            : state.mapperState.targetTreeNode
                    if (!tree) return

                    const newNode: MapperTreeNode = {
                        id: uuidv4(),
                        name,
                        type,
                    }
                    const updated = insertSibling(tree, siblingId, position, newNode)

                    if (side === "source") {
                        state.mapperState.sourceTreeNode = updated
                    } else {
                        state.mapperState.targetTreeNode = updated
                        state.mapperState.references = syncFlatReferences(state.mapperState)
                    }
                    state.isDirty = true
                })
            },

            deleteNodes: (nodeIds: string[], side: "source" | "target") => {
                set((state) => {
                    if (side === "source") {
                        // Clean up references in target tree pointing to deleted nodes
                        let targetTree = state.mapperState.targetTreeNode
                        if (targetTree) {
                            for (const nodeId of nodeIds) {
                                targetTree = removeReferencesForSourceNode(nodeId, targetTree)
                            }
                            state.mapperState.targetTreeNode = targetTree
                        }

                        // Remove nodes from source tree
                        let sourceTree = state.mapperState.sourceTreeNode
                        if (sourceTree) {
                            for (const nodeId of nodeIds) {
                                sourceTree = removeNode(sourceTree, nodeId)
                            }
                            state.mapperState.sourceTreeNode = sourceTree
                        }
                    } else {
                        // Remove nodes from target tree
                        let targetTree = state.mapperState.targetTreeNode
                        if (targetTree) {
                            for (const nodeId of nodeIds) {
                                targetTree = removeNode(targetTree, nodeId)
                            }
                            state.mapperState.targetTreeNode = targetTree
                        }
                    }

                    state.mapperState.references = syncFlatReferences(state.mapperState)
                    state.isDirty = true
                })
            },

            updateNodeFields: (
                nodeId: string,
                side: "source" | "target",
                patch: Partial<MapperTreeNode>,
            ) => {
                set((state) => {
                    if (side === "source" && state.mapperState.sourceTreeNode) {
                        state.mapperState.sourceTreeNode = updateNode(
                            state.mapperState.sourceTreeNode,
                            nodeId,
                            patch,
                        )
                    } else if (side === "target" && state.mapperState.targetTreeNode) {
                        state.mapperState.targetTreeNode = updateNode(
                            state.mapperState.targetTreeNode,
                            nodeId,
                            patch,
                        )
                        state.mapperState.references = syncFlatReferences(state.mapperState)
                    }
                    state.isDirty = true
                })
            },

            moveNode: (nodeId: string, side: "source" | "target", direction: "up" | "down") => {
                set((state) => {
                    if (side === "source" && state.mapperState.sourceTreeNode) {
                        state.mapperState.sourceTreeNode = moveNodeInTree(
                            state.mapperState.sourceTreeNode,
                            nodeId,
                            direction,
                        )
                    } else if (side === "target" && state.mapperState.targetTreeNode) {
                        state.mapperState.targetTreeNode = moveNodeInTree(
                            state.mapperState.targetTreeNode,
                            nodeId,
                            direction,
                        )
                    }
                    state.isDirty = true
                })
            },

            groupNodes: (nodeIds: string[], side: "source" | "target", groupName: string) => {
                set((state) => {
                    if (side === "source" && state.mapperState.sourceTreeNode) {
                        state.mapperState.sourceTreeNode = groupNodesUtil(
                            state.mapperState.sourceTreeNode,
                            nodeIds,
                            groupName,
                            "element",
                        )
                    } else if (side === "target" && state.mapperState.targetTreeNode) {
                        state.mapperState.targetTreeNode = groupNodesUtil(
                            state.mapperState.targetTreeNode,
                            nodeIds,
                            groupName,
                            "element",
                        )
                        state.mapperState.references = syncFlatReferences(state.mapperState)
                    }
                    state.isDirty = true
                })
            },

            // ─── Clipboard ──────────────────────────────────────────────────────
            copyNode: (nodeId: string, side: "source" | "target") => {
                set((state) => {
                    const tree =
                        side === "source"
                            ? state.mapperState.sourceTreeNode
                            : state.mapperState.targetTreeNode
                    if (!tree) return
                    const node = findNodeById(nodeId, tree)
                    if (!node) return
                    state.copiedNode = node
                    state.copiedNodeSide = side
                })
            },

            pasteNode: (parentId: string, side: "source" | "target") => {
                set((state) => {
                    if (!state.copiedNode) return
                    const tree =
                        side === "source"
                            ? state.mapperState.sourceTreeNode
                            : state.mapperState.targetTreeNode
                    if (!tree) return

                    // Deep copy with new UUIDs to avoid ID collisions
                    const pasted = deepCopyNode(state.copiedNode)
                    const updated = insertChild(tree, parentId, pasted)

                    if (side === "source") {
                        state.mapperState.sourceTreeNode = updated
                    } else {
                        state.mapperState.targetTreeNode = updated
                        state.mapperState.references = syncFlatReferences(state.mapperState)
                    }
                    state.isDirty = true
                })
            },

            // ─── Node field mutations ───────────────────────────────────────────
            updateTargetNode: (nodeId: string, patch: Partial<MapperTreeNode>) => {
                set((state) => {
                    if (!state.mapperState.targetTreeNode) return
                    state.mapperState.targetTreeNode = updateNode(
                        state.mapperState.targetTreeNode,
                        nodeId,
                        patch,
                    )
                    state.mapperState.references = syncFlatReferences(state.mapperState)
                    state.isDirty = true
                })
            },

            updateSourceNode: (nodeId: string, patch: Partial<MapperTreeNode>) => {
                set((state) => {
                    if (!state.mapperState.sourceTreeNode) return
                    state.mapperState.sourceTreeNode = updateNode(
                        state.mapperState.sourceTreeNode,
                        nodeId,
                        patch,
                    )
                    state.isDirty = true
                })
            },

            // ─── Source reference mutations ─────────────────────────────────────
            addSourceReferences: (targetNodeId: string, sourceNodes: MapperTreeNode[]) => {
                set((state) => {
                    const sourceTree = state.mapperState.sourceTreeNode
                    const targetTree = state.mapperState.targetTreeNode
                    if (!sourceTree || !targetTree) return

                    const targetNode = findNodeById(targetNodeId, targetTree)
                    if (!targetNode) return

                    const usedNames = collectUsedVariableNames(state.mapperState)
                    const newRefs: SourceReference[] = []

                    for (const srcNode of sourceNodes) {
                        // Skip if already referenced
                        const alreadyReferenced = targetNode.sourceReferences?.some(
                            (r) => r.sourceNodeId === srcNode.id,
                        )
                        if (alreadyReferenced) continue

                        const varName = suggestVariableName(srcNode.name, usedNames)
                        usedNames.add(varName)

                        const loopRef = findNearestLoopAncestor(
                            targetNodeId,
                            srcNode.id,
                            state.mapperState,
                        )

                        newRefs.push({
                            id: uuidv4(),
                            sourceNodeId: srcNode.id,
                            variableName: varName,
                            textReference: true,
                            loopOverId: loopRef?.id,
                        })
                    }

                    if (newRefs.length === 0) return

                    state.mapperState.targetTreeNode = updateNode(targetTree, targetNodeId, {
                        sourceReferences: [...(targetNode.sourceReferences ?? []), ...newRefs],
                    })
                    state.mapperState.references = syncFlatReferences(state.mapperState)
                    state.isDirty = true
                })
            },

            updateSourceReference: (
                targetNodeId: string,
                refId: string,
                patch: Partial<SourceReference>,
            ) => {
                set((state) => {
                    if (!state.mapperState.targetTreeNode) return
                    const targetNode = findNodeById(targetNodeId, state.mapperState.targetTreeNode)
                    if (!targetNode?.sourceReferences) return
                    state.mapperState.targetTreeNode = updateNode(
                        state.mapperState.targetTreeNode,
                        targetNodeId,
                        {
                            sourceReferences: targetNode.sourceReferences.map((r) =>
                                r.id === refId ? { ...r, ...patch } : r,
                            ),
                        },
                    )
                    state.mapperState.references = syncFlatReferences(state.mapperState)
                    state.isDirty = true
                })
            },

            deleteSourceReference: (targetNodeId: string, refId: string) => {
                set((state) => {
                    if (!state.mapperState.targetTreeNode) return
                    const targetNode = findNodeById(targetNodeId, state.mapperState.targetTreeNode)
                    if (!targetNode?.sourceReferences) return
                    const remaining = targetNode.sourceReferences.filter((r) => r.id !== refId)
                    const patch: Partial<MapperTreeNode> = { sourceReferences: remaining }
                    // Clear value when last reference is removed
                    if (remaining.length === 0) {
                        patch.value = undefined
                    }
                    state.mapperState.targetTreeNode = updateNode(
                        state.mapperState.targetTreeNode,
                        targetNodeId,
                        patch,
                    )
                    state.mapperState.references = syncFlatReferences(state.mapperState)
                    state.isDirty = true
                })
            },

            clearSourceReferences: (targetNodeId: string) => {
                set((state) => {
                    if (!state.mapperState.targetTreeNode) return
                    state.mapperState.targetTreeNode = updateNode(
                        state.mapperState.targetTreeNode,
                        targetNodeId,
                        { sourceReferences: [], value: undefined },
                    )
                    state.mapperState.references = syncFlatReferences(state.mapperState)
                    state.isDirty = true
                })
            },

            // ─── Mapping mutations ──────────────────────────────────────────────
            addMapping: (sourceNodeId: string, targetNodeId: string) => {
                set((state) => {
                    const sourceTree = state.mapperState.sourceTreeNode
                    const targetTree = state.mapperState.targetTreeNode
                    if (!sourceTree || !targetTree) return

                    // Find source and target nodes
                    const sourceNode = findNodeById(sourceNodeId, sourceTree)
                    const targetNode = findNodeById(targetNodeId, targetTree)
                    if (!targetNode || !sourceNode) return

                    // ── Array-to-array: auto-create a LoopReference ────────────
                    const isSourceArray =
                        sourceNode.type === "array" || sourceNode.type === "arrayChild"
                    const isTargetArray =
                        targetNode.type === "array" || targetNode.type === "arrayChild"

                    if (isSourceArray && isTargetArray) {
                        // Don't create a duplicate loop reference on this node
                        if (targetNode.loopReference) return

                        const usedNames = collectUsedVariableNames(state.mapperState)
                        const varName = suggestVariableName(sourceNode.name ?? "var", usedNames)
                        const iteratorName = `_${sourceNode.name ?? "item"}`

                        const loopRef = createLoopReference(sourceNodeId, varName)

                        state.mapperState.targetTreeNode = updateNode(targetTree, targetNodeId, {
                            loopReference: loopRef,
                            loopIterator: iteratorName,
                        })
                        state.mapperState.references = syncFlatReferences(state.mapperState)
                        state.isDirty = true
                        return
                    }

                    // ── Regular mapping ────────────────────────────────────────

                    // Check if source already referenced on this target
                    const alreadyReferenced = targetNode.sourceReferences?.some(
                        (r) => r.sourceNodeId === sourceNodeId,
                    )
                    if (alreadyReferenced) return

                    // Generate variable name
                    const usedNames = collectUsedVariableNames(state.mapperState)
                    const varName = suggestVariableName(sourceNode.name ?? "var", usedNames)

                    // Find nearest loop ancestor for auto-assign
                    const loopRef = findNearestLoopAncestor(
                        targetNodeId,
                        sourceNodeId,
                        state.mapperState,
                    )

                    // Create reference
                    const ref: SourceReference = {
                        id: uuidv4(),
                        sourceNodeId,
                        variableName: varName,
                        textReference: true,
                        loopOverId: loopRef?.id,
                    }

                    // Add to target node
                    const updatedTargetTree = updateNode(targetTree, targetNodeId, {
                        sourceReferences: [...(targetNode.sourceReferences ?? []), ref],
                        // Auto-set value if overrideTargetValue and no existing value
                        value:
                            state.mapperState.mapperPreferences.overrideTargetValue &&
                            !targetNode.value
                                ? varName
                                : targetNode.value,
                    })

                    state.mapperState.targetTreeNode = updatedTargetTree
                    state.mapperState.references = syncFlatReferences(state.mapperState)
                    state.isDirty = true
                })
            },

            removeReference: (referenceId: string) => {
                set((state) => {
                    if (!state.mapperState.targetTreeNode) return
                    state.mapperState.targetTreeNode = removeRefFromNode(
                        state.mapperState.targetTreeNode,
                        referenceId,
                    )
                    state.mapperState.references = syncFlatReferences(state.mapperState)
                    state.isDirty = true
                })
            },

            clearNodeMappings: (targetNodeId: string) => {
                set((state) => {
                    if (!state.mapperState.targetTreeNode) return
                    state.mapperState.targetTreeNode = clearRefsFromNode(
                        state.mapperState.targetTreeNode,
                        targetNodeId,
                    )
                    state.mapperState.references = syncFlatReferences(state.mapperState)
                    state.isDirty = true
                })
            },

            clearAllMappings: (targetNodeId: string) => {
                set((state) => {
                    if (!state.mapperState.targetTreeNode) return
                    state.mapperState.targetTreeNode = clearRefsRecursive(
                        state.mapperState.targetTreeNode,
                        targetNodeId,
                    )
                    state.mapperState.references = syncFlatReferences(state.mapperState)
                    state.isDirty = true
                })
            },

            renameVariable: (referenceId: string, newName: string) => {
                set((state) => {
                    if (!state.mapperState.targetTreeNode) return
                    state.mapperState.targetTreeNode = updateRefInTree(
                        state.mapperState.targetTreeNode,
                        referenceId,
                        (ref) => ({ ...ref, variableName: newName }),
                    )
                    state.mapperState.references = syncFlatReferences(state.mapperState)
                    state.isDirty = true
                })
            },

            setCustomPath: (referenceId: string, customPath: string | null) => {
                set((state) => {
                    if (!state.mapperState.targetTreeNode) return
                    state.mapperState.targetTreeNode = updateRefInTree(
                        state.mapperState.targetTreeNode,
                        referenceId,
                        (ref) => {
                            const updated = { ...ref }
                            if (customPath === null) {
                                delete updated.customPath
                            } else {
                                updated.customPath = customPath
                            }
                            return updated
                        },
                    )
                    state.mapperState.references = syncFlatReferences(state.mapperState)
                    state.isDirty = true
                })
            },

            // ─── Loop mutations ─────────────────────────────────────────────────
            setLoopReference: (targetNodeId: string, loopRef: LoopReference | null) => {
                set((state) => {
                    if (!state.mapperState.targetTreeNode) return
                    state.mapperState.targetTreeNode = updateNode(
                        state.mapperState.targetTreeNode,
                        targetNodeId,
                        loopRef
                            ? { loopReference: loopRef, loopIterator: loopRef.variableName }
                            : { loopReference: undefined, loopIterator: undefined },
                    )
                    state.mapperState.references = syncFlatReferences(state.mapperState)
                    state.isDirty = true
                })
            },

            setLoopIterator: (targetNodeId: string, iteratorName: string) => {
                set((state) => {
                    if (!state.mapperState.targetTreeNode) return
                    state.mapperState.targetTreeNode = updateNode(
                        state.mapperState.targetTreeNode,
                        targetNodeId,
                        { loopIterator: iteratorName },
                    )
                    state.isDirty = true
                })
            },

            setLoopStatement: (targetNodeId: string, statement: string | null) => {
                set((state) => {
                    if (!state.mapperState.targetTreeNode) return
                    state.mapperState.targetTreeNode = updateNode(
                        state.mapperState.targetTreeNode,
                        targetNodeId,
                        { loopStatement: statement ?? undefined },
                    )
                    state.isDirty = true
                })
            },

            addLoopCondition: (targetNodeId: string, condition: LoopCondition) => {
                set((state) => {
                    if (!state.mapperState.targetTreeNode) return
                    const node = findNodeById(targetNodeId, state.mapperState.targetTreeNode)
                    if (!node) return
                    state.mapperState.targetTreeNode = updateNode(
                        state.mapperState.targetTreeNode,
                        targetNodeId,
                        { loopConditions: [...(node.loopConditions ?? []), condition] },
                    )
                    state.isDirty = true
                })
            },

            removeLoopCondition: (targetNodeId: string, conditionId: string) => {
                set((state) => {
                    if (!state.mapperState.targetTreeNode) return
                    const node = findNodeById(targetNodeId, state.mapperState.targetTreeNode)
                    if (!node) return
                    state.mapperState.targetTreeNode = updateNode(
                        state.mapperState.targetTreeNode,
                        targetNodeId,
                        {
                            loopConditions: (node.loopConditions ?? []).filter(
                                (c) => c.id !== conditionId,
                            ),
                        },
                    )
                    state.isDirty = true
                })
            },

            updateLoopCondition: (
                targetNodeId: string,
                conditionId: string,
                patch: Partial<LoopCondition>,
            ) => {
                set((state) => {
                    if (!state.mapperState.targetTreeNode) return
                    const node = findNodeById(targetNodeId, state.mapperState.targetTreeNode)
                    if (!node) return
                    state.mapperState.targetTreeNode = updateNode(
                        state.mapperState.targetTreeNode,
                        targetNodeId,
                        {
                            loopConditions: (node.loopConditions ?? []).map((c) =>
                                c.id === conditionId ? { ...c, ...patch } : c,
                            ),
                        },
                    )
                    state.isDirty = true
                })
            },

            setLoopConditionsConnective: (targetNodeId: string, connective: "AND" | "OR") => {
                set((state) => {
                    if (!state.mapperState.targetTreeNode) return
                    state.mapperState.targetTreeNode = updateNode(
                        state.mapperState.targetTreeNode,
                        targetNodeId,
                        { loopConditionsConnective: connective },
                    )
                    state.isDirty = true
                })
            },

            // ─── Node condition ─────────────────────────────────────────────────
            setNodeCondition: (targetNodeId: string, condition: NodeCondition | null) => {
                set((state) => {
                    if (!state.mapperState.targetTreeNode) return
                    state.mapperState.targetTreeNode = updateNode(
                        state.mapperState.targetTreeNode,
                        targetNodeId,
                        { nodeCondition: condition ?? undefined },
                    )
                    state.isDirty = true
                })
            },

            // ─── Context mutations ──────────────────────────────────────────────
            addGlobalVariable: (variable: GlobalVariable) => {
                set((state) => {
                    state.mapperState.localContext.globalVariables.push(variable)
                    state.isDirty = true
                })
            },

            updateGlobalVariable: (id: string, patch: Partial<GlobalVariable>) => {
                set((state) => {
                    const idx = state.mapperState.localContext.globalVariables.findIndex(
                        (v) => v.id === id,
                    )
                    if (idx !== -1) {
                        state.mapperState.localContext.globalVariables[idx] = {
                            ...state.mapperState.localContext.globalVariables[idx],
                            ...patch,
                        }
                        state.isDirty = true
                    }
                })
            },

            removeGlobalVariable: (id: string) => {
                set((state) => {
                    state.mapperState.localContext.globalVariables =
                        state.mapperState.localContext.globalVariables.filter((v) => v.id !== id)
                    state.isDirty = true
                })
            },

            addLookupTable: (table: LookupTable) => {
                set((state) => {
                    state.mapperState.localContext.lookupTables.push(table)
                    state.isDirty = true
                })
            },

            updateLookupTable: (id: string, patch: Partial<LookupTable>) => {
                set((state) => {
                    const idx = state.mapperState.localContext.lookupTables.findIndex(
                        (t) => t.id === id,
                    )
                    if (idx !== -1) {
                        state.mapperState.localContext.lookupTables[idx] = {
                            ...state.mapperState.localContext.lookupTables[idx],
                            ...patch,
                        }
                        state.isDirty = true
                    }
                })
            },

            removeLookupTable: (id: string) => {
                set((state) => {
                    state.mapperState.localContext.lookupTables =
                        state.mapperState.localContext.lookupTables.filter((t) => t.id !== id)
                    state.isDirty = true
                })
            },

            addLookupEntry: (tableId: string, entry: LookupEntry) => {
                set((state) => {
                    const table = state.mapperState.localContext.lookupTables.find(
                        (t) => t.id === tableId,
                    )
                    if (table) {
                        table.entries.push(entry)
                        state.isDirty = true
                    }
                })
            },

            updateLookupEntry: (tableId: string, entryId: string, patch: Partial<LookupEntry>) => {
                set((state) => {
                    const table = state.mapperState.localContext.lookupTables.find(
                        (t) => t.id === tableId,
                    )
                    if (!table) return
                    const idx = table.entries.findIndex((e) => e.id === entryId)
                    if (idx !== -1) {
                        table.entries[idx] = { ...table.entries[idx], ...patch }
                        state.isDirty = true
                    }
                })
            },

            removeLookupEntry: (tableId: string, entryId: string) => {
                set((state) => {
                    const table = state.mapperState.localContext.lookupTables.find(
                        (t) => t.id === tableId,
                    )
                    if (table) {
                        table.entries = table.entries.filter((e) => e.id !== entryId)
                        state.isDirty = true
                    }
                })
            },

            addFunction: (fn: TransformFunction) => {
                set((state) => {
                    state.mapperState.localContext.functions.push(fn)
                    state.isDirty = true
                })
            },

            updateFunction: (id: string, patch: Partial<TransformFunction>) => {
                set((state) => {
                    const idx = state.mapperState.localContext.functions.findIndex(
                        (f) => f.id === id,
                    )
                    if (idx !== -1) {
                        state.mapperState.localContext.functions[idx] = {
                            ...state.mapperState.localContext.functions[idx],
                            ...patch,
                        }
                        state.isDirty = true
                    }
                })
            },

            removeFunction: (id: string) => {
                set((state) => {
                    state.mapperState.localContext.functions =
                        state.mapperState.localContext.functions.filter((f) => f.id !== id)
                    state.isDirty = true
                })
            },

            setPrologScript: (script: string | null) => {
                set((state) => {
                    state.mapperState.localContext.prologScript = script
                    state.isDirty = true
                })
            },

            setEpilogScript: (script: string | null) => {
                set((state) => {
                    state.mapperState.localContext.epilogScript = script
                    state.isDirty = true
                })
            },

            // ─── Bulk context / reference replacement (Phase 9 — Excel import) ──
            setReferences: (references) => {
                set((state) => {
                    state.mapperState.references = references as typeof state.mapperState.references
                    state.isDirty = true
                })
            },

            updateContext: (patch) => {
                set((state) => {
                    state.mapperState.localContext = {
                        ...state.mapperState.localContext,
                        ...patch,
                    }
                    state.isDirty = true
                })
            },

            // ─── Preferences ────────────────────────────────────────────────────
            updatePreferences: (patch: Partial<MapperPreferences>) => {
                set((state) => {
                    state.mapperState.mapperPreferences = {
                        ...state.mapperState.mapperPreferences,
                        ...patch,
                    }
                    state.isDirty = true
                })
            },

            // ─── Auto-map ───────────────────────────────────────────────────────
            autoMap: (options: {
                matchByName: boolean
                oneToMany: boolean
                includeSubNodes: boolean
            }) => {
                set((state) => {
                    const sourceTree = state.mapperState.sourceTreeNode
                    const targetTree = state.mapperState.targetTreeNode
                    if (!sourceTree || !targetTree) return

                    // Collect all source leaf nodes (name → node map)
                    const sourceLeaves = new Map<string, MapperTreeNode>()
                    traverseDown(sourceTree, (node) => {
                        if (isLeaf(node)) sourceLeaves.set(node.name.toLowerCase(), node)
                    })

                    const usedNames = collectUsedVariableNames(state.mapperState)

                    let updatedTargetTree = targetTree
                    traverseDown(targetTree, (targetNode) => {
                        // Skip non-leaf nodes unless includeSubNodes
                        if (!isLeaf(targetNode) && !options.includeSubNodes) return
                        // Skip already-mapped nodes
                        if (targetNode.sourceReferences?.length) return

                        const match = options.matchByName
                            ? sourceLeaves.get(targetNode.name.toLowerCase())
                            : undefined

                        if (match) {
                            const varName = suggestVariableName(match.name, usedNames)
                            usedNames.add(varName)
                            const ref: SourceReference = {
                                id: uuidv4(),
                                sourceNodeId: match.id,
                                variableName: varName,
                                textReference: true,
                            }
                            updatedTargetTree = updateNode(updatedTargetTree, targetNode.id, {
                                sourceReferences: [...(targetNode.sourceReferences ?? []), ref],
                                value: varName,
                            })
                        }
                    })

                    state.mapperState.targetTreeNode = updatedTargetTree
                    state.mapperState.references = syncFlatReferences(state.mapperState)
                    state.isDirty = true
                })
            },

            // ─── Selection ──────────────────────────────────────────────────────
            selectSourceNode: (nodeId: string | null) => {
                set((state) => {
                    state.selectedSourceNodeId = nodeId
                })
            },

            selectTargetNode: (nodeId: string | null) => {
                set((state) => {
                    state.selectedTargetNodeId = nodeId
                })
            },

            // ─── UI state ───────────────────────────────────────────────────────
            setDirty: (dirty: boolean) => {
                set((state) => {
                    state.isDirty = dirty
                })
            },

            setResourceName: (name: string | null) => {
                set((state) => {
                    state.currentResourceName = name
                })
            },

            setResourceId: (id: string | null) => {
                set((state) => {
                    state.currentResourceId = id
                })
            },

            toggleExecutePanel: () => {
                set((state) => {
                    state.isExecutePanelOpen = !state.isExecutePanelOpen
                })
            },

            setDSLMode: (enabled: boolean) => {
                set((state) => {
                    state.isDSLMode = enabled
                })
            },
        })),
    ),
)

// ============================================================
// Selector hooks
// ============================================================

export const useSource = () => useMapperStore((s) => s.mapperState.sourceTreeNode)
export const useTarget = () => useMapperStore((s) => s.mapperState.targetTreeNode)
export const useMappings = () => useMapperStore((s) => s.mapperState.references)
export const useMapperContext = () => useMapperStore((s) => s.mapperState.localContext)
export const usePreferences = () => useMapperStore((s) => s.mapperState.mapperPreferences)
export const useSelectedTargetNode = () =>
    useMapperStore((s) => {
        const id = s.selectedTargetNodeId
        const tree = s.mapperState.targetTreeNode
        return id && tree ? findNodeById(id, tree) : null
    })
export const useCanUndo = () => useMapperStore((s) => s.canUndo())
export const useCanRedo = () => useMapperStore((s) => s.canRedo())
export const useIsDirty = () => useMapperStore((s) => s.isDirty)
