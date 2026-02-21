import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { parseJSON } from "../parsers"
import {
    applyMappings,
    applyTransform,
    detectTemplateType,
    evaluateCondition,
    executeScript,
    generateJSONOutput,
    generateScript,
    treeToData,
} from "../engine"
import { createEmptyMapperState, createNode } from "../node-utils"
import { createLoopReference, createSourceReference } from "../reference-utils"
import type {
    GlobalVariable,
    LookupTable,
    MapperContext,
    MapperState,
    MapperTreeNode,
    Mapping,
    MappingCondition, SourceReference, TransformFunction 
} from "../types"

const samplesDir = resolve(__dirname, "../../../../BasicMapperTestingSamples")

function loadSample(name: string): string {
    return readFileSync(resolve(samplesDir, name), "utf-8")
}

describe("treeToData", () => {
    it("round-trips a flat object (sample1)", () => {
        const raw = JSON.parse(loadSample("sampleInput1.json"))
        const tree = parseJSON(loadSample("sampleInput1.json"))
        const result = treeToData(tree)
        expect(result).toEqual(raw)
    })

    it("round-trips a nested object (sample2)", () => {
        const raw = JSON.parse(loadSample("sampleInput2.json"))
        const tree = parseJSON(loadSample("sampleInput2.json"))
        const result = treeToData(tree)
        expect(result).toEqual(raw)
    })

    it("does not double-nest arrays (sample3)", () => {
        const raw = JSON.parse(loadSample("sampleInput3.json"))
        const tree = parseJSON(loadSample("sampleInput3.json"))
        const result = treeToData(tree) as Record<string, unknown>

        // products should be a flat array of objects, not [[{...}]]
        expect(Array.isArray(result.products)).toBe(true)
        expect(result.products).toHaveLength(2)
        expect(Array.isArray((result.products as Array<unknown>)[0])).toBe(false)
        expect(result).toEqual(raw)
    })

    it("round-trips nested objects (sample4)", () => {
        const raw = JSON.parse(loadSample("sampleInput4.json"))
        const tree = parseJSON(loadSample("sampleInput4.json"))
        expect(treeToData(tree)).toEqual(raw)
    })

    it("round-trips deeply nested objects (sample5)", () => {
        const raw = JSON.parse(loadSample("sampleInput5.json"))
        const tree = parseJSON(loadSample("sampleInput5.json"))
        expect(treeToData(tree)).toEqual(raw)
    })

    it("round-trips objects with arrays (sample6)", () => {
        const raw = JSON.parse(loadSample("sampleInput6.json"))
        const tree = parseJSON(loadSample("sampleInput6.json"))
        expect(treeToData(tree)).toEqual(raw)
    })

    it("preserves number types", () => {
        const tree = parseJSON(loadSample("sampleInput3.json"))
        const result = treeToData(tree) as Record<string, unknown>
        const products = result.products as Array<Record<string, unknown>>
        expect(typeof products[0].id).toBe("number")
        expect(typeof products[0].price).toBe("number")
        expect(products[0].id).toBe(1)
        expect(products[0].price).toBe(900)
    })

    it("preserves string types", () => {
        const tree = parseJSON(loadSample("sampleInput3.json"))
        const result = treeToData(tree) as Record<string, unknown>
        const products = result.products as Array<Record<string, unknown>>
        expect(typeof products[0].name).toBe("string")
        expect(products[0].name).toBe("Laptop")
    })

    it("returns null for null tree", () => {
        expect(treeToData(null)).toBeNull()
    })

    it("round-trips root-level array (sampleOutput6)", () => {
        const raw = JSON.parse(loadSample("sampleOutput6.json"))
        const tree = parseJSON(loadSample("sampleOutput6.json"))
        expect(treeToData(tree)).toEqual(raw)
    })
})

