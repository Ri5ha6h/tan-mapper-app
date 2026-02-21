import { describe, expect, test, vi } from "vitest"
import {
    bigDecimal,
    chunkArray,
    createDateFormatter,
    createLocale,
    deepFindAll,
    findResult,
    fromEpochSecond,
    getGroovyShimParamNames,
    getGroovyShimParamValues,
    getGroovyShimsCode,
    getISO3Country,
    getISOCountries,
    getText,
    groovyShims,
    jtShims,
    nowLocalDate,
    nowZonedDateTime,
    parseZonedDateTime,
    roundTo,
    stringFormat,
    sum,
    xmlProxy,
} from "../groovy-shims"

// ============================================================
// 7.2 — Date Formatting Shims
// ============================================================

describe("createDateFormatter", () => {
    // Use a fixed date for deterministic testing: 2024-03-15 14:30:45.123
    const testDate = new Date(2024, 2, 15, 14, 30, 45, 123)

    describe("format()", () => {
        test("yyyy-MM-dd HH:mm:ss", () => {
            const fmt = createDateFormatter("yyyy-MM-dd HH:mm:ss")
            expect(fmt.format(testDate)).toBe("2024-03-15 14:30:45")
        })

        test("yyyy-MM-dd'T'HH:mm:ss (ISO with literal T)", () => {
            const fmt = createDateFormatter("yyyy-MM-dd'T'HH:mm:ss")
            expect(fmt.format(testDate)).toBe("2024-03-15T14:30:45")
        })

        test("MM/dd/yyyy", () => {
            const fmt = createDateFormatter("MM/dd/yyyy")
            expect(fmt.format(testDate)).toBe("03/15/2024")
        })

        test("yyyyMMddHHmmss (compact)", () => {
            const fmt = createDateFormatter("yyyyMMddHHmmss")
            expect(fmt.format(testDate)).toBe("20240315143045")
        })

        test("yyyy-MM-dd HH:mm:ss.SSS (with milliseconds)", () => {
            const fmt = createDateFormatter("yyyy-MM-dd HH:mm:ss.SSS")
            expect(fmt.format(testDate)).toBe("2024-03-15 14:30:45.123")
        })

        test("dd-MMM-yyyy (short month name)", () => {
            const fmt = createDateFormatter("dd-MMM-yyyy")
            expect(fmt.format(testDate)).toBe("15-Mar-2024")
        })

        test("dd MMMM yyyy (long month name)", () => {
            const fmt = createDateFormatter("dd MMMM yyyy")
            expect(fmt.format(testDate)).toBe("15 March 2024")
        })

        test("EEE (short day name)", () => {
            const fmt = createDateFormatter("EEE")
            expect(fmt.format(testDate)).toBe("Fri")
        })

        test("yy (2-digit year)", () => {
            const fmt = createDateFormatter("yy")
            expect(fmt.format(testDate)).toBe("24")
        })

        test("M/d/yyyy (single-digit month and day)", () => {
            const fmt = createDateFormatter("M/d/yyyy")
            // March 15 → 3/15/2024
            expect(fmt.format(testDate)).toBe("3/15/2024")
        })

        test("hh:mm a (12-hour format with AM/PM)", () => {
            const fmt = createDateFormatter("hh:mm a")
            expect(fmt.format(testDate)).toBe("02:30 PM")
        })

        test("hh:mm a for AM", () => {
            const morningDate = new Date(2024, 2, 15, 9, 5, 0)
            const fmt = createDateFormatter("hh:mm a")
            expect(fmt.format(morningDate)).toBe("09:05 AM")
        })
    })

    describe("parse()", () => {
        test("yyyy-MM-dd HH:mm:ss round-trip", () => {
            const fmt = createDateFormatter("yyyy-MM-dd HH:mm:ss")
            const parsed = fmt.parse("2024-03-15 14:30:45")
            expect(parsed.getFullYear()).toBe(2024)
            expect(parsed.getMonth()).toBe(2) // March = 2
            expect(parsed.getDate()).toBe(15)
            expect(parsed.getHours()).toBe(14)
            expect(parsed.getMinutes()).toBe(30)
            expect(parsed.getSeconds()).toBe(45)
        })

        test("MM/dd/yyyy", () => {
            const fmt = createDateFormatter("MM/dd/yyyy")
            const parsed = fmt.parse("03/15/2024")
            expect(parsed.getFullYear()).toBe(2024)
            expect(parsed.getMonth()).toBe(2)
            expect(parsed.getDate()).toBe(15)
        })

        test("yyyyMMddHHmmss (compact)", () => {
            const fmt = createDateFormatter("yyyyMMddHHmmss")
            const parsed = fmt.parse("20240315143045")
            expect(parsed.getFullYear()).toBe(2024)
            expect(parsed.getMonth()).toBe(2)
            expect(parsed.getDate()).toBe(15)
            expect(parsed.getHours()).toBe(14)
            expect(parsed.getMinutes()).toBe(30)
            expect(parsed.getSeconds()).toBe(45)
        })

        test("dd-MMM-yyyy (short month name)", () => {
            const fmt = createDateFormatter("dd-MMM-yyyy")
            const parsed = fmt.parse("15-Mar-2024")
            expect(parsed.getFullYear()).toBe(2024)
            expect(parsed.getMonth()).toBe(2)
            expect(parsed.getDate()).toBe(15)
        })

        test("yyyy-MM-dd HH:mm:ss.SSS (with milliseconds)", () => {
            const fmt = createDateFormatter("yyyy-MM-dd HH:mm:ss.SSS")
            const parsed = fmt.parse("2024-03-15 14:30:45.123")
            expect(parsed.getMilliseconds()).toBe(123)
        })

        test("hh:mm a parses PM correctly", () => {
            const fmt = createDateFormatter("hh:mm a")
            const parsed = fmt.parse("02:30 PM")
            expect(parsed.getHours()).toBe(14)
            expect(parsed.getMinutes()).toBe(30)
        })

        test("hh:mm a parses 12 PM as noon", () => {
            const fmt = createDateFormatter("hh:mm a")
            const parsed = fmt.parse("12:00 PM")
            expect(parsed.getHours()).toBe(12)
        })

        test("hh:mm a parses 12 AM as midnight", () => {
            const fmt = createDateFormatter("hh:mm a")
            const parsed = fmt.parse("12:00 AM")
            expect(parsed.getHours()).toBe(0)
        })

        test("throws on unparseable date", () => {
            const fmt = createDateFormatter("yyyy-MM-dd")
            expect(() => fmt.parse("not-a-date")).toThrow("Cannot parse date")
        })

        test("format → parse round-trip preserves date components", () => {
            const fmt = createDateFormatter("yyyy-MM-dd HH:mm:ss")
            const formatted = fmt.format(testDate)
            const parsed = fmt.parse(formatted)
            expect(parsed.getFullYear()).toBe(testDate.getFullYear())
            expect(parsed.getMonth()).toBe(testDate.getMonth())
            expect(parsed.getDate()).toBe(testDate.getDate())
            expect(parsed.getHours()).toBe(testDate.getHours())
            expect(parsed.getMinutes()).toBe(testDate.getMinutes())
            expect(parsed.getSeconds()).toBe(testDate.getSeconds())
        })
    })
})

