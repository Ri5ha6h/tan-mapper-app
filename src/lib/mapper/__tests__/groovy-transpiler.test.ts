import { describe, expect, test } from "vitest"
import { transpileGroovyToJS, transpileMapperState } from "../groovy-transpiler"
import type { MapperState } from "../types"

// ---------------------------------------------------------------------------
// Tier 1: Mechanical Replacements
// ---------------------------------------------------------------------------

describe("Tier 1: Mechanical replacements", () => {
    describe("def keyword", () => {
        test("def to let", () => {
            expect(transpileGroovyToJS("def x = 5").code).toBe("let x = 5")
        })

        test("def with string value", () => {
            expect(transpileGroovyToJS('def name = "hello"').code).toBe('let name = "hello"')
        })

        test("def destructuring", () => {
            expect(transpileGroovyToJS("def (a, b, c) = list").code).toBe("let [a, b, c] = list")
        })

        test("multiple def declarations", () => {
            const input = "def x = 1\ndef y = 2"
            const result = transpileGroovyToJS(input)
            expect(result.code).toContain("let x = 1")
            expect(result.code).toContain("let y = 2")
        })
    })

    describe("GString interpolation", () => {
        test("GString to template literal", () => {
            expect(transpileGroovyToJS('"Hello ${name}"').code).toBe("`Hello ${name}`")
        })

        test("GString with expression", () => {
            expect(transpileGroovyToJS('"Total: ${a + b}"').code).toBe("`Total: ${a + b}`")
        })

        test("plain double-quoted string stays as-is", () => {
            expect(transpileGroovyToJS('"hello world"').code).toBe('"hello world"')
        })
    })

    describe("Elvis operator", () => {
        test("simple elvis", () => {
            expect(transpileGroovyToJS("a ?: b").code).toBe("a || b")
        })

        test("chained elvis", () => {
            expect(transpileGroovyToJS("a ?: b ?: c").code).toBe("a || b || c")
        })
    })

    describe("Map literals", () => {
        test("empty map [:] to {}", () => {
            expect(transpileGroovyToJS("def x = [:]").code).toBe("let x = {}")
        })
    })

    describe("println", () => {
        test("println string", () => {
            expect(transpileGroovyToJS('println "hello"').code).toBe('console.log("hello")')
        })

        test("println with parens", () => {
            expect(transpileGroovyToJS("println(x)").code).toBe("console.log(x)")
        })

        test("println expression", () => {
            expect(transpileGroovyToJS("println x.toString()").code).toBe("console.log(String(x))")
        })
    })

    describe(".put(k, v)", () => {
        test("map put to bracket assignment", () => {
            expect(transpileGroovyToJS('map.put("key", value)').code).toBe('map["key"] = value')
        })
    })

    describe(".add(x)", () => {
        test("list add to push", () => {
            expect(transpileGroovyToJS("list.add(item)").code).toBe("list.push(item)")
        })
    })

    describe(".size()", () => {
        test("size to length", () => {
            expect(transpileGroovyToJS("list.size()").code).toBe("list.length")
        })
    })

    describe("Type conversion methods", () => {
        test(".toInteger()", () => {
            expect(transpileGroovyToJS("x.toInteger()").code).toBe("parseInt(x, 10)")
        })

        test(".toLong()", () => {
            expect(transpileGroovyToJS("x.toLong()").code).toBe("parseInt(x, 10)")
        })

        test(".toDouble()", () => {
            expect(transpileGroovyToJS("x.toDouble()").code).toBe("parseFloat(x)")
        })

        test(".toBigDecimal()", () => {
            expect(transpileGroovyToJS("x.toBigDecimal()").code).toBe("parseFloat(x)")
        })

        test(".toList()", () => {
            expect(transpileGroovyToJS("x.toList()").code).toBe("Array.from(x)")
        })

        test(".toString()", () => {
            expect(transpileGroovyToJS("x.toString()").code).toBe("String(x)")
        })
    })

    describe(".containsKey()", () => {
        test("containsKey to in operator", () => {
            expect(transpileGroovyToJS('map.containsKey("key")').code).toBe('("key" in map)')
        })
    })

    describe("Numeric literal suffixes", () => {
        test("Long suffix L", () => {
            expect(transpileGroovyToJS("def x = 0L").code).toBe("let x = 0")
        })

        test("Double suffix d", () => {
            expect(transpileGroovyToJS("def x = 1.0d").code).toBe("let x = 1.0")
        })

        test("Float suffix f", () => {
            expect(transpileGroovyToJS("def x = 1.0f").code).toBe("let x = 1.0")
        })
    })

    describe("Typed catch", () => {
        test("typed catch to untyped", () => {
            expect(transpileGroovyToJS("catch(Exception e)").code).toBe("catch (e)")
        })

        test("specific exception type", () => {
            expect(transpileGroovyToJS("catch(NumberFormatException e)").code).toBe("catch (e)")
        })
    })

    describe("Java imports", () => {
        test("import removed", () => {
            expect(transpileGroovyToJS("import java.text.SimpleDateFormat").code).toBe("")
        })

        test("multiple imports removed", () => {
            const input = "import java.text.SimpleDateFormat\nimport java.util.Date\ndef x = 5"
            expect(transpileGroovyToJS(input).code).toBe("let x = 5")
        })
    })

    describe("Collection constructors", () => {
        test("new HashMap<>() to {}", () => {
            expect(transpileGroovyToJS("def m = new HashMap<>()").code).toBe("let m = {}")
        })

        test("new LinkedHashMap<>() to {}", () => {
            expect(transpileGroovyToJS("def m = new LinkedHashMap<>()").code).toBe("let m = {}")
        })

        test("new ArrayList<>() to []", () => {
            expect(transpileGroovyToJS("def l = new ArrayList<>()").code).toBe("let l = []")
        })

        test("new LinkedList<>() to []", () => {
            expect(transpileGroovyToJS("def l = new LinkedList<>()").code).toBe("let l = []")
        })

        test("typed generics", () => {
            expect(transpileGroovyToJS("def m = new HashMap<String, Integer>()").code).toBe(
                "let m = {}",
            )
        })
    })
})

