import type { Mapping } from "./types"

export interface DSLError {
    line: number
    message: string
}

export interface ParseResult {
    mappings: Array<Mapping>
    errors: Array<DSLError>
}

const LINE_REGEX = /^\s*(.+?)\s*->\s*(.+?)\s*$/

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
                message: `Invalid syntax. Expected: source.path -> target.path`,
            })
            return
        }

        const [, sourcePath, targetPath] = match

        mappings.push({
            id: `dsl-${lineNum}`,
            sourceId: normalizePath(sourcePath),
            targetId: normalizePath(targetPath),
        })
    })

    return { mappings, errors }
}

export function generateDSL(mappings: Array<Mapping>): string {
    return mappings
        .map(
            (m) => `${m.sourceId.replace(/^root\.?/, "")} -> ${m.targetId.replace(/^root\.?/, "")}`,
        )
        .join("\n")
}

function normalizePath(path: string): string {
    const trimmed = path.trim()
    if (!trimmed.startsWith("root")) {
        return `root.${trimmed}`
    }
    return trimmed
}