describe("parseZonedDateTime", () => {
    test("parses ISO 8601 string", () => {
        const d = parseZonedDateTime("2024-03-15T14:30:45.000Z")
        expect(d.getUTCFullYear()).toBe(2024)
        expect(d.getUTCMonth()).toBe(2)
        expect(d.getUTCDate()).toBe(15)
    })

    test("throws on invalid date string", () => {
        expect(() => parseZonedDateTime("not-a-date")).toThrow("Cannot parse date")
    })
})

describe("nowLocalDate", () => {
    test("returns a date at midnight", () => {
        const d = nowLocalDate()
        expect(d.getHours()).toBe(0)
        expect(d.getMinutes()).toBe(0)
        expect(d.getSeconds()).toBe(0)
        expect(d.getMilliseconds()).toBe(0)
    })

    test("returns today", () => {
        const d = nowLocalDate()
        const now = new Date()
        expect(d.getFullYear()).toBe(now.getFullYear())
        expect(d.getMonth()).toBe(now.getMonth())
        expect(d.getDate()).toBe(now.getDate())
    })
})

describe("nowZonedDateTime", () => {
    test("returns a Date without timezone argument", () => {
        const d = nowZonedDateTime()
        expect(d).toBeInstanceOf(Date)
        expect(isNaN(d.getTime())).toBe(false)
    })

    test("returns a Date with timezone argument", () => {
        const d = nowZonedDateTime("America/New_York")
        expect(d).toBeInstanceOf(Date)
        expect(isNaN(d.getTime())).toBe(false)
    })
})