describe("applyMappings", () => {
    it("maps source values to target template", () => {
        const sourceData = JSON.parse(loadSample("sampleInput1.json"))
        const targetTree = parseJSON(loadSample("sampleOutput1.json"))
        const targetTemplate = treeToData(targetTree) as Record<string, unknown>

        const mappings: Array<Mapping> = [
            { id: "m1", sourceId: "root.id", targetId: "root.userId" },
            { id: "m2", sourceId: "root.first_name", targetId: "root.fullName" },
            { id: "m3", sourceId: "root.age", targetId: "root.ageInYears" },
        ]

        const { result, errors } = applyMappings(sourceData, mappings, targetTemplate)
        expect(errors).toHaveLength(0)

        const r = result as Record<string, unknown>
        expect(r.userId).toBe("101")
        expect(r.fullName).toBe("John")
        expect(r.ageInYears).toBe("28")
    })

    it("maps nested source to flat target", () => {
        const sourceData = JSON.parse(loadSample("sampleInput2.json"))
        const targetTree = parseJSON(loadSample("sampleOutput2.json"))
        const targetTemplate = treeToData(targetTree) as Record<string, unknown>

        const mappings: Array<Mapping> = [
            { id: "m1", sourceId: "root.order_id", targetId: "root.order.id" },
            { id: "m2", sourceId: "root.total", targetId: "root.order.amount.value" },
            { id: "m3", sourceId: "root.currency", targetId: "root.order.amount.currency" },
            { id: "m4", sourceId: "root.customer.name", targetId: "root.customer_name" },
            { id: "m5", sourceId: "root.customer.email", targetId: "root.customer_email" },
        ]

        const { result, errors } = applyMappings(sourceData, mappings, targetTemplate)
        expect(errors).toHaveLength(0)

        const r = result as Record<string, unknown>
        expect(r.customer_name).toBe("John Doe")
        expect(r.customer_email).toBe("john@example.com")
        const order = r.order as Record<string, unknown>
        expect(order.id).toBe("ORD001")
        const amount = order.amount as Record<string, unknown>
        expect(amount.value).toBe(500)
        expect(amount.currency).toBe("USD")
    })

    it("reports error for missing source path", () => {
        const sourceData = { name: "test" }
        const targetTemplate = { name: "" }

        const mappings: Array<Mapping> = [
            { id: "m1", sourceId: "root.missing", targetId: "root.name" },
        ]

        const { errors } = applyMappings(sourceData, mappings, targetTemplate)
        expect(errors).toHaveLength(1)
        expect(errors[0].message).toContain("not found")
    })
})

describe("evaluateCondition", () => {
    const sourceData = {
        name: "Laptop",
        price: 900,
        category: "Electronics",
    }

    it("evaluates == with matching string", () => {
        const cond: MappingCondition = { field: "root.name", operator: "==", value: "Laptop" }
        expect(evaluateCondition(sourceData, cond)).toBe(true)
    })

    it("evaluates == with non-matching string", () => {
        const cond: MappingCondition = { field: "root.name", operator: "==", value: "Phone" }
        expect(evaluateCondition(sourceData, cond)).toBe(false)
    })

    it("evaluates != operator", () => {
        const cond: MappingCondition = { field: "root.name", operator: "!=", value: "Phone" }
        expect(evaluateCondition(sourceData, cond)).toBe(true)
    })

    it("evaluates > with numbers", () => {
        const cond: MappingCondition = { field: "root.price", operator: ">", value: "500" }
        expect(evaluateCondition(sourceData, cond)).toBe(true)
    })

    it("evaluates < with numbers", () => {
        const cond: MappingCondition = { field: "root.price", operator: "<", value: "500" }
        expect(evaluateCondition(sourceData, cond)).toBe(false)
    })

    it("evaluates >= with numbers", () => {
        const cond: MappingCondition = { field: "root.price", operator: ">=", value: "900" }
        expect(evaluateCondition(sourceData, cond)).toBe(true)
    })

    it("evaluates <= with numbers", () => {
        const cond: MappingCondition = { field: "root.price", operator: "<=", value: "900" }
        expect(evaluateCondition(sourceData, cond)).toBe(true)
    })

    it("evaluates contains", () => {
        const cond: MappingCondition = { field: "root.name", operator: "contains", value: "apt" }
        expect(evaluateCondition(sourceData, cond)).toBe(true)
    })

    it("evaluates startsWith", () => {
        const cond: MappingCondition = { field: "root.name", operator: "startsWith", value: "Lap" }
        expect(evaluateCondition(sourceData, cond)).toBe(true)
    })

    it("evaluates endsWith", () => {
        const cond: MappingCondition = { field: "root.name", operator: "endsWith", value: "top" }
        expect(evaluateCondition(sourceData, cond)).toBe(true)
    })

    it("returns false for missing field", () => {
        const cond: MappingCondition = { field: "root.missing", operator: "==", value: "x" }
        expect(evaluateCondition(sourceData, cond)).toBe(false)
    })

    it("returns false for null field", () => {
        const data = { value: null }
        const cond: MappingCondition = { field: "root.value", operator: "==", value: "x" }
        expect(evaluateCondition(data, cond)).toBe(false)
    })
})