// ---------------------------------------------------------------------------
// Tier 2: Pattern Transformations
// ---------------------------------------------------------------------------

describe("Tier 2: Pattern transformations", () => {
    describe(".each closure", () => {
        test("each with named param", () => {
            expect(transpileGroovyToJS("list.each { item -> process(item) }").code).toBe(
                "list.forEach((item) => { process(item) })",
            )
        })

        test("each with implicit it", () => {
            expect(transpileGroovyToJS("list.each { process(it) }").code).toBe(
                "list.forEach((it) => { process(it) })",
            )
        })
    })

    describe(".eachWithIndex closure", () => {
        test("eachWithIndex", () => {
            expect(
                transpileGroovyToJS("list.eachWithIndex { item, idx -> handle(item, idx) }").code,
            ).toBe("list.forEach((item, idx) => { handle(item, idx) })")
        })
    })

    describe(".find closure", () => {
        test("find with named param", () => {
            expect(transpileGroovyToJS("list.find { x -> x.active }").code).toBe(
                "list.find((x) => x.active)",
            )
        })

        test("find with implicit it", () => {
            expect(transpileGroovyToJS("list.find { it.active }").code).toBe(
                "list.find((it) => it.active)",
            )
        })
    })

    describe(".findAll closure", () => {
        test("findAll with implicit it", () => {
            expect(transpileGroovyToJS("list.findAll { it.active }").code).toBe(
                "list.filter((it) => it.active)",
            )
        })

        test("findAll with named param", () => {
            expect(transpileGroovyToJS("list.findAll { item -> item.age > 18 }").code).toBe(
                "list.filter((item) => item.age > 18)",
            )
        })
    })

    describe(".collect closure", () => {
        test("collect with named param", () => {
            expect(transpileGroovyToJS("list.collect { item -> item.name }").code).toBe(
                "list.map((item) => item.name)",
            )
        })

        test("collect with implicit it", () => {
            expect(transpileGroovyToJS("list.collect { it.name }").code).toBe(
                "list.map((it) => it.name)",
            )
        })
    })

    describe(".collectEntries closure", () => {
        test("collectEntries basic", () => {
            const input = "list.collectEntries { item -> [item.key: item.value] }"
            const result = transpileGroovyToJS(input)
            expect(result.code).toContain("Object.fromEntries")
            expect(result.code).toContain(".map(")
        })
    })

    describe(".findResult closure", () => {
        test("findResult", () => {
            const result = transpileGroovyToJS("list.findResult { it > 5 ? it : null }")
            expect(result.code).toContain(".reduce(")
            expect(result.code).toContain("acc ??")
        })
    })

    describe("Aggregate methods", () => {
        test(".sum()", () => {
            expect(transpileGroovyToJS("nums.sum()").code).toBe("nums.reduce((a, b) => a + b, 0)")
        })

        test(".max()", () => {
            expect(transpileGroovyToJS("nums.max()").code).toBe("Math.max(...nums)")
        })

        test(".min()", () => {
            expect(transpileGroovyToJS("nums.min()").code).toBe("Math.min(...nums)")
        })
    })

    describe(".round(n)", () => {
        test("round to shim", () => {
            expect(transpileGroovyToJS("x.round(2)").code).toBe("roundTo(x, 2)")
        })
    })

    describe("as type casts", () => {
        test("as Integer", () => {
            expect(transpileGroovyToJS("x as Integer").code).toBe("parseInt(x, 10)")
        })

        test("as int", () => {
            expect(transpileGroovyToJS("x as int").code).toBe("parseInt(x, 10)")
        })

        test("as String", () => {
            expect(transpileGroovyToJS("x as String").code).toBe("String(x)")
        })

        test("as String[]", () => {
            expect(transpileGroovyToJS("x as String[]").code).toBe("Array.from(x)")
        })
    })

    describe("Range slicing", () => {
        test("arr[1..-1] → arr.slice(1)", () => {
            expect(transpileGroovyToJS("arr[1..-1]").code).toBe("arr.slice(1)")
        })

        test("arr[0..2] → arr.slice(0, 3) (inclusive)", () => {
            expect(transpileGroovyToJS("arr[0..2]").code).toBe("arr.slice(0, 3)")
        })
    })

    describe("Regex", () => {
        test("=~ operator to .match()", () => {
            expect(transpileGroovyToJS("str =~ /\\d+/").code).toBe("str.match(/\\d+/)")
        })

        test(".matches(regex)", () => {
            expect(transpileGroovyToJS('str.matches("^\\\\d+$")').code).toBe(
                'new RegExp("^\\\\d+$").test(str)',
            )
        })
    })

    describe("String methods", () => {
        test(".replaceAll with string pattern", () => {
            expect(transpileGroovyToJS('str.replaceAll("a", "b")').code).toBe(
                'str.replace(new RegExp("a", \'g\'), "b")',
            )
        })

        test(".tokenize(delim) → .split(delim)", () => {
            expect(transpileGroovyToJS('str.tokenize(",")').code).toBe('str.split(",")')
        })
    })

    describe(".collate(n)", () => {
        test("collate to chunkArray shim", () => {
            expect(transpileGroovyToJS("list.collate(3)").code).toBe("chunkArray(list, 3)")
        })
    })

    describe("Spaceship operator", () => {
        test("ascending comparator", () => {
            const input = "{ a, b -> a <=> b }"
            const result = transpileGroovyToJS(input)
            expect(result.code).toContain("a < b ? -1")
            expect(result.code).toContain("a > b ? 1 : 0")
        })
    })

    describe("XML GPath", () => {
        test(".text() → getText()", () => {
            expect(transpileGroovyToJS("node.text()").code).toBe("getText(node)")
        })

        test(".'n:tagName' → bracket notation", () => {
            expect(transpileGroovyToJS("node.'ns:tag'").code).toBe("node['ns:tag']")
        })

        test(".@attrName → bracket notation", () => {
            expect(transpileGroovyToJS("node.@id").code).toBe("node['@id']")
        })
    })

    describe("Spread dot operator", () => {
        test("*.method() → .map(x => x.method())", () => {
            expect(transpileGroovyToJS("list*.name()").code).toBe("list.map(x => x.name())")
        })
    })

    describe(".contains(x)", () => {
        test("contains to includes", () => {
            expect(transpileGroovyToJS('str.contains("abc")').code).toBe('str.includes("abc")')
        })
    })
})

