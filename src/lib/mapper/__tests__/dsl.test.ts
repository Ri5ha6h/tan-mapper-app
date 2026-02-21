import { describe, expect, it } from "vitest"
import { applyDSLToState, generateDSL, mapperStateToDSL, parseDSL } from "../dsl"
import { createEmptyMapperState, createNode } from "../node-utils"
import type { Mapping, MapperState } from "../types"

describe("parseDSL", () => {
    it("parses a single mapping line", () => {
        const { mappings, errors } = parseDSL("user.name -> customer.fullName")
        expect(errors).toHaveLength(0)
        expect(mappings).toHaveLength(1)
        expect(mappings[0].sourceId).toBe("root.user.name")
        expect(mappings[0].targetId).toBe("root.customer.fullName")
    })

    it("parses multiple mapping lines", () => {
        const dsl = `
user.name -> customer.name
user.email -> customer.email
user.age -> customer.age
`
        const { mappings, errors } = parseDSL(dsl)
        expect(errors).toHaveLength(0)
        expect(mappings).toHaveLength(3)
    })

    it("skips blank lines", () => {
        const dsl = `
a -> b

c -> d
`
        const { mappings, errors } = parseDSL(dsl)
        expect(errors).toHaveLength(0)
        expect(mappings).toHaveLength(2)
    })

    it("skips comment lines starting with #", () => {
        const dsl = `# This is a comment
a -> b
# Another comment
c -> d`
        const { mappings, errors } = parseDSL(dsl)
        expect(errors).toHaveLength(0)
        expect(mappings).toHaveLength(2)
    })

    it("skips comment lines starting with //", () => {
        const dsl = `// comment
a -> b`
        const { mappings, errors } = parseDSL(dsl)
        expect(errors).toHaveLength(0)
        expect(mappings).toHaveLength(1)
    })

    it("reports error for invalid syntax", () => {
        const { mappings, errors } = parseDSL("not a valid line")
        expect(mappings).toHaveLength(0)
        expect(errors).toHaveLength(1)
        expect(errors[0].line).toBe(1)
        expect(errors[0].message).toContain("Invalid syntax")
    })

    it("handles paths already prefixed with root", () => {
        const { mappings } = parseDSL("root.a -> root.b")
        expect(mappings[0].sourceId).toBe("root.a")
        expect(mappings[0].targetId).toBe("root.b")
    })

    it("handles array index paths", () => {
        const { mappings, errors } = parseDSL("items[0].name -> output[0].label")
        expect(errors).toHaveLength(0)
        expect(mappings[0].sourceId).toBe("root.items[0].name")
        expect(mappings[0].targetId).toBe("root.output[0].label")
    })

    it("assigns line-based IDs", () => {
        const dsl = `a -> b
c -> d`
        const { mappings } = parseDSL(dsl)
        expect(mappings[0].id).toBe("dsl-1")
        expect(mappings[1].id).toBe("dsl-2")
    })
})

describe("parseDSL - WHERE clause", () => {
    it("parses a mapping with a numeric WHERE condition", () => {
        const { mappings, errors } = parseDSL(
            "products[0].name -> items[0].description WHERE products[0].price > 100",
        )
        expect(errors).toHaveLength(0)
        expect(mappings).toHaveLength(1)
        expect(mappings[0].condition).toBeDefined()
        expect(mappings[0].condition!.field).toBe("root.products[0].price")
        expect(mappings[0].condition!.operator).toBe(">")
        expect(mappings[0].condition!.value).toBe("100")
    })

    it("parses a mapping with a string WHERE condition", () => {
        const { mappings, errors } = parseDSL('name -> label WHERE name == "Laptop"')
        expect(errors).toHaveLength(0)
        expect(mappings[0].condition).toBeDefined()
        expect(mappings[0].condition!.operator).toBe("==")
        expect(mappings[0].condition!.value).toBe("Laptop")
    })

    it("parses contains operator", () => {
        const { mappings, errors } = parseDSL('name -> label WHERE name contains "top"')
        expect(errors).toHaveLength(0)
        expect(mappings[0].condition!.operator).toBe("contains")
        expect(mappings[0].condition!.value).toBe("top")
    })

    it("parses startsWith operator", () => {
        const { mappings, errors } = parseDSL('name -> label WHERE name startsWith "Lap"')
        expect(errors).toHaveLength(0)
        expect(mappings[0].condition!.operator).toBe("startsWith")
    })

    it("parses endsWith operator", () => {
        const { mappings, errors } = parseDSL('name -> label WHERE name endsWith "top"')
        expect(errors).toHaveLength(0)
        expect(mappings[0].condition!.operator).toBe("endsWith")
    })

    it("parses all comparison operators", () => {
        for (const op of ["==", "!=", ">", "<", ">=", "<="]) {
            const { mappings, errors } = parseDSL(`a -> b WHERE x ${op} 5`)
            expect(errors).toHaveLength(0)
            expect(mappings[0].condition!.operator).toBe(op)
        }
    })

    it("reports error for invalid WHERE clause", () => {
        const { mappings, errors } = parseDSL("a -> b WHERE invalid")
        expect(mappings).toHaveLength(0)
        expect(errors).toHaveLength(1)
        expect(errors[0].message).toContain("Invalid WHERE clause")
    })
})

