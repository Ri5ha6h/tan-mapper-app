/**
 * Groovy-to-JavaScript Transpiler
 *
 * Pattern-based transpiler that converts Groovy code found in legacy .jtmap files
 * into equivalent JavaScript. Processes code through three tiers:
 *   Tier 1: Mechanical replacements (regex string swaps)
 *   Tier 2: Pattern transformations (structural changes with capture groups)
 *   Tier 3: Complex translations (shim delegation + warnings)
 *
 * Architecture:
 *   groovyCode → Preprocessor → Tier1 → Tier2 → Tier3 → Postprocessor → TranspileResult
 */

import type { MapperState, MapperTreeNode } from "./types"

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TranspileResult {
    code: string
    warnings: TranspileWarning[]
    confidence: number
}

export interface TranspileWarning {
    line: number
    original: string
    message: string
    severity: "info" | "warning" | "error"
}

export interface TranspileMapperResult {
    state: MapperState
    warnings: TranspileWarning[]
    totalFields: number
    translatedFields: number
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function warn(
    warnings: TranspileWarning[],
    line: number,
    original: string,
    message: string,
    severity: TranspileWarning["severity"] = "warning",
): void {
    warnings.push({ line, original, message, severity })
}

/**
 * Find the matching closing brace for an opening `{` at position `startIdx`.
 * Respects nested braces, single-quoted strings, double-quoted strings, and
 * GString interpolations.
 */
function findMatchingBrace(code: string, startIdx: number): number {
    let depth = 0
    let i = startIdx
    while (i < code.length) {
        const ch = code[i]
        if (ch === "\\") {
            i += 2
            continue
        }
        if (ch === "'" || ch === '"' || ch === "`") {
            const quote = ch
            i++
            while (i < code.length && code[i] !== quote) {
                if (code[i] === "\\") i++
                i++
            }
            i++ // skip closing quote
            continue
        }
        if (ch === "{") {
            depth++
        } else if (ch === "}") {
            depth--
            if (depth === 0) return i
        }
        i++
    }
    return -1
}

/**
 * Extract the body of a closure `{ ... }` starting at the `{` position.
 * Returns [body, endIndex] or null if no matching brace found.
 */
function extractClosure(code: string, openBraceIdx: number): [string, number] | null {
    const closeIdx = findMatchingBrace(code, openBraceIdx)
    if (closeIdx === -1) return null
    const body = code.slice(openBraceIdx + 1, closeIdx).trim()
    return [body, closeIdx]
}

/**
 * Split a closure body into parameter(s) and body based on `->` delimiter.
 * Returns { params, body }. If no `->`, params is null (implicit `it`).
 */
function parseClosureParams(closureBody: string): { params: string | null; body: string } {
    // Look for `->` that is NOT inside a nested closure or string
    const arrowMatch = closureBody.match(/^(\s*[\w\s,]+?)\s*->(.*)$/s)
    if (arrowMatch) {
        return {
            params: arrowMatch[1].trim(),
            body: arrowMatch[2].trim(),
        }
    }
    return { params: null, body: closureBody }
}

// ---------------------------------------------------------------------------
// Preprocessor
// ---------------------------------------------------------------------------

function preprocess(code: string, _warnings: TranspileWarning[]): string {
    let result = code

    // Remove Java/Groovy import statements
    result = result.replace(/^\s*import\s+[\w.*]+(?:\s+as\s+\w+)?;?\s*$/gm, "")

    // Normalize Windows line endings
    result = result.replace(/\r\n/g, "\n")

    return result
}

// ---------------------------------------------------------------------------
// Tier 1 — Mechanical Replacements
// ---------------------------------------------------------------------------

function applyTier1(code: string, _warnings: TranspileWarning[]): string {
    let result = code

    // --- `def` keyword → `let` ---
    // Destructuring: def (a, b, c) = list → let [a, b, c] = list
    result = result.replace(/\bdef\s+\(([^)]+)\)\s*=/g, "let [$1] =")
    // Normal: def x = ... → let x = ...
    result = result.replace(/\bdef\s+(\w)/g, "let $1")

