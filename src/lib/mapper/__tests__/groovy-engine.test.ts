import { describe, expect, it } from "vitest"
import { parseJSON } from "../parsers"
import {
    detectRequiredImports,
    escapeGroovyString,
    generateGroovyScript,
    translateJsToGroovy,
} from "../groovy-engine"
import { createEmptyMapperState, createNode, fromParserTreeNode } from "../node-utils"
import { createLoopReference, createSourceReference } from "../reference-utils"
import type {
    GlobalVariable,
    LookupTable,
    MapperState,
    SourceReference,
    TransformFunction,
} from "../types"

// ============================================================
// Test helpers — mirror engine.test.ts patterns
// ============================================================

/**
 * Build a minimal MapperState with one source field mapped to one target field.
 * source tree:  root → order → id (element)
 * target tree:  root → orderId (element)
 */
function buildSimpleState(): MapperState {
    const state = createEmptyMapperState("JSON", "JSON")

    const orderId = createNode("id", "element")
    const order = createNode("order", "element", { children: [orderId] })
    state.sourceTreeNode = createNode("root", "element", {
        children: [order],
    })

    const ref: SourceReference = createSourceReference(orderId.id, "_id", true)
    const targetOrderId = createNode("orderId", "element", {
        sourceReferences: [ref],
    })
    state.targetTreeNode = createNode("root", "element", {
        children: [targetOrderId],
    })

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

    const srcId = createNode("id", "element")
    const srcArrayChild = createNode("[]", "arrayChild", {
        children: [srcId],
    })
    const srcOrders = createNode("orders", "array", {
        children: [srcArrayChild],
    })
    state.sourceTreeNode = createNode("root", "element", {
        children: [srcOrders],
    })

    const loopRef = createLoopReference(srcArrayChild.id, "_orders")

    const ref: SourceReference = createSourceReference(srcId.id, "_orderId", true, {
        loopOverId: loopRef.id,
    })
    const tgtOrderId = createNode("orderId", "element", {
        sourceReferences: [ref],
    })
    const tgtArrayChild = createNode("[]", "arrayChild", {
        children: [tgtOrderId],
    })
    const tgtItems = createNode("items", "array", {
        loopReference: loopRef,
        loopIterator: "_order",
        children: [tgtArrayChild],
    })
    state.targetTreeNode = createNode("root", "element", {
        children: [tgtItems],
    })

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
    const itemsNode = state.targetTreeNode!.children![0]

    const srcStatus = createNode("status", "element")
    const srcArrayChild = state.sourceTreeNode!.children![0].children![0]
    srcArrayChild.children = [...(srcArrayChild.children ?? []), srcStatus]

    itemsNode.loopConditions = [
        {
            id: "lc1",
            sourceNodePath: "orders.[].status",
            condition: conditionExpr,
            textReference: true,
        },
    ]

    return state
}

/**
 * Build a state with context.
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

/**
 * Build a state with a node condition on an array child.
 */
function buildStateWithNodeConditionOnArrayChild(conditionExpr: string): MapperState {
    const state = createEmptyMapperState("JSON", "JSON")

    const srcId = createNode("id", "element")
    const srcName = createNode("name", "element")
    const srcArrayChild = createNode("[]", "arrayChild", {
        children: [srcId, srcName],
    })
    const srcProducts = createNode("products", "array", {
        children: [srcArrayChild],
    })
    state.sourceTreeNode = createNode("root", "element", {
        children: [srcProducts],
    })

    const loopRef = createLoopReference(srcArrayChild.id, "_products")

    const refId: SourceReference = createSourceReference(srcId.id, "_id", true, {
        loopOverId: loopRef.id,
    })
    const refName: SourceReference = createSourceReference(srcName.id, "_name", true, {
        loopOverId: loopRef.id,
    })

    const tgtProductId = createNode("productId", "element", {
        sourceReferences: [refId],
    })
    const tgtDescription = createNode("description", "element", {
        sourceReferences: [refName],
    })
    const tgtArrayChild = createNode("[]", "arrayChild", {
        children: [tgtProductId, tgtDescription],
        nodeCondition: { condition: conditionExpr },
    })
    const tgtItems = createNode("items", "array", {
        loopReference: loopRef,
        loopIterator: "_product",
        children: [tgtArrayChild],
    })
    state.targetTreeNode = createNode("root", "element", {
        children: [tgtItems],
    })

    state.references = [
        {
            id: refId.id,
            sourceNodeId: srcId.id,
            targetNodeId: tgtProductId.id,
            variableName: "_id",
            textReference: true,
            loopOverId: loopRef.id,
        },
        {
            id: refName.id,
            sourceNodeId: srcName.id,
            targetNodeId: tgtDescription.id,
            variableName: "_name",
            textReference: true,
            loopOverId: loopRef.id,
        },
    ]

    return state
}

// ============================================================
// escapeGroovyString tests
// ============================================================

