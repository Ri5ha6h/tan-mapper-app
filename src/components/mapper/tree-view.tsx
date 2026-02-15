import { useRef } from "react"
import { FileText } from "lucide-react"
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
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground animate-fade-in-up">
                <div className="rounded-2xl bg-muted/30 p-4 mb-3">
                    <FileText className="h-8 w-8 opacity-40" />
                </div>
                <span className="text-sm">No file loaded</span>
            </div>
        )
    }

    return (
        <ScrollArea className="h-full">
            <div className="p-3">
                <TreeNode node={tree} side={side} onNodeRef={handleNodeRef} />
            </div>
        </ScrollArea>
    )
}
