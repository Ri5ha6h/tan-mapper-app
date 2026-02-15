import { describe, expect, it } from "vitest"
import { generateDSL, parseDSL } from "../dsl"
import type { Mapping } from "../types"

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
