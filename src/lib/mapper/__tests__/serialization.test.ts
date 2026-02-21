import { describe, expect, it } from "vitest"
import type { MapperState } from "../types"
import { MAPPER_MODEL_VERSION } from "../types"
import {
    CURRENT_MODEL_VERSION,
    SerializationError,
    deserializeMapperState,
    isLegacyJtmap,
    isMapperState,
    serializeMapperState,
} from "../serialization"
import { createEmptyMapperState } from "../node-utils"

// ============================================================
// Fixtures
// ============================================================

function makeValidState(): MapperState {
    return createEmptyMapperState()
}

/** A minimal legacy Vaadin-style .jtmap JSON object */
function makeLegacyJtmap() {
    return {
        modelVersion: 3, // old Vaadin format
        id: "old-uuid",
        name: "Test Map",
        sourceInputType: "JSON",
        targetInputType: "JSON",
        sourceTreeNode: {
            jsonId: 1,
            id: "src-root-id",
            name: "root",
            type: "element",
            children: [],
        },
        targetTreeNode: {
            id: "tgt-root-id",
            name: "root",
            type: "element",
            children: [],
        },
        references: [],
        localContext: {
            globalVariables: [],
            lookupTables: [],
            functions: [],
        },
        mapperPreferences: {
            debugComment: false,
            overrideTargetValue: true,
            autoMap: false,
            autoMapOneToMany: false,
            autoMapIncludeSubNodes: false,
        },
    }
}

// ============================================================
// CURRENT_MODEL_VERSION
// ============================================================

describe("CURRENT_MODEL_VERSION", () => {
    it("equals MAPPER_MODEL_VERSION from types", () => {
        expect(CURRENT_MODEL_VERSION).toBe(MAPPER_MODEL_VERSION)
        expect(CURRENT_MODEL_VERSION).toBe(1)
    })
})

// ============================================================
// serializeMapperState
// ============================================================

describe("serializeMapperState", () => {
    it("produces a valid JSON string", () => {
        const state = makeValidState()
        const json = serializeMapperState(state)
        expect(typeof json).toBe("string")
        expect(() => JSON.parse(json)).not.toThrow()
    })

    it("includes modelVersion in output", () => {
        const state = makeValidState()
        const json = serializeMapperState(state)
        const parsed = JSON.parse(json)
        expect(parsed.modelVersion).toBe(1)
    })

    it("is pretty-printed (contains newlines)", () => {
        const state = makeValidState()
        const json = serializeMapperState(state)
        expect(json).toContain("\n")
    })
})

// ============================================================
// deserializeMapperState
// ============================================================

describe("deserializeMapperState", () => {
    it("round-trips correctly (serialize → deserialize = original)", () => {
        const state = makeValidState()
        const json = serializeMapperState(state)
        const restored = deserializeMapperState(json)

        expect(restored.id).toBe(state.id)
        expect(restored.modelVersion).toBe(state.modelVersion)
        expect(restored.sourceInputType).toBe(state.sourceInputType)
        expect(restored.targetInputType).toBe(state.targetInputType)
        expect(restored.references).toEqual(state.references)
    })

    it("restores source tree root name", () => {
        const state = makeValidState()
        const json = serializeMapperState(state)
        const restored = deserializeMapperState(json)
        expect(restored.sourceTreeNode?.name).toBe("root")
    })

    it("throws SerializationError for invalid JSON", () => {
        expect(() => deserializeMapperState("not json")).toThrowError(SerializationError)
    })

    it("throws SerializationError for unknown format", () => {
        const unknown = JSON.stringify({ something: "random", modelVersion: 99 })
        expect(() => deserializeMapperState(unknown)).toThrowError(SerializationError)
    })

    it("calls migration for legacy .jtmap format", () => {
        const legacy = makeLegacyJtmap()
        const json = JSON.stringify(legacy)
        // Should not throw — migration handles old format
        const result = deserializeMapperState(json)
        expect(result.modelVersion).toBe(1)
        expect(result.sourceTreeNode?.name).toBe("root")
        expect(result.targetTreeNode?.name).toBe("root")
    })
})

// ============================================================
// isMapperState
// ============================================================

describe("isMapperState", () => {
    it("returns true for a valid MapperState", () => {
        const state = makeValidState()
        expect(isMapperState(state)).toBe(true)
    })

    it("returns false for null", () => {
        expect(isMapperState(null)).toBe(false)
    })

    it("returns false for non-object", () => {
        expect(isMapperState("string")).toBe(false)
        expect(isMapperState(42)).toBe(false)
    })

    it("returns false for object missing required fields", () => {
        expect(isMapperState({ modelVersion: 1 })).toBe(false)
    })

    it("returns false for wrong modelVersion", () => {
        const state = makeValidState()
        const broken = { ...state, modelVersion: 5 }
        expect(isMapperState(broken)).toBe(false)
    })

    it("returns false for legacy .jtmap (modelVersion=3)", () => {
        const legacy = makeLegacyJtmap()
        expect(isMapperState(legacy)).toBe(false)
    })
})