describe("applyTransform", () => {
    it("adds a number", () => {
        expect(applyTransform(100, { type: "add", value: 50 })).toBe(150)
    })

    it("subtracts a number", () => {
        expect(applyTransform(100, { type: "subtract", value: 30 })).toBe(70)
    })

    it("multiplies a number", () => {
        expect(applyTransform(100, { type: "multiply", value: 1.5 })).toBe(150)
    })

    it("divides a number", () => {
        expect(applyTransform(100, { type: "divide", value: 4 })).toBe(25)
    })

    it("does not divide by zero", () => {
        expect(applyTransform(100, { type: "divide", value: 0 })).toBe(100)
    })

    it("adds a percentage", () => {
        expect(applyTransform(100, { type: "add_percent", value: 5 })).toBe(105)
    })

    it("subtracts a percentage", () => {
        expect(applyTransform(200, { type: "subtract_percent", value: 10 })).toBe(180)
    })

    it("returns non-numeric value as-is", () => {
        expect(applyTransform("hello", { type: "add", value: 5 })).toBe("hello")
    })

    it("handles string numbers", () => {
        expect(applyTransform("100", { type: "add", value: 50 })).toBe(150)
    })
})

describe("applyMappings - with conditions and transforms", () => {
    it("skips mapping when condition is not met", () => {
        const sourceData = { price: 30 }
        const targetTemplate = { cost: 0 }

        const mappings: Array<Mapping> = [
            {
                id: "m1",
                sourceId: "root.price",
                targetId: "root.cost",
                condition: { field: "root.price", operator: ">", value: "50" },
            },
        ]

        const { result } = applyMappings(sourceData, mappings, targetTemplate)
        expect((result as Record<string, unknown>).cost).toBe(0) // not mapped
    })

    it("applies mapping when condition is met", () => {
        const sourceData = { price: 100 }
        const targetTemplate = { cost: 0 }

        const mappings: Array<Mapping> = [
            {
                id: "m1",
                sourceId: "root.price",
                targetId: "root.cost",
                condition: { field: "root.price", operator: ">", value: "50" },
            },
        ]

        const { result } = applyMappings(sourceData, mappings, targetTemplate)
        expect((result as Record<string, unknown>).cost).toBe(100)
    })

    it("applies transform to mapped value", () => {
        const sourceData = { price: 100 }
        const targetTemplate = { cost: 0 }

        const mappings: Array<Mapping> = [
            {
                id: "m1",
                sourceId: "root.price",
                targetId: "root.cost",
                transform: { type: "add_percent", value: 5 },
            },
        ]

        const { result } = applyMappings(sourceData, mappings, targetTemplate)
        expect((result as Record<string, unknown>).cost).toBe(105)
    })

    it("applies condition + transform together", () => {
        const sourceData = { price: 100 }
        const targetTemplate = { cost: 0 }

        const mappings: Array<Mapping> = [
            {
                id: "m1",
                sourceId: "root.price",
                targetId: "root.cost",
                condition: { field: "root.price", operator: ">", value: "40" },
                transform: { type: "add_percent", value: 5 },
            },
        ]

        const { result } = applyMappings(sourceData, mappings, targetTemplate)
        expect((result as Record<string, unknown>).cost).toBe(105)
    })

    it("skips condition + transform when condition fails", () => {
        const sourceData = { price: 20 }
        const targetTemplate = { cost: 0 }

        const mappings: Array<Mapping> = [
            {
                id: "m1",
                sourceId: "root.price",
                targetId: "root.cost",
                condition: { field: "root.price", operator: ">", value: "40" },
                transform: { type: "add_percent", value: 5 },
            },
        ]

        const { result } = applyMappings(sourceData, mappings, targetTemplate)
        expect((result as Record<string, unknown>).cost).toBe(0) // not mapped
    })
})