describe("escapeGroovyString", () => {
    it("escapes double quotes", () => {
        expect(escapeGroovyString('say "hello"')).toBe('say \\"hello\\"')
    })

    it("escapes backslashes", () => {
        expect(escapeGroovyString("path\\to\\file")).toBe("path\\\\to\\\\file")
    })

    it("escapes dollar signs", () => {
        expect(escapeGroovyString("price is $100")).toBe("price is \\$100")
    })

    it("escapes newlines", () => {
        expect(escapeGroovyString("line1\nline2")).toBe("line1\\nline2")
    })

    it("escapes carriage returns", () => {
        expect(escapeGroovyString("line1\rline2")).toBe("line1\\rline2")
    })

    it("escapes tabs", () => {
        expect(escapeGroovyString("col1\tcol2")).toBe("col1\\tcol2")
    })

    it("handles empty string", () => {
        expect(escapeGroovyString("")).toBe("")
    })

    it("handles string with no special chars", () => {
        expect(escapeGroovyString("hello world")).toBe("hello world")
    })
})

// ============================================================
// translateJsToGroovy tests
// ============================================================

describe("translateJsToGroovy", () => {
    it("converts const to def", () => {
        expect(translateJsToGroovy("const x = 1")).toBe("def x = 1")
    })

    it("converts let to def", () => {
        expect(translateJsToGroovy('let y = "hello"')).toBe('def y = "hello"')
    })

    it("converts === to ==", () => {
        expect(translateJsToGroovy("x === y")).toBe("x == y")
    })

    it("converts !== to !=", () => {
        expect(translateJsToGroovy("x !== y")).toBe("x != y")
    })

    it("converts console.log to println", () => {
        expect(translateJsToGroovy('console.log("test")')).toBe('println("test")')
    })

    it("converts template literals to GStrings", () => {
        expect(translateJsToGroovy("`Hello ${name}!`")).toBe('"Hello ${name}!"')
    })

    it("converts .includes to .contains", () => {
        expect(translateJsToGroovy("arr.includes(x)")).toBe("arr.contains(x)")
    })

    it("converts .push to .add", () => {
        expect(translateJsToGroovy("arr.push(item)")).toBe("arr.add(item)")
    })

    it("converts .length to .size()", () => {
        expect(translateJsToGroovy("arr.length")).toBe("arr.size()")
    })

    it("does not convert .length when followed by parentheses", () => {
        // .length() is not a JS pattern (JS uses .length without parens)
        // The negative lookahead correctly leaves .length() untouched
        expect(translateJsToGroovy("str.length()")).toBe("str.length()")
    })

    it("converts parseInt to .toInteger()", () => {
        expect(translateJsToGroovy("parseInt(x)")).toBe("x.toInteger()")
    })

    it("converts parseFloat to .toDouble()", () => {
        expect(translateJsToGroovy("parseFloat(x)")).toBe("x.toDouble()")
    })

    it("converts JSON.parse to JsonSlurper", () => {
        expect(translateJsToGroovy("JSON.parse(str)")).toBe(
            "new groovy.json.JsonSlurper().parseText(str)",
        )
    })

    it("converts Math.max spread", () => {
        expect(translateJsToGroovy("Math.max(...arr)")).toBe("arr.max()")
    })

    it("converts Math.min spread", () => {
        expect(translateJsToGroovy("Math.min(...arr)")).toBe("arr.min()")
    })

    it("handles multiple conversions in one line", () => {
        const js = "const result = arr.length"
        const groovy = translateJsToGroovy(js)
        expect(groovy).toBe("def result = arr.size()")
    })
})

// ============================================================
// generateGroovyScript - simple JSON→JSON mapping
// ============================================================

describe("generateGroovyScript - simple JSON→JSON mapping", () => {
    it("contains JsonSlurper input parsing for JSON source", () => {
        const state = buildSimpleState()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain("def sourceData = new JsonSlurper().parseText(input)")
    })

    it("contains import for JsonSlurper", () => {
        const state = buildSimpleState()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain("import groovy.json.JsonSlurper")
    })

    it("contains import for JsonBuilder", () => {
        const state = buildSimpleState()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain("import groovy.json.JsonBuilder")
    })

    it("declares source ref variable with safe navigation and text handling", () => {
        const state = buildSimpleState()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain('def _id = sourceData?.order?.id?.toString()?.trim() ?: ""')
    })

    it("assigns source variable to output field using bracket notation", () => {
        const state = buildSimpleState()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain('output["orderId"] = _id')
    })

    it("returns JsonBuilder output", () => {
        const state = buildSimpleState()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain("return new JsonBuilder(output).toPrettyString()")
    })

    it("initializes output as empty Groovy map", () => {
        const state = buildSimpleState()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain("def output = [:]")
    })
})

// ============================================================
// generateGroovyScript - XML source
// ============================================================