// ============================================================
// isLegacyJtmap
// ============================================================

describe("isLegacyJtmap", () => {
    it("returns true for old Vaadin format with modelVersion 3", () => {
        expect(isLegacyJtmap(makeLegacyJtmap())).toBe(true)
    })

    it("returns true for format with no modelVersion at all", () => {
        expect(isLegacyJtmap({ name: "old map" })).toBe(true)
    })

    it("returns true for sourceTreeNode with jsonId field", () => {
        const obj = {
            modelVersion: 100, // unusual
            sourceTreeNode: { jsonId: 1, name: "root" },
        }
        expect(isLegacyJtmap(obj)).toBe(true)
    })

    it("returns false for current v1 format", () => {
        const state = makeValidState()
        expect(isLegacyJtmap(state)).toBe(false)
    })

    it("returns false for null", () => {
        expect(isLegacyJtmap(null)).toBe(false)
    })
})

// ============================================================
// SerializationError
// ============================================================

describe("SerializationError", () => {
    it("is an instance of Error", () => {
        const err = new SerializationError("test")
        expect(err).toBeInstanceOf(Error)
        expect(err).toBeInstanceOf(SerializationError)
    })

    it("has the correct name", () => {
        const err = new SerializationError("test message")
        expect(err.name).toBe("SerializationError")
        expect(err.message).toBe("test message")
    })

    it("stores cause", () => {
        const cause = new Error("original")
        const err = new SerializationError("wrapped", cause)
        expect(err.cause).toBe(cause)
    })
})

// ============================================================
// Migration round-trip — full legacy fixture
// ============================================================

