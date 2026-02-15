import { XMLBuilder, XMLParser } from "fast-xml-parser"
import type { Mapping, TreeNode } from "./types"

export interface EngineError {
    line?: number
    message: string
}

function getValueAtPath(data: unknown, path: string): unknown {
    if (path === "root") return data

    const parts = path
        .replace(/^root\.?/, "")
        .split(/\.|\[|\]/)
        .filter(Boolean)
    let current: unknown = data

    for (const part of parts) {
        if (current === null || current === undefined) return undefined
        if (typeof current !== "object") return undefined

        const key = part.replace(/\]$/, "")
        current = (current as Record<string, unknown>)[key]
    }

    return current
}

function setValueAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path
        .replace(/^root\.?/, "")
        .split(/\.|\[|\]/)
        .filter(Boolean)
    let current: Record<string, unknown> = obj

    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i].replace(/\]$/, "")
        const nextPart = parts[i + 1].replace(/\]$/, "")

        if (!(part in current)) {
            const isNextArrayIndex = /^\d+$/.test(nextPart)
            current[part] = isNextArrayIndex ? [] : {}
        }
        current = current[part] as Record<string, unknown>
    }

    const lastPart = parts[parts.length - 1].replace(/\]$/, "")
    current[lastPart] = value
}

function buildTargetTemplate(node: TreeNode | null): unknown {
    if (!node) return {}

    if (node.type === "primitive" || node.type === "xml-attribute") {
        return node.value ?? ""
    }

    if (node.type === "array") {
        return node.children?.map((child) => buildTargetTemplate(child)) ?? []
    }

    const result: Record<string, unknown> = {}

    if (node.value !== undefined && node.type === "xml-element") {
        result["#text"] = node.value
    }

    node.children?.forEach((child) => {
        const childResult = buildTargetTemplate(child) as Record<string, unknown>
        if (child.type === "xml-attribute") {
            Object.assign(result, childResult)
        } else if (child.type === "array") {
            const arr = result[child.key]
            if (Array.isArray(arr)) {
                arr.push(childResult)
            } else {
                result[child.key] = [childResult]
            }
        } else {
            result[child.key] = childResult
        }
    })

    return result
}

export function applyMappings(
    sourceData: unknown,
    mappings: Array<Mapping>,
    targetTemplate: Record<string, unknown>,
): { result: unknown; errors: Array<EngineError> } {
    const errors: Array<EngineError> = []
    const result = JSON.parse(JSON.stringify(targetTemplate))

    for (const mapping of mappings) {
        const sourcePath = mapping.sourceId.replace(/^root\.?/, "root.")
        const targetPath = mapping.targetId.replace(/^root\.?/, "root.")

        const sourceValue = getValueAtPath(sourceData, sourcePath)

        if (sourceValue === undefined) {
            errors.push({
                message: `Source path "${sourcePath}" not found`,
            })
            continue
        }

        setValueAtPath(result, targetPath, sourceValue)
    }

    return { result, errors }
}

export function generateJSONOutput(data: unknown): string {
    return JSON.stringify(data, null, 2)
}

export function generateXMLOutput(data: unknown): string {
    const builder = new XMLBuilder({
        ignoreAttributes: false,
        attributeNamePrefix: "@",
        textNodeName: "#text",
        format: true,
        indentBy: "  ",
    })

    return builder.build(data)
}

export function treeToData(tree: TreeNode | null): unknown {
    if (!tree) return null
    return buildTargetTemplate(tree)
}

export function parseInput(content: string, type: "json" | "xml"): unknown {
    if (type === "json") {
        return JSON.parse(content)
    }

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@",
        textNodeName: "#text",
    })

    return parser.parse(content)
}
