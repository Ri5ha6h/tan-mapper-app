import { beforeEach, describe, expect, it } from "vitest"
import { useMapperStore } from "../store"
import type { LoopReference, MapperTreeNode } from "../types"

// Reset store state between tests
function resetStore() {
    useMapperStore.getState().resetState()
}

// Helper: build a simple source tree
function makeSourceTree(): MapperTreeNode {
    return {
        id: "src-root",
        name: "root",
        type: "element",
        children: [
            {
                id: "src-orders",
                name: "orders",
                type: "array",
                children: [
                    {
                        id: "src-orders-item",
                        name: "[]",
                        type: "arrayChild",
                        children: [
                            { id: "src-id", name: "id", type: "element" },
                            { id: "src-status", name: "status", type: "element" },
                        ],
                    },
                ],
            },
        ],
    }
}

// Helper: build a simple target tree
function makeTargetTree(): MapperTreeNode {
    return {
        id: "tgt-root",
        name: "root",
        type: "element",
        children: [
            {
                id: "tgt-items",
                name: "items",
                type: "array",
                children: [
                    {
                        id: "tgt-items-item",
                        name: "[]",
                        type: "arrayChild",
                        children: [
                            { id: "tgt-orderId", name: "orderId", type: "element" },
                            { id: "tgt-status", name: "status", type: "element" },
                        ],
                    },
                ],
            },
        ],
    }
}

describe("MapperStore — initial state", () => {
    beforeEach(resetStore)

    it("has empty MapperState on init", () => {
        const state = useMapperStore.getState()
        expect(state.mapperState.references).toEqual([])
        expect(state.undoStack).toEqual([])
        expect(state.redoStack).toEqual([])
        expect(state.isDirty).toBe(false)
        expect(state.selectedSourceNodeId).toBeNull()
        expect(state.selectedTargetNodeId).toBeNull()
    })

    it("canUndo and canRedo start false", () => {
        const state = useMapperStore.getState()
        expect(state.canUndo()).toBe(false)
        expect(state.canRedo()).toBe(false)
    })
})

describe("MapperStore — snapshot / undo / redo", () => {
    beforeEach(resetStore)

    it("snapshot pushes JSON to undoStack and clears redoStack", () => {
        const store = useMapperStore.getState()
        store.snapshot()
        const after = useMapperStore.getState()
        expect(after.undoStack).toHaveLength(1)
        expect(after.redoStack).toHaveLength(0)
        expect(after.canUndo()).toBe(true)
    })

    it("undo restores previous state and moves current to redoStack", () => {
        const store = useMapperStore.getState()
        // Load source tree, take snapshot, then set target tree
        store.setSourceTree(makeSourceTree(), "JSON")
        store.snapshot()
        store.setTargetTree(makeTargetTree(), "JSON")

        const beforeUndo = useMapperStore.getState()
        // After setTargetTree the target has the real tree (id = "tgt-root")
        expect(beforeUndo.mapperState.targetTreeNode?.id).toBe("tgt-root")

        beforeUndo.undo()

        const afterUndo = useMapperStore.getState()
        // After undo, targetTreeNode should be the default empty-root node (not "tgt-root")
        expect(afterUndo.mapperState.targetTreeNode?.id).not.toBe("tgt-root")
        expect(afterUndo.redoStack).toHaveLength(1)
        expect(afterUndo.undoStack).toHaveLength(0)
        expect(afterUndo.canRedo()).toBe(true)
    })

    it("redo restores redone state and moves current to undoStack", () => {
        const store = useMapperStore.getState()
        store.setSourceTree(makeSourceTree(), "JSON")
        store.snapshot()
        store.setTargetTree(makeTargetTree(), "JSON")
        useMapperStore.getState().undo()
        useMapperStore.getState().redo()

        const afterRedo = useMapperStore.getState()
        expect(afterRedo.mapperState.targetTreeNode?.id).toBe("tgt-root")
        expect(afterRedo.undoStack).toHaveLength(1)
        expect(afterRedo.redoStack).toHaveLength(0)
    })

    it("undo does nothing if undoStack is empty", () => {
        const store = useMapperStore.getState()
        store.undo() // should not throw
        const after = useMapperStore.getState()
        expect(after.undoStack).toHaveLength(0)
    })

    it("redo does nothing if redoStack is empty", () => {
        const store = useMapperStore.getState()
        store.redo() // should not throw
        const after = useMapperStore.getState()
        expect(after.redoStack).toHaveLength(0)
    })

    it("snapshot trims undoStack to max 8 entries", () => {
        const store = useMapperStore.getState()
        for (let i = 0; i < 10; i++) {
            store.snapshot()
        }
        const after = useMapperStore.getState()
        expect(after.undoStack).toHaveLength(8)
    })

    it("snapshot clears redoStack", () => {
        const store = useMapperStore.getState()
        store.snapshot()
        store.undo()
        // Now redoStack has 1 entry; taking a new snapshot should clear it
        useMapperStore.getState().snapshot()
        expect(useMapperStore.getState().redoStack).toHaveLength(0)
    })
})

