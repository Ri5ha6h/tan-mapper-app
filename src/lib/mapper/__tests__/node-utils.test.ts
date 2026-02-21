import { describe, expect, it } from "vitest"
import type { MapperTreeNode } from "../types"
import {
    cloneNode,
    collectAllNodeIds,
    createEmptyMapperState,
    createNode,
    deepCopyNode,
    findNodeById,
    findParentNode,
    fromParserTreeNode,
    getAncestors,
    getDisplayName,
    getFullPath,
    getPathFragment,
    groupNodes,
    insertChild,
    isLeaf,
    isRoot,
    mergeTrees,
    moveNodeDown,
    moveNodeUp,
    removeNode,
    traverseDown,
    traverseDownPPL,
    updateNode,
} from "../node-utils"
import type { TreeNode } from "../types"
import { parseJSON } from "../parsers"

// ============================================================
// Test fixtures
// ============================================================

function makeTree(): MapperTreeNode {
    return {
        id: "root",
        name: "root",
        type: "element",
        children: [
            {
                id: "orders",
                name: "orders",
                type: "array",
                children: [
                    {
                        id: "item",
                        name: "[]",
                        type: "arrayChild",
                        children: [
                            { id: "orderId", name: "id", type: "element" },
                            { id: "status", name: "status", type: "element" },
                            { id: "attr", name: "code", type: "attribute" },
                        ],
                    },
                ],
            },
        ],
    }
}

// ============================================================
// getPathFragment
// ============================================================

describe("getPathFragment", () => {
    it("returns name for element nodes", () => {
        const node = createNode("orderId", "element")
        expect(getPathFragment(node)).toBe("orderId")
    })

    it("returns @name for attribute nodes", () => {
        const node = createNode("code", "attribute")
        expect(getPathFragment(node)).toBe("@code")
    })

    it("returns null for arrayChild nodes", () => {
        const node = createNode("[]", "arrayChild")
        expect(getPathFragment(node)).toBeNull()
    })

    it("returns name for array nodes", () => {
        const node = createNode("orders", "array")
        expect(getPathFragment(node)).toBe("orders")
    })
})

// ============================================================
// getFullPath
// ============================================================

describe("getFullPath", () => {
    it("returns path for a nested element", () => {
        const tree = makeTree()
        expect(getFullPath("orderId", tree)).toBe("root.orders.id")
    })

    it("skips arrayChild in path", () => {
        const tree = makeTree()
        expect(getFullPath("item", tree)).toBe("root.orders")
    })

    it("prefixes attribute with @", () => {
        const tree = makeTree()
        expect(getFullPath("attr", tree)).toBe("root.orders.@code")
    })

    it("returns empty string for missing node", () => {
        const tree = makeTree()
        expect(getFullPath("nonexistent", tree)).toBe("")
    })

    it("returns name only for root node", () => {
        const tree = makeTree()
        expect(getFullPath("root", tree)).toBe("root")
    })
})

// ============================================================
// findNodeById
// ============================================================

describe("findNodeById", () => {
    it("finds a deep nested node", () => {
        const tree = makeTree()
        const found = findNodeById("status", tree)
        expect(found).not.toBeNull()
        expect(found?.name).toBe("status")
    })

    it("finds root itself", () => {
        const tree = makeTree()
        const found = findNodeById("root", tree)
        expect(found?.id).toBe("root")
    })

    it("returns null for missing ID", () => {
        const tree = makeTree()
        expect(findNodeById("missing", tree)).toBeNull()
    })
})

// ============================================================
// findParentNode
// ============================================================

describe("findParentNode", () => {
    it("finds the direct parent", () => {
        const tree = makeTree()
        const parent = findParentNode("orderId", tree)
        expect(parent?.id).toBe("item")
    })

    it("returns null for root", () => {
        const tree = makeTree()
        expect(findParentNode("root", tree)).toBeNull()
    })

    it("returns null for missing node", () => {
        const tree = makeTree()
        expect(findParentNode("nothing", tree)).toBeNull()
    })
})

// ============================================================
// getAncestors
// ============================================================

describe("getAncestors", () => {
    it("returns all ancestors from root", () => {
        const tree = makeTree()
        const ancestors = getAncestors("orderId", tree)
        expect(ancestors.map((a) => a.id)).toEqual(["root", "orders", "item"])
    })

    it("returns empty for root node", () => {
        const tree = makeTree()
        expect(getAncestors("root", tree)).toEqual([])
    })

    it("returns empty for missing node", () => {
        const tree = makeTree()
        expect(getAncestors("ghost", tree)).toEqual([])
    })
})