describe("fromEpochSecond", () => {
    test("converts epoch seconds to Date", () => {
        const d = fromEpochSecond(1710510645) // ~2024-03-15 UTC
        expect(d).toBeInstanceOf(Date)
        expect(d.getUTCFullYear()).toBe(2024)
    })

    test("epoch 0 returns Unix epoch", () => {
        const d = fromEpochSecond(0)
        expect(d.getTime()).toBe(0)
    })
})

// ============================================================
// 7.3 — Numeric Shims
// ============================================================

describe("roundTo", () => {
    test("rounds to 2 decimal places", () => {
        expect(roundTo(3.14159, 2)).toBe(3.14)
    })

    test("rounds to 0 decimal places", () => {
        expect(roundTo(3.7, 0)).toBe(4)
    })

    test("rounds to 4 decimal places", () => {
        expect(roundTo(1.23456789, 4)).toBe(1.2346)
    })

    test("handles negative numbers", () => {
        expect(roundTo(-3.14159, 2)).toBe(-3.14)
    })

    test("handles string input", () => {
        expect(roundTo("3.14159", 2)).toBe(3.14)
    })

    test("returns 0 for NaN input", () => {
        expect(roundTo("not-a-number", 2)).toBe(0)
    })

    test("handles zero", () => {
        expect(roundTo(0, 5)).toBe(0)
    })

    test("rounds 0.5 up (half-up behavior)", () => {
        expect(roundTo(2.5, 0)).toBe(3)
    })
})

describe("bigDecimal", () => {
    test("creates from number", () => {
        const bd = bigDecimal(3.14)
        expect(bd.value).toBe(3.14)
        expect(bd.toNumber()).toBe(3.14)
    })

    test("creates from string", () => {
        const bd = bigDecimal("3.14")
        expect(bd.value).toBe(3.14)
    })

    test("setScale rounds correctly", () => {
        const bd = bigDecimal(3.14159).setScale(2)
        expect(bd.value).toBe(3.14)
    })

    test("add", () => {
        const bd = bigDecimal(1.5).add(bigDecimal(2.5))
        expect(bd.value).toBe(4)
    })

    test("subtract", () => {
        const bd = bigDecimal(5).subtract(3)
        expect(bd.value).toBe(2)
    })

    test("multiply", () => {
        const bd = bigDecimal(3).multiply(4)
        expect(bd.value).toBe(12)
    })

    test("divide", () => {
        const bd = bigDecimal(10).divide(3, 2)
        expect(bd.value).toBe(3.33)
    })

    test("divide by zero throws", () => {
        expect(() => bigDecimal(10).divide(0)).toThrow("Division by zero")
    })

    test("compareTo", () => {
        expect(bigDecimal(3).compareTo(2)).toBe(1)
        expect(bigDecimal(2).compareTo(3)).toBe(-1)
        expect(bigDecimal(3).compareTo(3)).toBe(0)
    })

    test("toString", () => {
        expect(bigDecimal(3.14).toString()).toBe("3.14")
    })

    test("chaining operations", () => {
        const result = bigDecimal(10).add(5).multiply(2).setScale(0)
        expect(result.value).toBe(30)
    })
})