describe("generateJSONOutput", () => {
    it("produces indented JSON", () => {
        const data = { a: 1, b: [2, 3] }
        const output = generateJSONOutput(data)
        expect(output).toBe(JSON.stringify(data, null, 2))
    })

    it("handles null", () => {
        expect(generateJSONOutput(null)).toBe("null")
    })
})

// ============================================================
// Phase 6 — Test helpers
// ============================================================

const emptyContext: MapperContext = {
    globalVariables: [],
    lookupTables: [],
    functions: [],
    prologScript: null,
    epilogScript: null,
}

/**
 * Build a minimal MapperState with one source field mapped to one target field.
 * source tree:  root → order → id (element)
 * target tree:  root → orderId (element)
 */
function buildSimpleState(): MapperState {
    const state = createEmptyMapperState("JSON", "JSON")

    // Source: root.order.id
    const orderId = createNode("id", "element")
    const order = createNode("order", "element", { children: [orderId] })
    state.sourceTreeNode = createNode("root", "element", { children: [order] })

    // Target: root.orderId
    const ref: SourceReference = createSourceReference(orderId.id, "_id", true)
    const targetOrderId = createNode("orderId", "element", { sourceReferences: [ref] })
    state.targetTreeNode = createNode("root", "element", { children: [targetOrderId] })

    state.references = [
        {
            id: ref.id,
            sourceNodeId: orderId.id,
            targetNodeId: targetOrderId.id,
            variableName: "_id",
            textReference: true,
        },
    ]

    return state
}

/**
 * Build a MapperState with a loop.
 * source:  root → orders (array) → [] (arrayChild) → id (element)
 * target:  root → items (array, loopRef=orders[]) → [] (arrayChild) → orderId (element, ref=_id)
 */
function buildStateWithLoop(): MapperState {
    const state = createEmptyMapperState("JSON", "JSON")

    // Source tree
    const srcId = createNode("id", "element")
    const srcArrayChild = createNode("[]", "arrayChild", { children: [srcId] })
    const srcOrders = createNode("orders", "array", { children: [srcArrayChild] })
    state.sourceTreeNode = createNode("root", "element", { children: [srcOrders] })

    // Loop reference pointing at the arrayChild
    const loopRef = createLoopReference(srcArrayChild.id, "_orders")

    // Target tree
    const ref: SourceReference = createSourceReference(srcId.id, "_orderId", true, {
        loopOverId: loopRef.id,
    })
    const tgtOrderId = createNode("orderId", "element", { sourceReferences: [ref] })
    const tgtArrayChild = createNode("[]", "arrayChild", { children: [tgtOrderId] })
    const tgtItems = createNode("items", "array", {
        loopReference: loopRef,
        loopIterator: "_order",
        children: [tgtArrayChild],
    })
    state.targetTreeNode = createNode("root", "element", { children: [tgtItems] })

    state.references = [
        {
            id: ref.id,
            sourceNodeId: srcId.id,
            targetNodeId: tgtOrderId.id,
            variableName: "_orderId",
            textReference: true,
            loopOverId: loopRef.id,
        },
    ]

    return state
}