describe("parseDSL - THEN clause", () => {
    it("parses a mapping with add transform", () => {
        const { mappings, errors } = parseDSL("price -> cost THEN +100")
        expect(errors).toHaveLength(0)
        expect(mappings[0].transform).toBeDefined()
        expect(mappings[0].transform!.type).toBe("add")
        expect(mappings[0].transform!.value).toBe(100)
    })

    it("parses a mapping with subtract transform", () => {
        const { mappings, errors } = parseDSL("price -> cost THEN -50")
        expect(errors).toHaveLength(0)
        expect(mappings[0].transform!.type).toBe("subtract")
        expect(mappings[0].transform!.value).toBe(50)
    })

    it("parses a mapping with multiply transform", () => {
        const { mappings, errors } = parseDSL("price -> cost THEN *1.05")
        expect(errors).toHaveLength(0)
        expect(mappings[0].transform!.type).toBe("multiply")
        expect(mappings[0].transform!.value).toBe(1.05)
    })

    it("parses a mapping with divide transform", () => {
        const { mappings, errors } = parseDSL("price -> cost THEN /2")
        expect(errors).toHaveLength(0)
        expect(mappings[0].transform!.type).toBe("divide")
        expect(mappings[0].transform!.value).toBe(2)
    })

    it("parses add_percent transform", () => {
        const { mappings, errors } = parseDSL("price -> cost THEN +5%")
        expect(errors).toHaveLength(0)
        expect(mappings[0].transform!.type).toBe("add_percent")
        expect(mappings[0].transform!.value).toBe(5)
    })

    it("parses subtract_percent transform", () => {
        const { mappings, errors } = parseDSL("price -> cost THEN -10%")
        expect(errors).toHaveLength(0)
        expect(mappings[0].transform!.type).toBe("subtract_percent")
        expect(mappings[0].transform!.value).toBe(10)
    })

    it("reports error for invalid THEN clause", () => {
        const { mappings, errors } = parseDSL("a -> b THEN invalid")
        expect(mappings).toHaveLength(0)
        expect(errors).toHaveLength(1)
        expect(errors[0].message).toContain("Invalid THEN clause")
    })
})

describe("parseDSL - WHERE + THEN combined", () => {
    it("parses a mapping with both WHERE and THEN", () => {
        const { mappings, errors } = parseDSL(
            "products[0].price -> items[0].cost WHERE products[0].price > 40 THEN +5%",
        )
        expect(errors).toHaveLength(0)
        expect(mappings).toHaveLength(1)
        expect(mappings[0].condition!.field).toBe("root.products[0].price")
        expect(mappings[0].condition!.operator).toBe(">")
        expect(mappings[0].condition!.value).toBe("40")
        expect(mappings[0].transform!.type).toBe("add_percent")
        expect(mappings[0].transform!.value).toBe(5)
    })

    it("simple mappings without WHERE or THEN still work", () => {
        const { mappings, errors } = parseDSL("a -> b")
        expect(errors).toHaveLength(0)
        expect(mappings[0].condition).toBeUndefined()
        expect(mappings[0].transform).toBeUndefined()
    })
})