// ============================================================
// traverseDown
// ============================================================

describe("traverseDown", () => {
    it("visits all nodes in preorder", () => {
        const tree = makeTree()
        const visited: string[] = []
        traverseDown(tree, (n) => visited.push(n.id))
        expect(visited[0]).toBe("root")
        expect(visited).toContain("orders")
        expect(visited).toContain("orderId")
        expect(visited).toContain("status")
        expect(visited).toContain("attr")
        expect(visited.length).toBe(6) // root, orders, item, orderId, status, attr
    })
})

// ============================================================
// traverseDownPPL
// ============================================================

describe("traverseDownPPL", () => {
    it("calls leaf fn for leaf nodes only", () => {
        const tree = makeTree()
        const leaves: string[] = []
        traverseDownPPL(
            tree,
            () => {},
            () => {},
            (n) => leaves.push(n.id),
        )
        expect(leaves).toContain("orderId")
        expect(leaves).toContain("status")
        expect(leaves).toContain("attr")
        expect(leaves).not.toContain("root")
    })

    it("calls preorder for non-leaf nodes", () => {
        const tree = makeTree()
        const pre: string[] = []
        traverseDownPPL(
            tree,
            (n) => pre.push(n.id),
            () => {},
            () => {},
        )
        expect(pre).toContain("root")
        expect(pre).toContain("orders")
    })
})

// ============================================================
// collectAllNodeIds
// ============================================================

describe("collectAllNodeIds", () => {
    it("collects all IDs", () => {
        const tree = makeTree()
        const ids = collectAllNodeIds(tree)
        expect(ids.size).toBe(6)
        expect(ids.has("root")).toBe(true)
        expect(ids.has("attr")).toBe(true)
    })
})

// ============================================================
// deepCopyNode / cloneNode
// ============================================================

describe("deepCopyNode", () => {
    it("produces a copy with new UUIDs", () => {
        const tree = makeTree()
        const copy = deepCopyNode(tree)
        expect(copy.id).not.toBe(tree.id)
        expect(copy.name).toBe(tree.name)
        expect(copy.children?.length).toBe(tree.children?.length)
    })

    it("all descendant IDs are new", () => {
        const tree = makeTree()
        const copy = deepCopyNode(tree)
        const origIds = collectAllNodeIds(tree)
        const copyIds = collectAllNodeIds(copy)
        for (const id of copyIds) {
            expect(origIds.has(id)).toBe(false)
        }
    })
})

describe("cloneNode", () => {
    it("preserves the same UUIDs", () => {
        const tree = makeTree()
        const clone = cloneNode(tree)
        expect(clone.id).toBe(tree.id)
        const origIds = collectAllNodeIds(tree)
        const cloneIds = collectAllNodeIds(clone)
        expect([...origIds].sort()).toEqual([...cloneIds].sort())
    })

    it("is a deep copy — does not share object references", () => {
        const tree = makeTree()
        const clone = cloneNode(tree)
        clone.name = "modified"
        expect(tree.name).toBe("root")
    })
})

// ============================================================
// createEmptyMapperState
// ============================================================

describe("createEmptyMapperState", () => {
    it("returns a valid MapperState shape", () => {
        const state = createEmptyMapperState()
        expect(state.modelVersion).toBe(1)
        expect(typeof state.id).toBe("string")
        expect(state.sourceTreeNode).not.toBeNull()
        expect(state.targetTreeNode).not.toBeNull()
        expect(state.references).toEqual([])
        expect(state.sourceInputType).toBe("JSON")
        expect(state.targetInputType).toBe("JSON")
    })

    it("accepts custom input types", () => {
        const state = createEmptyMapperState("XML", "JSON")
        expect(state.sourceInputType).toBe("XML")
        expect(state.targetInputType).toBe("JSON")
    })

    it("has default preferences", () => {
        const state = createEmptyMapperState()
        expect(state.mapperPreferences.overrideTargetValue).toBe(true)
        expect(state.mapperPreferences.debugComment).toBe(false)
    })
})

// ============================================================
// getDisplayName
// ============================================================

