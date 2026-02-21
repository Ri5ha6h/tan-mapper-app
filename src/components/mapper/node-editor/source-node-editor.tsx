import { useState, useRef, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useMapperStore } from "@/lib/mapper/store"
import { getFullPath } from "@/lib/mapper/node-utils"
import type { MapperTreeNode } from "@/lib/mapper/types"

interface SourceNodeEditorProps {
    node: MapperTreeNode
}

// ─── SourceNodeEditor ─────────────────────────────────────────────────────────

export function SourceNodeEditor({ node }: SourceNodeEditorProps) {
    const sourceTree = useMapperStore((s) => s.mapperState.sourceTreeNode)
    const updateSourceNode = useMapperStore((s) => s.updateSourceNode)
    const snapshot = useMapperStore((s) => s.snapshot)

    const [name, setName] = useState(node.name)
    const [value, setValue] = useState(node.value ?? "")
    const [comment, setComment] = useState(node.comment ?? "")
    const [label, setLabel] = useState(node.label ?? "")
    const [format, setFormat] = useState(node.format ?? "")

    const hasSnapshotted = useRef(false)
    const ensureSnapshot = useCallback(() => {
        if (!hasSnapshotted.current) {
            snapshot()
            hasSnapshotted.current = true
        }
    }, [snapshot])

    // Sync when node changes
    const prevNodeId = useRef(node.id)
    if (prevNodeId.current !== node.id) {
        prevNodeId.current = node.id
        hasSnapshotted.current = false
        setName(node.name)
        setValue(node.value ?? "")
        setComment(node.comment ?? "")
        setLabel(node.label ?? "")
        setFormat(node.format ?? "")
    }

    const fullPath = sourceTree ? getFullPath(node.id, sourceTree) : node.name

    return (
        <div className="flex flex-col gap-4 p-4">
            {/* Header badge */}
            <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-source/15 text-source font-medium">
                    Source Node
                </span>
                <span className="text-xs text-muted-foreground font-mono truncate" title={fullPath}>
                    {fullPath}
                </span>
            </div>

            {/* Name */}
            <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input
                    className="h-8 text-sm bg-glass-bg/50 border-glass-border"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={(e) => {
                        ensureSnapshot()
                        updateSourceNode(node.id, { name: e.target.value })
                    }}
                />
            </div>

            {/* Default value */}
            <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Default Value</Label>
                <Input
                    className="h-8 text-sm bg-glass-bg/50 border-glass-border"
                    placeholder="Optional default value"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onBlur={(e) => {
                        ensureSnapshot()
                        updateSourceNode(node.id, { value: e.target.value })
                    }}
                />
            </div>

            {/* Comment */}
            <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Comment</Label>
                <Input
                    className="h-8 text-sm bg-glass-bg/50 border-glass-border"
                    placeholder="Description or notes"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onBlur={(e) => {
                        ensureSnapshot()
                        updateSourceNode(node.id, { comment: e.target.value })
                    }}
                />
            </div>

            {/* Label */}
            <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Label</Label>
                <Input
                    className="h-8 text-sm bg-glass-bg/50 border-glass-border"
                    placeholder="Display label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    onBlur={(e) => {
                        ensureSnapshot()
                        updateSourceNode(node.id, { label: e.target.value })
                    }}
                />
            </div>

            {/* Format */}
            <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Format</Label>
                <Input
                    className="h-8 text-sm bg-glass-bg/50 border-glass-border"
                    placeholder="e.g. yyyy-MM-dd"
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    onBlur={(e) => {
                        ensureSnapshot()
                        updateSourceNode(node.id, { format: e.target.value })
                    }}
                />
            </div>

            {/* Read-only info */}
            <div className="rounded-xl bg-muted/10 border border-glass-border p-3 text-xs text-muted-foreground/60">
                Node type: <span className="font-mono text-muted-foreground">{node.type}</span>
            </div>
        </div>
    )
}
