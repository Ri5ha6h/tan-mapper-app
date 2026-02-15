import { XMLParser } from "fast-xml-parser"
import type { TreeNode } from "./types"

/**
 * Detect file type by first non-whitespace character
 */
export function detectFileType(content: string): "json" | "xml" {
    const trimmed = content.trim()
    if (trimmed.startsWith("<")) return "xml"
    return "json"
}

/**
 * Parse JSON string into TreeNode
 */
export function parseJSON(content: string, prefix = "root"): TreeNode {
    const data = JSON.parse(content)
    return jsonToTree(data, "root", prefix, 0)
}

function jsonToTree(value: unknown, key: string, path: string, depth: number): TreeNode {
    // Primitive
    if (value === null || typeof value !== "object") {
        return {
            id: path,
            key,
            value: String(value),
            type: "primitive",
            depth,
        }
    }

    // Array
    if (Array.isArray(value)) {
        return {
            id: path,
            key,
            type: "array",
            depth,
            children: value.map((item, i) =>
                jsonToTree(item, `[${i}]`, `${path}[${i}]`, depth + 1),
            ),
        }
    }

    // Object
    return {
        id: path,
        key,
        type: "object",
        depth,
        children: Object.entries(value).map(([k, v]) =>
            jsonToTree(v, k, `${path}.${k}`, depth + 1),
        ),
    }
}

/**
 * Parse XML string into TreeNode
 */
export function parseXML(content: string): TreeNode {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@",
        textNodeName: "#text",
    })
    const data = parser.parse(content)
    return xmlToTree(data, "root", "root", 0)
}

function xmlToTree(value: unknown, key: string, path: string, depth: number): TreeNode {
    // Text content
    if (typeof value === "string" || typeof value === "number") {
        return {
            id: path,
            key,
            value: String(value),
            type: "primitive",
            depth,
        }
    }

    if (typeof value !== "object" || value === null) {
        return {
            id: path,
            key,
            value: String(value ?? ""),
            type: "primitive",
            depth,
        }
    }

    const children: Array<TreeNode> = []
    const obj = value as Record<string, unknown>

    for (const [k, v] of Object.entries(obj)) {
        // Skip text node as direct child content
        if (k === "#text") continue

        // XML attribute
        if (k.startsWith("@")) {
            children.push({
                id: `${path}.${k}`,
                key: k,
                value: String(v),
                type: "xml-attribute",
                depth: depth + 1,
            })
            continue
        }

        // Array of elements
        if (Array.isArray(v)) {
            v.forEach((item, i) => {
                children.push(xmlToTree(item, `${k}[${i}]`, `${path}.${k}[${i}]`, depth + 1))
            })
            continue
        }

        // Nested element
        children.push(xmlToTree(v, k, `${path}.${k}`, depth + 1))
    }

    // Check for text content
    const textValue = obj["#text"]

    return {
        id: path,
        key,
        value: textValue ? String(textValue) : undefined,
        type: "xml-element",
        depth,
        children: children.length > 0 ? children : undefined,
    }
}
