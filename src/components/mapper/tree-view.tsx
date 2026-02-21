import { useRef, useState, useCallback, useEffect } from "react"
import { Network } from "lucide-react"
import { TreeNode } from "./tree-node"
import type { MapperTreeNode } from "@/lib/mapper/types"
import { useMapperStore } from "@/lib/mapper/store"
import { ScrollArea } from "@/components/ui/scroll-area"
import { traverseDown } from "@/lib/mapper/node-utils"

interface TreeViewProps {
    tree: MapperTreeNode | null
    side: "source" | "target"
    onNodeRefs?: (refs: Map<string, HTMLElement>) => void
}

/** Auto-expand the first `depth` levels of the tree (Vaadin: expandRecursively(..., 2)). */
function buildInitialExpanded(tree: MapperTreeNode, levels = 2): Set<string> {
    const expanded = new Set<string>()

    function walk(node: MapperTreeNode, currentLevel: number) {
        if (currentLevel >= levels) return
        if (node.children && node.children.length > 0) {
            expanded.add(node.id)
            for (const child of node.children) {
                walk(child, currentLevel + 1)
            }
        }
    }

    walk(tree, 0)
    return expanded
}

export function TreeView({ tree, side, onNodeRefs }: TreeViewProps) {
    const nodeRefsMap = useRef(new Map<string, HTMLElement>())
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

    const selectedSourceNodeId = useMapperStore((s) => s.selectedSourceNodeId)
    const selectedTargetNodeId = useMapperStore((s) => s.selectedTargetNodeId)
    const selectedNodeId = side === "source" ? selectedSourceNodeId : selectedTargetNodeId

    // Auto-expand first 2 levels when tree loads
    useEffect(() => {
        if (tree) {
            setExpandedNodes(buildInitialExpanded(tree, 2))
        } else {
            setExpandedNodes(new Set())
        }
    }, [tree?.id]) // Only re-run when tree root changes (new file loaded)

    const handleNodeRef = useCallback(
        (id: string, el: HTMLElement | null) => {
            if (el) {
                nodeRefsMap.current.set(id, el)
            } else {
                nodeRefsMap.current.delete(id)
            }
            onNodeRefs?.(nodeRefsMap.current)
        },
        [onNodeRefs],
    )

    const handleToggleExpand = useCallback((id: string) => {
        setExpandedNodes((prev) => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }, [])

    const handleExpandAll = useCallback(() => {
        if (!tree) return
        const all = new Set<string>()
        traverseDown(tree, (n) => {
            if (n.children && n.children.length > 0) all.add(n.id)
        })
        setExpandedNodes(all)
    }, [tree])

    const handleCollapseAll = useCallback(() => {
        setExpandedNodes(new Set())
    }, [])

    if (!tree) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground animate-fade-in-up">
                <div className="rounded-2xl bg-muted/30 p-4 mb-3">
                    <Network className="h-8 w-8 opacity-40" />
                </div>
                <span className="text-sm">No file loaded</span>
                <span className="text-xs text-muted-foreground/60 mt-1">
                    Upload a JSON or XML file
                </span>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full">
            {/* Expand/Collapse controls */}
            <div className="flex items-center gap-2 px-3 py-1 border-b border-glass-border/50 bg-muted/10">
                <button
                    onClick={handleExpandAll}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                    Expand all
                </button>
                <span className="text-muted-foreground/40 text-xs">·</span>
                <button
                    onClick={handleCollapseAll}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                    Collapse all
                </button>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-2">
                    <TreeNode
                        node={tree}
                        side={side}
                        onNodeRef={handleNodeRef}
                        expandedNodes={expandedNodes}
                        onToggleExpand={handleToggleExpand}
                        selectedNodeId={selectedNodeId}
                        depth={0}
                    />
                </div>
            </ScrollArea>
        </div>
    )
}