describe("getDisplayName", () => {
    it("returns label when set", () => {
        const node = createNode("orderId", "element", { label: "Order ID" })
        expect(getDisplayName(node)).toBe("Order ID")
    })

    it("returns name when no label", () => {
        const node = createNode("orderId", "element")
        expect(getDisplayName(node)).toBe("orderId")
    })
})

// ============================================================
// isLeaf / isRoot
// ============================================================

describe("isLeaf", () => {
    it("returns true for node with no children", () => {
        const node = createNode("leaf", "element")
        expect(isLeaf(node)).toBe(true)
    })

    it("returns true for empty children array", () => {
        const node = createNode("empty", "element", { children: [] })
        expect(isLeaf(node)).toBe(true)
    })

    it("returns false for node with children", () => {
        const tree = makeTree()
        expect(isLeaf(tree)).toBe(false)
    })
})

describe("isRoot", () => {
    it("returns true for root node", () => {
        const tree = makeTree()
        expect(isRoot(tree, tree)).toBe(true)
    })

    it("returns false for non-root node", () => {
        const tree = makeTree()
        const child = findNodeById("orders", tree)!
        expect(isRoot(child, tree)).toBe(false)
    })
})

// ============================================================
// fromParserTreeNode
// ============================================================

describe("fromParserTreeNode", () => {
    const makeParserNode = (
        type: TreeNode["type"],
        key: string,
        children?: TreeNode[],
    ): TreeNode => ({
        id: `path.${key}`,
        key,
        type,
        depth: 0,
        children,
    })

    it("converts xml-attribute to attribute", () => {
        const n = makeParserNode("xml-attribute", "code")
        const result = fromParserTreeNode(n)
        expect(result.type).toBe("attribute")
        expect(result.name).toBe("code")
    })

    it("converts xml-element to element", () => {
        const n = makeParserNode("xml-element", "order")
        expect(fromParserTreeNode(n).type).toBe("element")
    })

    it("converts object to element", () => {
        const n = makeParserNode("object", "user")
        expect(fromParserTreeNode(n).type).toBe("element")
    })

    it("converts array to array", () => {
        const n = makeParserNode("array", "items")
        expect(fromParserTreeNode(n).type).toBe("array")
    })

    it("converts primitive to element", () => {
        const n = makeParserNode("primitive", "name")
        expect(fromParserTreeNode(n).type).toBe("element")
    })

    it("assigns new UUIDs (not parser path IDs)", () => {
        const n = makeParserNode("element" as any, "x")
        const result = fromParserTreeNode(n)
        expect(result.id).not.toBe(n.id)
    })

    it("recursively converts children", () => {
        const child = makeParserNode("xml-attribute", "attr")
        const n = makeParserNode("xml-element", "root", [child])
        const result = fromParserTreeNode(n)
        expect(result.children).toHaveLength(1)
        expect(result.children![0].type).toBe("attribute")
    })
})

// ============================================================
// moveNodeUp / moveNodeDown
// ============================================================

describe("moveNodeUp", () => {
    const siblings = (): MapperTreeNode[] => [
        createNode("a", "element"),
        createNode("b", "element"),
        createNode("c", "element"),
    ]

    it("moves node up", () => {
        const s = siblings()
        const bId = s[1].id
        const result = moveNodeUp(s, bId)
        expect(result[0].id).toBe(bId)
    })

    it("does nothing for first node", () => {
        const s = siblings()
        const aId = s[0].id
        const result = moveNodeUp(s, aId)
        expect(result[0].id).toBe(aId)
    })
})

describe("moveNodeDown", () => {
    const siblings = (): MapperTreeNode[] => [
        createNode("a", "element"),
        createNode("b", "element"),
        createNode("c", "element"),
    ]

    it("moves node down", () => {
        const s = siblings()
        const bId = s[1].id
        const result = moveNodeDown(s, bId)
        expect(result[2].id).toBe(bId)
    })

    it("does nothing for last node", () => {
        const s = siblings()
        const cId = s[2].id
        const result = moveNodeDown(s, cId)
        expect(result[2].id).toBe(cId)
    })
})

// ============================================================
// groupNodes
// ============================================================

describe("groupNodes", () => {
    it("groups selected nodes under a new parent", () => {
        const tree = makeTree()
        const orderIdNode = findNodeById("orderId", tree)!
        const statusNode = findNodeById("status", tree)!
        const result = groupNodes(tree, [orderIdNode.id, statusNode.id], "fields", "element")
        const itemNode = findNodeById("item", result)!
        expect(itemNode.children).toHaveLength(2) // attr + new group
        const grouped = itemNode.children!.find((c) => c.name === "fields")
        expect(grouped).toBeDefined()
        expect(grouped?.children).toHaveLength(2)
    })
})

