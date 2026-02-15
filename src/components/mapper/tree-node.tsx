import { useDraggable, useDroppable } from "@dnd-kit/core"
import { AtSign, ChevronRight, FileText, Folder, Hash, List, X } from "lucide-react"
import type { DragData, TreeNode as TreeNodeType } from "@/lib/mapper/types"
import { useMapper } from "@/lib/mapper/context"
import { cn } from "@/lib/utils"

interface TreeNodeProps {
    node: TreeNodeType
    side: "source" | "target"
    onNodeRef?: (id: string, el: HTMLElement | null) => void
}

export function TreeNode({ node, side, onNodeRef }: TreeNodeProps) {
    const { isExpanded: checkExpanded, toggleExpand, mappings, removeMappingsForNode } = useMapper()
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

    const { icon: TypeIcon, colorClass: iconColor } = getTypeIcon(node.type)

    return (
        <div className="select-none">
            <div
                ref={setRef}
                className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer",
                    "hover:bg-muted/40 hover:scale-[1.01] transition-all duration-150",
                    isDragging && "opacity-50",
                    isOver && "bg-target/10 ring-2 ring-target/50 scale-[1.02]",
                    isMapped && "bg-mapped/10 animate-mapped-glow",
                )}
                style={{ paddingLeft: `${node.depth * 20 + 12}px` }}
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
                        className="p-0.5 hover:bg-muted/50 rounded-full"
                    >
                        <ChevronRight
                            className={cn(
                                "h-3.5 w-3.5 transition-transform duration-200",
                                isExpanded && "rotate-90",
                            )}
                        />
                    </button>
                ) : (
                    <span className="w-4" />
                )}

                {/* Type icon */}
                <TypeIcon className={cn("h-4 w-4 shrink-0", iconColor)} />

                {/* Key name */}
                <span className="font-medium text-sm truncate">{node.key}</span>

                {/* Value preview (primitives) */}
                {node.value !== undefined && (
                    <span className="text-xs text-muted-foreground truncate ml-1">
                        : {truncateValue(node.value)}
                    </span>
                )}

                {/* Unlink button (mapped nodes only) */}
                {isMapped && (
                    <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation()
                            removeMappingsForNode(node.id, side)
                        }}
                        className="ml-auto h-5 w-5 shrink-0 flex items-center justify-center rounded-full hover:bg-destructive/20 text-mapped transition-colors"
                    >
                        <X className="h-3 w-3" />
                    </button>
                )}
            </div>

            {/* Children with CSS grid transition */}
            {hasChildren && (
                <div
                    className="grid transition-[grid-template-rows] duration-200 ease-out"
                    style={{
                        gridTemplateRows: isExpanded ? "1fr" : "0fr",
                    }}
                >
                    <div className="overflow-hidden">
                        {node.children!.map((child) => (
                            <TreeNode
                                key={child.id}
                                node={child}
                                side={side}
                                onNodeRef={onNodeRef}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

function getTypeIcon(type: TreeNodeType["type"]) {
    switch (type) {
        case "object":
        case "xml-element":
            return { icon: Folder, colorClass: "text-secondary" }
        case "array":
            return { icon: List, colorClass: "text-accent" }
        case "primitive":
            return { icon: FileText, colorClass: "text-source" }
        case "xml-attribute":
            return { icon: AtSign, colorClass: "text-chart-5" }
        default:
            return { icon: Hash, colorClass: "text-muted-foreground" }
    }
}

function truncateValue(value: string, max = 30) {
    if (value.length <= max) return value
    return value.slice(0, max) + "..."
}