describe("MapperStore — addMapping", () => {
    beforeEach(() => {
        resetStore()
        const store = useMapperStore.getState()
        store.setSourceTree(makeSourceTree(), "JSON")
        store.setTargetTree(makeTargetTree(), "JSON")
    })

    it("creates a SourceReference with a suggested variable name", () => {
        useMapperStore.getState().addMapping("src-id", "tgt-orderId")

        const state = useMapperStore.getState()
        const targetTree = state.mapperState.targetTreeNode!
        const tgtOrderId = findNode(targetTree, "tgt-orderId")
        expect(tgtOrderId?.sourceReferences).toHaveLength(1)
        expect(tgtOrderId?.sourceReferences![0].sourceNodeId).toBe("src-id")
        expect(tgtOrderId?.sourceReferences![0].variableName).toBe("_id")
        expect(state.isDirty).toBe(true)
    })

    it("does not duplicate if same source+target already mapped", () => {
        useMapperStore.getState().addMapping("src-id", "tgt-orderId")
        useMapperStore.getState().addMapping("src-id", "tgt-orderId")

        const targetTree = useMapperStore.getState().mapperState.targetTreeNode!
        const tgtOrderId = findNode(targetTree, "tgt-orderId")
        expect(tgtOrderId?.sourceReferences).toHaveLength(1)
    })

    it("syncs flat references after addMapping", () => {
        useMapperStore.getState().addMapping("src-id", "tgt-orderId")
        const refs = useMapperStore.getState().mapperState.references
        expect(refs).toHaveLength(1)
        expect(refs[0].sourceNodeId).toBe("src-id")
        expect(refs[0].targetNodeId).toBe("tgt-orderId")
    })

    it("auto-assigns loopOverId when ancestor has loop reference", () => {
        // Set up a loop reference on tgt-items-item
        const loopRef: LoopReference = {
            id: "loop-ref-1",
            sourceNodeId: "src-orders-item",
            variableName: "_orders",
            textReference: false,
            isLoop: true,
        }
        useMapperStore.getState().setLoopReference("tgt-items-item", loopRef)
        // Now add a mapping from a child of src-orders-item to tgt-orderId (child of tgt-items-item)
        useMapperStore.getState().addMapping("src-id", "tgt-orderId")

        const targetTree = useMapperStore.getState().mapperState.targetTreeNode!
        const tgtOrderId = findNode(targetTree, "tgt-orderId")
        expect(tgtOrderId?.sourceReferences![0].loopOverId).toBe("loop-ref-1")
    })

    it("sets value to variable name if overrideTargetValue and no existing value", () => {
        useMapperStore.getState().addMapping("src-id", "tgt-orderId")
        const targetTree = useMapperStore.getState().mapperState.targetTreeNode!
        const tgtOrderId = findNode(targetTree, "tgt-orderId")
        expect(tgtOrderId?.value).toBe("_id")
    })
})

