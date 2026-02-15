import { useDraggable, useDroppable } from "@dnd-kit/core"
import { AtSign, ChevronRight, FileText, Folder, Hash, List } from "lucide-react"
import type { DragData, TreeNode as TreeNodeType } from "@/lib/mapper/types"
import { useMapper } from "@/lib/mapper/context"
import { cn } from "@/lib/utils"

interface TreeNodeProps {
    node: TreeNodeType
    side: "source" | "target"
    onNodeRef?: (id: string, el: HTMLElement | null) => void
}

export function TreeNode({ node, side, onNodeRef }: TreeNodeProps) {
    const { isExpanded: checkExpanded, toggleExpand, mappings } = useMapper()
    const isExpanded = checkExpanded(node.id, side)
    const hasChildren = node.children && node.children.length > 0

    // Check if this node is mapped
    const isMapped =
        side === "source"
            ? mappings.some((m) => m.sourceId === node.id)
            : mappings.some((m) => m.targetId === node.id)

    // Drag (source side only)
    const dragData: DragData = { nodeId: node.id, side }
    const {
        attributes: dragAttrs,
        listeners: dragListeners,
        setNodeRef: setDragRef,
        isDragging,
    } = useDraggable({
        id: `drag-${node.id}`,
        data: dragData,
        disabled: side !== "source",
    })

    // Drop (target side only)
    const { setNodeRef: setDropRef, isOver } = useDroppable({
        id: `drop-${node.id}`,
        data: { nodeId: node.id, side },
        disabled: side !== "target",
    })

    // Combined ref
    const setRef = (el: HTMLElement | null) => {
        if (side === "source") {
            setDragRef(el)
        } else {
            setDropRef(el)
        }
        onNodeRef?.(node.id, el)
    }

    const TypeIcon = getTypeIcon(node.type)

    return (
        <div className="select-none">
            <div
                ref={setRef}
                className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-sm cursor-pointer",
                    "hover:bg-muted/50 transition-colors",
                    isDragging && "opacity-50",
                    isOver && "bg-primary/20 ring-2 ring-primary",
                    isMapped && "bg-green-500/10",
                )}
                style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
                {...(side === "source" ? { ...dragAttrs, ...dragListeners } : {})}
            >
                {/* Expand/collapse chevron */}
                {hasChildren ? (
                    <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation()
                            toggleExpand(node.id, side)
                        }}
                        className="p-0.5 hover:bg-muted rounded"
                    >
                        <ChevronRight
                            className={cn(
                                "h-3.5 w-3.5 transition-transform",
                                isExpanded && "rotate-90",
                            )}
                        />
                    </button>
                ) : (
                    <span className="w-4" />
                )}

                {/* Type icon */}
                <TypeIcon className="h-4 w-4 text-muted-foreground shrink-0" />

                {/* Key name */}
                <span className="font-medium text-sm truncate">{node.key}</span>

                {/* Value preview (primitives) */}
                {node.value !== undefined && (
                    <span className="text-xs text-muted-foreground truncate ml-1">
                        : {truncateValue(node.value)}
                    </span>
                )}
            </div>

            {/* Children */}
            {hasChildren && isExpanded && (
                <div>
                    {node.children!.map((child) => (
                        <TreeNode key={child.id} node={child} side={side} onNodeRef={onNodeRef} />
                    ))}
                </div>
            )}
        </div>
    )
}

function getTypeIcon(type: TreeNodeType["type"]) {
    switch (type) {
        case "object":
        case "xml-element":
            return Folder
        case "array":
            return List
        case "primitive":
            return FileText
        case "xml-attribute":
            return AtSign
        default:
            return Hash
    }
}

function truncateValue(value: string, max = 30) {
    if (value.length <= max) return value
    return value.slice(0, max) + "..."
}