// ============================================================
// 7.4 — Collection Shims
// ============================================================

describe("chunkArray", () => {
    test("splits array into chunks of given size", () => {
        expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    })

    test("returns single chunk when size >= array length", () => {
        expect(chunkArray([1, 2, 3], 5)).toEqual([[1, 2, 3]])
    })

    test("handles chunk size of 1", () => {
        expect(chunkArray([1, 2, 3], 1)).toEqual([[1], [2], [3]])
    })

    test("handles empty array", () => {
        expect(chunkArray([], 3)).toEqual([])
    })

    test("handles chunk size <= 0 by returning whole array", () => {
        expect(chunkArray([1, 2, 3], 0)).toEqual([[1, 2, 3]])
    })

    test("exact division", () => {
        expect(chunkArray([1, 2, 3, 4], 2)).toEqual([
            [1, 2],
            [3, 4],
        ])
    })
})

describe("sum", () => {
    test("sums numbers", () => {
        expect(sum([1, 2, 3, 4, 5])).toBe(15)
    })

    test("sums with closure", () => {
        const items = [{ v: 10 }, { v: 20 }, { v: 30 }]
        expect(sum(items, (item) => (item as { v: number }).v)).toBe(60)
    })

    test("empty array returns 0", () => {
        expect(sum([])).toBe(0)
    })

    test("handles string numbers", () => {
        expect(sum(["1", "2", "3"])).toBe(6)
    })
})

describe("findResult", () => {
    test("returns first non-null result", () => {
        const result = findResult([1, 2, 3, 4], (n) => (n > 2 ? `found ${n}` : null))
        expect(result).toBe("found 3")
    })

    test("returns null when no match", () => {
        const result = findResult([1, 2, 3], () => null)
        expect(result).toBeNull()
    })

    test("returns first match, not last", () => {
        const result = findResult([1, 2, 3], (n) => (n >= 2 ? n * 10 : null))
        expect(result).toBe(20)
    })

    test("skips undefined results", () => {
        const result = findResult([1, 2, 3], (n) => (n === 2 ? "two" : undefined))
        expect(result).toBe("two")
    })

    test("empty array returns null", () => {
        const result = findResult([], () => "found")
        expect(result).toBeNull()
    })
})

// ============================================================
// 7.5 — Locale / Country Code Shims
// ============================================================

describe("getISOCountries", () => {
    test("returns array of alpha-2 codes", () => {
        const codes = getISOCountries()
        expect(Array.isArray(codes)).toBe(true)
        expect(codes.length).toBeGreaterThan(200)
    })

    test("includes common codes", () => {
        const codes = getISOCountries()
        expect(codes).toContain("US")
        expect(codes).toContain("GB")
        expect(codes).toContain("DE")
        expect(codes).toContain("FR")
        expect(codes).toContain("JP")
    })

    test("all codes are 2 characters", () => {
        const codes = getISOCountries()
        for (const code of codes) {
            expect(code).toHaveLength(2)
        }
    })
})

describe("getISO3Country", () => {
    test("maps common codes correctly", () => {
        expect(getISO3Country("US")).toBe("USA")
        expect(getISO3Country("GB")).toBe("GBR")
        expect(getISO3Country("DE")).toBe("DEU")
        expect(getISO3Country("FR")).toBe("FRA")
        expect(getISO3Country("JP")).toBe("JPN")
    })

    test("case-insensitive", () => {
        expect(getISO3Country("us")).toBe("USA")
    })

    test("returns input for unknown code", () => {
        expect(getISO3Country("XX")).toBe("XX")
    })
})