describe("MapperStore — removeReference / clearNodeMappings / clearAllMappings", () => {
    beforeEach(() => {
        resetStore()
        const store = useMapperStore.getState()
        store.setSourceTree(makeSourceTree(), "JSON")
        store.setTargetTree(makeTargetTree(), "JSON")
        store.addMapping("src-id", "tgt-orderId")
        store.addMapping("src-status", "tgt-status")
    })

    it("removeReference removes a single reference by ID", () => {
        const refs = useMapperStore.getState().mapperState.references
        expect(refs).toHaveLength(2)
        const refId = refs[0].id
        useMapperStore.getState().removeReference(refId)
        expect(useMapperStore.getState().mapperState.references).toHaveLength(1)
    })

    it("clearNodeMappings removes all refs from target node only", () => {
        useMapperStore.getState().clearNodeMappings("tgt-orderId")
        const refs = useMapperStore.getState().mapperState.references
        // tgt-status mapping should remain
        expect(refs.some((r) => r.targetNodeId === "tgt-orderId")).toBe(false)
        expect(refs.some((r) => r.targetNodeId === "tgt-status")).toBe(true)
    })

    it("clearAllMappings removes refs from target node and descendants", () => {
        // Map something to the parent container too
        useMapperStore.getState().addMapping("src-id", "tgt-items")
        useMapperStore.getState().clearAllMappings("tgt-items")

        const refs = useMapperStore.getState().mapperState.references
        // Nothing under tgt-items (which includes tgt-orderId, tgt-status) should remain
        expect(refs.filter((r) => r.targetNodeId.startsWith("tgt-"))).toHaveLength(0)
    })
})

describe("MapperStore — renameVariable", () => {
    beforeEach(() => {
        resetStore()
        const store = useMapperStore.getState()
        store.setSourceTree(makeSourceTree(), "JSON")
        store.setTargetTree(makeTargetTree(), "JSON")
        store.addMapping("src-id", "tgt-orderId")
    })

    it("updates variableName in node and flat refs", () => {
        const refId = useMapperStore.getState().mapperState.references[0].id
        useMapperStore.getState().renameVariable(refId, "_myOrderId")

        const refs = useMapperStore.getState().mapperState.references
        expect(refs[0].variableName).toBe("_myOrderId")

        const targetTree = useMapperStore.getState().mapperState.targetTreeNode!
        const tgtOrderId = findNode(targetTree, "tgt-orderId")
        expect(tgtOrderId?.sourceReferences![0].variableName).toBe("_myOrderId")
    })
})

describe("MapperStore — deleteNodes", () => {
    beforeEach(() => {
        resetStore()
        const store = useMapperStore.getState()
        store.setSourceTree(makeSourceTree(), "JSON")
        store.setTargetTree(makeTargetTree(), "JSON")
        store.addMapping("src-id", "tgt-orderId")
        store.addMapping("src-status", "tgt-status")
    })

    it("deleteNodes (source): removes references from target tree", () => {
        useMapperStore.getState().deleteNodes(["src-id"], "source")
        const refs = useMapperStore.getState().mapperState.references
        expect(refs.some((r) => r.sourceNodeId === "src-id")).toBe(false)
        // src-status ref should remain
        expect(refs.some((r) => r.sourceNodeId === "src-status")).toBe(true)
    })

    it("deleteNodes (source): removes the node from source tree", () => {
        useMapperStore.getState().deleteNodes(["src-id"], "source")
        const sourceTree = useMapperStore.getState().mapperState.sourceTreeNode!
        expect(findNode(sourceTree, "src-id")).toBeNull()
    })

    it("deleteNodes (target): removes node and its references", () => {
        useMapperStore.getState().deleteNodes(["tgt-orderId"], "target")
        const refs = useMapperStore.getState().mapperState.references
        expect(refs.some((r) => r.targetNodeId === "tgt-orderId")).toBe(false)
        const targetTree = useMapperStore.getState().mapperState.targetTreeNode!
        expect(findNode(targetTree, "tgt-orderId")).toBeNull()
    })
})

