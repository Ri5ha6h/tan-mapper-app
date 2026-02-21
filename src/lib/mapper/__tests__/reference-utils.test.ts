import { describe, expect, it } from "vitest"
import type { LoopReference, MapperState, MapperTreeNode, SourceReference } from "../types"
import {
    collectUsedVariableNames,
    createDefaultContext,
    createDefaultPreferences,
    createLoopReference,
    createSourceReference,
    findNearestLoopAncestor,
    generateVariableName,
    getAllLoopReferences,
    isReferenceValid,
    removeReferencesForSourceNode,
    suggestVariableName,
    syncFlatReferences,
} from "../reference-utils"
import { MAPPER_MODEL_VERSION } from "../types"

// ============================================================
// Fixtures
// ============================================================

function makeSourceRef(sourceNodeId: string, variableName = "_x"): SourceReference {
    return {
        id: `ref-${sourceNodeId}`,
        sourceNodeId,
        variableName,
        textReference: true,
    }
}

function makeLoopRef(sourceNodeId: string, variableName = "_items"): LoopReference {
    return {
        id: `loop-${sourceNodeId}`,
        sourceNodeId,
        variableName,
        textReference: false,
        isLoop: true,
    }
}

function makeState(sourceTree: MapperTreeNode, targetTree: MapperTreeNode): MapperState {
    return {
        modelVersion: MAPPER_MODEL_VERSION,
        id: "state-1",
        sourceTreeNode: sourceTree,
        targetTreeNode: targetTree,
        references: [],
        localContext: createDefaultContext(),
        mapperPreferences: createDefaultPreferences(),
        sourceInputType: "JSON",
        targetInputType: "JSON",
    }
}

// ============================================================
// generateVariableName
// ============================================================

describe("generateVariableName", () => {
    it("returns var0 when no names used", () => {
        expect(generateVariableName(new Set())).toBe("var0")
    })

    it("returns var1 when var0 is taken", () => {
        expect(generateVariableName(new Set(["var0"]))).toBe("var1")
    })

    it("skips already-used names", () => {
        expect(generateVariableName(new Set(["var0", "var1", "var2"]))).toBe("var3")
    })
})

// ============================================================
// suggestVariableName
// ============================================================

describe("suggestVariableName", () => {
    it("generates _orderId from orderId", () => {
        expect(suggestVariableName("orderId", new Set())).toBe("_orderId")
    })

    it("generates _name from name", () => {
        expect(suggestVariableName("name", new Set())).toBe("_name")
    })

    it("handles collision — appends _1", () => {
        expect(suggestVariableName("orderId", new Set(["_orderId"]))).toBe("_orderId_1")
    })

    it("handles further collisions — appends _2", () => {
        expect(suggestVariableName("orderId", new Set(["_orderId", "_orderId_1"]))).toBe(
            "_orderId_2",
        )
    })

    it("replaces illegal JS identifier chars with _", () => {
        // Hyphenated name
        const result = suggestVariableName("order-id", new Set())
        expect(result).toBe("_order_id")
    })

    it("handles names with dots", () => {
        const result = suggestVariableName("a.b", new Set())
        expect(result).toBe("_a_b")
    })
})

// ============================================================
// collectUsedVariableNames
// ============================================================

describe("collectUsedVariableNames", () => {
    it("finds all variable names in target tree", () => {
        const loopRef = makeLoopRef("src-1", "_items")
        const srcRef = makeSourceRef("src-2", "_name")
        const targetTree: MapperTreeNode = {
            id: "root",
            name: "root",
            type: "element",
            children: [
                {
                    id: "items",
                    name: "items",
                    type: "array",
                    loopReference: loopRef,
                    loopIterator: "_items",
                    children: [
                        {
                            id: "item",
                            name: "[]",
                            type: "arrayChild",
                            children: [
                                {
                                    id: "nameNode",
                                    name: "name",
                                    type: "element",
                                    sourceReferences: [srcRef],
                                },
                            ],
                        },
                    ],
                },
            ],
        }
        const state = makeState({ id: "s", name: "src", type: "element" }, targetTree)
        const names = collectUsedVariableNames(state)
        expect(names.has("_items")).toBe(true)
        expect(names.has("_name")).toBe(true)
    })

    it("returns empty set when no target tree", () => {
        const state: MapperState = {
            modelVersion: MAPPER_MODEL_VERSION,
            id: "x",
            sourceTreeNode: null,
            targetTreeNode: null,
            references: [],
            localContext: createDefaultContext(),
            mapperPreferences: createDefaultPreferences(),
            sourceInputType: "JSON",
            targetInputType: "JSON",
        }
        expect(collectUsedVariableNames(state).size).toBe(0)
    })
})

// ============================================================
// syncFlatReferences
// ============================================================