/**
 * Build a state with a loop and a loop condition.
 */
function buildStateWithLoopCondition(conditionExpr: string): MapperState {
    const state = buildStateWithLoop()
    // Find the items array node and add a loop condition
    const itemsNode = state.targetTreeNode!.children![0]

    // Source node for condition: orders.[].status
    const srcStatus = createNode("status", "element")
    const srcArrayChild = state.sourceTreeNode!.children![0].children![0]
    srcArrayChild.children = [...(srcArrayChild.children ?? []), srcStatus]

    itemsNode.loopConditions = [
        {
            id: "lc1",
            sourceNodePath: `orders.[].status`,
            condition: conditionExpr,
            textReference: true,
        },
    ]

    return state
}

/**
 * Build a state with context (global variables, lookup table, functions, prolog, epilog).
 */
function buildStateWithContext(opts: {
    globalVars?: Array<GlobalVariable>
    lookupTables?: Array<LookupTable>
    functions?: Array<TransformFunction>
    prolog?: string
    epilog?: string
}): MapperState {
    const state = buildSimpleState()
    state.localContext = {
        globalVariables: opts.globalVars ?? [],
        lookupTables: opts.lookupTables ?? [],
        functions: opts.functions ?? [],
        prologScript: opts.prolog ?? null,
        epilogScript: opts.epilog ?? null,
    }
    return state
}

// ============================================================
// Phase 6 — generateScript tests
// ============================================================

describe("generateScript - simple JSON→JSON mapping", () => {
    it("contains JSON.parse(input) for JSON source", () => {
        const state = buildSimpleState()
        const script = generateScript(state, "json", "json")
        expect(script).toContain("const sourceData = JSON.parse(input)")
    })

    it("contains a const declaration for the source reference variable", () => {
        const state = buildSimpleState()
        const script = generateScript(state, "json", "json")
        expect(script).toContain("const _id = sourceData.order.id")
    })

    it("assigns source variable to output field", () => {
        const state = buildSimpleState()
        const script = generateScript(state, "json", "json")
        expect(script).toContain("output.orderId = _id")
    })

    it("returns JSON.stringify(output, null, 2) for JSON output", () => {
        const state = buildSimpleState()
        const script = generateScript(state, "json", "json")
        expect(script).toContain("return JSON.stringify(output, null, 2)")
    })

    it("initializes output as empty object", () => {
        const state = buildSimpleState()
        const script = generateScript(state, "json", "json")
        expect(script).toContain("const output = {}")
    })
})

describe("generateScript - XML source", () => {
    it("uses parseXML(input) for xml source type", () => {
        const state = buildSimpleState()
        state.sourceInputType = "XML"
        const script = generateScript(state, "xml", "json")
        expect(script).toContain("const sourceData = parseXML(input)")
        expect(script).not.toContain("JSON.parse(input)")
    })
})

describe("generateScript - XML output", () => {
    it("uses toXML(output) for xml output type", () => {
        const state = buildSimpleState()
        state.targetInputType = "XML"
        const script = generateScript(state, "json", "xml")
        expect(script).toContain("return toXML(output)")
        expect(script).not.toContain("JSON.stringify(output")
    })
})