describe("MapperStore — setLoopReference", () => {
    beforeEach(() => {
        resetStore()
        const store = useMapperStore.getState()
        store.setSourceTree(makeSourceTree(), "JSON")
        store.setTargetTree(makeTargetTree(), "JSON")
    })

    it("sets loop reference on target node", () => {
        const loopRef: LoopReference = {
            id: "lr-1",
            sourceNodeId: "src-orders-item",
            variableName: "_orders",
            textReference: false,
            isLoop: true,
        }
        useMapperStore.getState().setLoopReference("tgt-items", loopRef)

        const targetTree = useMapperStore.getState().mapperState.targetTreeNode!
        const tgtItems = findNode(targetTree, "tgt-items")
        expect(tgtItems?.loopReference).toEqual(loopRef)
        expect(tgtItems?.loopIterator).toBe("_orders")
        expect(useMapperStore.getState().isDirty).toBe(true)
    })

    it("clears loop reference when null is passed", () => {
        const loopRef: LoopReference = {
            id: "lr-1",
            sourceNodeId: "src-orders-item",
            variableName: "_orders",
            textReference: false,
            isLoop: true,
        }
        useMapperStore.getState().setLoopReference("tgt-items", loopRef)
        useMapperStore.getState().setLoopReference("tgt-items", null)

        const targetTree = useMapperStore.getState().mapperState.targetTreeNode!
        const tgtItems = findNode(targetTree, "tgt-items")
        expect(tgtItems?.loopReference).toBeUndefined()
        expect(tgtItems?.loopIterator).toBeUndefined()
    })
})

describe("MapperStore — autoMap", () => {
    beforeEach(resetStore)

    it("matches source/target nodes by name and creates references", () => {
        // Both trees have a 'status' leaf node
        useMapperStore.getState().setSourceTree(makeSourceTree(), "JSON")
        useMapperStore.getState().setTargetTree(makeTargetTree(), "JSON")

        useMapperStore.getState().autoMap({
            matchByName: true,
            oneToMany: false,
            includeSubNodes: false,
        })

        const refs = useMapperStore.getState().mapperState.references
        // 'status' should be mapped (src-status → tgt-status)
        const statusRef = refs.find(
            (r) => r.sourceNodeId === "src-status" && r.targetNodeId === "tgt-status",
        )
        expect(statusRef).toBeDefined()
    })

    it("does not double-map already mapped nodes", () => {
        useMapperStore.getState().setSourceTree(makeSourceTree(), "JSON")
        useMapperStore.getState().setTargetTree(makeTargetTree(), "JSON")
        useMapperStore.getState().addMapping("src-status", "tgt-status")
        useMapperStore.getState().autoMap({
            matchByName: true,
            oneToMany: false,
            includeSubNodes: false,
        })

        const refs = useMapperStore.getState().mapperState.references
        const statusRefs = refs.filter((r) => r.targetNodeId === "tgt-status")
        expect(statusRefs).toHaveLength(1)
    })
})

describe("MapperStore — loadState / resetState", () => {
    beforeEach(resetStore)

    it("loadState replaces state and resets stacks", () => {
        const store = useMapperStore.getState()
        store.setSourceTree(makeSourceTree(), "JSON")
        store.snapshot()

        // Spread a plain copy — immer freezes state objects
        const newState = { ...store.mapperState, name: "Test Map" }
        store.loadState(newState)

        const after = useMapperStore.getState()
        expect(after.undoStack).toHaveLength(0)
        expect(after.redoStack).toHaveLength(0)
        expect(after.isDirty).toBe(false)
        expect(after.mapperState.name).toBe("Test Map")
    })

    it("resetState returns to empty state", () => {
        const store = useMapperStore.getState()
        store.setSourceTree(makeSourceTree(), "JSON")
        store.snapshot()
        store.resetState()

        const after = useMapperStore.getState()
        expect(after.mapperState.sourceTreeNode?.children).toHaveLength(0)
        expect(after.undoStack).toHaveLength(0)
        expect(after.currentResourceName).toBeNull()
        expect(after.currentResourceId).toBeNull()
    })
})

describe("MapperStore — selection", () => {
    beforeEach(resetStore)

    it("selectSourceNode updates selectedSourceNodeId", () => {
        useMapperStore.getState().selectSourceNode("src-id")
        expect(useMapperStore.getState().selectedSourceNodeId).toBe("src-id")
    })

    it("selectTargetNode updates selectedTargetNodeId", () => {
        useMapperStore.getState().selectTargetNode("tgt-orderId")
        expect(useMapperStore.getState().selectedTargetNodeId).toBe("tgt-orderId")
    })

    it("selectSourceNode(null) clears selection", () => {
        useMapperStore.getState().selectSourceNode("src-id")
        useMapperStore.getState().selectSourceNode(null)
        expect(useMapperStore.getState().selectedSourceNodeId).toBeNull()
    })
})