describe("generateDSL", () => {
    it("generates DSL from mappings", () => {
        const mappings: Array<Mapping> = [
            { id: "m1", sourceId: "root.user.name", targetId: "root.customer.fullName" },
            { id: "m2", sourceId: "root.user.email", targetId: "root.customer.email" },
        ]

        const dsl = generateDSL(mappings)
        const lines = dsl.split("\n")
        expect(lines).toHaveLength(2)
        expect(lines[0]).toBe("user.name -> customer.fullName")
        expect(lines[1]).toBe("user.email -> customer.email")
    })

    it("strips root prefix from paths", () => {
        const mappings: Array<Mapping> = [{ id: "m1", sourceId: "root.a", targetId: "root.b" }]
        expect(generateDSL(mappings)).toBe("a -> b")
    })

    it("returns empty string for no mappings", () => {
        expect(generateDSL([])).toBe("")
    })

    it("generates DSL with WHERE clause", () => {
        const mappings: Array<Mapping> = [
            {
                id: "m1",
                sourceId: "root.price",
                targetId: "root.cost",
                condition: { field: "root.price", operator: ">", value: "100" },
            },
        ]
        expect(generateDSL(mappings)).toBe("price -> cost WHERE price > 100")
    })

    it("generates DSL with THEN clause", () => {
        const mappings: Array<Mapping> = [
            {
                id: "m1",
                sourceId: "root.price",
                targetId: "root.cost",
                transform: { type: "add_percent", value: 5 },
            },
        ]
        expect(generateDSL(mappings)).toBe("price -> cost THEN +5%")
    })

    it("generates DSL with WHERE and THEN clauses", () => {
        const mappings: Array<Mapping> = [
            {
                id: "m1",
                sourceId: "root.price",
                targetId: "root.cost",
                condition: { field: "root.price", operator: ">", value: "40" },
                transform: { type: "add_percent", value: 5 },
            },
        ]
        expect(generateDSL(mappings)).toBe("price -> cost WHERE price > 40 THEN +5%")
    })

    it("generates DSL with string condition values in quotes", () => {
        const mappings: Array<Mapping> = [
            {
                id: "m1",
                sourceId: "root.name",
                targetId: "root.label",
                condition: { field: "root.name", operator: "==", value: "Laptop" },
            },
        ]
        expect(generateDSL(mappings)).toBe('name -> label WHERE name == "Laptop"')
    })

    it("round-trips: parseDSL(generateDSL(m)) reproduces paths", () => {
        const original: Array<Mapping> = [
            { id: "m1", sourceId: "root.order.id", targetId: "root.orderId" },
            { id: "m2", sourceId: "root.items[0].sku", targetId: "root.productCode" },
        ]

        const dsl = generateDSL(original)
        const { mappings } = parseDSL(dsl)

        expect(mappings).toHaveLength(2)
        expect(mappings[0].sourceId).toBe("root.order.id")
        expect(mappings[0].targetId).toBe("root.orderId")
        expect(mappings[1].sourceId).toBe("root.items[0].sku")
        expect(mappings[1].targetId).toBe("root.productCode")
    })

    it("round-trips with WHERE and THEN", () => {
        const original: Array<Mapping> = [
            {
                id: "m1",
                sourceId: "root.products[0].price",
                targetId: "root.items[0].cost",
                condition: { field: "root.products[0].price", operator: ">", value: "40" },
                transform: { type: "add_percent", value: 5 },
            },
        ]

        const dsl = generateDSL(original)
        const { mappings, errors } = parseDSL(dsl)

        expect(errors).toHaveLength(0)
        expect(mappings).toHaveLength(1)
        expect(mappings[0].sourceId).toBe("root.products[0].price")
        expect(mappings[0].targetId).toBe("root.items[0].cost")
        expect(mappings[0].condition!.field).toBe("root.products[0].price")
        expect(mappings[0].condition!.operator).toBe(">")
        expect(mappings[0].condition!.value).toBe("40")
        expect(mappings[0].transform!.type).toBe("add_percent")
        expect(mappings[0].transform!.value).toBe(5)
    })
})

// ============================================================
// Phase 2 — New DSL grammar tests
// ============================================================

