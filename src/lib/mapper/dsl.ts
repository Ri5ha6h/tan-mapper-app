import type { Mapping, MappingCondition, MappingTransform } from "./types"

export interface DSLError {
    line: number
    message: string
}

export interface ParseResult {
    mappings: Array<Mapping>
    errors: Array<DSLError>
}

const LINE_REGEX = /^\s*(.+?)\s*->\s*(.+?)(?:\s+WHERE\s+(.+?))?(?:\s+THEN\s+(.+?))?\s*$/i
const CONDITION_REGEX = /^(.+?)\s*(==|!=|>=|<=|>|<|contains|startsWith|endsWith)\s*(.+)$/
const TRANSFORM_REGEX = /^([+\-*/])(\d+(?:\.\d+)?)(%)?\s*$/

export function parseDSL(dslString: string): ParseResult {
    const mappings: Array<Mapping> = []
    const errors: Array<DSLError> = []

    const lines = dslString.split("\n")

    lines.forEach((line, index) => {
        const lineNum = index + 1
        const trimmed = line.trim()

        if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
            return
        }

        const match = trimmed.match(LINE_REGEX)

        if (!match) {
            errors.push({
                line: lineNum,
                message: `Invalid syntax. Expected: source.path -> target.path [WHERE condition] [THEN transform]`,
            })
            return
        }

        const [, sourcePath, targetPath, whereClause, thenClause] = match

        const mapping: Mapping = {
            id: `dsl-${lineNum}`,
            sourceId: normalizePath(sourcePath),
            targetId: normalizePath(targetPath),
        }

        if (whereClause) {
            const condition = parseCondition(whereClause.trim())
            if (condition) {
                mapping.condition = condition
            } else {
                errors.push({
                    line: lineNum,
                    message: `Invalid WHERE clause: "${whereClause.trim()}"`,
                })
                return
            }
        }

        if (thenClause) {
            const transform = parseTransform(thenClause.trim())
            if (transform) {
                mapping.transform = transform
            } else {
                errors.push({
                    line: lineNum,
                    message: `Invalid THEN clause: "${thenClause.trim()}"`,
                })
                return
            }
        }

        mappings.push(mapping)
    })

    return { mappings, errors }
}

function parseCondition(clause: string): MappingCondition | null {
    const match = clause.match(CONDITION_REGEX)
    if (!match) return null

    const [, field, operator, rawValue] = match
    let value = rawValue.trim()

    // Strip surrounding quotes from string values
    if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1)
    }

    return {
        field: normalizePath(field.trim()),
        operator: operator as MappingCondition["operator"],
        value,
    }
}

function parseTransform(clause: string): MappingTransform | null {
    const match = clause.match(TRANSFORM_REGEX)
    if (!match) return null

    const [, op, numStr, percent] = match
    const value = parseFloat(numStr)

    if (percent) {
        if (op === "+") return { type: "add_percent", value }
        if (op === "-") return { type: "subtract_percent", value }
        return null
    }

    switch (op) {
        case "+":
            return { type: "add", value }
        case "-":
            return { type: "subtract", value }
        case "*":
            return { type: "multiply", value }
        case "/":
            return { type: "divide", value }
        default:
            return null
    }
}

export function generateDSL(mappings: Array<Mapping>): string {
    return mappings
        .map((m) => {
            let line = `${stripRoot(m.sourceId)} -> ${stripRoot(m.targetId)}`

            if (m.condition) {
                line += ` WHERE ${stripRoot(m.condition.field)} ${m.condition.operator} ${formatConditionValue(m.condition)}`
            }

            if (m.transform) {
                line += ` THEN ${formatTransform(m.transform)}`
            }

            return line
        })
        .join("\n")
}

function stripRoot(path: string): string {
    return path.replace(/^root\.?/, "")
}

function formatConditionValue(condition: MappingCondition): string {
    const num = Number(condition.value)
    if (!isNaN(num) && condition.value.trim() !== "") {
        return condition.value
    }
    return `"${condition.value}"`
}

export function formatTransform(transform: MappingTransform): string {
    switch (transform.type) {
        case "add":
            return `+${transform.value}`
        case "subtract":
            return `-${transform.value}`
        case "multiply":
            return `*${transform.value}`
        case "divide":
            return `/${transform.value}`
        case "add_percent":
            return `+${transform.value}%`
        case "subtract_percent":
            return `-${transform.value}%`
    }
}

function normalizePath(path: string): string {
    const trimmed = path.trim()
    if (!trimmed.startsWith("root")) {
        return `root.${trimmed}`
    }
    return trimmed
}