describe("syncFlatReferences", () => {
    it("builds a flat list from target tree", () => {
        const loopRef = makeLoopRef("src-array", "_items")
        const srcRef = makeSourceRef("src-id", "_itemId")
        const targetTree: MapperTreeNode = {
            id: "root",
            name: "root",
            type: "element",
            children: [
                {
                    id: "items-node",
                    name: "items",
                    type: "array",
                    loopReference: loopRef,
                    children: [
                        {
                            id: "item-node",
                            name: "[]",
                            type: "arrayChild",
                            children: [
                                {
                                    id: "id-node",
                                    name: "id",
                                    type: "element",
                                    sourceReferences: [srcRef],
                                },
                            ],
                        },
                    ],
                },
            ],
        }
        const state = makeState({ id: "src", name: "src", type: "element" }, targetTree)
        const refs = syncFlatReferences(state)
        expect(refs).toHaveLength(2)

        const loop = refs.find((r) => r.isLoop)
        expect(loop?.variableName).toBe("_items")
        expect(loop?.targetNodeId).toBe("items-node")
        expect(loop?.sourceNodeId).toBe("src-array")

        const plain = refs.find((r) => !r.isLoop)
        expect(plain?.variableName).toBe("_itemId")
        expect(plain?.targetNodeId).toBe("id-node")
    })

    it("returns empty array when no target tree", () => {
        const state: MapperState = {
            modelVersion: MAPPER_MODEL_VERSION,
            id: "x",
            sourceTreeNode: null,
            targetTreeNode: null,
            references: [],
            localContext: createDefaultContext(),
            mapperPreferences: createDefaultPreferences(),
            sourceInputType: "JSON",
            targetInputType: "JSON",
        }
        expect(syncFlatReferences(state)).toEqual([])
    })
})

// ============================================================
// isReferenceValid
// ============================================================

describe("isReferenceValid", () => {
    const sourceTree: MapperTreeNode = {
        id: "src-root",
        name: "root",
        type: "element",
        children: [{ id: "src-id", name: "id", type: "element" }],
    }
    const targetTree: MapperTreeNode = {
        id: "tgt-root",
        name: "root",
        type: "element",
        children: [{ id: "tgt-name", name: "name", type: "element" }],
    }

    it("returns true for valid reference", () => {
        const ref = {
            id: "r1",
            sourceNodeId: "src-id",
            targetNodeId: "tgt-name",
            variableName: "_id",
            textReference: true,
        }
        expect(isReferenceValid(ref, sourceTree, targetTree)).toBe(true)
    })

    it("returns false when source node is missing", () => {
        const ref = {
            id: "r1",
            sourceNodeId: "missing-src",
            targetNodeId: "tgt-name",
            variableName: "_id",
            textReference: true,
        }
        expect(isReferenceValid(ref, sourceTree, targetTree)).toBe(false)
    })

    it("returns false when target node is missing", () => {
        const ref = {
            id: "r1",
            sourceNodeId: "src-id",
            targetNodeId: "missing-tgt",
            variableName: "_id",
            textReference: true,
        }
        expect(isReferenceValid(ref, sourceTree, targetTree)).toBe(false)
    })
})

// ============================================================
// removeReferencesForSourceNode
// ============================================================

describe("removeReferencesForSourceNode", () => {
    it("removes source references pointing to the given source node", () => {
        const srcRef = makeSourceRef("src-to-delete", "_val")
        const targetTree: MapperTreeNode = {
            id: "root",
            name: "root",
            type: "element",
            children: [
                {
                    id: "field",
                    name: "field",
                    type: "element",
                    sourceReferences: [srcRef],
                },
            ],
        }
        const result = removeReferencesForSourceNode("src-to-delete", targetTree)
        const field = result.children![0]
        expect(field.sourceReferences).toHaveLength(0)
    })

    it("removes loop references pointing to the given source node", () => {
        const loopRef = makeLoopRef("src-array", "_items")
        const targetTree: MapperTreeNode = {
            id: "root",
            name: "root",
            type: "element",
            children: [
                {
                    id: "items",
                    name: "items",
                    type: "array",
                    loopReference: loopRef,
                    loopIterator: "_items",
                },
            ],
        }
        const result = removeReferencesForSourceNode("src-array", targetTree)
        const items = result.children![0]
        expect(items.loopReference).toBeUndefined()
        expect(items.loopIterator).toBeUndefined()
    })

    it("keeps unrelated references intact", () => {
        const ref1 = makeSourceRef("src-keep", "_keep")
        const ref2 = makeSourceRef("src-delete", "_del")
        const targetTree: MapperTreeNode = {
            id: "root",
            name: "root",
            type: "element",
            children: [
                {
                    id: "field",
                    name: "field",
                    type: "element",
                    sourceReferences: [ref1, ref2],
                },
            ],
        }
        const result = removeReferencesForSourceNode("src-delete", targetTree)
        const field = result.children![0]
        expect(field.sourceReferences).toHaveLength(1)
        expect(field.sourceReferences![0].variableName).toBe("_keep")
    })
})