// ---------------------------------------------------------------------------
// Tier 3: Complex Translations
// ---------------------------------------------------------------------------

describe("Tier 3: Complex translations", () => {
    describe("SimpleDateFormat", () => {
        test("translates to createDateFormatter shim", () => {
            const result = transpileGroovyToJS('new SimpleDateFormat("yyyy-MM-dd")')
            expect(result.code).toBe('createDateFormatter("yyyy-MM-dd")')
            expect(result.warnings).toHaveLength(1)
            expect(result.warnings[0].severity).toBe("warning")
            expect(result.warnings[0].message).toContain("Date formatting")
        })
    })

    describe("Java Date APIs", () => {
        test("ZonedDateTime.parse()", () => {
            const result = transpileGroovyToJS("ZonedDateTime.parse(dateStr)")
            expect(result.code).toBe("new Date(dateStr)")
            expect(result.warnings.length).toBeGreaterThan(0)
        })

        test("LocalDate.now()", () => {
            const result = transpileGroovyToJS("LocalDate.now()")
            expect(result.code).toBe("new Date()")
        })

        test("LocalDateTime.now()", () => {
            const result = transpileGroovyToJS("LocalDateTime.now()")
            expect(result.code).toBe("new Date()")
        })
    })

    describe("Locale API", () => {
        test("getISOCountries", () => {
            const result = transpileGroovyToJS("Locale.getISOCountries()")
            expect(result.code).toBe("getISOCountries()")
            expect(result.warnings[0].severity).toBe("info")
        })
    })

    describe("BigDecimal", () => {
        test("BigDecimal.valueOf().setScale()", () => {
            const result = transpileGroovyToJS("BigDecimal.valueOf(x).setScale(2)")
            expect(result.code).toBe("roundTo(x, 2)")
            expect(result.warnings.length).toBeGreaterThan(0)
        })

        test("new BigDecimal(x)", () => {
            const result = transpileGroovyToJS("new BigDecimal(x)")
            expect(result.code).toBe("parseFloat(x)")
        })
    })

    describe("JsonSlurper", () => {
        test("parseText", () => {
            expect(transpileGroovyToJS("new JsonSlurper().parseText(jsonStr)").code).toBe(
                "JSON.parse(jsonStr)",
            )
        })
    })

    describe("Platform APIs", () => {
        test("JTUtil.getGlobalData()", () => {
            const result = transpileGroovyToJS('JTUtil.getGlobalData("key")')
            expect(result.code).toBe('jtShims.getGlobalData("key")')
            expect(result.warnings[0].severity).toBe("error")
        })

        test("JTUtil.logFailureEvent()", () => {
            const result = transpileGroovyToJS('JTUtil.logFailureEvent("error msg")')
            expect(result.code).toBe('console.error("error msg")')
        })

        test("JTLookupUtil.getLookupTable()", () => {
            const result = transpileGroovyToJS('JTLookupUtil.getLookupTable("table1")')
            expect(result.code).toBe('jtShims.getLookupTable("table1")')
            expect(result.warnings[0].severity).toBe("error")
        })

        test("JTV3Utils method", () => {
            const result = transpileGroovyToJS("JTV3Utils.someMethod(arg)")
            expect(result.code).toBe("jtShims.someMethod(arg)")
            expect(result.warnings[0].severity).toBe("error")
        })
    })

    describe("Class definitions", () => {
        test("class with implements", () => {
            const result = transpileGroovyToJS("class Foo implements Cloneable {")
            expect(result.code).toBe("class Foo {")
            expect(result.warnings.length).toBeGreaterThan(0)
        })
    })

    describe("String.format", () => {
        test("%.2f format to toFixed", () => {
            expect(transpileGroovyToJS('String.format("%.2f", value)').code).toBe(
                "value.toFixed(2)",
            )
        })
    })

    describe("JTJSONObject", () => {
        test("new JTJSONObject(str) → JSON.parse", () => {
            const result = transpileGroovyToJS("new JTJSONObject(jsonStr)")
            expect(result.code).toBe("JSON.parse(jsonStr)")
            expect(result.warnings[0].severity).toBe("warning")
        })
    })
})