describe("parseDSL - LOOP declaration", () => {
    it('parses "arr[*] -> target LOOP _iter" as a loop declaration', () => {
        const { mappings, errors } = parseDSL("orders[*] -> output.items LOOP _orders")
        expect(errors).toHaveLength(0)
        expect(mappings).toHaveLength(1)
        expect(mappings[0].isLoopDeclaration).toBe(true)
        expect(mappings[0].loopName).toBe("_orders")
        expect(mappings[0].sourceId).toBe("root.orders")
        expect(mappings[0].targetId).toBe("root.output.items")
    })

    it("strips [*] suffix from source path in loop declaration", () => {
        const { mappings } = parseDSL("data.records[*] -> result.list LOOP _rec")
        expect(mappings[0].sourceId).toBe("root.data.records")
        expect(mappings[0].isLoopDeclaration).toBe(true)
    })

    it("non-loop lines do not set isLoopDeclaration", () => {
        const { mappings } = parseDSL("a -> b")
        expect(mappings[0].isLoopDeclaration).toBeUndefined()
    })

    it("loop declaration without [*] is not treated as loop declaration", () => {
        const { mappings } = parseDSL("orders -> output.items LOOP _orders")
        // LOOP keyword present but no [*] → isLoopDeclaration stays false
        expect(mappings[0].isLoopDeclaration).toBeFalsy()
        expect(mappings[0].loopName).toBe("_orders")
    })
})

describe("parseDSL - UNDER clause", () => {
    it('parses "_iter.field -> target UNDER _iter"', () => {
        const { mappings, errors } = parseDSL("_orders.id -> output.items[].orderId UNDER _orders")
        expect(errors).toHaveLength(0)
        expect(mappings[0].underLoop).toBe("_orders")
    })

    it("UNDER clause is preserved on the mapping", () => {
        const { mappings } = parseDSL(
            '_orders.status -> output.items[].status UNDER _orders WHERE _orders.status == "ACTIVE"',
        )
        expect(mappings[0].underLoop).toBe("_orders")
        expect(mappings[0].condition?.value).toBe("ACTIVE")
    })

    it("mapping without UNDER has no underLoop field", () => {
        const { mappings } = parseDSL("a -> b")
        expect(mappings[0].underLoop).toBeUndefined()
    })
})

describe("parseDSL - AS LITERAL / AS EXPR", () => {
    it('parses "value -> target AS LITERAL" → valueType="literal"', () => {
        const { mappings, errors } = parseDSL('"USD" -> output.currency AS LITERAL')
        expect(errors).toHaveLength(0)
        expect(mappings[0].valueType).toBe("literal")
    })

    it('parses "expr -> target AS EXPR" → valueType="expr"', () => {
        const { mappings, errors } = parseDSL(
            'status == "ACTIVE" ? "1" : "0" -> output.statusCode AS EXPR',
        )
        expect(errors).toHaveLength(0)
        expect(mappings[0].valueType).toBe("expr")
    })

    it("AS is case-insensitive", () => {
        const { mappings } = parseDSL('"hello" -> output.greeting as literal')
        expect(mappings[0].valueType).toBe("literal")
    })

    it("mapping without AS has no valueType", () => {
        const { mappings } = parseDSL("a -> b")
        expect(mappings[0].valueType).toBeUndefined()
    })
})

describe("parseDSL - LOOKUP clause", () => {
    it('parses "source -> target LOOKUP tableName"', () => {
        const { mappings, errors } = parseDSL(
            "_orders.statusCode -> output.items[].statusLabel LOOKUP statusCodes",
        )
        expect(errors).toHaveLength(0)
        expect(mappings[0].lookupTable).toBe("statusCodes")
    })

    it("LOOKUP clause is preserved on the mapping", () => {
        const { mappings } = parseDSL("a -> b LOOKUP myTable")
        expect(mappings[0].lookupTable).toBe("myTable")
    })

    it("mapping without LOOKUP has no lookupTable", () => {
        const { mappings } = parseDSL("a -> b")
        expect(mappings[0].lookupTable).toBeUndefined()
    })
})

describe("parseDSL - standalone node condition (IF)", () => {
    it('parses "target.path IF expression" without a "->"', () => {
        const { mappings, errors } = parseDSL("output.optionalField IF source.flag == true")
        expect(errors).toHaveLength(0)
        expect(mappings).toHaveLength(1)
        expect(mappings[0].sourceId).toBe("")
        expect(mappings[0].targetId).toBe("root.output.optionalField")
        expect(mappings[0].nodeCondition).toBe("source.flag == true")
    })

    it("standalone IF line is not an error", () => {
        const { errors } = parseDSL("foo.bar IF x > 0")
        expect(errors).toHaveLength(0)
    })

    it("normal mapping line with no IF has no nodeCondition", () => {
        const { mappings } = parseDSL("a -> b")
        expect(mappings[0].nodeCondition).toBeUndefined()
    })
})