describe("generateGroovyScript - XML source", () => {
    it("uses XmlSlurper for xml source type", () => {
        const state = buildSimpleState()
        state.sourceInputType = "XML"
        const script = generateGroovyScript(state, "xml", "json")
        expect(script).toContain("def sourceData = new XmlSlurper().parseText(input)")
        expect(script).not.toContain("JsonSlurper")
    })

    it("imports XmlSlurper for XML source", () => {
        const state = buildSimpleState()
        const script = generateGroovyScript(state, "xml", "json")
        expect(script).toContain("import groovy.xml.XmlSlurper")
    })
})

// ============================================================
// generateGroovyScript - XML output
// ============================================================

describe("generateGroovyScript - XML output", () => {
    it("uses buildXml helper for xml output type", () => {
        const state = buildSimpleState()
        state.targetInputType = "XML"
        const script = generateGroovyScript(state, "json", "xml")
        expect(script).toContain("return buildXml(output)")
        expect(script).not.toContain("JsonBuilder")
    })

    it("imports MarkupBuilder for XML output", () => {
        const state = buildSimpleState()
        const script = generateGroovyScript(state, "json", "xml")
        expect(script).toContain("import groovy.xml.MarkupBuilder")
    })

    it("includes the buildXml helper function", () => {
        const state = buildSimpleState()
        const script = generateGroovyScript(state, "json", "xml")
        expect(script).toContain("def buildXml(data)")
        expect(script).toContain("new groovy.xml.MarkupBuilder(writer)")
    })
})

// ============================================================
// generateGroovyScript - loops
// ============================================================