describe("createLocale", () => {
    test("creates locale with language and country", () => {
        const loc = createLocale("en", "US")
        expect(loc.language).toBe("en")
        expect(loc.country).toBe("US")
    })

    test("getISO3Country returns alpha-3", () => {
        const loc = createLocale("en", "US")
        expect(loc.getISO3Country()).toBe("USA")
    })

    test("toString with country", () => {
        const loc = createLocale("en", "US")
        expect(loc.toString()).toBe("en_US")
    })

    test("toString without country", () => {
        const loc = createLocale("en", "")
        expect(loc.toString()).toBe("en")
    })
})

// ============================================================
// 7.6 — XML GPath Shims
// ============================================================

describe("getText", () => {
    test("returns string value directly", () => {
        expect(getText("hello")).toBe("hello")
    })

    test("returns empty string for null/undefined", () => {
        expect(getText(null)).toBe("")
        expect(getText(undefined)).toBe("")
    })

    test("converts number to string", () => {
        expect(getText(42)).toBe("42")
    })

    test("converts boolean to string", () => {
        expect(getText(true)).toBe("true")
    })

    test("extracts #text from fast-xml-parser node", () => {
        expect(getText({ "#text": "hello world" })).toBe("hello world")
    })

    test("concatenates text from child nodes", () => {
        expect(getText({ child1: "hello", child2: " world" })).toBe("hello world")
    })

    test("ignores attributes (@_)", () => {
        expect(getText({ "@_id": "123", "#text": "content" })).toBe("content")
    })

    test("handles array of nodes", () => {
        expect(getText(["hello", " ", "world"])).toBe("hello world")
    })

    test("handles nested objects", () => {
        const node = {
            paragraph: {
                "#text": "inner text",
            },
        }
        expect(getText(node)).toBe("inner text")
    })
})

describe("deepFindAll", () => {
    test("finds all matching nodes recursively", () => {
        const tree = {
            level1: {
                level2a: { name: "Alice" },
                level2b: { name: "Bob" },
            },
        }
        const results = deepFindAll(tree, (node) => {
            return typeof node === "object" && node !== null && "name" in node
        })
        expect(results).toHaveLength(2)
    })

    test("handles arrays in tree", () => {
        const tree = {
            items: [
                { type: "a", value: 1 },
                { type: "b", value: 2 },
                { type: "a", value: 3 },
            ],
        }
        const results = deepFindAll(tree, (node) => {
            return (
                typeof node === "object" &&
                node !== null &&
                "type" in node &&
                (node as Record<string, unknown>).type === "a"
            )
        })
        expect(results).toHaveLength(2)
    })

    test("returns empty array for no matches", () => {
        const tree = { a: 1, b: 2 }
        const results = deepFindAll(tree, () => false)
        expect(results).toEqual([])
    })

    test("handles null root", () => {
        expect(deepFindAll(null, () => true)).toEqual([])
    })

    test("includes root if it matches", () => {
        const tree = { type: "root", children: [] }
        const results = deepFindAll(tree, (node) => {
            return (
                typeof node === "object" &&
                node !== null &&
                "type" in node &&
                (node as Record<string, unknown>).type === "root"
            )
        })
        expect(results.length).toBeGreaterThanOrEqual(1)
    })
})