describe("parseDSL - combined LOOP + UNDER + WHERE + LOOKUP", () => {
    it("parses a multi-clause line combining LOOP UNDER WHERE LOOKUP", () => {
        const dsl =
            "_orders.statusCode -> output.items[].status UNDER _orders WHERE _orders.active == true LOOKUP statusMap"
        const { mappings, errors } = parseDSL(dsl)
        expect(errors).toHaveLength(0)
        expect(mappings[0].underLoop).toBe("_orders")
        expect(mappings[0].condition?.value).toBe("true")
        expect(mappings[0].lookupTable).toBe("statusMap")
    })

    it("parses a full mapping scenario (loop + inner mappings)", () => {
        const dsl = `# Loop with condition and lookup
orders[*] -> output.items LOOP _orders
_orders.id -> output.items[].orderId UNDER _orders
_orders.statusCode -> output.items[].status UNDER _orders LOOKUP statusCodes
_orders.amount -> output.items[].total UNDER _orders WHERE _orders.amount > 0 THEN *1.2`
        const { mappings, errors } = parseDSL(dsl)
        expect(errors).toHaveLength(0)
        expect(mappings).toHaveLength(4)

        // Loop declaration
        expect(mappings[0].isLoopDeclaration).toBe(true)
        expect(mappings[0].loopName).toBe("_orders")

        // Inner mappings
        expect(mappings[1].underLoop).toBe("_orders")
        expect(mappings[2].lookupTable).toBe("statusCodes")
        expect(mappings[3].condition?.operator).toBe(">")
        expect(mappings[3].transform?.type).toBe("multiply")
        expect(mappings[3].transform?.value).toBe(1.2)
    })
})

describe("generateDSL - new clauses", () => {
    it("emits LOOP suffix for loop declarations", () => {
        const mappings: Array<Mapping> = [
            {
                id: "m1",
                sourceId: "root.orders",
                targetId: "root.output.items",
                isLoopDeclaration: true,
                loopName: "_orders",
            },
        ]
        expect(generateDSL(mappings)).toBe("orders[*] -> output.items LOOP _orders")
    })

    it("emits UNDER clause for nested references", () => {
        const mappings: Array<Mapping> = [
            {
                id: "m1",
                sourceId: "root.orders.id",
                targetId: "root.output.items.orderId",
                underLoop: "_orders",
            },
        ]
        // Source path is rendered as "_orders.id" when underLoop is set
        expect(generateDSL(mappings)).toBe("_orders.id -> output.items.orderId UNDER _orders")
    })

    it("emits AS LITERAL for literal value type", () => {
        const mappings: Array<Mapping> = [
            {
                id: "m1",
                sourceId: 'root."USD"',
                targetId: "root.output.currency",
                valueType: "literal",
            },
        ]
        expect(generateDSL(mappings)).toContain("AS LITERAL")
    })

    it("emits AS EXPR for expression value type", () => {
        const mappings: Array<Mapping> = [
            {
                id: "m1",
                sourceId: "root.statusExpr",
                targetId: "root.output.statusCode",
                valueType: "expr",
            },
        ]
        expect(generateDSL(mappings)).toContain("AS EXPR")
    })

    it("emits LOOKUP clause", () => {
        const mappings: Array<Mapping> = [
            {
                id: "m1",
                sourceId: "root.statusCode",
                targetId: "root.output.statusLabel",
                underLoop: "_orders",
                lookupTable: "statusCodes",
            },
        ]
        const result = generateDSL(mappings)
        expect(result).toContain("LOOKUP statusCodes")
        expect(result).toContain("UNDER _orders")
    })

    it("emits standalone node condition (no source)", () => {
        const mappings: Array<Mapping> = [
            {
                id: "m1",
                sourceId: "",
                targetId: "root.output.optionalField",
                nodeCondition: "source.flag == true",
            },
        ]
        expect(generateDSL(mappings)).toBe("output.optionalField IF source.flag == true")
    })

    it("round-trips: loop declaration parseDSL(generateDSL(m))", () => {
        const original: Array<Mapping> = [
            {
                id: "m1",
                sourceId: "root.orders",
                targetId: "root.output.items",
                isLoopDeclaration: true,
                loopName: "_orders",
            },
        ]
        const dsl = generateDSL(original)
        const { mappings, errors } = parseDSL(dsl)
        expect(errors).toHaveLength(0)
        expect(mappings[0].isLoopDeclaration).toBe(true)
        expect(mappings[0].loopName).toBe("_orders")
        expect(mappings[0].sourceId).toBe("root.orders")
    })

    it("round-trips: UNDER + LOOKUP + WHERE + THEN", () => {
        const original: Array<Mapping> = [
            {
                id: "m1",
                sourceId: "root.orders.amount",
                targetId: "root.output.items.total",
                underLoop: "_orders",
                condition: { field: "root.orders.amount", operator: ">", value: "0" },
                transform: { type: "multiply", value: 1.2 },
            },
        ]
        const dsl = generateDSL(original)
        const { mappings, errors } = parseDSL(dsl)
        expect(errors).toHaveLength(0)
        expect(mappings[0].underLoop).toBe("_orders")
        expect(mappings[0].condition?.operator).toBe(">")
        expect(mappings[0].transform?.type).toBe("multiply")
        expect(mappings[0].transform?.value).toBe(1.2)
    })
})

