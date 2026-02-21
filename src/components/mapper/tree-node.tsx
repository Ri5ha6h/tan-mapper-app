import { useDraggable, useDroppable } from "@dnd-kit/core"
import { ChevronRight, Link2 } from "lucide-react"
import type { DragData, MapperNodeType, MapperTreeNode } from "@/lib/mapper/types"
import { useMapperStore } from "@/lib/mapper/store"
import { cn } from "@/lib/utils"

interface TreeNodeProps {
    node: MapperTreeNode
    side: "source" | "target"
    onNodeRef?: (id: string, el: HTMLElement | null) => void
    expandedNodes: Set<string>
    onToggleExpand: (id: string) => void
    selectedNodeId: string | null
    depth?: number
}

// ─── Type Icon ─────────────────────────────────────────────────────────────────

function NodeTypeIcon({ type }: { type: MapperNodeType }) {
    const config: Record<MapperNodeType, { label: string; className: string }> = {
        element: { label: "{}", className: "bg-secondary/20 text-secondary" },
        array: { label: "[]", className: "bg-accent/20 text-accent" },
        arrayChild: { label: "·", className: "bg-accent/15 text-accent/70" },
        attribute: { label: "@", className: "bg-amber-500/20 text-amber-400" },
        code: { label: "</>", className: "bg-primary/20 text-primary" },
    }
    const { label, className } = config[type] ?? config.element
    return (
        <span
            className={cn(
                "inline-flex items-center justify-center w-5 h-5 rounded-full",
                "text-[10px] font-mono font-semibold shrink-0",
                className,
            )}
        >
            {label}
        </span>
    )
}

// ─── TreeNode ──────────────────────────────────────────────────────────────────

export function TreeNode({
    node,
    side,
    onNodeRef,
    expandedNodes,
    onToggleExpand,
    selectedNodeId,
    depth = 0,
}: TreeNodeProps) {
    const clearNodeMappings = useMapperStore((s) => s.clearNodeMappings)
    const selectSourceNode = useMapperStore((s) => s.selectSourceNode)
    const selectTargetNode = useMapperStore((s) => s.selectTargetNode)

    const isExpanded = expandedNodes.has(node.id)
    const hasChildren = !!node.children && node.children.length > 0
    const isSelected = selectedNodeId === node.id

    // Mapping indicators (target side only)
    const isMapped = side === "target" && !!node.sourceReferences?.length
    const hasLoopReference = side === "target" && !!node.loopReference

    // ─── Drag (source side only) ────────────────────────────────────────────────
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

    // ─── Drop (target side only) ────────────────────────────────────────────────
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

    const handleRowClick = () => {
        if (side === "source") {
            selectSourceNode(node.id)
        } else {
            selectTargetNode(node.id)
        }
    }

    return (
        <div className="select-none">
            {/* Node row */}
            <div
                ref={setRef}
                className={cn(
                    "flex items-center gap-1.5 pr-3 py-1 rounded-full cursor-pointer",
                    "hover:bg-muted/40 transition-all duration-150",
                    isDragging && "opacity-50",
                    isOver && "bg-target/10 ring-2 ring-target/50 scale-[1.02]",
                    isMapped && "animate-mapped-glow",
                    isSelected && side === "source" && "bg-source/10 ring-1 ring-source/30",
                    isSelected && side === "target" && "bg-target/10 ring-1 ring-target/30",
                )}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={handleRowClick}
                {...(side === "source" ? { ...dragAttrs, ...dragListeners } : {})}
            >
                {/* Expand/collapse chevron */}
                {hasChildren ? (
                    <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation()
                            onToggleExpand(node.id)
                        }}
                        className="p-0.5 hover:bg-muted/50 rounded-full shrink-0"
                    >
                        <ChevronRight
                            className={cn(
                                "h-3.5 w-3.5 transition-transform duration-200 text-muted-foreground",
                                isExpanded && "rotate-90",
                            )}
                        />
                    </button>
                ) : (
                    <span className="w-4 shrink-0" />
                )}

                {/* Type icon */}
                <NodeTypeIcon type={node.type} />

                {/* Node name */}
                <span
                    className={cn(
                        "font-medium text-sm truncate flex-1",
                        node.type === "code" && "italic text-primary/80",
                    )}
                >
                    {node.label ?? node.name}
                </span>

                {/* Value preview */}
                {node.value && (
                    <span className="text-xs text-muted-foreground/70 truncate ml-1 max-w-[80px] hidden sm:block">
                        : {node.value.length > 20 ? node.value.slice(0, 20) + "…" : node.value}
                    </span>
                )}

                {/* Mapped glow dot (target only) */}
                {isMapped && (
                    <span className="h-1.5 w-1.5 rounded-full bg-mapped shrink-0 ml-auto" />
                )}

                {/* Loop indicator (target only) */}
                {hasLoopReference && <Link2 className="h-3 w-3 text-accent shrink-0 ml-1" />}

                {/* Unlink button for mapped target nodes */}
                {isMapped && (
                    <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation()
                            clearNodeMappings(node.id)
                        }}
                        className={cn(
                            "shrink-0 h-4 w-4 ml-1 rounded-full",
                            "flex items-center justify-center",
                            "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
                            "transition-colors",
                        )}
                        title="Clear mapping"
                    >
                        ×
                    </button>
                )}
            </div>

            {/* Children with CSS grid transition */}
            {hasChildren && (
                <div
                    className="grid transition-[grid-template-rows] duration-200 ease-out"
                    style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
                >
                    <div className="overflow-hidden">
                        {node.children!.map((child) => (
                            <TreeNode
                                key={child.id}
                                node={child}
                                side={side}
                                onNodeRef={onNodeRef}
                                expandedNodes={expandedNodes}
                                onToggleExpand={onToggleExpand}
                                selectedNodeId={selectedNodeId}
                                depth={depth + 1}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