// ---------------------------------------------------------------------------
// Confidence scoring
// ---------------------------------------------------------------------------

describe("Confidence scoring", () => {
    test("empty input has confidence 1", () => {
        expect(transpileGroovyToJS("").confidence).toBe(1)
    })

    test("pure JS code has high confidence", () => {
        const result = transpileGroovyToJS("const x = 5")
        expect(result.confidence).toBeGreaterThanOrEqual(0.9)
    })

    test("platform API lowers confidence", () => {
        const result = transpileGroovyToJS('JTUtil.getGlobalData("key")')
        expect(result.confidence).toBeLessThan(1)
    })

    test("multiple warnings lower confidence", () => {
        const result = transpileGroovyToJS(
            'JTUtil.getGlobalData("key")\nJTLookupUtil.getLookupTable("t")',
        )
        expect(result.confidence).toBeLessThan(0.8)
    })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("Edge cases", () => {
    test("null/undefined input", () => {
        expect(transpileGroovyToJS("").code).toBe("")
        expect(transpileGroovyToJS("  ").code).toBe("")
    })

    test("already valid JS passes through", () => {
        const js = "const x = arr.map(i => i * 2)"
        expect(transpileGroovyToJS(js).code).toBe(js)
    })

    test("mixed Groovy and JS", () => {
        const input = "def x = list.size()\nconst y = x + 1"
        const result = transpileGroovyToJS(input)
        expect(result.code).toContain("let x = list.length")
        expect(result.code).toContain("const y = x + 1")
    })

    test("multiple transformations in single line", () => {
        const input = "def x = list.size().toInteger()"
        const result = transpileGroovyToJS(input)
        expect(result.code).toContain("let x")
        expect(result.code).toContain(".length")
    })

    test("try-catch with typed exception", () => {
        const input = `try {
    def x = val.toInteger()
} catch(NumberFormatException e) {
    println e.getMessage()
}`
        const result = transpileGroovyToJS(input)
        expect(result.code).toContain("let x")
        expect(result.code).toContain("catch (e)")
        expect(result.code).not.toContain("NumberFormatException")
    })
})

// ---------------------------------------------------------------------------
// Integration: transpileMapperState
// ---------------------------------------------------------------------------

describe("transpileMapperState", () => {
    function createMinimalState(overrides?: Partial<MapperState>): MapperState {
        return {
            modelVersion: 1,
            id: "test-map",
            name: "Test Map",
            sourceTreeNode: null,
            targetTreeNode: null,
            references: [],
            localContext: {
                globalVariables: [],
                lookupTables: [],
                functions: [],
                prologScript: null,
                epilogScript: null,
            },
            mapperPreferences: {} as MapperState["mapperPreferences"],
            sourceInputType: "json" as MapperState["sourceInputType"],
            targetInputType: "json" as MapperState["targetInputType"],
            ...overrides,
        }
    }

    test("empty state returns zero fields", () => {
        const state = createMinimalState()
        const result = transpileMapperState(state)
        expect(result.totalFields).toBe(0)
        expect(result.translatedFields).toBe(0)
        expect(result.warnings).toHaveLength(0)
    })

    test("translates target node value expressions", () => {
        const state = createMinimalState({
            targetTreeNode: {
                id: "1",
                name: "root",
                type: "element",
                value: "def x = input.toInteger()",
                plainTextValue: false,
                children: [],
            },
        })
        const result = transpileMapperState(state)
        expect(result.totalFields).toBe(1)
        expect(result.translatedFields).toBe(1)
        expect(result.state.targetTreeNode?.value).toContain("let x")
        expect(result.state.targetTreeNode?.value).toContain("parseInt(input, 10)")
    })

    test("skips plainTextValue fields", () => {
        const state = createMinimalState({
            targetTreeNode: {
                id: "1",
                name: "root",
                type: "element",
                value: "def x = 5",
                plainTextValue: true,
                children: [],
            },
        })
        const result = transpileMapperState(state)
        expect(result.totalFields).toBe(0)
        expect(result.state.targetTreeNode?.value).toBe("def x = 5")
    })

    test("translates customCode", () => {
        const state = createMinimalState({
            targetTreeNode: {
                id: "1",
                name: "root",
                type: "element",
                customCode: "list.each { println it }",
                children: [],
            },
        })
        const result = transpileMapperState(state)
        expect(result.totalFields).toBe(1)
        expect(result.state.targetTreeNode?.customCode).toContain("forEach")
    })

    test("translates nodeCondition", () => {
        const state = createMinimalState({
            targetTreeNode: {
                id: "1",
                name: "root",
                type: "element",
                nodeCondition: {
                    condition: 'map.containsKey("active")',
                },
                children: [],
            },
        })
        const result = transpileMapperState(state)
        expect(result.totalFields).toBe(1)
        expect(result.state.targetTreeNode?.nodeCondition?.condition).toBe('("active" in map)')
    })

    test("translates loopConditions", () => {
        const state = createMinimalState({
            targetTreeNode: {
                id: "1",
                name: "root",
                type: "element",
                loopConditions: [
                    {
                        id: "lc1",
                        sourceNodePath: "/items",
                        condition: "val.toInteger() > 0",
                        textReference: false,
                    },
                ],
                children: [],
            },
        })
        const result = transpileMapperState(state)
        expect(result.totalFields).toBe(1)
        expect(result.state.targetTreeNode?.loopConditions?.[0].condition).toContain(
            "parseInt(val, 10)",
        )
    })

    test("translates loopStatement", () => {
        const state = createMinimalState({
            targetTreeNode: {
                id: "1",
                name: "root",
                type: "element",
                loopStatement: "items.findAll { it.active }.collect { it.name }",
                children: [],
            },
        })
        const result = transpileMapperState(state)
        expect(result.state.targetTreeNode?.loopStatement).toContain("filter")
        expect(result.state.targetTreeNode?.loopStatement).toContain("map")
    })

    test("translates context prologScript", () => {
        const state = createMinimalState({
            localContext: {
                globalVariables: [],
                lookupTables: [],
                functions: [],
                prologScript: "def counter = 0L",
                epilogScript: null,
            },
        })
        const result = transpileMapperState(state)
        expect(result.totalFields).toBe(1)
        expect(result.state.localContext.prologScript).toBe("let counter = 0")
    })

    test("translates context epilogScript", () => {
        const state = createMinimalState({
            localContext: {
                globalVariables: [],
                lookupTables: [],
                functions: [],
                prologScript: null,
                epilogScript: 'println "Done"',
            },
        })
        const result = transpileMapperState(state)
        expect(result.state.localContext.epilogScript).toBe('console.log("Done")')
    })

    test("translates functions[].body", () => {
        const state = createMinimalState({
            localContext: {
                globalVariables: [],
                lookupTables: [],
                functions: [
                    {
                        id: "fn1",
                        name: "transform",
                        body: "def result = input.toInteger()\nreturn result",
                    },
                ],
                prologScript: null,
                epilogScript: null,
            },
        })
        const result = transpileMapperState(state)
        expect(result.totalFields).toBe(1)
        expect(result.state.localContext.functions[0].body).toContain("let result")
        expect(result.state.localContext.functions[0].body).toContain("parseInt(input, 10)")
    })

    test("translates globalVariables[].value (non-plainText)", () => {
        const state = createMinimalState({
            localContext: {
                globalVariables: [
                    {
                        id: "gv1",
                        name: "myVar",
                        value: "items.size()",
                        plainTextValue: false,
                    },
                ],
                lookupTables: [],
                functions: [],
                prologScript: null,
                epilogScript: null,
            },
        })
        const result = transpileMapperState(state)
        expect(result.totalFields).toBe(1)
        expect(result.state.localContext.globalVariables[0].value).toBe("items.length")
    })

    test("skips globalVariables with plainTextValue=true", () => {
        const state = createMinimalState({
            localContext: {
                globalVariables: [
                    {
                        id: "gv1",
                        name: "myVar",
                        value: "items.size()",
                        plainTextValue: true,
                    },
                ],
                lookupTables: [],
                functions: [],
                prologScript: null,
                epilogScript: null,
            },
        })
        const result = transpileMapperState(state)
        expect(result.totalFields).toBe(0)
        expect(result.state.localContext.globalVariables[0].value).toBe("items.size()")
    })

    test("does not mutate original state", () => {
        const state = createMinimalState({
            targetTreeNode: {
                id: "1",
                name: "root",
                type: "element",
                value: "def x = 5",
                plainTextValue: false,
                children: [],
            },
        })
        const originalValue = state.targetTreeNode?.value
        transpileMapperState(state)
        expect(state.targetTreeNode?.value).toBe(originalValue)
    })

    test("walks nested children", () => {
        const state = createMinimalState({
            targetTreeNode: {
                id: "1",
                name: "root",
                type: "element",
                children: [
                    {
                        id: "2",
                        name: "child",
                        type: "element",
                        value: "list.size()",
                        plainTextValue: false,
                        children: [
                            {
                                id: "3",
                                name: "grandchild",
                                type: "element",
                                value: "x.toInteger()",
                                plainTextValue: false,
                                children: [],
                            },
                        ],
                    },
                ],
            },
        })
        const result = transpileMapperState(state)
        expect(result.totalFields).toBe(2)
        expect(result.translatedFields).toBe(2)
        expect(result.state.targetTreeNode?.children?.[0].value).toBe("list.length")
        expect(result.state.targetTreeNode?.children?.[0].children?.[0].value).toBe(
            "parseInt(x, 10)",
        )
    })

    test("aggregates warnings from multiple fields", () => {
        const state = createMinimalState({
            targetTreeNode: {
                id: "1",
                name: "root",
                type: "element",
                value: 'JTUtil.getGlobalData("key")',
                plainTextValue: false,
                children: [],
            },
            localContext: {
                globalVariables: [],
                lookupTables: [],
                functions: [],
                prologScript: 'new SimpleDateFormat("yyyy-MM-dd")',
                epilogScript: null,
            },
        })
        const result = transpileMapperState(state)
        expect(result.warnings.length).toBeGreaterThanOrEqual(2)
    })
})

// ---------------------------------------------------------------------------
// Multi-pattern integration tests
// ---------------------------------------------------------------------------

describe("Multi-pattern integration", () => {
    test("complex Groovy snippet", () => {
        const input = `import java.text.SimpleDateFormat
def items = new ArrayList<>()
list.each { item ->
    def val = item.toInteger()
    if (val > 0L) {
        items.add(val)
    }
}
def total = items.size()
println "Total: \${total}"`

        const result = transpileGroovyToJS(input)

        // Imports removed
        expect(result.code).not.toContain("import")

        // def → let
        expect(result.code).toContain("let items = []")

        // .each → .forEach
        expect(result.code).toContain(".forEach((item) => {")

        // .toInteger() → parseInt
        expect(result.code).toContain("parseInt(item, 10)")

        // 0L → 0
        expect(result.code).toContain("> 0")
        expect(result.code).not.toContain("0L")

        // .add → .push
        expect(result.code).toContain(".push(val)")

        // .size() → .length
        expect(result.code).toContain(".length")

        // println with GString → console.log with template literal
        expect(result.code).toContain("console.log")
    })

    test("collection pipeline", () => {
        const input =
            "def result = items.findAll { it.active }.collect { it.name }.findAll { it.size() > 0 }"
        const result = transpileGroovyToJS(input)
        expect(result.code).toContain(".filter(")
        expect(result.code).toContain(".map(")
    })

    test("try-catch with Groovy patterns", () => {
        const input = `try {
    def num = str.toInteger()
} catch(NumberFormatException e) {
    def fallback = 0L
}`
        const result = transpileGroovyToJS(input)
        expect(result.code).toContain("let num")
        expect(result.code).toContain("parseInt(str, 10)")
        expect(result.code).toContain("catch (e)")
        expect(result.code).toContain("let fallback = 0")
    })
})
