import { describe, expect, it } from "vitest"

// ============================================================
// Groovy Sidecar Integration Tests
// ============================================================
//
// These tests call the Groovy sidecar REST API directly.
// They require the sidecar to be running:
//   bun run groovy:up
//
// If the sidecar is not available, all tests are skipped gracefully.
// To run in CI, ensure Docker is available and the sidecar is started
// before running the test suite.

const GROOVY_SIDECAR_URL = process.env.GROOVY_SIDECAR_URL || "http://localhost:8090"

/**
 * Check if the Groovy sidecar is reachable.
 */
async function isSidecarAvailable(): Promise<boolean> {
    try {
        const res = await fetch(`${GROOVY_SIDECAR_URL}/health`, {
            signal: AbortSignal.timeout(3000),
        })
        return res.ok
    } catch {
        return false
    }
}

/**
 * Execute a script via the sidecar REST API.
 */
async function executeScript(
    script: string,
    input: string,
    timeout?: number,
): Promise<{
    output: string
    error: string | null
    logs: string[]
    durationMs: number
}> {
    const res = await fetch(`${GROOVY_SIDECAR_URL}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, input, timeout: timeout ?? 30000 }),
    })
    return res.json()
}

// Detect sidecar availability before running tests
let sidecarAvailable = false

describe("Groovy Sidecar Execution", async () => {
    sidecarAvailable = await isSidecarAvailable()

    // Helper to conditionally skip tests
    const conditionalIt = sidecarAvailable ? it : it.skip

    // ----------------------------------------------------------
    // Health check
    // ----------------------------------------------------------

    conditionalIt("health endpoint returns OK", async () => {
        const res = await fetch(`${GROOVY_SIDECAR_URL}/health`)
        expect(res.ok).toBe(true)
        const text = await res.text()
        expect(text).toBe("OK")
    })

    // ----------------------------------------------------------
    // Basic execution
    // ----------------------------------------------------------

    conditionalIt("simple arithmetic", async () => {
        const result = await executeScript("return 1 + 1", "")
        expect(result.error).toBeNull()
        expect(result.output).toBe("2")
        expect(result.durationMs).toBeGreaterThan(0)
    })

    conditionalIt("string return", async () => {
        const result = await executeScript('return "hello world"', "")
        expect(result.error).toBeNull()
        expect(result.output).toBe("hello world")
    })

    conditionalIt("null return produces empty string", async () => {
        const result = await executeScript("return null", "")
        expect(result.error).toBeNull()
        expect(result.output).toBe("")
    })

    // ----------------------------------------------------------
    // JSON transformation
    // ----------------------------------------------------------

    conditionalIt("simple JSON transformation", async () => {
        const result = await executeScript(
            `
      def source = new groovy.json.JsonSlurper().parseText(input)
      def output = [name: source.name.toUpperCase()]
      return new groovy.json.JsonBuilder(output).toPrettyString()
      `,
            '{"name": "hello"}',
        )
        expect(result.error).toBeNull()
        expect(JSON.parse(result.output)).toEqual({ name: "HELLO" })
    })

    conditionalIt("JSON with nested objects", async () => {
        const result = await executeScript(
            `
      def source = new groovy.json.JsonSlurper().parseText(input)
      def output = [
        fullName: source.first + " " + source.last,
        age: source.age * 2
      ]
      return new groovy.json.JsonBuilder(output).toPrettyString()
      `,
            '{"first": "John", "last": "Doe", "age": 25}',
        )
        expect(result.error).toBeNull()
        const parsed = JSON.parse(result.output)
        expect(parsed.fullName).toBe("John Doe")
        expect(parsed.age).toBe(50)
    })

    conditionalIt("JSON array processing", async () => {
        const result = await executeScript(
            `
      def source = new groovy.json.JsonSlurper().parseText(input)
      def names = source.items.collect { it.name.toUpperCase() }
      return new groovy.json.JsonBuilder(names).toPrettyString()
      `,
            '{"items": [{"name": "foo"}, {"name": "bar"}]}',
        )
        expect(result.error).toBeNull()
        expect(JSON.parse(result.output)).toEqual(["FOO", "BAR"])
    })

    // ----------------------------------------------------------
    // XML parsing
    // ----------------------------------------------------------

    conditionalIt("XML input auto-parsed into source variable", async () => {
        const result = await executeScript(
            `
      // source is auto-injected as XmlSlurper result for XML input
      def name = source.name.text()
      return name
      `,
            "<root><name>Hello XML</name></root>",
        )
        expect(result.error).toBeNull()
        expect(result.output).toBe("Hello XML")
    })

    conditionalIt("XML to JSON transformation", async () => {
        const result = await executeScript(
            `
      def name = source.person.name.text()
      def age = source.person.age.text()
      def output = [name: name, age: age.toInteger()]
      return new groovy.json.JsonBuilder(output).toPrettyString()
      `,
            "<root><person><name>Jane</name><age>30</age></person></root>",
        )
        expect(result.error).toBeNull()
        const parsed = JSON.parse(result.output)
        expect(parsed.name).toBe("Jane")
        expect(parsed.age).toBe(30)
    })

    conditionalIt("parseXML helper function", async () => {
        const result = await executeScript(
            `
      def xml = parseXML(input)
      return xml.item.text()
      `,
            "<root><item>test value</item></root>",
        )
        expect(result.error).toBeNull()
        expect(result.output).toBe("test value")
    })

    // ----------------------------------------------------------
    // Output capture (println)
    // ----------------------------------------------------------

    conditionalIt("captures println output in logs", async () => {
        const result = await executeScript(
            `
      println "debug line 1"
      println "debug line 2"
      return "done"
      `,
            "",
        )
        expect(result.error).toBeNull()
        expect(result.output).toBe("done")
        expect(result.logs).toContain("debug line 1")
        expect(result.logs).toContain("debug line 2")
    })

    // ----------------------------------------------------------
    // Error handling
    // ----------------------------------------------------------

    conditionalIt("script compilation error", async () => {
        const result = await executeScript("def x = {{{", "")
        expect(result.error).toBeTruthy()
        expect(result.output).toBe("")
    })

    conditionalIt("runtime exception", async () => {
        const result = await executeScript('throw new RuntimeException("test error")', "")
        expect(result.error).toBe("test error")
        expect(result.output).toBe("")
    })

    conditionalIt("null pointer in script", async () => {
        // Groovy handles null.toString() gracefully, so test a real NPE
        const result = await executeScript(
            `
      def x = null
      return x.someMethod()
      `,
            "",
        )
        expect(result.error).toBeTruthy()
    })

    // ----------------------------------------------------------
    // Timeout enforcement
    // ----------------------------------------------------------

    conditionalIt("timeout enforcement on infinite loop", async () => {
        const result = await executeScript("while(true) {}", "{}", 2000)
        expect(result.error).toContain("timed out")
        expect(result.durationMs).toBeGreaterThanOrEqual(1900)
    })

    conditionalIt("long-running script within timeout succeeds", async () => {
        const result = await executeScript(
            `
      Thread.sleep(500)
      return "completed"
      `,
            "",
            5000,
        )
        expect(result.error).toBeNull()
        expect(result.output).toBe("completed")
    })

    // ----------------------------------------------------------
    // Platform stubs
    // ----------------------------------------------------------

    conditionalIt("transaction stub is available", async () => {
        const result = await executeScript(
            `
      // transaction is injected as a stub
      def t = transaction
      return t != null ? "available" : "null"
      `,
            "",
        )
        expect(result.error).toBeNull()
        expect(result.output).toBe("available")
    })

    // ----------------------------------------------------------
    // Groovy-specific features
    // ----------------------------------------------------------

    conditionalIt("GString interpolation", async () => {
        const result = await executeScript(
            `
      def name = "World"
      return "Hello, \${name}!"
      `,
            "",
        )
        expect(result.error).toBeNull()
        expect(result.output).toBe("Hello, World!")
    })

    conditionalIt("Groovy closures", async () => {
        const result = await executeScript(
            `
      def nums = [1, 2, 3, 4, 5]
      def doubled = nums.collect { it * 2 }
      return doubled.toString()
      `,
            "",
        )
        expect(result.error).toBeNull()
        expect(result.output).toBe("[2, 4, 6, 8, 10]")
    })

    conditionalIt("Groovy map operations", async () => {
        const result = await executeScript(
            `
      def map = [a: 1, b: 2, c: 3]
      def sum = map.values().sum()
      return sum.toString()
      `,
            "",
        )
        expect(result.error).toBeNull()
        expect(result.output).toBe("6")
    })

    conditionalIt("Groovy regex", async () => {
        const result = await executeScript(
            `
      def text = "abc123def456"
      def nums = (text =~ /\\d+/).collect { it }
      return nums.toString()
      `,
            "",
        )
        expect(result.error).toBeNull()
        expect(result.output).toBe("[123, 456]")
    })

    conditionalIt("Groovy safe navigation operator", async () => {
        const result = await executeScript(
            `
      def obj = null
      return obj?.name ?: "default"
      `,
            "",
        )
        expect(result.error).toBeNull()
        expect(result.output).toBe("default")
    })

    // ----------------------------------------------------------
    // Duration tracking
    // ----------------------------------------------------------

    conditionalIt("durationMs is populated", async () => {
        const result = await executeScript('return "fast"', "")
        expect(result.error).toBeNull()
        expect(typeof result.durationMs).toBe("number")
        expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })
})
