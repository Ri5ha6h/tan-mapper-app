import { useState, useRef, useEffect } from "react"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import { ChevronRight, Link2, MoreHorizontal } from "lucide-react"
import type { DragData, MapperNodeType, MapperTreeNode } from "@/lib/mapper/types"
import { useMapperStore } from "@/lib/mapper/store"
import { getFullPath } from "@/lib/mapper/node-utils"
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

// ─── Inline rename input ────────────────────────────────────────────────────────

interface RenameInputProps {
    initialValue: string
    onCommit: (name: string) => void
    onCancel: () => void
}

function RenameInput({ initialValue, onCommit, onCancel }: RenameInputProps) {
    const [val, setVal] = useState(initialValue)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        inputRef.current?.select()
    }, [])

    return (
        <input
            ref={inputRef}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => {
                const trimmed = val.trim()
                if (trimmed && trimmed !== initialValue) onCommit(trimmed)
                else onCancel()
            }}
            onKeyDown={(e) => {
                if (e.key === "Enter") {
                    e.preventDefault()
                    const trimmed = val.trim()
                    if (trimmed) onCommit(trimmed)
                    else onCancel()
                } else if (e.key === "Escape") {
                    onCancel()
                }
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
                "flex-1 min-w-0 bg-glass-bg border border-primary/50 rounded-md",
                "px-1.5 py-0 text-sm font-medium outline-none text-foreground",
            )}
            autoFocus
        />
    )
}

// ─── Add Node inline dialog ─────────────────────────────────────────────────────

type AddNodeMode =
    | { kind: "child"; parentId: string }
    | { kind: "sibling"; siblingId: string; position: "above" | "below" }

interface AddNodeDialogProps {
    mode: AddNodeMode
    side: "source" | "target"
    defaultType?: MapperNodeType
    onDone: () => void
}

