import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { useMapperStore } from "@/lib/mapper/store"
import { countNodes } from "@/lib/mapper/persistence"
import { saveMap } from "@/lib/mapper/persistence.server"

interface SaveAsDialogProps {
    open: boolean
    onClose: () => void
}

export function SaveAsDialog({ open, onClose }: SaveAsDialogProps) {
    const mapperState = useMapperStore((s) => s.mapperState)
    const currentName = useMapperStore((s) => s.currentResourceName)
    const setCurrentResource = useMapperStore((s) => s.setCurrentResource)
    const setDirty = useMapperStore((s) => s.setDirty)
    const setLastSavedAt = useMapperStore((s) => s.setLastSavedAt)

    const [name, setName] = React.useState("")
    const [error, setError] = React.useState<string | null>(null)
    const [saving, setSaving] = React.useState(false)

    // Pre-fill name when dialog opens
    React.useEffect(() => {
        if (open) {
            setName(currentName ?? "")
            setError(null)
            setSaving(false)
        }
    }, [open, currentName])

    async function handleSave() {
        const trimmed = name.trim()
        if (!trimmed) {
            setError("Please enter a name.")
            return
        }
        setSaving(true)
        setError(null)
        try {
            const stateWithName = { ...mapperState, name: trimmed }
            const nodeCount =
                countNodes(mapperState.sourceTreeNode) + countNodes(mapperState.targetTreeNode)
            const result = await saveMap({
                data: {
                    name: trimmed,
                    state: stateWithName as unknown as Record<string, unknown>,
                    sourceInputType: mapperState.sourceInputType ?? undefined,
                    targetInputType: mapperState.targetInputType ?? undefined,
                    nodeCount,
                },
            })
            setCurrentResource(result.name, result.id)
            setLastSavedAt(result.savedAt)
            setDirty(false)
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save.")
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Save Map As</DialogTitle>
                </DialogHeader>

                <div className="py-4 space-y-2">
                    <Input
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value)
                            setError(null)
                        }}
                        placeholder="Enter a name for this map"
                        className="rounded-full"
                        onKeyDown={(e) => e.key === "Enter" && handleSave()}
                        autoFocus
                    />
                    {error && <p className="text-xs text-destructive px-1">{error}</p>}
                </div>

                <DialogFooter>
                    <Button
                        variant="ghost"
                        className="rounded-full"
                        onClick={onClose}
                        disabled={saving}
                    >
                        Cancel
                    </Button>
                    <Button
                        className="rounded-full"
                        onClick={handleSave}
                        disabled={!name.trim() || saving}
                    >
                        {saving ? "Saving…" : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