describe("generateScript - loops", () => {
    it("generates for-loop for array mapping", () => {
        const state = buildStateWithLoop()
        const script = generateScript(state, "json", "json")
        expect(script).toMatch(/for \(const _order of sourceData\.orders\)/)
    })

    it("initializes the output array inside the loop", () => {
        const state = buildStateWithLoop()
        const script = generateScript(state, "json", "json")
        expect(script).toContain("output.items = output.items || []")
        expect(script).toContain("output.items.push({})")
    })

    it("declares loop-scoped ref vars inside the loop body", () => {
        const state = buildStateWithLoop()
        const script = generateScript(state, "json", "json")
        // _orderId should be declared inside the loop with _order.id
        expect(script).toContain("const _orderId = _order.id")
    })

    it("assigns loop-scoped ref to nested output path", () => {
        const state = buildStateWithLoop()
        const script = generateScript(state, "json", "json")
        expect(script).toContain("output.items[output.items.length - 1].orderId = _orderId")
    })
})

describe("generateScript - loop conditions", () => {
    it("wraps loop body in an if statement with condition", () => {
        const state = buildStateWithLoopCondition("=== 'ACTIVE'")
        const script = generateScript(state, "json", "json")
        expect(script).toContain("=== 'ACTIVE'")
        expect(script).toMatch(/if \(.*=== 'ACTIVE'\)/)
    })
})

describe("generateScript - node conditions", () => {
    it("wraps node output in an if block when nodeCondition is set", () => {
        const state = buildSimpleState()
        // Add a node condition to the target orderId node
        const targetNode = state.targetTreeNode!.children![0]
        targetNode.nodeCondition = { condition: "sourceData.order.active === true" }
        const script = generateScript(state, "json", "json")
        expect(script).toContain("if (sourceData.order.active === true)")
    })
})

describe("generateScript - plain text value", () => {
    it("quotes the value when plainTextValue=true", () => {
        const state = createEmptyMapperState("JSON", "JSON")
        const tgtNode = createNode("status", "element", {
            value: "ACTIVE",
            plainTextValue: true,
        })
        state.targetTreeNode = createNode("root", "element", { children: [tgtNode] })
        state.references = []

        const script = generateScript(state, "json", "json")
        expect(script).toContain('output.status = "ACTIVE"')
    })

    it("uses value verbatim when plainTextValue=false", () => {
        const state = createEmptyMapperState("JSON", "JSON")
        const tgtNode = createNode("computed", "element", {
            value: "sourceData.price * 1.1",
            plainTextValue: false,
        })
        state.targetTreeNode = createNode("root", "element", { children: [tgtNode] })
        state.references = []

        const script = generateScript(state, "json", "json")
        expect(script).toContain("output.computed = sourceData.price * 1.1")
    })
})

describe("generateScript - global variables", () => {
    it("injects plain text global variables as quoted strings", () => {
        const state = buildStateWithContext({
            globalVars: [
                {
                    id: "gv1",
                    name: "ENV",
                    value: "prod",
                    plainTextValue: true,
                },
            ],
        })
        const script = generateScript(state, "json", "json")
        expect(script).toContain('const ENV = "prod"')
    })

    it("injects expression global variables verbatim", () => {
        const state = buildStateWithContext({
            globalVars: [
                {
                    id: "gv2",
                    name: "BASE_URL",
                    value: "process.env.BASE_URL",
                    plainTextValue: false,
                },
            ],
        })
        const script = generateScript(state, "json", "json")
        expect(script).toContain("const BASE_URL = process.env.BASE_URL")
    })
})

describe("generateScript - lookup tables", () => {
    it("generates a JS object for a lookup table", () => {
        const state = buildStateWithContext({
            lookupTables: [
                {
                    id: "lt1",
                    name: "STATUS_MAP",
                    entries: [
                        { id: "e1", key: "A", value: "Active", plainTextValue: true },
                        { id: "e2", key: "I", value: "Inactive", plainTextValue: true },
                    ],
                },
            ],
        })
        const script = generateScript(state, "json", "json")
        expect(script).toContain("const STATUS_MAP = {")
        expect(script).toContain('"A": "Active"')
        expect(script).toContain('"I": "Inactive"')
    })
})