// ============================================================
// removeNode
// ============================================================

describe("removeNode", () => {
    it("removes a node and its descendants", () => {
        const tree = makeTree()
        const result = removeNode(tree, "orders")
        expect(findNodeById("orders", result)).toBeNull()
        expect(findNodeById("orderId", result)).toBeNull()
    })

    it("does nothing for missing nodeId", () => {
        const tree = makeTree()
        const result = removeNode(tree, "ghost")
        expect(collectAllNodeIds(result).size).toBe(6)
    })
})

// ============================================================
// insertChild
// ============================================================

describe("insertChild", () => {
    it("inserts a child under the correct parent", () => {
        const tree = makeTree()
        const newNode = createNode("newField", "element")
        const result = insertChild(tree, "item", newNode)
        const item = findNodeById("item", result)!
        expect(item.children?.some((c) => c.name === "newField")).toBe(true)
    })
})

// ============================================================
// updateNode
// ============================================================

describe("updateNode", () => {
    it("patches only the specified fields", () => {
        const tree = makeTree()
        const result = updateNode(tree, "orderId", { label: "Order ID", comment: "a comment" })
        const updated = findNodeById("orderId", result)!
        expect(updated.label).toBe("Order ID")
        expect(updated.comment).toBe("a comment")
        expect(updated.name).toBe("id") // name unchanged
    })

    it("returns unchanged tree for missing nodeId", () => {
        const tree = makeTree()
        const result = updateNode(tree, "ghost", { label: "x" })
        expect(findNodeById("root", result)?.label).toBeUndefined()
    })
})

// ============================================================
// mergeTrees
// ============================================================

describe("mergeTrees REPLACE", () => {
    it("completely replaces existing with incoming", () => {
        const existing = makeTree()
        const incoming: MapperTreeNode = { id: "new", name: "new", type: "element" }
        const result = mergeTrees(existing, incoming, "REPLACE")
        expect(result.id).toBe("new")
        expect(result.name).toBe("new")
    })
})

describe("mergeTrees ADD_ONLY", () => {
    it("adds new nodes from incoming, does not remove existing", () => {
        const existing: MapperTreeNode = {
            id: "root",
            name: "root",
            type: "element",
            children: [{ id: "a", name: "a", type: "element" }],
        }
        const incoming: MapperTreeNode = {
            id: "root",
            name: "root",
            type: "element",
            children: [
                { id: "a", name: "a", type: "element" },
                { id: "b", name: "b", type: "element" },
            ],
        }
        const result = mergeTrees(existing, incoming, "ADD_ONLY")
        expect(result.children?.map((c) => c.name)).toContain("a")
        expect(result.children?.map((c) => c.name)).toContain("b")
    })

    it("does not remove nodes absent from incoming", () => {
        const existing: MapperTreeNode = {
            id: "root",
            name: "root",
            type: "element",
            children: [
                { id: "a", name: "a", type: "element" },
                { id: "z", name: "z", type: "element" },
            ],
        }
        const incoming: MapperTreeNode = {
            id: "root",
            name: "root",
            type: "element",
            children: [{ id: "a", name: "a", type: "element" }],
        }
        const result = mergeTrees(existing, incoming, "ADD_ONLY")
        expect(result.children?.map((c) => c.name)).toContain("z")
    })
})

describe("mergeTrees DELETE_ONLY", () => {
    it("removes nodes absent from incoming", () => {
        const existing: MapperTreeNode = {
            id: "root",
            name: "root",
            type: "element",
            children: [
                { id: "a", name: "a", type: "element" },
                { id: "z", name: "z", type: "element" },
            ],
        }
        const incoming: MapperTreeNode = {
            id: "root",
            name: "root",
            type: "element",
            children: [{ id: "a", name: "a", type: "element" }],
        }
        const result = mergeTrees(existing, incoming, "DELETE_ONLY")
        expect(result.children?.map((c) => c.name)).not.toContain("z")
        expect(result.children?.map((c) => c.name)).toContain("a")
    })

    it("does not add new nodes", () => {
        const existing: MapperTreeNode = {
            id: "root",
            name: "root",
            type: "element",
            children: [{ id: "a", name: "a", type: "element" }],
        }
        const incoming: MapperTreeNode = {
            id: "root",
            name: "root",
            type: "element",
            children: [
                { id: "a", name: "a", type: "element" },
                { id: "b", name: "b", type: "element" },
            ],
        }
        const result = mergeTrees(existing, incoming, "DELETE_ONLY")
        expect(result.children?.map((c) => c.name)).not.toContain("b")
    })
})