describe("generateGroovyScript - loops", () => {
    it("generates .each closure for array mapping", () => {
        const state = buildStateWithLoop()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toMatch(/sourceData\?\.orders\?\.each\s*\{\s*_order\s*->/)
    })

    it("initializes output array with null check", () => {
        const state = buildStateWithLoop()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain('if (output["items"] == null) output["items"] = []')
    })

    it("creates temp map object (build-then-push pattern)", () => {
        const state = buildStateWithLoop()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toMatch(/def _item_\d+ = \[:\]/)
    })

    it("uses .size() > 0 guard before adding to array", () => {
        const state = buildStateWithLoop()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toMatch(/if \(_item_\d+\.size\(\) > 0\)/)
        expect(script).toMatch(/output\["items"\]\.add\(_item_\d+\)/)
    })

    it("declares loop-scoped ref vars inside the loop body with text handling", () => {
        const state = buildStateWithLoop()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain('def _orderId = _order?.id?.toString()?.trim() ?: ""')
    })

    it("assigns loop-scoped ref to temp item object", () => {
        const state = buildStateWithLoop()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toMatch(/_item_\d+\["orderId"\] = _orderId/)
    })
})

// ============================================================
// generateGroovyScript - loop conditions
// ============================================================

describe("generateGroovyScript - loop conditions", () => {
    it("wraps loop body in an if statement with condition", () => {
        const state = buildStateWithLoopCondition("== 'ACTIVE'")
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain("== 'ACTIVE'")
        expect(script).toMatch(/if \(.*== 'ACTIVE'\)/)
    })

    it("adds .toString()?.trim() to loop condition paths", () => {
        const state = buildStateWithLoopCondition("== 'ACTIVE'")
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toMatch(/status\?\.toString\(\)\?\.trim\(\)\s+== 'ACTIVE'/)
    })
})

// ============================================================
// generateGroovyScript - loops from parsed JSON trees
// ============================================================

function buildStateFromParsedJSON(): MapperState {
    const state = createEmptyMapperState("JSON", "JSON")

    const rawSource = JSON.stringify({
        products: [
            { id: 1, name: "Laptop", price: 900 },
            { id: 2, name: "Mouse", price: 20 },
        ],
    })
    state.sourceTreeNode = fromParserTreeNode(parseJSON(rawSource))

    const rawTarget = JSON.stringify({
        items: [{ productId: null, description: null }],
    })
    state.targetTreeNode = fromParserTreeNode(parseJSON(rawTarget))

    const srcProducts = state.sourceTreeNode.children!.find((n) => n.name === "products")!
    const tgtItems = state.targetTreeNode.children!.find((n) => n.name === "items")!
    const tgtArrayChild = tgtItems.children![0]

    const loopRef = createLoopReference(srcProducts.id, "_products")
    tgtItems.loopReference = loopRef
    tgtItems.loopIterator = "_product"

    const srcArrayChild = srcProducts.children![0]
    const srcId = srcArrayChild.children!.find((n) => n.name === "id")!
    const tgtProductId = tgtArrayChild.children!.find((n) => n.name === "productId")!

    const idRef = createSourceReference(srcId.id, "_id", true, {
        loopOverId: loopRef.id,
    })
    tgtProductId.sourceReferences = [idRef]
    tgtProductId.value = "_id"

    state.references = [
        {
            id: idRef.id,
            sourceNodeId: srcId.id,
            targetNodeId: tgtProductId.id,
            variableName: "_id",
            textReference: true,
            loopOverId: loopRef.id,
        },
    ]

    return state
}

describe("generateGroovyScript - loops from parsed JSON trees", () => {
    it("generates .each closure from parsed tree", () => {
        const state = buildStateFromParsedJSON()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toMatch(/sourceData\?\.products\?\.each\s*\{\s*_product\s*->/)
    })

    it("initializes output array inside the loop", () => {
        const state = buildStateFromParsedJSON()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain('if (output["items"] == null) output["items"] = []')
        expect(script).toMatch(/def _item_\d+ = \[:\]/)
    })

    it("declares loop-scoped ref using iterator variable", () => {
        const state = buildStateFromParsedJSON()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain("def _id = _product?.id")
        expect(script).not.toContain('"[0]"')
        expect(script).not.toContain(".[0]")
    })

    it("assigns to temp item object", () => {
        const state = buildStateFromParsedJSON()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toMatch(/_item_\d+\["productId"\] = _id/)
    })
})

// ============================================================
// generateGroovyScript - loopStatement override
// ============================================================

describe("generateGroovyScript - loopStatement override", () => {
    it("uses loopStatement as the iterable expression when set", () => {
        const state = buildStateWithLoop()
        const itemsNode = state.targetTreeNode!.children![0]
        itemsNode.loopStatement = "myCustomList"
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toMatch(/myCustomList\?\.each\s*\{\s*_order\s*->/)
        expect(script).not.toContain("sourceData?.orders")
    })

    it("still initializes output array and scoped refs", () => {
        const state = buildStateWithLoop()
        const itemsNode = state.targetTreeNode!.children![0]
        itemsNode.loopStatement = "myCustomList"
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain('if (output["items"] == null) output["items"] = []')
        expect(script).toMatch(/def _item_\d+ = \[:\]/)
        expect(script).toMatch(/_item_\d+\["orderId"\] = _orderId/)
        expect(script).toMatch(/output\["items"\]\.add\(_item_\d+\)/)
    })
})

// ============================================================
// generateGroovyScript - node conditions
// ============================================================

describe("generateGroovyScript - node conditions", () => {
    it("wraps node output in an if block when nodeCondition is set", () => {
        const state = buildSimpleState()
        const targetNode = state.targetTreeNode!.children![0]
        targetNode.nodeCondition = {
            condition: "sourceData?.order?.active == true",
        }
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain("if (sourceData?.order?.active == true)")
    })
})

// ============================================================
// generateGroovyScript - plain text value
// ============================================================

describe("generateGroovyScript - plain text value", () => {
    it("quotes the value when plainTextValue=true", () => {
        const state = createEmptyMapperState("JSON", "JSON")
        const tgtNode = createNode("status", "element", {
            value: "ACTIVE",
            plainTextValue: true,
        })
        state.targetTreeNode = createNode("root", "element", {
            children: [tgtNode],
        })
        state.references = []

        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain('output["status"] = "ACTIVE"')
    })

    it("uses value verbatim when plainTextValue=false", () => {
        const state = createEmptyMapperState("JSON", "JSON")
        const tgtNode = createNode("computed", "element", {
            value: "sourceData?.price * 1.1",
            plainTextValue: false,
        })
        state.targetTreeNode = createNode("root", "element", {
            children: [tgtNode],
        })
        state.references = []

        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain('output["computed"] = sourceData?.price * 1.1')
    })
})

// ============================================================
// generateGroovyScript - global variables
// ============================================================

describe("generateGroovyScript - global variables", () => {
    it("injects plain text global variables as quoted strings with def", () => {
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
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain('def ENV = "prod"')
    })

    it("injects expression global variables verbatim", () => {
        const state = buildStateWithContext({
            globalVars: [
                {
                    id: "gv2",
                    name: "BASE_URL",
                    value: 'System.getenv("BASE_URL")',
                    plainTextValue: false,
                },
            ],
        })
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain('def BASE_URL = System.getenv("BASE_URL")')
    })

    it("uses final def for isFinal variables", () => {
        const state = buildStateWithContext({
            globalVars: [
                {
                    id: "gv3",
                    name: "CONSTANT",
                    value: "42",
                    plainTextValue: false,
                    isFinal: true,
                },
            ],
        })
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain("final def CONSTANT = 42")
    })
})

// ============================================================
// generateGroovyScript - lookup tables
// ============================================================

describe("generateGroovyScript - lookup tables", () => {
    it("generates a Groovy map literal for a lookup table", () => {
        const state = buildStateWithContext({
            lookupTables: [
                {
                    id: "lt1",
                    name: "STATUS_MAP",
                    entries: [
                        {
                            id: "e1",
                            key: "A",
                            value: "Active",
                            plainTextValue: true,
                        },
                        {
                            id: "e2",
                            key: "I",
                            value: "Inactive",
                            plainTextValue: true,
                        },
                    ],
                },
            ],
        })
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain("def STATUS_MAP = [")
        expect(script).toContain('"A": "Active"')
        expect(script).toContain('"I": "Inactive"')
    })

    it("handles expression values in lookup tables", () => {
        const state = buildStateWithContext({
            lookupTables: [
                {
                    id: "lt2",
                    name: "CODE_MAP",
                    entries: [
                        {
                            id: "e1",
                            key: "X",
                            value: "someFunction()",
                            plainTextValue: false,
                        },
                    ],
                },
            ],
        })
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain('"X": someFunction()')
    })
})

// ============================================================
// generateGroovyScript - user functions
// ============================================================

describe("generateGroovyScript - user functions", () => {
    it("injects the function body into the script", () => {
        const state = buildStateWithContext({
            functions: [
                {
                    id: "fn1",
                    name: "formatDate",
                    body: 'def formatDate = { d -> new SimpleDateFormat("yyyy-MM-dd").format(d) }',
                },
            ],
        })
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain("def formatDate = { d ->")
        expect(script).toContain("SimpleDateFormat")
    })
})

// ============================================================
// generateGroovyScript - prolog and epilog
// ============================================================

describe("generateGroovyScript - prolog and epilog", () => {
    it("injects prolog before output section", () => {
        const state = buildStateWithContext({ prolog: "def x = 1" })
        const script = generateGroovyScript(state, "json", "json")
        const prologIdx = script.indexOf("def x = 1")
        const outputIdx = script.indexOf("def output = [:]")
        expect(prologIdx).toBeGreaterThan(-1)
        expect(prologIdx).toBeLessThan(outputIdx)
    })

    it("injects epilog after output section", () => {
        const state = buildStateWithContext({
            epilog: 'println("done")',
        })
        const script = generateGroovyScript(state, "json", "json")
        const outputIdx = script.indexOf("def output = [:]")
        const epilogIdx = script.indexOf('println("done")')
        expect(epilogIdx).toBeGreaterThan(outputIdx)
    })
})

// ============================================================
// generateGroovyScript - code nodes
// ============================================================

describe("generateGroovyScript - code nodes", () => {
    it("injects code node value verbatim without assignment", () => {
        const state = createEmptyMapperState("JSON", "JSON")
        const codeNode = createNode("__code__", "code", {
            value: 'output["debug"] = "injected code"',
        })
        state.targetTreeNode = createNode("root", "element", {
            children: [codeNode],
        })
        state.references = []

        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain('output["debug"] = "injected code"')
    })
})

// ============================================================
// generateGroovyScript - debug comments
// ============================================================

describe("generateGroovyScript - debug comments", () => {
    it("adds variable name comments when debugComment is true", () => {
        const state = buildSimpleState()
        state.mapperPreferences.debugComment = true
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain("// _id")
    })

    it("does not add comments when debugComment is false", () => {
        const state = buildSimpleState()
        state.mapperPreferences.debugComment = false
        const script = generateGroovyScript(state, "json", "json")
        expect(script).not.toMatch(/= _id \/\//)
    })
})

// ============================================================
// generateGroovyScript - multiple source refs (GString)
// ============================================================

describe("generateGroovyScript - multiple source refs (GString)", () => {
    it("combines multiple refs into a GString", () => {
        const state = createEmptyMapperState("JSON", "JSON")

        const srcFirst = createNode("first", "element")
        const srcLast = createNode("last", "element")
        state.sourceTreeNode = createNode("root", "element", {
            children: [srcFirst, srcLast],
        })

        const ref1 = createSourceReference(srcFirst.id, "_first", true)
        const ref2 = createSourceReference(srcLast.id, "_last", true)
        const tgtName = createNode("fullName", "element", {
            sourceReferences: [ref1, ref2],
        })
        state.targetTreeNode = createNode("root", "element", {
            children: [tgtName],
        })
        state.references = []

        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain('"${_first}${_last}"')
    })
})

// ============================================================
// generateGroovyScript - build-then-push pattern
// ============================================================

describe("generateGroovyScript - build-then-push: no empty objects in output", () => {
    it("does not emit .add([:]) — uses temp object instead", () => {
        const state = buildStateWithLoop()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).not.toContain(".add([:])")
        expect(script).toMatch(/def _item_\d+ = \[:\]/)
    })

    it("emits .size() > 0 guard before adding", () => {
        const state = buildStateWithLoop()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toMatch(/if \(_item_\d+\.size\(\) > 0\)/)
        expect(script).toMatch(/output\["items"\]\.add\(_item_\d+\)/)
    })

    it("loop condition if-block appears before temp object", () => {
        const state = buildStateWithLoopCondition("== 'ACTIVE'")
        const script = generateGroovyScript(state, "json", "json")
        const condIdx = script.indexOf("== 'ACTIVE'")
        const itemIdx = script.search(/def _item_\d+ = \[:\]/)
        expect(condIdx).toBeGreaterThan(-1)
        expect(itemIdx).toBeGreaterThan(-1)
        expect(condIdx).toBeLessThan(itemIdx)
    })
})

// ============================================================
// generateGroovyScript - custom code
// ============================================================

describe("generateGroovyScript - custom code", () => {
    it("injects customCode verbatim in the output section", () => {
        const state = createEmptyMapperState("JSON", "JSON")
        const tgtNode = createNode("status", "element", {
            customCode: "def computed = sourceData?.value * 2",
            value: "computed",
            plainTextValue: false,
        })
        state.targetTreeNode = createNode("root", "element", {
            children: [tgtNode],
        })
        state.references = []

        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain("def computed = sourceData?.value * 2")
        expect(script).toContain('output["status"] = computed')
    })
})

// ============================================================
// detectRequiredImports tests
// ============================================================

describe("detectRequiredImports", () => {
    it("detects SimpleDateFormat usage", () => {
        const state = buildStateWithContext({
            prolog: 'def sdf = new SimpleDateFormat("yyyy-MM-dd")',
        })
        const imports = detectRequiredImports(state)
        expect(imports).toContain("import java.text.SimpleDateFormat")
    })

    it("detects ZonedDateTime usage", () => {
        const state = buildStateWithContext({
            prolog: "def now = ZonedDateTime.now()",
        })
        const imports = detectRequiredImports(state)
        expect(imports).toContain("import java.time.*")
    })

    it("detects LocalDate usage", () => {
        const state = buildStateWithContext({
            prolog: "def today = LocalDate.now()",
        })
        const imports = detectRequiredImports(state)
        expect(imports).toContain("import java.time.*")
    })

    it("detects BigDecimal usage", () => {
        const state = buildStateWithContext({
            prolog: 'def amount = new BigDecimal("100.50")',
        })
        const imports = detectRequiredImports(state)
        expect(imports).toContain("import java.math.BigDecimal")
    })

    it("detects Locale usage", () => {
        const state = buildStateWithContext({
            prolog: "def loc = Locale.US",
        })
        const imports = detectRequiredImports(state)
        expect(imports).toContain("import java.util.Locale")
    })

    it("detects Pattern/Matcher usage", () => {
        const state = buildStateWithContext({
            prolog: 'def p = Pattern.compile("\\\\d+")',
        })
        const imports = detectRequiredImports(state)
        expect(imports).toContain("import java.util.regex.*")
    })

    it("returns empty array when no special imports needed", () => {
        const state = buildSimpleState()
        const imports = detectRequiredImports(state)
        expect(imports).toEqual([])
    })

    it("detects imports from function bodies", () => {
        const state = buildStateWithContext({
            functions: [
                {
                    id: "fn1",
                    name: "formatDate",
                    body: 'def sdf = new SimpleDateFormat("yyyy")',
                },
            ],
        })
        const imports = detectRequiredImports(state)
        expect(imports).toContain("import java.text.SimpleDateFormat")
    })

    it("detects imports from custom code in target nodes", () => {
        const state = createEmptyMapperState("JSON", "JSON")
        const tgtNode = createNode("date", "element", {
            customCode: "def dt = LocalDateTime.now()",
            value: "dt.toString()",
            plainTextValue: false,
        })
        state.targetTreeNode = createNode("root", "element", {
            children: [tgtNode],
        })
        state.references = []

        const imports = detectRequiredImports(state)
        expect(imports).toContain("import java.time.*")
    })

    it("deduplicates imports", () => {
        const state = buildStateWithContext({
            prolog: "def a = ZonedDateTime.now()\ndef b = LocalDate.now()",
        })
        const imports = detectRequiredImports(state)
        // Both trigger import java.time.* — should only appear once
        const timeImports = imports.filter((i) => i === "import java.time.*")
        expect(timeImports).toHaveLength(1)
    })

    it("returns sorted imports", () => {
        const state = buildStateWithContext({
            prolog: 'def loc = Locale.US\ndef sdf = new SimpleDateFormat("yyyy")\ndef bd = new BigDecimal("1")',
        })
        const imports = detectRequiredImports(state)
        // Verify sorted order
        for (let i = 1; i < imports.length; i++) {
            expect(imports[i] >= imports[i - 1]).toBe(true)
        }
    })
})

// ============================================================
// Script structure tests
// ============================================================

describe("generateGroovyScript - script structure", () => {
    it("has correct section order: imports, input, globals, output, return", () => {
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
        const script = generateGroovyScript(state, "json", "json")
        const importIdx = script.indexOf("import groovy.json.JsonSlurper")
        const inputIdx = script.indexOf("def sourceData = new JsonSlurper()")
        const globalIdx = script.indexOf('def ENV = "prod"')
        const outputIdx = script.indexOf("def output = [:]")
        const returnIdx = script.indexOf("return new JsonBuilder(output).toPrettyString()")

        expect(importIdx).toBeGreaterThan(-1)
        expect(inputIdx).toBeGreaterThan(importIdx)
        expect(globalIdx).toBeGreaterThan(inputIdx)
        expect(outputIdx).toBeGreaterThan(globalIdx)
        expect(returnIdx).toBeGreaterThan(outputIdx)
    })

    it("handles empty state without errors", () => {
        const state = createEmptyMapperState("JSON", "JSON")
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain("def sourceData = new JsonSlurper().parseText(input)")
        expect(script).toContain("def output = [:]")
        expect(script).toContain("return new JsonBuilder(output).toPrettyString()")
    })
})

// ============================================================
// Groovy-specific syntax patterns
// ============================================================

describe("generateGroovyScript - Groovy-specific patterns", () => {
    it("uses def instead of const for variable declarations", () => {
        const state = buildSimpleState()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).not.toContain("const ")
        expect(script).toContain("def ")
    })

    it("uses [:]  for empty maps", () => {
        const state = buildSimpleState()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain("[:]")
    })

    it("uses bracket notation for map access", () => {
        const state = buildSimpleState()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain('output["orderId"]')
    })

    it("uses safe navigation (?.) for source data access", () => {
        const state = buildSimpleState()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain("sourceData?.order?.id")
    })

    it("uses .each {} instead of for...of for loops", () => {
        const state = buildStateWithLoop()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain(".each {")
        expect(script).not.toContain("for (")
    })

    it("uses .add() instead of .push()", () => {
        const state = buildStateWithLoop()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain(".add(")
        expect(script).not.toContain(".push(")
    })

    it("uses .size() instead of .length", () => {
        const state = buildStateWithLoop()
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain(".size()")
        expect(script).not.toMatch(/\.length\b/)
    })
})

// ============================================================
// Non-text reference (expression) source refs
// ============================================================

describe("generateGroovyScript - non-text reference source refs", () => {
    it("does not add .toString()?.trim() for non-text references", () => {
        const state = createEmptyMapperState("JSON", "JSON")

        const srcPrice = createNode("price", "element")
        state.sourceTreeNode = createNode("root", "element", {
            children: [srcPrice],
        })

        const ref = createSourceReference(srcPrice.id, "_price", false) // textReference = false
        const tgtPrice = createNode("amount", "element", {
            sourceReferences: [ref],
        })
        state.targetTreeNode = createNode("root", "element", {
            children: [tgtPrice],
        })
        state.references = []

        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain("def _price = sourceData?.price")
        expect(script).not.toContain("def _price = sourceData?.price?.toString()")
    })
})

// ============================================================
// Nested object output
// ============================================================

describe("generateGroovyScript - nested output", () => {
    it("generates nested bracket notation for deep output paths", () => {
        const state = createEmptyMapperState("JSON", "JSON")

        const srcName = createNode("name", "element")
        state.sourceTreeNode = createNode("root", "element", {
            children: [srcName],
        })

        const ref = createSourceReference(srcName.id, "_name", true)
        const tgtField = createNode("field", "element", {
            sourceReferences: [ref],
        })
        const tgtNested = createNode("nested", "element", {
            children: [tgtField],
        })
        state.targetTreeNode = createNode("root", "element", {
            children: [tgtNested],
        })
        state.references = []

        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain('output["nested"]["field"] = _name')
    })
})

// ============================================================
// Attribute nodes
// ============================================================

describe("generateGroovyScript - attribute nodes", () => {
    it("generates bracket notation for attribute output paths", () => {
        const state = createEmptyMapperState("JSON", "JSON")

        const srcVal = createNode("value", "element")
        state.sourceTreeNode = createNode("root", "element", {
            children: [srcVal],
        })

        const ref = createSourceReference(srcVal.id, "_val", true)
        const tgtAttr = createNode("@lang", "attribute", {
            sourceReferences: [ref],
        })
        const tgtElem = createNode("greeting", "element", {
            children: [tgtAttr],
        })
        state.targetTreeNode = createNode("root", "element", {
            children: [tgtElem],
        })
        state.references = []

        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain('output["greeting"]["@lang"] = _val')
    })
})

// ============================================================
// Loop connectives (OR)
// ============================================================

describe("generateGroovyScript - loop condition connectives", () => {
    it("uses || for OR connective", () => {
        const state = buildStateWithLoop()
        const itemsNode = state.targetTreeNode!.children![0]

        const srcStatus = createNode("status", "element")
        const srcType = createNode("type", "element")
        const srcArrayChild = state.sourceTreeNode!.children![0].children![0]
        srcArrayChild.children = [...(srcArrayChild.children ?? []), srcStatus, srcType]

        itemsNode.loopConditions = [
            {
                id: "lc1",
                sourceNodePath: "orders.[].status",
                condition: "== 'ACTIVE'",
                textReference: true,
            },
            {
                id: "lc2",
                sourceNodePath: "orders.[].type",
                condition: "== 'PREMIUM'",
                textReference: true,
            },
        ]
        itemsNode.loopConditionsConnective = "OR"

        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain(" || ")
    })

    it("uses && for AND connective (default)", () => {
        const state = buildStateWithLoop()
        const itemsNode = state.targetTreeNode!.children![0]

        const srcStatus = createNode("status", "element")
        const srcType = createNode("type", "element")
        const srcArrayChild = state.sourceTreeNode!.children![0].children![0]
        srcArrayChild.children = [...(srcArrayChild.children ?? []), srcStatus, srcType]

        itemsNode.loopConditions = [
            {
                id: "lc1",
                sourceNodePath: "orders.[].status",
                condition: "== 'ACTIVE'",
                textReference: true,
            },
            {
                id: "lc2",
                sourceNodePath: "orders.[].type",
                condition: "== 'PREMIUM'",
                textReference: true,
            },
        ]
        itemsNode.loopConditionsConnective = "AND"

        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain(" && ")
    })
})

// ============================================================
// XML to JSON
// ============================================================

describe("generateGroovyScript - XML to JSON", () => {
    it("uses XmlSlurper input and JsonBuilder output", () => {
        const state = buildSimpleState()
        const script = generateGroovyScript(state, "xml", "json")
        expect(script).toContain("def sourceData = new XmlSlurper().parseText(input)")
        expect(script).toContain("return new JsonBuilder(output).toPrettyString()")
        expect(script).toContain("import groovy.xml.XmlSlurper")
        expect(script).toContain("import groovy.json.JsonBuilder")
    })
})

// ============================================================
// JSON to XML
// ============================================================

describe("generateGroovyScript - JSON to XML", () => {
    it("uses JsonSlurper input and buildXml output", () => {
        const state = buildSimpleState()
        const script = generateGroovyScript(state, "json", "xml")
        expect(script).toContain("def sourceData = new JsonSlurper().parseText(input)")
        expect(script).toContain("return buildXml(output)")
        expect(script).toContain("import groovy.json.JsonSlurper")
        expect(script).toContain("import groovy.xml.MarkupBuilder")
    })
})

// ============================================================
// XML to XML
// ============================================================

describe("generateGroovyScript - XML to XML", () => {
    it("uses XmlSlurper input and buildXml output", () => {
        const state = buildSimpleState()
        const script = generateGroovyScript(state, "xml", "xml")
        expect(script).toContain("def sourceData = new XmlSlurper().parseText(input)")
        expect(script).toContain("return buildXml(output)")
        expect(script).toContain("import groovy.xml.XmlSlurper")
        expect(script).toContain("import groovy.xml.MarkupBuilder")
    })
})

// ============================================================
// Node condition on array child (build-then-push filtering)
// ============================================================

describe("generateGroovyScript - node condition on array child", () => {
    it("wraps child fields in condition block inside the loop", () => {
        const state = buildStateWithNodeConditionOnArrayChild('_name == "Laptop"')
        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain('if (_name == "Laptop")')
    })

    it("does not emit .add([:]) — uses temp object with size guard", () => {
        const state = buildStateWithNodeConditionOnArrayChild("true")
        const script = generateGroovyScript(state, "json", "json")
        expect(script).not.toContain(".add([:])")
        expect(script).toMatch(/def _item_\d+ = \[:\]/)
        expect(script).toMatch(/if \(_item_\d+\.size\(\) > 0\)/)
    })

    it("condition on child appears inside loop body", () => {
        const state = buildStateWithNodeConditionOnArrayChild('_name == "Laptop"')
        const script = generateGroovyScript(state, "json", "json")
        const loopIdx = script.indexOf(".each {")
        const condIdx = script.indexOf('if (_name == "Laptop")')
        expect(loopIdx).toBeGreaterThan(-1)
        expect(condIdx).toBeGreaterThan(loopIdx)
    })
})

// ============================================================
// Special characters in values
// ============================================================

describe("generateGroovyScript - special characters", () => {
    it("escapes dollar signs in plain text values", () => {
        const state = createEmptyMapperState("JSON", "JSON")
        const tgtNode = createNode("price", "element", {
            value: "$100.00",
            plainTextValue: true,
        })
        state.targetTreeNode = createNode("root", "element", {
            children: [tgtNode],
        })
        state.references = []

        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain('output["price"] = "\\$100.00"')
    })

    it("escapes double quotes in plain text values", () => {
        const state = createEmptyMapperState("JSON", "JSON")
        const tgtNode = createNode("msg", "element", {
            value: 'He said "hello"',
            plainTextValue: true,
        })
        state.targetTreeNode = createNode("root", "element", {
            children: [tgtNode],
        })
        state.references = []

        const script = generateGroovyScript(state, "json", "json")
        expect(script).toContain('output["msg"] = "He said \\"hello\\""')
    })
})