function AddNodeDialog({ mode, side, defaultType, onDone }: AddNodeDialogProps) {
    const addChildNode = useMapperStore((s) => s.addChildNode)
    const addSiblingNode = useMapperStore((s) => s.addSiblingNode)
    const snapshot = useMapperStore((s) => s.snapshot)
    const [name, setName] = useState("")
    const [type, setType] = useState<MapperNodeType>(defaultType ?? "element")
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const typeOptions: Array<{ value: MapperNodeType; label: string }> = [
        { value: "element", label: "Element {}" },
        { value: "array", label: "Array []" },
        { value: "arrayChild", label: "Array Child ·" },
        { value: "attribute", label: "Attribute @" },
        { value: "code", label: "Code </>" },
    ]

    const title =
        mode.kind === "child"
            ? "Add Child Node"
            : mode.position === "above"
              ? "Add Node Above"
              : "Add Node Below"

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        const trimmed = name.trim()
        if (!trimmed) return
        snapshot()
        if (mode.kind === "child") {
            addChildNode(mode.parentId, side, type, trimmed)
        } else {
            addSiblingNode(mode.siblingId, side, type, trimmed, mode.position)
        }
        onDone()
    }

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={onDone}
        >
            <div
                className="bg-glass-bg backdrop-blur-xl border border-glass-border rounded-2xl shadow-2xl w-[340px] p-5 animate-modal-enter"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="text-base font-semibold tracking-tight mb-4">{title}</h3>
                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-muted-foreground font-medium">Name</label>
                        <input
                            ref={inputRef}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. fieldName"
                            className="h-8 w-full rounded-lg border border-glass-border bg-glass-bg/50 px-3 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 text-foreground placeholder:text-muted-foreground"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-muted-foreground font-medium">Type</label>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value as MapperNodeType)}
                            className="h-8 w-full rounded-lg border border-glass-border bg-glass-bg/50 px-3 text-sm outline-none focus:border-primary/50 text-foreground"
                        >
                            {typeOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={onDone}
                            className="h-8 px-4 rounded-full text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!name.trim()}
                            className="h-8 px-4 rounded-full text-sm bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity font-medium"
                        >
                            Add
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ─── Type icon label helpers for menus ─────────────────────────────────────────

const TYPE_ICON_LABELS: Array<{
    type: MapperNodeType
    icon: string
    iconClass: string
    label: string
}> = [
    { type: "element", icon: "{}", iconClass: "text-secondary", label: "Element" },
    { type: "array", icon: "[]", iconClass: "text-accent", label: "Array" },
    { type: "arrayChild", icon: "·", iconClass: "text-accent/70", label: "Array Child" },
    { type: "attribute", icon: "@", iconClass: "text-amber-400", label: "Attribute" },
    { type: "code", icon: "</>", iconClass: "text-primary", label: "Code Node" },
]

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
    const deleteNodes = useMapperStore((s) => s.deleteNodes)
    const updateNodeFields = useMapperStore((s) => s.updateNodeFields)
    const snapshot = useMapperStore((s) => s.snapshot)
    const mapperState = useMapperStore((s) => s.mapperState)

    const [isRenaming, setIsRenaming] = useState(false)
    const [addNodeMode, setAddNodeMode] = useState<AddNodeMode | null>(null)
    const [addNodeDefaultType, setAddNodeDefaultType] = useState<MapperNodeType | undefined>()

    const isExpanded = expandedNodes.has(node.id)
    const hasChildren = !!node.children && node.children.length > 0
    const isSelected = selectedNodeId === node.id

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

    const setRef = (el: HTMLElement | null) => {
        if (side === "source") setDragRef(el)
        else setDropRef(el)
        onNodeRef?.(node.id, el)
    }

    const handleRowClick = () => {
        if (side === "source") selectSourceNode(node.id)
        else selectTargetNode(node.id)
    }

    const handleCopyPath = () => {
        const tree = side === "source" ? mapperState.sourceTreeNode : mapperState.targetTreeNode
        if (!tree) return
        const path = getFullPath(node.id, tree)
        navigator.clipboard.writeText(path).catch(() => {})
    }

    const handleDelete = () => {
        snapshot()
        deleteNodes([node.id], side)
    }

    const handleRename = (newName: string) => {
        snapshot()
        updateNodeFields(node.id, side, { name: newName })
        setIsRenaming(false)
    }

    const handleOpenAddChild = (defaultType?: MapperNodeType) => {
        setAddNodeDefaultType(defaultType)
        setAddNodeMode({ kind: "child", parentId: node.id })
    }

    const handleOpenAddSibling = (position: "above" | "below", defaultType?: MapperNodeType) => {
        setAddNodeDefaultType(defaultType)
        setAddNodeMode({ kind: "sibling", siblingId: node.id, position })
    }

    const rowClasses = cn(
        "flex items-center gap-1.5 pr-1 py-1 rounded-full cursor-pointer",
        "hover:bg-muted/40 transition-all duration-150",
        isDragging && "opacity-50",
        isOver && "bg-target/10 ring-2 ring-target/50 scale-[1.02]",
        isMapped && "animate-mapped-glow",
        isSelected && side === "source" && "bg-source/10 ring-1 ring-source/30",
        isSelected && side === "target" && "bg-target/10 ring-1 ring-target/30",
    )
    const rowStyle = { paddingLeft: `${depth * 16 + 8}px` }

    return (
        <div className="select-none group/node">
            {addNodeMode && (
                <AddNodeDialog
                    mode={addNodeMode}
                    side={side}
                    defaultType={addNodeDefaultType}
                    onDone={() => setAddNodeMode(null)}
                />
            )}

            {/* Right-click context menu wrapper */}
            <ContextMenu>
                <ContextMenuTrigger>
                    <div
                        ref={setRef}
                        className={rowClasses}
                        style={rowStyle}
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

                        {/* Node name (or rename input) */}
                        {isRenaming ? (
                            <RenameInput
                                initialValue={node.name}
                                onCommit={handleRename}
                                onCancel={() => setIsRenaming(false)}
                            />
                        ) : (
                            <span
                                className={cn(
                                    "font-medium text-sm truncate flex-1",
                                    node.type === "code" && "italic text-primary/80",
                                )}
                            >
                                {node.label ?? node.name}
                            </span>
                        )}

                        {/* Value preview — sampleValue from parsed source file, or value expression on target */}
                        {!isRenaming && (node.sampleValue ?? node.value) && (
                            <span className="text-xs text-muted-foreground/70 truncate ml-1 max-w-[80px] hidden sm:block">
                                :{" "}
                                {(() => {
                                    const display = node.sampleValue ?? node.value ?? ""
                                    return display.length > 20
                                        ? display.slice(0, 20) + "…"
                                        : display
                                })()}
                            </span>
                        )}

                        {/* Mapped glow dot (target only) */}
                        {isMapped && (
                            <span className="h-1.5 w-1.5 rounded-full bg-mapped shrink-0 ml-auto" />
                        )}

                        {/* Loop indicator (target only) */}
                        {hasLoopReference && (
                            <Link2 className="h-3 w-3 text-accent shrink-0 ml-1" />
                        )}

                        {/* Hover ⋯ dropdown button */}
                        {!isRenaming && (
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    className={cn(
                                        "shrink-0 h-5 w-5 rounded-full ml-1",
                                        "flex items-center justify-center",
                                        "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                                        "opacity-0 group-hover/node:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100",
                                        "transition-opacity outline-none",
                                    )}
                                    title="Node actions"
                                >
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" side="bottom" sideOffset={4}>
                                    <DropdownMenuSub>
                                        <DropdownMenuSubTrigger>
                                            Add Child Node
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent>
                                            {TYPE_ICON_LABELS.map(
                                                ({ type, icon, iconClass, label }) => (
                                                    <DropdownMenuItem
                                                        key={type}
                                                        onClick={() => handleOpenAddChild(type)}
                                                    >
                                                        <span
                                                            className={cn(
                                                                "w-5 font-mono text-xs font-semibold",
                                                                iconClass,
                                                            )}
                                                        >
                                                            {icon}
                                                        </span>
                                                        {label}
                                                    </DropdownMenuItem>
                                                ),
                                            )}
                                        </DropdownMenuSubContent>
                                    </DropdownMenuSub>

                                    <DropdownMenuSub>
                                        <DropdownMenuSubTrigger>Add Node</DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent>
                                            <DropdownMenuSub>
                                                <DropdownMenuSubTrigger>
                                                    Above
                                                </DropdownMenuSubTrigger>
                                                <DropdownMenuSubContent>
                                                    {TYPE_ICON_LABELS.map(
                                                        ({ type, icon, iconClass, label }) => (
                                                            <DropdownMenuItem
                                                                key={type}
                                                                onClick={() =>
                                                                    handleOpenAddSibling(
                                                                        "above",
                                                                        type,
                                                                    )
                                                                }
                                                            >
                                                                <span
                                                                    className={cn(
                                                                        "w-5 font-mono text-xs font-semibold",
                                                                        iconClass,
                                                                    )}
                                                                >
                                                                    {icon}
                                                                </span>
                                                                {label}
                                                            </DropdownMenuItem>
                                                        ),
                                                    )}
                                                </DropdownMenuSubContent>
                                            </DropdownMenuSub>
                                            <DropdownMenuSub>
                                                <DropdownMenuSubTrigger>
                                                    Below
                                                </DropdownMenuSubTrigger>
                                                <DropdownMenuSubContent>
                                                    {TYPE_ICON_LABELS.map(
                                                        ({ type, icon, iconClass, label }) => (
                                                            <DropdownMenuItem
                                                                key={type}
                                                                onClick={() =>
                                                                    handleOpenAddSibling(
                                                                        "below",
                                                                        type,
                                                                    )
                                                                }
                                                            >
                                                                <span
                                                                    className={cn(
                                                                        "w-5 font-mono text-xs font-semibold",
                                                                        iconClass,
                                                                    )}
                                                                >
                                                                    {icon}
                                                                </span>
                                                                {label}
                                                            </DropdownMenuItem>
                                                        ),
                                                    )}
                                                </DropdownMenuSubContent>
                                            </DropdownMenuSub>
                                        </DropdownMenuSubContent>
                                    </DropdownMenuSub>

                                    <DropdownMenuItem onClick={() => setIsRenaming(true)}>
                                        Rename
                                    </DropdownMenuItem>

                                    <DropdownMenuItem onClick={handleCopyPath}>
                                        Copy Path
                                    </DropdownMenuItem>

                                    {side === "target" && isMapped && (
                                        <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onClick={() => clearNodeMappings(node.id)}
                                            >
                                                Clear Mappings
                                            </DropdownMenuItem>
                                        </>
                                    )}

                                    <DropdownMenuSeparator />

                                    <DropdownMenuItem variant="destructive" onClick={handleDelete}>
                                        Delete Node
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}

                        {/* Unlink × button for mapped target nodes */}
                        {isMapped && (
                            <button
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    clearNodeMappings(node.id)
                                }}
                                className={cn(
                                    "shrink-0 h-4 w-4 ml-1 mr-2 rounded-full",
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
                </ContextMenuTrigger>

                {/* Right-click context menu content */}
                <ContextMenuContent>
                    <ContextMenuSub>
                        <ContextMenuSubTrigger>Add Child Node</ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                            {TYPE_ICON_LABELS.map(({ type, icon, iconClass, label }) => (
                                <ContextMenuItem
                                    key={type}
                                    onClick={() => handleOpenAddChild(type)}
                                >
                                    <span
                                        className={cn(
                                            "w-5 font-mono text-xs font-semibold",
                                            iconClass,
                                        )}
                                    >
                                        {icon}
                                    </span>
                                    {label}
                                </ContextMenuItem>
                            ))}
                        </ContextMenuSubContent>
                    </ContextMenuSub>

                    <ContextMenuSub>
                        <ContextMenuSubTrigger>Add Node</ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                            <ContextMenuSub>
                                <ContextMenuSubTrigger>Above</ContextMenuSubTrigger>
                                <ContextMenuSubContent>
                                    {TYPE_ICON_LABELS.map(({ type, icon, iconClass, label }) => (
                                        <ContextMenuItem
                                            key={type}
                                            onClick={() => handleOpenAddSibling("above", type)}
                                        >
                                            <span
                                                className={cn(
                                                    "w-5 font-mono text-xs font-semibold",
                                                    iconClass,
                                                )}
                                            >
                                                {icon}
                                            </span>
                                            {label}
                                        </ContextMenuItem>
                                    ))}
                                </ContextMenuSubContent>
                            </ContextMenuSub>
                            <ContextMenuSub>
                                <ContextMenuSubTrigger>Below</ContextMenuSubTrigger>
                                <ContextMenuSubContent>
                                    {TYPE_ICON_LABELS.map(({ type, icon, iconClass, label }) => (
                                        <ContextMenuItem
                                            key={type}
                                            onClick={() => handleOpenAddSibling("below", type)}
                                        >
                                            <span
                                                className={cn(
                                                    "w-5 font-mono text-xs font-semibold",
                                                    iconClass,
                                                )}
                                            >
                                                {icon}
                                            </span>
                                            {label}
                                        </ContextMenuItem>
                                    ))}
                                </ContextMenuSubContent>
                            </ContextMenuSub>
                        </ContextMenuSubContent>
                    </ContextMenuSub>

                    <ContextMenuItem onClick={() => setIsRenaming(true)}>Rename</ContextMenuItem>

                    <ContextMenuItem onClick={handleCopyPath}>Copy Path</ContextMenuItem>

                    {side === "target" && isMapped && (
                        <>
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={() => clearNodeMappings(node.id)}>
                                Clear Mappings
                            </ContextMenuItem>
                        </>
                    )}

                    <ContextMenuSeparator />

                    <ContextMenuItem variant="destructive" onClick={handleDelete}>
                        Delete Node
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

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