describe("xmlProxy", () => {
    test("navigates nested objects via dot notation", () => {
        const xml = {
            root: {
                child: {
                    "#text": "hello",
                },
            },
        }
        const proxy = xmlProxy(xml) as Record<string, unknown>
        const child = (proxy.root as Record<string, unknown>).child as Record<string, () => string>
        expect(child.text()).toBe("hello")
    })

    test(".text() extracts text content", () => {
        const xml = { "#text": "hello" }
        const proxy = xmlProxy(xml) as Record<string, () => string>
        expect(proxy.text()).toBe("hello")
    })

    test(".name() returns first non-attribute key", () => {
        const xml = { "@_id": "1", element: { "#text": "val" } }
        const proxy = xmlProxy(xml) as Record<string, () => string>
        expect(proxy.name()).toBe("element")
    })

    test("accesses attributes via @", () => {
        const xml = { "@_id": "123", "#text": "content" }
        const proxy = xmlProxy(xml) as Record<string, unknown>
        expect(proxy["@id"]).toBe("123")
    })

    test("wraps array children as proxies", () => {
        const xml = {
            items: [{ "#text": "a" }, { "#text": "b" }],
        }
        const proxy = xmlProxy(xml) as Record<string, unknown>
        const items = proxy.items as Array<Record<string, () => string>>
        expect(items).toHaveLength(2)
        expect(items[0].text()).toBe("a")
        expect(items[1].text()).toBe("b")
    })

    test("returns undefined for missing properties", () => {
        const xml = { a: 1 }
        const proxy = xmlProxy(xml) as Record<string, unknown>
        expect(proxy.nonexistent).toBeUndefined()
    })

    test("returns primitive values directly", () => {
        const xml = { count: 42 }
        const proxy = xmlProxy(xml) as Record<string, unknown>
        expect(proxy.count).toBe(42)
    })

    test("returns null/undefined for null input", () => {
        expect(xmlProxy(null)).toBeNull()
        expect(xmlProxy(undefined)).toBeUndefined()
    })

    test("** deep traversal via findAll", () => {
        const xml = {
            root: {
                a: { "#text": "1" },
                b: {
                    c: { "#text": "2" },
                },
            },
        }
        const proxy = xmlProxy(xml) as Record<
            string,
            Record<string, (fn: (node: unknown) => boolean) => unknown[]>
        >
        const results = proxy["**"].findAll((node: unknown) => {
            return (
                typeof node === "object" &&
                node !== null &&
                "#text" in (node as Record<string, unknown>)
            )
        })
        expect(results.length).toBeGreaterThanOrEqual(2)
    })
})

// ============================================================
// 7.7 — Platform API Stubs
// ============================================================

describe("jtShims", () => {
    test("getGlobalData returns null with warning", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
        const result = jtShims.getGlobalData("key")
        expect(result).toBeNull()
        expect(warnSpy).toHaveBeenCalled()
        warnSpy.mockRestore()
    })

    test("logFailureEvent logs error", () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
        jtShims.logFailureEvent("test error")
        expect(errorSpy).toHaveBeenCalled()
        errorSpy.mockRestore()
    })

    test("getLookupTable returns empty object", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
        const result = jtShims.getLookupTable("tableName")
        expect(result).toEqual({})
        warnSpy.mockRestore()
    })

    test("getLookupTableValue returns null", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
        const result = jtShims.getLookupTableValue("table", "key")
        expect(result).toBeNull()
        warnSpy.mockRestore()
    })

    test("unknown method returns null via proxy", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
        const result = (
            jtShims as Record<string, (...args: unknown[]) => unknown>
        ).someUnknownMethod("arg")
        expect(result).toBeNull()
        expect(warnSpy).toHaveBeenCalled()
        warnSpy.mockRestore()
    })
})

describe("JsonSlurper (via groovyShims)", () => {
    test("parseText parses JSON", () => {
        const result = groovyShims.JsonSlurper.parseText('{"name":"test"}')
        expect(result).toEqual({ name: "test" })
    })
})

