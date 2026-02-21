import { useState, useMemo } from "react"
import { Search, Network } from "lucide-react"
import { cn } from "@/lib/utils"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useMapperStore } from "@/lib/mapper/store"
import type { MapperTreeNode, MapperNodeType } from "@/lib/mapper/types"

interface SourceTreePickerProps {
    open: boolean
    onClose: () => void
    onConfirm: (nodes: MapperTreeNode[]) => void
    /** false = single select (for loop conditions). Default: true */
    multiSelect?: boolean
}

// ─── Mini type icon ─────────────────────────────────────────────────────────

function MiniTypeIcon({ type }: { type: MapperNodeType }) {
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
                "inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0",
                "text-[9px] font-mono font-semibold",
                className,
            )}
        >
            {label}
        </span>
    )
}

// ─── Flat list row ───────────────────────────────────────────────────────────

interface FlatNode {
    node: MapperTreeNode
    depth: number
    path: string
}

function buildFlatList(tree: MapperTreeNode): FlatNode[] {
    const items: FlatNode[] = []
    function walk(node: MapperTreeNode, depth: number, pathParts: string[]) {
        const part = node.type === "arrayChild" ? "[]" : node.name
        const newPath = [...pathParts, part]
        items.push({ node, depth, path: newPath.join(".") })
        if (node.children) {
            for (const child of node.children) {
                walk(child, depth + 1, newPath)
            }
        }
    }
    walk(tree, 0, [])
    return items
}

// ─── SourceTreePicker ────────────────────────────────────────────────────────

export function SourceTreePicker({
    open,
    onClose,
    onConfirm,
    multiSelect = true,
}: SourceTreePickerProps) {
    const sourceTree = useMapperStore((s) => s.mapperState.sourceTreeNode)
    const [search, setSearch] = useState("")
    const [selected, setSelected] = useState<Set<string>>(new Set())
    // Build flat list and filter
    const allItems = useMemo(() => {
        if (!sourceTree) return []
        return buildFlatList(sourceTree)
    }, [sourceTree])

    const filteredItems = useMemo(() => {
        if (!search.trim()) return allItems
        const q = search.toLowerCase()
        return allItems.filter(
            (item) =>
                item.node.name.toLowerCase().includes(q) || item.path.toLowerCase().includes(q),
        )
    }, [allItems, search])

    const toggleSelected = (nodeId: string) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(nodeId)) {
                next.delete(nodeId)
            } else {
                if (!multiSelect) {
                    next.clear()
                }
                next.add(nodeId)
            }
            return next
        })
    }

    const handleConfirm = () => {
        const selectedNodes = allItems
            .filter((item) => selected.has(item.node.id))
            .map((item) => item.node)
        onConfirm(selectedNodes)
        setSelected(new Set())
        setSearch("")
        onClose()
    }

    const handleClose = () => {
        setSelected(new Set())
        setSearch("")
        onClose()
    }

    return (
        <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
            <DialogContent className="max-w-md w-full flex flex-col max-h-[75vh]">
                <DialogHeader>
                    <DialogTitle>
                        {multiSelect ? "Select Source Node(s)" : "Select Source Node"}
                    </DialogTitle>
                </DialogHeader>

                {/* Search */}
                <div className="relative shrink-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                        className="pl-9 h-8 text-sm"
                        placeholder="Filter nodes..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        autoFocus
                    />
                </div>

                {/* Tree list */}
                <ScrollArea className="flex-1 min-h-0 border border-glass-border rounded-xl overflow-hidden">
                    {!sourceTree ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground/50">
                            <Network className="h-8 w-8" />
                            <p className="text-xs">No source tree loaded</p>
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground/50">
                            <p className="text-xs">No matching nodes</p>
                        </div>
                    ) : (
                        <div className="p-1">
                            {filteredItems.map(({ node, depth, path }) => {
                                const isSelected = selected.has(node.id)
                                return (
                                    <button
                                        key={node.id}
                                        type="button"
                                        className={cn(
                                            "w-full flex items-center gap-2 px-2 py-1 rounded-lg text-left",
                                            "text-xs transition-colors",
                                            isSelected
                                                ? "bg-source/15 text-source"
                                                : "hover:bg-muted/40 text-foreground",
                                        )}
                                        style={{ paddingLeft: `${depth * 12 + 8}px` }}
                                        onClick={() => toggleSelected(node.id)}
                                    >
                                        <MiniTypeIcon type={node.type} />
                                        <span className="font-medium truncate">
                                            {node.type === "arrayChild" ? "[]" : node.name}
                                        </span>
                                        {search && (
                                            <span className="ml-auto text-muted-foreground/50 text-[10px] truncate max-w-28">
                                                {path}
                                            </span>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </ScrollArea>

                <DialogFooter>
                    <div className="flex items-center gap-2 w-full">
                        <span className="text-xs text-muted-foreground flex-1">
                            {selected.size > 0 ? (
                                <span className="text-source">
                                    {selected.size} node{selected.size > 1 ? "s" : ""} selected
                                </span>
                            ) : multiSelect ? (
                                "Click to select, Ctrl+Click for multi-select"
                            ) : (
                                "Click a node to select"
                            )}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-full"
                            onClick={handleClose}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            className="rounded-full"
                            disabled={selected.size === 0}
                            onClick={handleConfirm}
                        >
                            Confirm
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