describe("generateScript - user functions", () => {
    it("injects the function body into the script", () => {
        const state = buildStateWithContext({
            functions: [
                {
                    id: "fn1",
                    name: "formatDate",
                    body: "function formatDate(d) { return new Date(d).toISOString() }",
                },
            ],
        })
        const script = generateScript(state, "json", "json")
        expect(script).toContain("function formatDate(d)")
        expect(script).toContain("toISOString()")
    })
})

describe("generateScript - prolog and epilog", () => {
    it("injects prolog before output section", () => {
        const state = buildStateWithContext({ prolog: "const x = 1" })
        const script = generateScript(state, "json", "json")
        const prologIdx = script.indexOf("const x = 1")
        const outputIdx = script.indexOf("const output = {}")
        expect(prologIdx).toBeGreaterThan(-1)
        expect(prologIdx).toBeLessThan(outputIdx)
    })

    it("injects epilog after output section", () => {
        const state = buildStateWithContext({ epilog: "console.log('done')" })
        const script = generateScript(state, "json", "json")
        const outputIdx = script.indexOf("const output = {}")
        const epilogIdx = script.indexOf("console.log('done')")
        expect(epilogIdx).toBeGreaterThan(outputIdx)
    })
})

describe("generateScript - code nodes", () => {
    it("injects code node value verbatim without assignment", () => {
        const state = createEmptyMapperState("JSON", "JSON")
        const codeNode = createNode("__code__", "code", {
            value: "output.debug = 'injected code'",
        })
        state.targetTreeNode = createNode("root", "element", { children: [codeNode] })
        state.references = []

        const script = generateScript(state, "json", "json")
        expect(script).toContain("output.debug = 'injected code'")
    })
})