describe("MapperStore — UI state", () => {
    beforeEach(resetStore)

    it("toggleExecutePanel flips isExecutePanelOpen", () => {
        expect(useMapperStore.getState().isExecutePanelOpen).toBe(false)
        useMapperStore.getState().toggleExecutePanel()
        expect(useMapperStore.getState().isExecutePanelOpen).toBe(true)
        useMapperStore.getState().toggleExecutePanel()
        expect(useMapperStore.getState().isExecutePanelOpen).toBe(false)
    })

    it("setDSLMode updates isDSLMode", () => {
        useMapperStore.getState().setDSLMode(true)
        expect(useMapperStore.getState().isDSLMode).toBe(true)
    })

    it("setResourceName updates currentResourceName", () => {
        useMapperStore.getState().setResourceName("Order Map")
        expect(useMapperStore.getState().currentResourceName).toBe("Order Map")
    })
})

describe("MapperStore — context mutations", () => {
    beforeEach(resetStore)

    it("addGlobalVariable / updateGlobalVariable / removeGlobalVariable", () => {
        const gv = { id: "gv-1", name: "taxRate", value: "0.1", plainTextValue: true }
        useMapperStore.getState().addGlobalVariable(gv)
        expect(useMapperStore.getState().mapperState.localContext.globalVariables).toHaveLength(1)

        useMapperStore.getState().updateGlobalVariable("gv-1", { value: "0.2" })
        expect(useMapperStore.getState().mapperState.localContext.globalVariables[0].value).toBe(
            "0.2",
        )

        useMapperStore.getState().removeGlobalVariable("gv-1")
        expect(useMapperStore.getState().mapperState.localContext.globalVariables).toHaveLength(0)
    })

    it("setPrologScript / setEpilogScript", () => {
        useMapperStore.getState().setPrologScript("const x = 1;")
        expect(useMapperStore.getState().mapperState.localContext.prologScript).toBe("const x = 1;")

        useMapperStore.getState().setEpilogScript("console.log('done')")
        expect(useMapperStore.getState().mapperState.localContext.epilogScript).toBe(
            "console.log('done')",
        )
    })

    it("addLookupTable / addLookupEntry / removeLookupEntry / removeLookupTable", () => {
        const table = { id: "lt-1", name: "statusMap", entries: [] }
        useMapperStore.getState().addLookupTable(table)
        expect(useMapperStore.getState().mapperState.localContext.lookupTables).toHaveLength(1)

        const entry = { id: "le-1", key: "A", value: "Active", plainTextValue: true }
        useMapperStore.getState().addLookupEntry("lt-1", entry)
        expect(
            useMapperStore.getState().mapperState.localContext.lookupTables[0].entries,
        ).toHaveLength(1)

        useMapperStore.getState().removeLookupEntry("lt-1", "le-1")
        expect(
            useMapperStore.getState().mapperState.localContext.lookupTables[0].entries,
        ).toHaveLength(0)

        useMapperStore.getState().removeLookupTable("lt-1")
        expect(useMapperStore.getState().mapperState.localContext.lookupTables).toHaveLength(0)
    })
})

describe("MapperStore — preferences", () => {
    beforeEach(resetStore)

    it("updatePreferences patches mapperPreferences", () => {
        useMapperStore.getState().updatePreferences({ debugComment: true, autoMap: true })
        const prefs = useMapperStore.getState().mapperState.mapperPreferences
        expect(prefs.debugComment).toBe(true)
        expect(prefs.autoMap).toBe(true)
        expect(prefs.overrideTargetValue).toBe(true) // unchanged default
    })
})

// ─── helpers ────────────────────────────────────────────────────────────────

function findNode(tree: MapperTreeNode, id: string): MapperTreeNode | null {
    if (tree.id === id) return tree
    if (tree.children) {
        for (const child of tree.children) {
            const found = findNode(child, id)
            if (found) return found
        }
    }
    return null
}