describe("JTJSONObject (via groovyShims)", () => {
    test("constructor from string", () => {
        const obj = new groovyShims.JTJSONObject('{"key":"value"}')
        expect(obj.get("key")).toBe("value")
    })

    test("constructor with no args", () => {
        const obj = new groovyShims.JTJSONObject()
        expect(obj.get("key")).toBeNull()
    })

    test("put and get", () => {
        const obj = new groovyShims.JTJSONObject()
        obj.put("name", "Alice")
        expect(obj.get("name")).toBe("Alice")
    })

    test("toString returns JSON", () => {
        const obj = new groovyShims.JTJSONObject()
        obj.put("x", 1)
        expect(JSON.parse(obj.toString())).toEqual({ x: 1 })
    })

    test("toJSON returns plain object", () => {
        const obj = new groovyShims.JTJSONObject()
        obj.put("a", "b")
        expect(obj.toJSON()).toEqual({ a: "b" })
    })
})

// ============================================================
// 7.8 — String Utility Shims
// ============================================================

describe("stringFormat", () => {
    test("%s string substitution", () => {
        expect(stringFormat("Hello, %s!", "World")).toBe("Hello, World!")
    })

    test("%d integer substitution", () => {
        expect(stringFormat("Count: %d", 42)).toBe("Count: 42")
    })

    test("%d truncates decimals", () => {
        expect(stringFormat("Count: %d", 3.7)).toBe("Count: 3")
    })

    test("%.2f float with decimal places", () => {
        expect(stringFormat("Price: %.2f", 3.14159)).toBe("Price: 3.14")
    })

    test("%.0f float with 0 decimal places", () => {
        expect(stringFormat("Count: %.0f", 42.7)).toBe("Count: 43")
    })

    test("%f default (6 decimal places)", () => {
        expect(stringFormat("Value: %f", 3.14)).toBe("Value: 3.140000")
    })

    test("%n newline", () => {
        expect(stringFormat("Line1%nLine2")).toBe("Line1\nLine2")
    })

    test("%% literal percent", () => {
        expect(stringFormat("100%%")).toBe("100%")
    })

    test("multiple substitutions", () => {
        expect(stringFormat("%s has %d items worth %.2f", "Cart", 3, 29.99)).toBe(
            "Cart has 3 items worth 29.99",
        )
    })

    test("handles null/undefined args as empty string for %s", () => {
        expect(stringFormat("Value: %s", null)).toBe("Value: ")
        expect(stringFormat("Value: %s", undefined)).toBe("Value: ")
    })
})

// ============================================================
// 7.9 — Shim Injection API
// ============================================================

describe("groovyShims object", () => {
    test("contains all expected shim functions", () => {
        expect(typeof groovyShims.createDateFormatter).toBe("function")
        expect(typeof groovyShims.parseZonedDateTime).toBe("function")
        expect(typeof groovyShims.nowLocalDate).toBe("function")
        expect(typeof groovyShims.nowZonedDateTime).toBe("function")
        expect(typeof groovyShims.fromEpochSecond).toBe("function")
        expect(typeof groovyShims.roundTo).toBe("function")
        expect(typeof groovyShims.bigDecimal).toBe("function")
        expect(typeof groovyShims.chunkArray).toBe("function")
        expect(typeof groovyShims.sum).toBe("function")
        expect(typeof groovyShims.findResult).toBe("function")
        expect(typeof groovyShims.getISOCountries).toBe("function")
        expect(typeof groovyShims.getISO3Country).toBe("function")
        expect(typeof groovyShims.createLocale).toBe("function")
        expect(typeof groovyShims.getText).toBe("function")
        expect(typeof groovyShims.deepFindAll).toBe("function")
        expect(typeof groovyShims.xmlProxy).toBe("function")
        expect(typeof groovyShims.stringFormat).toBe("function")
    })

    test("jtShims is a proxy object", () => {
        expect(groovyShims.jtShims).toBeDefined()
    })

    test("JTJSONObject is a constructor", () => {
        expect(typeof groovyShims.JTJSONObject).toBe("function")
    })

    test("JsonSlurper has parseText", () => {
        expect(typeof groovyShims.JsonSlurper.parseText).toBe("function")
    })
})

