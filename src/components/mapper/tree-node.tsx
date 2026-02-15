import { useDraggable, useDroppable } from "@dnd-kit/core"
import {
    AtSign,
    ChevronRight,
    FileText,
    Folder,
    Hash,
    List,
    Pencil,
    Plus,
    Trash2,
    X,
} from "lucide-react"
import { useState } from "react"
import { AddNodeDialog } from "./add-node-dialog"
import { EditMappingModal } from "./edit-mapping-modal"
import type { DragData, NodeType, TreeNode as TreeNodeType } from "@/lib/mapper/types"
import { useMapper } from "@/lib/mapper/context"
import { createNewTreeNode } from "@/lib/mapper/utils"
import { cn } from "@/lib/utils"
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
} from "@/components/ui/context-menu"

interface TreeNodeProps {
    node: TreeNodeType
    side: "source" | "target"
    onNodeRef?: (id: string, el: HTMLElement | null) => void
}

const NODE_TYPES: Array<{ label: string; value: NodeType; Icon: typeof FileText }> = [
    { label: "Normal", value: "primitive", Icon: FileText },
    { label: "Array", value: "array", Icon: List },
    { label: "Object", value: "object", Icon: Folder },
]

export function TreeNode({ node, side, onNodeRef }: TreeNodeProps) {
    const {
        isExpanded: checkExpanded,
        toggleExpand,
        mappings,
        removeMappingsForNode,
        addTreeNode,
        updateMappingRule,
    } = useMapper()
    const isExpanded = checkExpanded(node.id, side)
    const hasChildren = node.children && node.children.length > 0

    // Check if this node is mapped
    const nodeMapping =
        side === "source"
            ? mappings.find((m) => m.sourceId === node.id)
            : mappings.find((m) => m.targetId === node.id)
    const isMapped = !!nodeMapping

    // Add node dialog state
    const [addDialogOpen, setAddDialogOpen] = useState(false)
    const [addPosition, setAddPosition] = useState<"above" | "below" | "inside">("below")
    const [addNodeType, setAddNodeType] = useState<NodeType>("primitive")

    // Edit mapping modal state
    const [editModalOpen, setEditModalOpen] = useState(false)

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

    const canAddInside =
        node.type === "object" || node.type === "array" || node.type === "xml-element"

    const handleAddNode = (position: "above" | "below" | "inside", type: NodeType) => {
        setAddPosition(position)
        setAddNodeType(type)
        setAddDialogOpen(true)
    }

    const handleConfirmAdd = (key: string) => {
        const newNode = createNewTreeNode(
            addPosition === "inside" ? node.id : node.id.split(".").slice(0, -1).join("."),
            key,
            addNodeType as "primitive" | "array" | "object",
            addPosition === "inside" ? node.depth + 1 : node.depth,
        )
        addTreeNode(node.id, side, addPosition, newNode)
    }

    const renderAddSubmenu = (position: "above" | "below" | "inside") => (
        <ContextMenuSub>
            <ContextMenuSubTrigger className="capitalize">
                {position === "above" && "Above"}
                {position === "below" && "Below"}
                {position === "inside" && "Inside"}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
                {NODE_TYPES.map(({ label, value, Icon }) => (
                    <ContextMenuItem key={value} onSelect={() => handleAddNode(position, value)}>
                        <Icon
                            className={cn(
                                "h-4 w-4",
                                value === "object"
                                    ? "text-secondary"
                                    : value === "array"
                                      ? "text-accent"
                                      : "text-source",
                            )}
                        />
                        {label}
                    </ContextMenuItem>
                ))}
            </ContextMenuSubContent>
        </ContextMenuSub>
    )

    return (
        <div className="select-none">
            <ContextMenu>
                <ContextMenuTrigger>
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
                </ContextMenuTrigger>

                <ContextMenuContent>
                    {/* Add Node submenu */}
                    <ContextMenuSub>
                        <ContextMenuSubTrigger>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Node
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                            {renderAddSubmenu("above")}
                            {renderAddSubmenu("below")}
                            {canAddInside && renderAddSubmenu("inside")}
                        </ContextMenuSubContent>
                    </ContextMenuSub>

                    {/* Target-only: Edit Mapping */}
                    {side === "target" && isMapped && (
                        <>
                            <ContextMenuSeparator />
                            <ContextMenuItem onSelect={() => setEditModalOpen(true)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit Mapping
                            </ContextMenuItem>
                        </>
                    )}

                    {/* Clear Mapping (both sides, only if mapped) */}
                    {isMapped && (
                        <>
                            {!(side === "target") && <ContextMenuSeparator />}
                            <ContextMenuItem
                                variant="destructive"
                                onSelect={() => removeMappingsForNode(node.id, side)}
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Clear Mapping
                            </ContextMenuItem>
                        </>
                    )}
                </ContextMenuContent>
            </ContextMenu>

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

            {/* Add Node Dialog */}
            <AddNodeDialog
                open={addDialogOpen}
                onOpenChange={setAddDialogOpen}
                position={addPosition}
                nodeType={addNodeType}
                onConfirm={handleConfirmAdd}
            />

            {/* Edit Mapping Modal */}
            {nodeMapping && (
                <EditMappingModal
                    open={editModalOpen}
                    onOpenChange={setEditModalOpen}
                    mapping={nodeMapping}
                    onSave={updateMappingRule}
                />
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