describe("Migration round-trip", () => {
    it("migrates a legacy fixture with source references", () => {
        const legacy = {
            modelVersion: 4,
            id: "map-001",
            name: "Order Map",
            sourceInputType: "XML",
            targetInputType: "JSON",
            sourceTreeNode: {
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
            },
            targetTreeNode: {
                id: "tgt-root",
                name: "root",
                type: "element",
                children: [
                    {
                        id: "tgt-items",
                        name: "items",
                        type: "array",
                        loopReference: {
                            id: "lr-1",
                            sourceNodeId: "src-item",
                            variableName: "_orders",
                            textReference: false,
                        },
                        loopIterator: "_orders",
                        children: [
                            {
                                id: "tgt-item",
                                name: "[]",
                                type: "arrayChild",
                                children: [
                                    {
                                        id: "tgt-id",
                                        name: "orderId",
                                        type: "element",
                                        sourceReferences: [
                                            {
                                                id: "ref-1",
                                                sourceNodeId: "src-id",
                                                variableName: "_orderId",
                                                textReference: true,
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            localContext: {
                globalVariables: [],
                lookupTables: [],
                functions: [],
            },
            mapperPreferences: {
                debugComment: false,
                overrideTargetValue: true,
                autoMap: false,
                autoMapOneToMany: false,
                autoMapIncludeSubNodes: false,
            },
        }

        const json = JSON.stringify(legacy)
        const result = deserializeMapperState(json)

        expect(result.modelVersion).toBe(1)
        expect(result.name).toBe("Order Map")
        expect(result.sourceInputType).toBe("XML")

        // Target tree structure should be preserved
        expect(result.targetTreeNode?.name).toBe("root")
        const items = result.targetTreeNode?.children?.[0]
        expect(items?.name).toBe("items")
        expect(items?.loopReference?.variableName).toBe("_orders")

        // Flat references should be built
        expect(result.references.length).toBeGreaterThan(0)
        const loopRef = result.references.find((r) => r.isLoop)
        expect(loopRef?.variableName).toBe("_orders")
    })
})

// ============================================================
// migrateFromJtmap — old Vaadin .jtmap format edge cases
// ============================================================

describe("migrateFromJtmap - old Vaadin format", () => {
    it("normalises old 'ar' type to 'array' and 'ac' type to 'arrayChild'", () => {
        const legacy = {
            modelVersion: 3,
            sourceInputType: "JSON",
            targetInputType: "JSON",
            sourceTreeNode: {
                jsonId: 1,
                name: "root",
                type: "element",
                children: [
                    {
                        jsonId: 2,
                        name: "products",
                        type: "ar", // old Vaadin shorthand for array
                        children: [
                            {
                                jsonId: 3,
                                name: "[0]",
                                type: "ac", // old Vaadin shorthand for arrayChild
                                children: [{ jsonId: 4, name: "id", type: "element" }],
                            },
                        ],
                    },
                ],
            },
            targetTreeNode: { name: "root", type: "element", children: [] },
            localContext: { globalVariables: [], lookupTables: [], functions: [] },
            mapperPreferences: {
                debugComment: false,
                overrideTargetValue: true,
                autoMap: false,
                autoMapOneToMany: false,
                autoMapIncludeSubNodes: false,
            },
        }
        const result = deserializeMapperState(JSON.stringify(legacy))
        const products = result.sourceTreeNode?.children?.[0]
        expect(products?.type).toBe("array")
        const item = products?.children?.[0]
        expect(item?.type).toBe("arrayChild")
    })

    it("migrates old loopReference format (path + var + jsonId) correctly", () => {
        // Mirrors the structure of MapperWithMappingSample3_Rishabh.jtmap
        const legacy = {
            modelVersion: 3,
            sourceInputType: "JSON",
            targetInputType: "JSON",
            sourceTreeNode: {
                name: "root",
                type: "element",
                children: [
                    {
                        jsonId: 1,
                        name: "products",
                        type: "ar",
                        children: [
                            {
                                jsonId: 2,
                                name: "[0]",
                                type: "ac",
                                children: [{ jsonId: 3, name: "id", type: "element" }],
                            },
                        ],
                    },
                ],
            },
            targetTreeNode: {
                name: "root",
                type: "element",
                children: [
                    {
                        name: "items",
                        type: "ar",
                        children: [
                            {
                                name: "[0]",
                                type: "ac",
                                loopIterator: "it_Products",
                                loopReference: {
                                    jsonId: 1,
                                    path: "root.products",
                                    var: "loop123",
                                    text: false,
                                },
                                references: [
                                    {
                                        jsonId: 1,
                                        path: "root.products",
                                        var: "loop123",
                                        text: false,
                                    },
                                ],
                                children: [
                                    {
                                        name: "productId",
                                        type: "element",
                                        value: "_id",
                                        references: [
                                            {
                                                jsonId: 3,
                                                path: "root.products.id",
                                                var: "_id",
                                                text: true,
                                                loopOverRef: 1,
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            localContext: { globalVariables: [], lookupTables: [], functions: [] },
            mapperPreferences: {
                debugComment: false,
                overrideTargetValue: true,
                autoMap: false,
                autoMapOneToMany: false,
                autoMapIncludeSubNodes: false,
            },
        }

        const result = deserializeMapperState(JSON.stringify(legacy))

        // Target array should have loopReference with resolved sourceNodeId
        const itemsArr = result.targetTreeNode?.children?.[0]
        expect(itemsArr?.type).toBe("array")
        const acNode = itemsArr?.children?.[0]
        expect(acNode?.type).toBe("arrayChild")

        // loopReference must be populated (not dropped)
        expect(acNode?.loopReference).toBeDefined()
        expect(acNode?.loopIterator).toBe("it_Products")
        expect(acNode?.loopReference?.variableName).toBe("loop123")

        // The sourceNodeId in the loop reference should be a valid UUID mapping to "products"
        const srcProducts = result.sourceTreeNode?.children?.[0]
        expect(acNode?.loopReference?.sourceNodeId).toBe(srcProducts?.id)

        // Source ref on productId should use "var" → variableName
        const productId = acNode?.children?.[0]
        expect(productId?.sourceReferences?.[0]?.variableName).toBe("_id")
        expect(productId?.sourceReferences?.[0]?.textReference).toBe(true)

        // loopOverRef should be resolved to the loop reference's new UUID
        expect(productId?.sourceReferences?.[0]?.loopOverId).toBe(acNode?.loopReference?.id)
    })

    it("migrates looper.loopStatement to node.loopStatement", () => {
        const legacy = {
            modelVersion: 3,
            sourceInputType: "JSON",
            targetInputType: "JSON",
            sourceTreeNode: { name: "root", type: "element", children: [] },
            targetTreeNode: {
                name: "root",
                type: "element",
                children: [
                    {
                        name: "stops",
                        type: "ar",
                        children: [
                            {
                                name: "[0]",
                                type: "ac",
                                looper: { loopStatement: "stopMap.each" },
                                codeValue: "const stopType = it.value.stopType",
                                children: [],
                            },
                        ],
                    },
                ],
            },
            localContext: { globalVariables: [], lookupTables: [], functions: [] },
            mapperPreferences: {
                debugComment: false,
                overrideTargetValue: true,
                autoMap: false,
                autoMapOneToMany: false,
                autoMapIncludeSubNodes: false,
            },
        }

        const result = deserializeMapperState(JSON.stringify(legacy))
        const stopsArr = result.targetTreeNode?.children?.[0]
        const acNode = stopsArr?.children?.[0]
        expect(acNode?.loopStatement).toBe("stopMap.each")
        expect(acNode?.customCode).toBe("const stopType = it.value.stopType")
    })
})