describe("getGroovyShimParamNames / getGroovyShimParamValues", () => {
    test("param names match param values in length", () => {
        const names = getGroovyShimParamNames()
        const values = getGroovyShimParamValues()
        expect(names.length).toBe(values.length)
    })

    test("param names are all strings", () => {
        const names = getGroovyShimParamNames()
        for (const name of names) {
            expect(typeof name).toBe("string")
        }
    })

    test("includes key shim names", () => {
        const names = getGroovyShimParamNames()
        expect(names).toContain("roundTo")
        expect(names).toContain("chunkArray")
        expect(names).toContain("getText")
        expect(names).toContain("deepFindAll")
        expect(names).toContain("createDateFormatter")
        expect(names).toContain("stringFormat")
        expect(names).toContain("jtShims")
    })
})

describe("getGroovyShimsCode", () => {
    test("returns a non-empty string", () => {
        const code = getGroovyShimsCode()
        expect(typeof code).toBe("string")
        expect(code.length).toBeGreaterThan(100)
    })

    test("contains key function definitions", () => {
        const code = getGroovyShimsCode()
        expect(code).toContain("createDateFormatter")
        expect(code).toContain("roundTo")
        expect(code).toContain("chunkArray")
        expect(code).toContain("getText")
        expect(code).toContain("deepFindAll")
        expect(code).toContain("xmlProxy")
        expect(code).toContain("stringFormat")
        expect(code).toContain("jtShims")
        expect(code).toContain("JTJSONObject")
        expect(code).toContain("JsonSlurper")
    })

    test("generated code is syntactically valid (can be evaluated)", () => {
        const code = getGroovyShimsCode()
        // Should not throw when evaluated in a new Function
        expect(() => new Function(code)).not.toThrow()
    })
})

// ============================================================
// Integration: shims work inside new Function() scope
// ============================================================

describe("shim injection integration", () => {
    test("roundTo is callable in Function scope via params", () => {
        const names = getGroovyShimParamNames()
        const values = getGroovyShimParamValues()
        const fn = new Function(...names, "return roundTo(3.14159, 2)")
        expect(fn(...values)).toBe(3.14)
    })

    test("chunkArray is callable in Function scope via params", () => {
        const names = getGroovyShimParamNames()
        const values = getGroovyShimParamValues()
        const fn = new Function(...names, "return JSON.stringify(chunkArray([1,2,3,4,5], 2))")
        expect(JSON.parse(fn(...values))).toEqual([[1, 2], [3, 4], [5]])
    })

    test("createDateFormatter is callable in Function scope via params", () => {
        const names = getGroovyShimParamNames()
        const values = getGroovyShimParamValues()
        const fn = new Function(
            ...names,
            'var fmt = createDateFormatter("yyyy-MM-dd"); return fmt.format(new Date(2024, 2, 15))',
        )
        expect(fn(...values)).toBe("2024-03-15")
    })

    test("getText is callable in Function scope via params", () => {
        const names = getGroovyShimParamNames()
        const values = getGroovyShimParamValues()
        const fn = new Function(...names, 'return getText({"#text": "hello"})')
        expect(fn(...values)).toBe("hello")
    })

    test("jtShims is callable in Function scope via params", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
        const names = getGroovyShimParamNames()
        const values = getGroovyShimParamValues()
        const fn = new Function(...names, 'return jtShims.getGlobalData("key")')
        expect(fn(...values)).toBeNull()
        warnSpy.mockRestore()
    })

    test("stringFormat is callable in Function scope via params", () => {
        const names = getGroovyShimParamNames()
        const values = getGroovyShimParamValues()
        const fn = new Function(...names, 'return stringFormat("Hello, %s!", "World")')
        expect(fn(...values)).toBe("Hello, World!")
    })

    test("getGroovyShimsCode() generates working inline shim code", () => {
        const code = getGroovyShimsCode()
        const script = `${code}\nreturn roundTo(3.14159, 2);`
        const fn = new Function(script)
        expect(fn()).toBe(3.14)
    })
})
