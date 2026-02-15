import { useState } from "react"
import { FileText, Folder, List } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { NodeType } from "@/lib/mapper/types"
import { cn } from "@/lib/utils"

interface AddNodeDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    position: "above" | "below" | "inside"
    nodeType: NodeType
    onConfirm: (key: string) => void
}

const typeLabels: Record<string, { label: string; icon: typeof FileText }> = {
    primitive: { label: "Normal", icon: FileText },
    array: { label: "Array", icon: List },
    object: { label: "Object", icon: Folder },
}

export function AddNodeDialog({
    open,
    onOpenChange,
    position,
    nodeType,
    onConfirm,
}: AddNodeDialogProps) {
    const [key, setKey] = useState("")

    if (!open) return null

    const typeInfo = typeLabels[nodeType] ?? typeLabels.primitive
    const TypeIcon = typeInfo.icon

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        const trimmed = key.trim()
        if (!trimmed) return
        onConfirm(trimmed)
        setKey("")
        onOpenChange(false)
    }

    const handleClose = () => {
        setKey("")
        onOpenChange(false)
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={handleClose}
        >
            <div
                className="bg-glass-bg backdrop-blur-xl border border-glass-border rounded-2xl shadow-xl w-[360px] max-w-[90vw] p-6 animate-modal-enter"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="text-lg font-semibold tracking-tight mb-4">Add Node</h3>

                <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
                    <span className="capitalize">{position}</span>
                    <span>&middot;</span>
                    <TypeIcon className={cn("h-4 w-4", nodeType === "object" ? "text-secondary" : nodeType === "array" ? "text-accent" : "text-source")} />
                    <span>{typeInfo.label}</span>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="space-y-2 mb-6">
                        <Label htmlFor="node-key">Key Name</Label>
                        <Input
                            id="node-key"
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            placeholder="e.g. fieldName"
                            autoFocus
                        />
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleClose}
                            className="rounded-full"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={!key.trim()}
                            className="rounded-full"
                        >
                            Add
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    )
}