// ============================================================
// getAllLoopReferences
// ============================================================

describe("getAllLoopReferences", () => {
    it("collects all loop refs from target tree", () => {
        const loop1 = makeLoopRef("src-1", "_list1")
        const loop2 = makeLoopRef("src-2", "_list2")
        const targetTree: MapperTreeNode = {
            id: "root",
            name: "root",
            type: "element",
            children: [
                { id: "a", name: "a", type: "array", loopReference: loop1 },
                { id: "b", name: "b", type: "array", loopReference: loop2 },
            ],
        }
        const state = makeState({ id: "s", name: "src", type: "element" }, targetTree)
        const loops = getAllLoopReferences(state)
        expect(loops).toHaveLength(2)
        expect(loops.map((l) => l.variableName)).toContain("_list1")
        expect(loops.map((l) => l.variableName)).toContain("_list2")
    })

    it("returns empty array when no target tree", () => {
        const state: MapperState = {
            modelVersion: MAPPER_MODEL_VERSION,
            id: "x",
            sourceTreeNode: null,
            targetTreeNode: null,
            references: [],
            localContext: createDefaultContext(),
            mapperPreferences: createDefaultPreferences(),
            sourceInputType: "JSON",
            targetInputType: "JSON",
        }
        expect(getAllLoopReferences(state)).toEqual([])
    })
})

// ============================================================
// findNearestLoopAncestor
// ============================================================

describe("findNearestLoopAncestor", () => {
    it("returns the loop ref when dropping inside a looped array", () => {
        // Source tree: root → orders(array) → [](arrayChild) → id
        const sourceTree: MapperTreeNode = {
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
                            id: "src-item",
                            name: "[]",
                            type: "arrayChild",
                            children: [{ id: "src-id", name: "id", type: "element" }],
                        },
                    ],
                },
            ],
        }

        const loopRef: LoopReference = {
            id: "lr-1",
            sourceNodeId: "src-item", // loops over the array child
            variableName: "_orders",
            textReference: false,
            isLoop: true,
        }

        // Target tree: root → items(array, loopRef → src-item) → [](arrayChild) → orderId
        const targetTree: MapperTreeNode = {
            id: "tgt-root",
            name: "root",
            type: "element",
            children: [
                {
                    id: "tgt-items",
                    name: "items",
                    type: "array",
                    loopReference: loopRef,
                    children: [
                        {
                            id: "tgt-item",
                            name: "[]",
                            type: "arrayChild",
                            children: [{ id: "tgt-id", name: "orderId", type: "element" }],
                        },
                    ],
                },
            ],
        }

        const state = makeState(sourceTree, targetTree)
        // Dropping src-id onto tgt-id — src-id is a child of src-item which is the loop source
        const result = findNearestLoopAncestor("tgt-id", "src-id", state)
        expect(result).not.toBeNull()
        expect(result?.id).toBe("lr-1")
    })

    it("returns null when source is not related to any loop", () => {
        const sourceTree: MapperTreeNode = {
            id: "src-root",
            name: "root",
            type: "element",
            children: [{ id: "src-name", name: "name", type: "element" }],
        }
        const targetTree: MapperTreeNode = {
            id: "tgt-root",
            name: "root",
            type: "element",
            children: [{ id: "tgt-name", name: "name", type: "element" }],
        }
        const state = makeState(sourceTree, targetTree)
        expect(findNearestLoopAncestor("tgt-name", "src-name", state)).toBeNull()
    })
})

// ============================================================
// createDefaultContext / createDefaultPreferences
// ============================================================

describe("createDefaultContext", () => {
    it("returns empty context", () => {
        const ctx = createDefaultContext()
        expect(ctx.globalVariables).toEqual([])
        expect(ctx.lookupTables).toEqual([])
        expect(ctx.functions).toEqual([])
        expect(ctx.prologScript).toBeNull()
        expect(ctx.epilogScript).toBeNull()
    })
})

describe("createDefaultPreferences", () => {
    it("returns correct defaults", () => {
        const prefs = createDefaultPreferences()
        expect(prefs.overrideTargetValue).toBe(true)
        expect(prefs.debugComment).toBe(false)
        expect(prefs.autoMap).toBe(false)
    })
})

// ============================================================
// createSourceReference / createLoopReference
// ============================================================

describe("createSourceReference", () => {
    it("creates a source reference with uuid", () => {
        const ref = createSourceReference("src-1", "_val")
        expect(ref.sourceNodeId).toBe("src-1")
        expect(ref.variableName).toBe("_val")
        expect(ref.textReference).toBe(true)
        expect(typeof ref.id).toBe("string")
    })
})

describe("createLoopReference", () => {
    it("creates a loop reference with isLoop=true", () => {
        const ref = createLoopReference("src-array", "_items")
        expect(ref.isLoop).toBe(true)
        expect(ref.variableName).toBe("_items")
    })
})