describe("generateScript - debug comments", () => {
    it("adds variable name comments when debugComment is true", () => {
        const state = buildSimpleState()
        state.mapperPreferences.debugComment = true
        const script = generateScript(state, "json", "json")
        expect(script).toContain("// _id")
    })

    it("does not add comments when debugComment is false", () => {
        const state = buildSimpleState()
        state.mapperPreferences.debugComment = false
        const script = generateScript(state, "json", "json")
        // Should not have debug comment
        expect(script).not.toMatch(/= _id \/\//)
    })
})

describe("generateScript - multiple source refs (template literal)", () => {
    it("combines multiple refs into a template literal", () => {
        const state = createEmptyMapperState("JSON", "JSON")

        const srcFirst = createNode("first", "element")
        const srcLast = createNode("last", "element")
        state.sourceTreeNode = createNode("root", "element", {
            children: [srcFirst, srcLast],
        })

        const ref1 = createSourceReference(srcFirst.id, "_first", true)
        const ref2 = createSourceReference(srcLast.id, "_last", true)
        const tgtName = createNode("fullName", "element", { sourceReferences: [ref1, ref2] })
        state.targetTreeNode = createNode("root", "element", { children: [tgtName] })
        state.references = []

        const script = generateScript(state, "json", "json")
        expect(script).toContain("`${_first}${_last}`")
    })
})

// ============================================================
// Phase 6 — detectTemplateType tests
// ============================================================

describe("detectTemplateType", () => {
    it("returns json_to_json for JSON→JSON", () => {
        const state = createEmptyMapperState("JSON", "JSON")
        expect(detectTemplateType(state)).toBe("json_to_json")
    })

    it("returns xml_to_json for XML→JSON", () => {
        const state = createEmptyMapperState("XML", "JSON")
        expect(detectTemplateType(state)).toBe("xml_to_json")
    })

    it("returns json_to_xml for JSON→XML", () => {
        const state = createEmptyMapperState("JSON", "XML")
        expect(detectTemplateType(state)).toBe("json_to_xml")
    })

    it("returns xml_to_xml for XML→XML", () => {
        const state = createEmptyMapperState("XML", "XML")
        expect(detectTemplateType(state)).toBe("xml_to_xml")
    })
})

// ============================================================
// Phase 6 — executeScript tests
// ============================================================

describe("executeScript", () => {
    it("executes a simple JSON passthrough and returns output", async () => {
        const script = [
            "const sourceData = JSON.parse(input)",
            "const output = { id: sourceData.id }",
            "return JSON.stringify(output, null, 2)",
        ].join("\n")

        const result = await executeScript(script, '{"id": "123"}', emptyContext)
        expect(result.error).toBeNull()
        expect(JSON.parse(result.output).id).toBe("123")
    })

    it("captures errors without throwing", async () => {
        const script = 'throw new Error("intentional error")'
        const result = await executeScript(script, "{}", emptyContext)
        expect(result.error).toContain("intentional error")
        expect(result.output).toBe("")
    })

    it("returns the scriptBody in the result", async () => {
        const script = 'return "hello"'
        const result = await executeScript(script, "{}", emptyContext)
        expect(result.scriptBody).toBe(script)
    })

    it("reports durationMs >= 0", async () => {
        const script = 'return "ok"'
        const result = await executeScript(script, "{}", emptyContext)
        expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    it("handles JSON parse errors in script gracefully", async () => {
        const script = "const sourceData = JSON.parse(input); return JSON.stringify(sourceData)"
        const result = await executeScript(script, "not valid json", emptyContext)
        expect(result.error).not.toBeNull()
        expect(result.output).toBe("")
    })

    it("executes script generated by generateScript()", async () => {
        const state = buildSimpleState()
        const scriptBody = generateScript(state, "json", "json")
        const input = JSON.stringify({ order: { id: "ORDER-42" } })

        const result = await executeScript(scriptBody, input, state.localContext)
        expect(result.error).toBeNull()
        const parsed = JSON.parse(result.output)
        expect(parsed.orderId).toBe("ORDER-42")
    })

    it("returns empty string output on null script return", async () => {
        const script = "const x = 1" // no return → undefined
        const result = await executeScript(script, "{}", emptyContext)
        expect(result.output).toBe("")
        expect(result.error).toBeNull()
    })
})

// ============================================================
// Phase 6 — Integration: generateScript + executeScript roundtrip
// ============================================================

describe("generateScript + executeScript integration", () => {
    it("maps a flat JSON field end-to-end", async () => {
        const state = buildSimpleState()
        const script = generateScript(state, "json", "json")
        const result = await executeScript(
            script,
            JSON.stringify({ order: { id: "X1" } }),
            emptyContext,
        )
        expect(result.error).toBeNull()
        expect(JSON.parse(result.output).orderId).toBe("X1")
    })

    it("maps with a global variable available in output", async () => {
        const state = buildStateWithContext({
            globalVars: [{ id: "g1", name: "PREFIX", value: "ORD-", plainTextValue: true }],
        })
        // target node uses the global var concatenated with the source ref variable
        // Keep the sourceReferences so _id is declared; combine with PREFIX in the value expr
        const tgt = state.targetTreeNode!.children![0]
        tgt.value = "PREFIX + sourceData.order.id"
        tgt.plainTextValue = false
        tgt.sourceReferences = [] // clear refs; value expression reads sourceData directly

        const script = generateScript(state, "json", "json")
        const result = await executeScript(
            script,
            JSON.stringify({ order: { id: "123" } }),
            state.localContext,
        )
        expect(result.error).toBeNull()
        const parsed = JSON.parse(result.output)
        expect(parsed.orderId).toBe("ORD-123")
    })

    it("applies prolog code before mapping", async () => {
        const state = buildStateWithContext({ prolog: "const greeting = 'hello'" })
        const tgt = state.targetTreeNode!.children![0]
        tgt.value = "greeting"
        tgt.plainTextValue = false
        tgt.sourceReferences = []

        const script = generateScript(state, "json", "json")
        const result = await executeScript(script, "{}", state.localContext)
        expect(result.error).toBeNull()
        expect(JSON.parse(result.output).orderId).toBe("hello")
    })
})