    // --- GString interpolation → template literals ---
    // Convert double-quoted strings with ${} to backtick template literals
    // Must be careful not to touch strings already using backticks
    result = result.replace(/"((?:[^"\\]|\\.)*)"/g, (_match, content: string) => {
        if (content.includes("${")) {
            // Convert to template literal
            return "`" + content + "`"
        }
        return _match
    })

    // --- Elvis operator ?: → || ---
    // Must not match ternary ?:  (ternary has `?` before `:` with expression between)
    result = result.replace(/\s*\?:\s*/g, " || ")

    // --- Empty map literal [:] → {} ---
    result = result.replace(/\[:\]/g, "{}")

    // --- Simple map literal [key: value, ...] → { key: value, ... } ---
    // Only handle simple cases (no nested brackets)
    result = result.replace(
        /\[(\w+)\s*:\s*([^\[\]]+?)\]/g,
        (_match, key: string, value: string) => {
            // Check if this looks like a map literal (key is an identifier, not a number)
            if (/^\d/.test(key)) return _match // array index, skip
            // Handle multiple entries
            const entries = `${key}: ${value}`
            return `{ ${entries} }`
        },
    )

    // --- println → console.log ---
    // println "text" → console.log("text")
    result = result.replace(/\bprintln\s+"([^"]*?)"/g, 'console.log("$1")')
    result = result.replace(/\bprintln\s+`([^`]*?)`/g, "console.log(`$1`)")
    // println(expr) → console.log(expr)
    result = result.replace(/\bprintln\s*\(/g, "console.log(")
    // println expr (no parens, no string) → console.log(expr)
    result = result.replace(/\bprintln\s+(?!console)(\S[^\n;]*)/g, "console.log($1)")

    // --- .put(k, v) → bracket assignment ---
    result = result.replace(/(\w+(?:\.\w+)*)\.put\((.+?),\s*(.+?)\)/g, "$1[$2] = $3")

    // --- .add(x) → .push(x) ---
    result = result.replace(/\.add\(/g, ".push(")

    // --- .size() → .length ---
    result = result.replace(/\.size\(\)/g, ".length")

    // --- Type conversion methods ---
    // .toInteger() → parseInt(X, 10)
    result = result.replace(/(\w+(?:\.\w+(?:\(\))?)*)\.toInteger\(\)/g, "parseInt($1, 10)")
    // .toLong() → parseInt(X, 10)
    result = result.replace(/(\w+(?:\.\w+(?:\(\))?)*)\.toLong\(\)/g, "parseInt($1, 10)")
    // .toDouble() → parseFloat(X)
    result = result.replace(/(\w+(?:\.\w+(?:\(\))?)*)\.toDouble\(\)/g, "parseFloat($1)")
    // .toBigDecimal() → parseFloat(X)
    result = result.replace(/(\w+(?:\.\w+(?:\(\))?)*)\.toBigDecimal\(\)/g, "parseFloat($1)")
    // .toList() → Array.from(X)
    result = result.replace(/(\w+(?:\.\w+(?:\(\))?)*)\.toList\(\)/g, "Array.from($1)")
    // .toString() → String(X)
    result = result.replace(/(\w+(?:\.\w+(?:\(\))?)*)\.toString\(\)/g, "String($1)")

    // --- .containsKey(k) → (k in obj) ---
    result = result.replace(/(\w+(?:\.\w+)*)\.containsKey\((.+?)\)/g, "($2 in $1)")

    // --- Numeric literal suffixes → strip ---
    // 0L, 1L, etc.
    result = result.replace(/(\d+)[Ll]\b/g, "$1")
    // 1.0d, 1.0f, 1.0D, 1.0F
    result = result.replace(/(\d+\.\d+)[dDfF]\b/g, "$1")

    // --- Typed catch → untyped ---
    result = result.replace(/\bcatch\s*\(\s*\w+(?:\.\w+)*\s+(\w+)\s*\)/g, "catch ($1)")

    // --- new LinkedHashMap<>() / new HashMap<>() → {} ---
    result = result.replace(/new\s+(?:LinkedHashMap|HashMap)\s*(?:<[^>]*>)?\s*\(\s*\)/g, "{}")

    // --- new ArrayList<>() / new LinkedList<>() → [] ---
    result = result.replace(/new\s+(?:ArrayList|LinkedList)\s*(?:<[^>]*>)?\s*\(\s*\)/g, "[]")

    return result
}

// ---------------------------------------------------------------------------
// Tier 2 — Pattern Transformations
// ---------------------------------------------------------------------------

/**
 * Scan backwards from `dotIdx` (the position of the `.` before the method name)
 * to find the start of the receiver expression. Handles balanced parens, brackets,
 * identifiers and dots.
 */
function findExpressionStart(code: string, dotIdx: number): number {
    let i = dotIdx - 1
    // Skip trailing whitespace
    while (i >= 0 && /\s/.test(code[i])) i--
    if (i < 0) return dotIdx

    // Walk backwards over the expression
    while (i >= 0) {
        const ch = code[i]
        if (ch === ")" || ch === "]") {
            // Find matching opening paren/bracket
            const open = ch === ")" ? "(" : "["
            let depth = 1
            i--
            while (i >= 0 && depth > 0) {
                if (code[i] === ch) depth++
                else if (code[i] === open) depth--
                i--
            }
            // `i` is now one before the opening paren/bracket
            // Continue to pick up the identifier before the paren
            continue
        }
        if (/[\w.$]/.test(ch)) {
            i--
            continue
        }
        // Hit a character that's not part of the expression
        break
    }
    return i + 1
}

/**
 * Transform a Groovy closure method call to its JS equivalent.
 * Generic handler for .each, .find, .findAll, .collect, .collectEntries, etc.
 */
function transformClosureMethod(
    code: string,
    groovyMethod: string,
    jsTransform: (objExpr: string, params: string, body: string) => string,
): string {
    let result = code
    // Pattern: .method {  — we find the dot-method-brace and then scan backwards for the receiver
    const dotMethodPattern = new RegExp(`\\.${groovyMethod}\\s*\\{`, "g")

    let iterations = 0
    const MAX_ITERATIONS = 100

    // Collect all match positions first
    const matchPositions: { dotIdx: number; braceIdx: number }[] = []
    let m: RegExpExecArray | null
    while ((m = dotMethodPattern.exec(result)) !== null) {
        if (iterations++ > MAX_ITERATIONS) break
        matchPositions.push({
            dotIdx: m.index,
            braceIdx: m.index + m[0].length - 1,
        })
    }

    // Process in reverse to preserve indices
    for (let i = matchPositions.length - 1; i >= 0; i--) {
        const { dotIdx, braceIdx } = matchPositions[i]
        const exprStart = findExpressionStart(result, dotIdx)
        const objExpr = result.slice(exprStart, dotIdx)

        if (!objExpr.trim()) continue // No receiver found

        const closure = extractClosure(result, braceIdx)
        if (!closure) continue

        const [closureBody, endIdx] = closure
        const { params: rawParams, body } = parseClosureParams(closureBody)

        const params = rawParams ?? "it"
        const replacement = jsTransform(objExpr, params, body)
        result = result.slice(0, exprStart) + replacement + result.slice(endIdx + 1)
    }

    return result
}

function applyTier2(code: string, _warnings: TranspileWarning[]): string {
    let result = code

    // --- .each { param -> body } → .forEach((param) => { body }) ---
    result = transformClosureMethod(result, "each", (obj, params, body) => {
        return `${obj}.forEach((${params}) => { ${body} })`
    })

    // --- .eachWithIndex { item, idx -> body } → .forEach((item, idx) => { body }) ---
    result = transformClosureMethod(result, "eachWithIndex", (obj, params, body) => {
        return `${obj}.forEach((${params}) => { ${body} })`
    })

    // --- .find { predicate } → .find((param) => predicate) ---
    result = transformClosureMethod(result, "find", (obj, params, body) => {
        return `${obj}.find((${params}) => ${body})`
    })

    // --- .findAll { predicate } → .filter((param) => predicate) ---
    result = transformClosureMethod(result, "findAll", (obj, params, body) => {
        return `${obj}.filter((${params}) => ${body})`
    })

    // --- .collect { transform } → .map((param) => transform) ---
    result = transformClosureMethod(result, "collect", (obj, params, body) => {
        // If body contains return statement, wrap in block
        if (body.includes("\n") || body.includes("return")) {
            return `${obj}.map((${params}) => { ${body} })`
        }
        return `${obj}.map((${params}) => ${body})`
    })

    // --- .collectEntries { closure } → Object.fromEntries(X.map(...)) ---
    result = transformClosureMethod(result, "collectEntries", (obj, params, body) => {
        // Groovy collectEntries closure returns [key, value] pairs from map literal
        // [(it.key): it.value] → [it.key, it.value]
        let transformedBody = body.replace(/\[\(([^)]+)\)\s*:\s*(.+)\]/g, "[$1, $2]")
        // Also handle [key: value] → [key, value]
        transformedBody = transformedBody.replace(/\[(\w[\w.]*)\s*:\s*(.+)\]/g, "[$1, $2]")
        return `Object.fromEntries(${obj}.map((${params}) => ${transformedBody}))`
    })

    // --- .findResult { closure } → .reduce((acc, it) => acc ?? closure, null) ---
    result = transformClosureMethod(result, "findResult", (obj, params, body) => {
        return `${obj}.reduce((acc, ${params}) => acc ?? (${body}), null)`
    })

    // --- .sum() → .reduce((a, b) => a + b, 0) ---
    result = result.replace(/(\w+(?:\.\w+)*)\.sum\(\)/g, "$1.reduce((a, b) => a + b, 0)")

    // --- .max() → Math.max(...X) ---
    result = result.replace(/(\w+(?:\.\w+)*)\.max\(\)/g, "Math.max(...$1)")

    // --- .min() → Math.min(...X) ---
    result = result.replace(/(\w+(?:\.\w+)*)\.min\(\)/g, "Math.min(...$1)")

    // --- .round(n) → roundTo(X, n) (shim) ---
    result = result.replace(/(\w+(?:\.\w+(?:\(\))?)*)\.round\((\d+)\)/g, "roundTo($1, $2)")

    // --- `as Integer` / `as int` → parseInt(X, 10) ---
    result = result.replace(
        /(\w+(?:\.\w+(?:\([^)]*\))?)*)\s+as\s+(?:Integer|int|long|Long)\b/g,
        "parseInt($1, 10)",
    )

    // --- `as String[]` → Array.from(X) (must come before `as String`) ---
    result = result.replace(/(\w+(?:\.\w+(?:\([^)]*\))?)*)\s+as\s+String\[\]/g, "Array.from($1)")

    // --- `as String` → String(X) ---
    result = result.replace(/(\w+(?:\.\w+(?:\([^)]*\))?)*)\s+as\s+String\b/g, "String($1)")

    // --- Range [n..-1] → .slice(n) ---
    // arr[1..-1] → arr.slice(1)
    result = result.replace(/(\w+)\[(\d+)\.\.-1\]/g, "$1.slice($2)")
    // arr[0..n] → arr.slice(0, n + 1) (Groovy ranges are inclusive)
    result = result.replace(
        /(\w+)\[(\d+)\.\.(\d+)\]/g,
        (_match, arr: string, start: string, end: string) => {
            return `${arr}.slice(${start}, ${parseInt(end, 10) + 1})`
        },
    )

    // --- Regex =~ → .match() ---
    result = result.replace(/(\w+(?:\.\w+)*)\s*=~\s*\/(.+?)\//g, "$1.match(/$2/)")

    // --- .replaceAll(regex, replacement) → .replace(new RegExp(regex, 'g'), replacement) ---
    result = result.replace(
        /(\w+(?:\.\w+)*)\.replaceAll\(\/(.+?)\/\s*,\s*(.+?)\)/g,
        "$1.replace(new RegExp(/$2/, 'g'), $3)",
    )
    // String pattern version
    result = result.replace(
        /(\w+(?:\.\w+)*)\.replaceAll\(("(?:[^"\\]|\\.)*")\s*,\s*(.+?)\)/g,
        "$1.replace(new RegExp($2, 'g'), $3)",
    )

    // --- .replaceFirst(regex, replacement) → .replace(new RegExp(regex), replacement) ---
    result = result.replace(
        /(\w+(?:\.\w+)*)\.replaceFirst\(("(?:[^"\\]|\\.)*")\s*,\s*(.+?)\)/g,
        "$1.replace(new RegExp($2), $3)",
    )

    // --- .matches(regex) → new RegExp(regex).test(X) ---
    result = result.replace(/(\w+(?:\.\w+)*)\.matches\((.+?)\)/g, "new RegExp($2).test($1)")

    // --- .tokenize(delim) → .split(delim) ---
    result = result.replace(/\.tokenize\(/g, ".split(")

    // --- .collate(n) → chunkArray(X, n) (shim) ---
    result = result.replace(/(\w+(?:\.\w+)*)\.collate\((\d+)\)/g, "chunkArray($1, $2)")

    // --- Spaceship <=> → comparator function ---
    result = result.replace(
        /\{\s*(\w+)\s*,\s*(\w+)\s*->\s*(\w+)\s*<=>\s*(\w+)\s*\}/g,
        (_match, p1: string, p2: string, a: string, b: string) => {
            return `(${p1}, ${p2}) => ${a} < ${b} ? -1 : ${a} > ${b} ? 1 : 0`
        },
    )

    // --- .text() (XML GPath) → getText(X) (shim) ---
    result = result.replace(/(\w+(?:\.\w+)*)\.text\(\)/g, "getText($1)")

    // --- source.'**'.findAll → deepFindAll(source, predicate) (shim) ---
    result = result.replace(/(\w+)\.'?\*\*'?\.findAll\s*\{/g, (_match, obj: string) => {
        return `deepFindAll(${obj}, (`
    })

    // --- .'n:tagName' (namespaced XML) → ['n:tagName'] ---
    result = result.replace(/\.\'([^']+)\'/g, "['$1']")

    // --- .@attrName (XML attribute) → ['@attrName'] ---
    result = result.replace(/\.@(\w+)/g, "['@$1']")

    // --- Spread dot *.method() → .map(x => x.method()) ---
    result = result.replace(/(\w+(?:\.\w+)*)\*\.(\w+)\(\)/g, "$1.map(x => x.$2())")

    // --- .contains(x) → .includes(x) ---
    // Context-agnostic: both String and List .contains maps to .includes in JS
    result = result.replace(/\.contains\(/g, ".includes(")

    return result
}

// ---------------------------------------------------------------------------
// Tier 3 — Complex Translations (warnings + shim delegation)
// ---------------------------------------------------------------------------

function applyTier3(code: string, warnings: TranspileWarning[]): string {
    let result = code

    // --- new SimpleDateFormat(pattern) → createDateFormatter(pattern) (shim) ---
    if (result.includes("SimpleDateFormat")) {
        result = result.replace(/new\s+SimpleDateFormat\((.+?)\)/g, "createDateFormatter($1)")
        warn(
            warnings,
            0,
            "SimpleDateFormat",
            "Date formatting translated via shim — verify output format",
            "warning",
        )
    }

    // --- ZonedDateTime / LocalDate / LocalDateTime → Date / shim ---
    if (
        result.includes("ZonedDateTime") ||
        result.includes("LocalDate") ||
        result.includes("LocalDateTime")
    ) {
        result = result.replace(/ZonedDateTime\.parse\((.+?)\)/g, "new Date($1)")
        result = result.replace(/LocalDate\.now\(\)/g, "new Date()")
        result = result.replace(/LocalDateTime\.now\(\)/g, "new Date()")
        result = result.replace(/LocalDate\.parse\((.+?)\)/g, "new Date($1)")
        warn(
            warnings,
            0,
            "Java date API",
            "Java date API translated — timezone handling may differ",
            "warning",
        )
    }

    // --- Locale.getISOCountries() → getISOCountries() (shim) ---
    if (result.includes("Locale.getISOCountries")) {
        result = result.replace(/Locale\.getISOCountries\(\)/g, "getISOCountries()")
        warn(
            warnings,
            0,
            "Locale.getISOCountries()",
            "Locale API translated to shim function",
            "info",
        )
    }

    // --- BigDecimal → parseFloat / roundTo ---
    if (result.includes("BigDecimal")) {
        result = result.replace(
            /BigDecimal\.valueOf\((.+?)\)\.setScale\((\d+)[^)]*\)/g,
            "roundTo($1, $2)",
        )
        result = result.replace(/new\s+BigDecimal\((.+?)\)/g, "parseFloat($1)")
        warn(
            warnings,
            0,
            "BigDecimal",
            "BigDecimal translated to float — precision may differ for very large/small numbers",
            "warning",
        )
    }

    // --- new JsonSlurper().parseText(str) → JSON.parse(str) ---
    result = result.replace(/new\s+JsonSlurper\(\)\.parseText\((.+?)\)/g, "JSON.parse($1)")

    // --- Platform APIs (JTUtil, JTLookupUtil, JTV3Utils, JTJSONObject) ---
    if (result.includes("JTUtil")) {
        result = result.replace(/JTUtil\.getGlobalData\((.+?)\)/g, "jtShims.getGlobalData($1)")
        result = result.replace(/JTUtil\.logFailureEvent\((.+?)\)/g, "console.error($1)")
        result = result.replace(/JTUtil\.(\w+)\(([^)]*)\)/g, "jtShims.$1($2)")
        warn(
            warnings,
            0,
            "JTUtil",
            "Platform API call cannot be translated — stub injected",
            "error",
        )
    }

    if (result.includes("JTLookupUtil")) {
        result = result.replace(
            /JTLookupUtil\.getLookupTable\((.+?)\)/g,
            "jtShims.getLookupTable($1)",
        )
        result = result.replace(/JTLookupUtil\.(\w+)\(([^)]*)\)/g, "jtShims.$1($2)")
        warn(
            warnings,
            0,
            "JTLookupUtil",
            "Platform API call cannot be translated — stub injected",
            "error",
        )
    }

    if (result.includes("JTV3Utils")) {
        result = result.replace(/JTV3Utils\.(\w+)\(([^)]*)\)/g, "jtShims.$1($2)")
        warn(
            warnings,
            0,
            "JTV3Utils",
            "Platform API call cannot be translated — stub injected",
            "error",
        )
    }

    if (result.includes("JTJSONObject")) {
        result = result.replace(/new\s+JTJSONObject\((.+?)\)/g, "JSON.parse($1)")
        warn(warnings, 0, "JTJSONObject", "Platform API translated — verify behavior", "warning")
    }

    // --- Class definitions → ES6 class ---
    result = result.replace(
        /class\s+(\w+)\s+implements\s+\w+(?:\s*,\s*\w+)*\s*\{/g,
        (_match, className: string) => {
            warn(warnings, 0, _match, "Class translated — verify method behavior", "warning")
            return `class ${className} {`
        },
    )
    // Also handle `class Foo extends Bar {`
    result = result.replace(
        /class\s+(\w+)\s+extends\s+(\w+)\s+implements\s+\w+(?:\s*,\s*\w+)*\s*\{/g,
        (_match, className: string, parent: string) => {
            warn(warnings, 0, _match, "Class translated — verify method behavior", "warning")
            return `class ${className} extends ${parent} {`
        },
    )

    // --- String.format() → template literal or toFixed ---
    if (result.includes("String.format")) {
        // String.format("%.2f", value) → value.toFixed(2)
        result = result.replace(/String\.format\(\s*"%.(\d+)f"\s*,\s*(.+?)\)/g, "$2.toFixed($1)")
        // Generic String.format → template literal with warning
        result = result.replace(/String\.format\((.+?)\)/g, (_match, args: string) => {
            warn(warnings, 0, _match, "String.format translated — verify output format", "warning")
            return `stringFormat(${args})`
        })
    }

    return result
}

// ---------------------------------------------------------------------------
// Postprocessor
// ---------------------------------------------------------------------------

function postprocess(code: string): string {
    let result = code

    // Remove multiple consecutive blank lines (keep at most one)
    result = result.replace(/\n{3,}/g, "\n\n")

    // Trim leading/trailing whitespace
    result = result.trim()

    return result
}

// ---------------------------------------------------------------------------
// Confidence calculation
// ---------------------------------------------------------------------------

function calculateConfidence(
    originalCode: string,
    transpiledCode: string,
    warnings: TranspileWarning[],
): number {
    if (!originalCode.trim()) return 1

    const errorCount = warnings.filter((w) => w.severity === "error").length
    const warningCount = warnings.filter((w) => w.severity === "warning").length

    // Start at 1.0, deduct for warnings and errors
    let confidence = 1.0
    confidence -= errorCount * 0.15
    confidence -= warningCount * 0.05

    // Check for remaining Groovy-isms that weren't translated
    const groovyPatterns = [
        /\bdef\s+\w/,
        /\.each\s*\{/,
        /\.collect\s*\{/,
        /\.findAll\s*\{/,
        /\?:/,
        /\.put\(/,
        /\.size\(\)/,
        /\.toInteger\(\)/,
        /\.toDouble\(\)/,
        /\bprintln\b/,
        /\bimport\s+java\./,
        /new\s+(?:ArrayList|HashMap|LinkedHashMap)/,
    ]

    for (const pattern of groovyPatterns) {
        if (pattern.test(transpiledCode)) {
            confidence -= 0.05
        }
    }

    return Math.max(0, Math.min(1, confidence))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Transpile a single Groovy code string to JavaScript.
 * Used for individual fields (value, condition, customCode, etc.)
 */
export function transpileGroovyToJS(groovyCode: string): TranspileResult {
    if (!groovyCode || !groovyCode.trim()) {
        return { code: "", warnings: [], confidence: 1 }
    }

    const warnings: TranspileWarning[] = []

    let code = preprocess(groovyCode, warnings)
    code = applyTier1(code, warnings)
    code = applyTier2(code, warnings)
    code = applyTier3(code, warnings)
    code = postprocess(code)

    const confidence = calculateConfidence(groovyCode, code, warnings)

    return { code, warnings, confidence }
}

/**
 * Transpile an entire MapperState's Groovy code to JavaScript.
 * Walks all code-bearing fields and translates each one.
 */
export function transpileMapperState(state: MapperState): TranspileMapperResult {
    const allWarnings: TranspileWarning[] = []
    let totalFields = 0
    let translatedFields = 0

    // Deep clone state to avoid mutation
    const newState: MapperState = JSON.parse(JSON.stringify(state))

    /**
     * Transpile a single field, returning the translated string.
     */
    function transpileField(
        value: string | undefined | null,
        plainText?: boolean,
    ): string | undefined | null {
        if (!value || plainText) return value
        totalFields++
        const result = transpileGroovyToJS(value)
        allWarnings.push(...result.warnings)
        if (result.code !== value) {
            translatedFields++
        }
        return result.code
    }

    /**
     * Recursively walk a tree node and transpile all code fields.
     */
    function walkNode(node: MapperTreeNode): void {
        // value (when not plainTextValue)
        if (node.value && !node.plainTextValue) {
            node.value = transpileField(node.value) ?? node.value
        }

        // customCode
        if (node.customCode) {
            node.customCode = transpileField(node.customCode) ?? node.customCode
        }

        // loopStatement
        if (node.loopStatement) {
            node.loopStatement = transpileField(node.loopStatement) ?? node.loopStatement
        }

        // nodeCondition.condition
        if (node.nodeCondition?.condition) {
            node.nodeCondition.condition =
                transpileField(node.nodeCondition.condition) ?? node.nodeCondition.condition
        }

        // loopConditions[].condition
        if (node.loopConditions) {
            for (const lc of node.loopConditions) {
                if (lc.condition) {
                    lc.condition = transpileField(lc.condition) ?? lc.condition
                }
            }
        }

        // Recurse into children
        if (node.children) {
            for (const child of node.children) {
                walkNode(child)
            }
        }
    }

    // Walk target tree (source tree doesn't have code fields)
    if (newState.targetTreeNode) {
        walkNode(newState.targetTreeNode)
    }

    // Translate context fields
    const ctx = newState.localContext
    if (ctx) {
        // prologScript
        if (ctx.prologScript) {
            ctx.prologScript = transpileField(ctx.prologScript) ?? ctx.prologScript
        }

        // epilogScript
        if (ctx.epilogScript) {
            ctx.epilogScript = transpileField(ctx.epilogScript) ?? ctx.epilogScript
        }

        // functions[].body
        if (ctx.functions) {
            for (const fn of ctx.functions) {
                if (fn.body) {
                    fn.body = transpileField(fn.body) ?? fn.body
                }
            }
        }

        // globalVariables[].value (when not plainTextValue)
        if (ctx.globalVariables) {
            for (const gv of ctx.globalVariables) {
                if (gv.value && !gv.plainTextValue) {
                    gv.value = transpileField(gv.value) ?? gv.value
                }
            }
        }
    }

    return {
        state: newState,
        warnings: allWarnings,
        totalFields,
        translatedFields,
    }
}