// ============================================================
// Bridge: mapperStateToDSL
// ============================================================

describe("mapperStateToDSL", () => {
    it("converts empty state to empty DSL (no mappings)", () => {
        const state = createEmptyMapperState()
        const dsl = mapperStateToDSL(state)
        // No mappings → empty (possibly only a name comment if name is set)
        expect(dsl).toBe("")
    })

    it("emits name comment when state.name is set", () => {
        const state: MapperState = { ...createEmptyMapperState(), name: "My Map" }
        const dsl = mapperStateToDSL(state)
        expect(dsl).toContain("# My Map")
    })

    it("emits global variable comments", () => {
        const state = createEmptyMapperState()
        state.localContext.globalVariables.push({
            id: "gv1",
            name: "TAX_RATE",
            value: "0.2",
            plainTextValue: false,
        })
        const dsl = mapperStateToDSL(state)
        expect(dsl).toContain("# var: TAX_RATE = 0.2")
    })

    it("emits a simple mapping from a target node with a source reference", () => {
        const state = createEmptyMapperState()
        // Add source node
        const srcNode = createNode("orderId", "element")
        state.sourceTreeNode!.children = [srcNode]

        // Add target node with source reference
        const tgtNode = createNode("outputId", "element")
        tgtNode.sourceReferences = [
            {
                id: "ref1",
                sourceNodeId: srcNode.id,
                variableName: "_orderId",
                textReference: true,
            },
        ]
        state.targetTreeNode!.children = [tgtNode]

        const dsl = mapperStateToDSL(state)
        expect(dsl).toContain("orderId -> outputId")
    })

    it("emits LOOP declaration for a node with loopReference", () => {
        const state = createEmptyMapperState()

        // Source: root.orders (array child)
        const srcArray = createNode("orders", "array")
        const srcChild = createNode("[]", "arrayChild")
        srcArray.children = [srcChild]
        state.sourceTreeNode!.children = [srcArray]

        // Target: root.items with loopReference pointing to srcChild
        const tgtArray = createNode("items", "array")
        tgtArray.loopReference = {
            id: "lr1",
            sourceNodeId: srcChild.id,
            variableName: "_orders",
            textReference: false,
            isLoop: true,
        }
        tgtArray.loopIterator = "_orders"
        state.targetTreeNode!.children = [tgtArray]

        const dsl = mapperStateToDSL(state)
        expect(dsl).toContain("LOOP _orders")
    })

    it("emits literal value line for node with value and plainTextValue=true", () => {
        const state = createEmptyMapperState()
        const tgtNode = createNode("currency", "element")
        tgtNode.value = "USD"
        tgtNode.plainTextValue = true
        state.targetTreeNode!.children = [tgtNode]

        const dsl = mapperStateToDSL(state)
        expect(dsl).toContain('"USD"')
        expect(dsl).toContain("AS LITERAL")
    })

    it("emits expression value line for node with value and plainTextValue=false", () => {
        const state = createEmptyMapperState()
        const tgtNode = createNode("statusCode", "element")
        tgtNode.value = 'status == "ACTIVE" ? "1" : "0"'
        tgtNode.plainTextValue = false
        state.targetTreeNode!.children = [tgtNode]

        const dsl = mapperStateToDSL(state)
        expect(dsl).toContain("AS EXPR")
    })

    it("emits node condition IF line", () => {
        const state = createEmptyMapperState()
        const tgtNode = createNode("optionalField", "element")
        tgtNode.nodeCondition = { condition: "source.flag == true" }
        state.targetTreeNode!.children = [tgtNode]

        const dsl = mapperStateToDSL(state)
        expect(dsl).toContain("optionalField IF source.flag == true")
    })
})