describe("mergeTrees MERGE", () => {
    it("adds new nodes AND removes deleted nodes, keeps unchanged", () => {
        const existing: MapperTreeNode = {
            id: "root",
            name: "root",
            type: "element",
            children: [
                { id: "a", name: "a", type: "element" },
                { id: "old", name: "old", type: "element" },
            ],
        }
        const incoming: MapperTreeNode = {
            id: "root",
            name: "root",
            type: "element",
            children: [
                { id: "a", name: "a", type: "element" },
                { id: "new", name: "new", type: "element" },
            ],
        }
        const result = mergeTrees(existing, incoming, "MERGE")
        const names = result.children?.map((c) => c.name) ?? []
        expect(names).toContain("a")
        expect(names).toContain("new")
        expect(names).not.toContain("old")
    })
})

// ============================================================
// fromParserTreeNode — arrayChild normalisation
// ============================================================

describe("fromParserTreeNode - arrayChild normalisation", () => {
    it("converts array children with [N] keys to a single arrayChild node named '[]'", () => {
        const parsed = parseJSON(
            JSON.stringify({
                products: [
                    { id: 1, name: "Laptop" },
                    { id: 2, name: "Mouse" },
                ],
            }),
        )
        const root = fromParserTreeNode(parsed)

        const products = root.children?.find((n) => n.name === "products")
        expect(products).toBeDefined()
        expect(products!.type).toBe("array")

        // Should have exactly ONE child, not two ([0] and [1])
        expect(products!.children).toHaveLength(1)
        const arrayChild = products!.children![0]
        expect(arrayChild.type).toBe("arrayChild")
        expect(arrayChild.name).toBe("[]")
    })

    it("arrayChild has fields merged from all elements", () => {
        const parsed = parseJSON(
            JSON.stringify({
                items: [
                    { id: 1, price: 10 },
                    { id: 2, price: 20 },
                ],
            }),
        )
        const root = fromParserTreeNode(parsed)
        const arrayChild = root.children![0].children![0]
        const fieldNames = arrayChild.children?.map((c) => c.name) ?? []
        expect(fieldNames).toContain("id")
        expect(fieldNames).toContain("price")
    })

    it("nested arrays are also normalised to a single arrayChild", () => {
        const parsed = parseJSON(
            JSON.stringify({
                orders: [
                    { id: 1, lines: [{ sku: "A" }, { sku: "B" }] },
                    { id: 2, lines: [{ sku: "C" }] },
                ],
            }),
        )
        const root = fromParserTreeNode(parsed)
        const ordersChild = root.children![0].children![0] // arrayChild of orders
        expect(ordersChild.type).toBe("arrayChild")

        const lines = ordersChild.children?.find((n) => n.name === "lines")
        expect(lines?.type).toBe("array")
        expect(lines?.children).toHaveLength(1)
        expect(lines?.children![0].type).toBe("arrayChild")
        expect(lines?.children![0].name).toBe("[]")
    })

    it("arrayChild for array-of-primitives has no children and carries sampleValue", () => {
        const parsed = parseJSON(JSON.stringify({ tags: ["a", "b", "c"] }))
        const root = fromParserTreeNode(parsed)
        const tags = root.children![0]
        expect(tags.type).toBe("array")
        const child = tags.children![0]
        expect(child.type).toBe("arrayChild")
        expect(child.children).toBeUndefined()
        expect(child.sampleValue).toBe("a")
    })

    it("getFullPath for a node inside normalised arrayChild does not include [N] segments", () => {
        const parsed = parseJSON(JSON.stringify({ products: [{ id: 1, name: "Laptop" }] }))
        const root = fromParserTreeNode(parsed)
        const idNode = root.children![0].children![0].children!.find((n) => n.name === "id")!
        const path = getFullPath(idNode.id, root)
        // Should be "root.products.id" not "root.products.[0].id"
        expect(path).toBe("root.products.id")
        expect(path).not.toContain("[0]")
    })
})
