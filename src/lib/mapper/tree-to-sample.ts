import type { MapperTreeNode } from "./types"

// ─── JSON sample ──────────────────────────────────────────────────────────────

/**
 * Converts a list of child nodes into a plain JS object `{ key: value, ... }`.
 * Array children are represented as single-element arrays.
 * Returns null if the list is empty.
 */
function childrenToObject(children: MapperTreeNode[] | undefined): Record<string, unknown> | null {
    if (!children || children.length === 0) return null

    const obj: Record<string, unknown> = {}

    for (const child of children) {
        if (child.type === "arrayChild") {
            // arrayChild items shouldn't be keyed by name at this level
            // They're always wrapped by an 'array' parent — handled above
            continue
        }
        const key = child.name || child.id
        if (child.type === "array") {
            // Array field
            const inner = childrenToObject(child.children)
            obj[key] = inner !== null ? [inner] : []
        } else if (child.children && child.children.length > 0) {
            obj[key] = childrenToObject(child.children) ?? {}
        } else {
            obj[key] = ""
        }
    }

    return obj
}

/**
 * Serializes a MapperTreeNode source tree into a pretty-printed JSON string
 * suitable for use as sample input in the Execute dialog.
 *
 * Returns an empty string if `tree` is null/undefined.
 */
export function treeToSampleJson(tree: MapperTreeNode | null | undefined): string {
    if (!tree) return ""

    let value: unknown

    if (tree.type === "array") {
        const inner = childrenToObject(tree.children)
        value = inner !== null ? [inner] : []
    } else {
        // Root is typically an object/element
        value = childrenToObject(tree.children) ?? {}
    }

    return JSON.stringify(value, null, 2)
}

// ─── XML sample ───────────────────────────────────────────────────────────────

function indent(depth: number): string {
    return "  ".repeat(depth)
}

/**
 * Recursively builds an XML string from a MapperTreeNode tree.
 */
function nodeToXml(node: MapperTreeNode, depth: number): string {
    const tag = node.name || "element"
    const ind = indent(depth)

    if (node.type === "attribute") {
        // Attributes are inlined on their parent — skip standalone rendering
        return ""
    }

    // Separate attribute children from element children
    const attrChildren = (node.children ?? []).filter((c) => c.type === "attribute")
    const elemChildren = (node.children ?? []).filter((c) => c.type !== "attribute")

    const attrStr = attrChildren.map((a) => ` ${a.name || a.id}=""`).join("")

    if (elemChildren.length === 0) {
        return `${ind}<${tag}${attrStr}></${tag}>`
    }

    const childLines = elemChildren.map((c) => nodeToXml(c, depth + 1)).filter(Boolean)

    return [`${ind}<${tag}${attrStr}>`, ...childLines, `${ind}</${tag}>`].join("\n")
}

/**
 * Serializes a MapperTreeNode source tree into an XML string suitable for
 * use as sample input in the Execute dialog.
 *
 * Returns an empty string if `tree` is null/undefined.
 */
export function treeToSampleXml(tree: MapperTreeNode | null | undefined): string {
    if (!tree) return ""
    return nodeToXml(tree, 0)
}

// ─── Unified entry point ──────────────────────────────────────────────────────

/**
 * Generates a sample input string from the source tree, using the correct
 * format for the given template type.
 *
 * @param tree  The source MapperTreeNode (from `mapperState.sourceTreeNode`)
 * @param lang  `'json'` or `'xml'`
 */
export function treeToSample(
    tree: MapperTreeNode | null | undefined,
    lang: "json" | "xml",
): string {
    if (!tree) return ""
    return lang === "xml" ? treeToSampleXml(tree) : treeToSampleJson(tree)
}