// ============================================================
// Bridge: applyDSLToState
// ============================================================

describe("applyDSLToState", () => {
    it("returns errors for invalid DSL without mutating state", () => {
        const state = createEmptyMapperState()
        const { state: newState, errors } = applyDSLToState("not valid dsl", state)
        expect(errors).toHaveLength(1)
        expect(newState).toBe(state) // same reference — untouched
    })

    it("applies a simple source reference to a target node", () => {
        const state = createEmptyMapperState()

        // Build minimal trees
        const srcNode = createNode("orderId", "element")
        state.sourceTreeNode!.children = [srcNode]

        const tgtNode = createNode("outputId", "element")
        state.targetTreeNode!.children = [tgtNode]

        const dsl = "orderId -> outputId"
        const { state: newState, errors } = applyDSLToState(dsl, state)

        expect(errors).toHaveLength(0)
        // The target node in the new state should have a sourceReference
        const updatedTarget = newState.targetTreeNode?.children?.[0]
        expect(updatedTarget?.sourceReferences?.length).toBeGreaterThan(0)
    })

    it("clears existing source references before applying DSL", () => {
        const state = createEmptyMapperState()
        const srcNode = createNode("field", "element")
        state.sourceTreeNode!.children = [srcNode]

        const tgtNode = createNode("outField", "element")
        // Pre-populate with an old reference
        tgtNode.sourceReferences = [
            {
                id: "old-ref",
                sourceNodeId: "some-old-id",
                variableName: "_old",
                textReference: true,
            },
        ]
        state.targetTreeNode!.children = [tgtNode]

        const { state: newState } = applyDSLToState("field -> outField", state)
        const updatedTarget = newState.targetTreeNode?.children?.[0]
        // Old reference should be gone; new one added
        expect(updatedTarget?.sourceReferences?.every((r) => r.id !== "old-ref")).toBe(true)
    })

    it("applies loop declaration to the target tree", () => {
        const state = createEmptyMapperState()
        const srcArray = createNode("orders", "array")
        const srcChild = createNode("[]", "arrayChild")
        srcArray.children = [srcChild]
        state.sourceTreeNode!.children = [srcArray]

        const tgtArray = createNode("items", "array")
        state.targetTreeNode!.children = [tgtArray]

        const { state: newState, errors } = applyDSLToState(
            "orders[*] -> items LOOP _orders",
            state,
        )
        expect(errors).toHaveLength(0)
        const updatedTgt = newState.targetTreeNode?.children?.[0]
        expect(updatedTgt?.loopReference).toBeDefined()
        expect(updatedTgt?.loopIterator).toBe("_orders")
    })

    it("applies node condition to the target tree", () => {
        const state = createEmptyMapperState()
        const tgtNode = createNode("optionalField", "element")
        state.targetTreeNode!.children = [tgtNode]

        const { state: newState, errors } = applyDSLToState(
            "optionalField IF source.flag == true",
            state,
        )
        expect(errors).toHaveLength(0)
        const updatedTgt = newState.targetTreeNode?.children?.[0]
        expect(updatedTgt?.nodeCondition?.condition).toBe("source.flag == true")
    })

    it("rebuilds flat references after applying DSL", () => {
        const state = createEmptyMapperState()
        const srcNode = createNode("id", "element")
        state.sourceTreeNode!.children = [srcNode]
        const tgtNode = createNode("outputId", "element")
        state.targetTreeNode!.children = [tgtNode]

        const { state: newState } = applyDSLToState("id -> outputId", state)
        // Flat references should be rebuilt
        expect(newState.references.length).toBeGreaterThan(0)
    })
})
