import { useRef } from "react"
import { TreeNode } from "./tree-node"
import type { TreeNode as TreeNodeType } from "@/lib/mapper/types"
import { ScrollArea } from "@/components/ui/scroll-area"

interface TreeViewProps {
    tree: TreeNodeType | null
    side: "source" | "target"
    onNodeRefs?: (refs: Map<string, HTMLElement>) => void
}

export function TreeView({ tree, side, onNodeRefs }: TreeViewProps) {
    const nodeRefsMap = useRef(new Map<string, HTMLElement>())

    const handleNodeRef = (id: string, el: HTMLElement | null) => {
        if (el) {
            nodeRefsMap.current.set(id, el)
        } else {
            nodeRefsMap.current.delete(id)
        }
        onNodeRefs?.(nodeRefsMap.current)
    }

    if (!tree) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                No file loaded
            </div>
        )
    }

    return (
        <ScrollArea className="h-full">
            <div className="p-2">
                <TreeNode node={tree} side={side} onNodeRef={handleNodeRef} />
            </div>
        </ScrollArea>
    )
}
