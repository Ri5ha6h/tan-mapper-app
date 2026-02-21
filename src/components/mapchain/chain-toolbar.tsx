import { useState } from "react"
import {
    Download,
    FilePlus2,
    FolderOpen,
    Link2,
    Loader2,
    Play,
    Save,
    SaveAll,
    Search,
    Trash2,
} from "lucide-react"

import { ChainExecuteDialog } from "./chain-execute-dialog"
import { useMapChainStore } from "@/lib/mapchain/store"
import { downloadAsJtchain, loadFromJtchainFile } from "@/lib/mapchain/persistence"
import { listChains, saveChain, loadChain, deleteChain } from "@/lib/mapchain/persistence.server"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { isChainExecutable } from "@/lib/mapchain/chain-engine"
import type { MapChain } from "@/lib/mapchain/types"

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SavedChainEntry {
    id: string
    name: string
    linkCount: number | null
    createdAt: Date | null
    updatedAt: Date | null
}

// ─── Relative time helper ──────────────────────────────────────────────────────

function formatRelativeTime(date: Date | string | null): string {
    if (!date) return "unknown"
    const now = Date.now()
    const then = typeof date === "string" ? new Date(date).getTime() : date.getTime()
    const diffMs = now - then
    const diffMins = Math.floor(diffMs / 60_000)
    if (diffMins < 1) return "just now"
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
}

// ─── ChainOpenDialog ───────────────────────────────────────────────────────────

interface ChainOpenDialogProps {
    open: boolean
    onClose: () => void
}

function ChainListRow({
    entry,
    onOpen,
    onDelete,
    isLoading,
}: {
    entry: SavedChainEntry
    onOpen: (entry: SavedChainEntry) => void
    onDelete: (id: string, name: string) => void
    isLoading: boolean
}) {
    return (
        <div
            className={cn(
                "flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl",
                "hover:bg-muted/20 transition-colors group",
            )}
        >
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground truncate">
                        {entry.name}
                    </span>
                    <Badge variant="outline" className="rounded-full text-xs shrink-0">
                        {entry.linkCount ?? 0} step{(entry.linkCount ?? 0) !== 1 ? "s" : ""}
                    </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {formatRelativeTime(entry.updatedAt)}
                </p>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full h-7 text-xs"
                    onClick={() => onOpen(entry)}
                    disabled={isLoading}
                >
                    {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Open"}
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full h-7 w-7 text-destructive hover:bg-destructive/10"
                    onClick={() => onDelete(entry.id, entry.name)}
                    title="Delete"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    )
}

function ChainOpenDialog({ open, onClose }: ChainOpenDialogProps) {
    const loadChainToStore = useMapChainStore((s) => s.loadChain)

    const [search, setSearch] = useState("")
    const [savedChains, setSavedChains] = useState<Array<SavedChainEntry>>([])
    const [fileError, setFileError] = useState<string | null>(null)
    const [isDragOver, setIsDragOver] = useState(false)
    const [isLoadingList, setIsLoadingList] = useState(false)
    const [loadingChainId, setLoadingChainId] = useState<string | null>(null)
    const [openError, setOpenError] = useState<string | null>(null)

    async function fetchChains() {
        setIsLoadingList(true)
        try {
            const chains = await listChains()
            setSavedChains(chains)
        } catch (err) {
            setOpenError(err instanceof Error ? err.message : "Failed to fetch chains")
            setSavedChains([])
        } finally {
            setIsLoadingList(false)
        }
    }

    // Reload list every time dialog opens
    function handleOpenChange(isOpen: boolean) {
        if (isOpen) {
            setSearch("")
            setFileError(null)
            setOpenError(null)
            setLoadingChainId(null)
            void fetchChains()
        } else {
            onClose()
        }
    }

    async function handleOpen(entry: SavedChainEntry) {
        setLoadingChainId(entry.id)
        setOpenError(null)
        try {
            const chainData = await loadChain({ data: { id: entry.id } })
            const chain = chainData as unknown as MapChain
            loadChainToStore(chain, entry.name, entry.id)
            onClose()
        } catch (err) {
            setOpenError(err instanceof Error ? err.message : "Failed to load chain")
        } finally {
            setLoadingChainId(null)
        }
    }

    async function handleDelete(id: string, name: string) {
        if (!window.confirm(`Delete chain "${name}"?`)) return
        try {
            await deleteChain({ data: { id } })
            await fetchChains()
        } catch (err) {
            setOpenError(err instanceof Error ? err.message : "Failed to delete chain")
        }
    }

    async function handleFileDrop(file: File) {
        setFileError(null)
        const { chain: parsedChain, error } = await loadFromJtchainFile(file)
        if (error || !parsedChain) {
            setFileError(error ?? "Failed to parse file")
            return
        }
        loadChainToStore(parsedChain, parsedChain.name, null)
        onClose()
    }

    function onDrop(e: React.DragEvent<HTMLDivElement>) {
        e.preventDefault()
        setIsDragOver(false)
        const file = e.dataTransfer.files.item(0)
        if (file) void handleFileDrop(file)
    }

    function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (file) void handleFileDrop(file)
    }

    const filtered = savedChains.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Open Map Chain</DialogTitle>
                </DialogHeader>

                {/* Saved chains list */}
                <div className="flex flex-col gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch((e.target as HTMLInputElement).value)}
                            placeholder="Search chains…"
                            className="pl-9 rounded-full text-sm"
                        />
                    </div>

                    {openError && (
                        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                            {openError}
                        </div>
                    )}

                    <div className="max-h-56 overflow-y-auto flex flex-col gap-0.5">
                        {isLoadingList ? (
                            <div className="flex items-center justify-center py-6 text-muted-foreground gap-2">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                <span className="text-sm">Loading chains…</span>
                            </div>
                        ) : filtered.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-6">
                                {savedChains.length === 0
                                    ? "No saved chains yet."
                                    : "No chains match your search."}
                            </p>
                        ) : (
                            filtered.map((entry) => (
                                <ChainListRow
                                    key={entry.id}
                                    entry={entry}
                                    onOpen={handleOpen}
                                    onDelete={handleDelete}
                                    isLoading={loadingChainId === entry.id}
                                />
                            ))
                        )}
                    </div>

                    <Separator />

                    {/* File drop zone */}
                    <div
                        className={cn(
                            "rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer",
                            isDragOver
                                ? "border-primary bg-primary/5"
                                : "border-glass-border/60 hover:border-primary/40 hover:bg-primary/5",
                        )}
                        onDragOver={(e) => {
                            e.preventDefault()
                            setIsDragOver(true)
                        }}
                        onDragLeave={() => setIsDragOver(false)}
                        onDrop={onDrop}
                        onClick={() => {
                            const input = document.createElement("input")
                            input.type = "file"
                            input.accept = ".jtchain"
                            input.onchange = (e) =>
                                onFileChange(e as unknown as React.ChangeEvent<HTMLInputElement>)
                            input.click()
                        }}
                    >
                        <p className="text-sm text-muted-foreground">
                            Drop a{" "}
                            <span className="font-mono text-xs bg-muted/30 px-1 py-0.5 rounded">
                                .jtchain
                            </span>{" "}
                            file or click to browse
                        </p>
                    </div>

                    {fileError && (
                        <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                            {fileError}
                        </p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

// ─── ChainSaveAsDialog ─────────────────────────────────────────────────────────

interface ChainSaveAsDialogProps {
    open: boolean
    onClose: () => void
}

function ChainSaveAsDialog({ open, onClose }: ChainSaveAsDialogProps) {
    const chain = useMapChainStore((s) => s.chain)
    const currentChainName = useMapChainStore((s) => s.currentChainName)
    const setCurrentChain = useMapChainStore((s) => s.setCurrentChain)
    const setDirty = useMapChainStore((s) => s.setDirty)

    const [name, setName] = useState(currentChainName ?? chain.name)
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    function handleOpenChange(isOpen: boolean) {
        if (isOpen) {
            setName(currentChainName ?? chain.name)
            setError(null)
            setSaving(false)
        } else {
            onClose()
        }
    }

    async function handleSave() {
        const trimmed = name.trim()
        if (!trimmed) {
            setError("Name is required.")
            return
        }
        setSaving(true)
        setError(null)
        try {
            const result = await saveChain({
                data: {
                    name: trimmed,
                    chain: chain as unknown as Record<string, unknown>,
                    linkCount: chain.links.length,
                },
            })
            setCurrentChain(result.name, result.id)
            setDirty(false)
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save.")
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Save Chain As</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-3">
                    <Input
                        autoFocus
                        value={name}
                        onChange={(e) => setName((e.target as HTMLInputElement).value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSave()}
                        placeholder="Chain name…"
                        className="rounded-full"
                    />
                    {error && <p className="text-xs text-destructive">{error}</p>}
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

// ─── ChainToolbar ──────────────────────────────────────────────────────────────

export function ChainToolbar() {
    const chain = useMapChainStore((s) => s.chain)
    const isDirty = useMapChainStore((s) => s.isDirty)
    const isSaving = useMapChainStore((s) => s.isSaving)
    const currentChainName = useMapChainStore((s) => s.currentChainName)
    const currentChainId = useMapChainStore((s) => s.currentChainId)
    const addLink = useMapChainStore((s) => s.addLink)
    const resetChain = useMapChainStore((s) => s.resetChain)
    const setDirty = useMapChainStore((s) => s.setDirty)
    const setSaving = useMapChainStore((s) => s.setSaving)
    const setSaveError = useMapChainStore((s) => s.setSaveError)
    const setCurrentChain = useMapChainStore((s) => s.setCurrentChain)

    const [openDialogOpen, setOpenDialogOpen] = useState(false)
    const [saveAsOpen, setSaveAsOpen] = useState(false)
    const [executeOpen, setExecuteOpen] = useState(false)

    const executable = isChainExecutable(chain.links)

    function handleNew() {
        if (isDirty && !window.confirm("Discard unsaved changes?")) return
        resetChain()
    }

    async function handleSave() {
        if (!currentChainId || !currentChainName) {
            setSaveAsOpen(true)
            return
        }
        setSaving(true)
        setSaveError(null)
        try {
            const result = await saveChain({
                data: {
                    id: currentChainId,
                    name: currentChainName,
                    chain: chain as unknown as Record<string, unknown>,
                    linkCount: chain.links.length,
                },
            })
            setCurrentChain(result.name, result.id)
            setDirty(false)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to save."
            setSaveError(message)
            window.alert(message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-glass-border bg-glass-bg backdrop-blur-xl">
            {/* File group */}
            <Button
                variant="ghost"
                size="sm"
                className="rounded-full gap-1.5"
                onClick={handleNew}
                title="New chain"
            >
                <FilePlus2 className="h-4 w-4" />
                <span className="hidden sm:inline">New</span>
            </Button>
            <Button
                variant="ghost"
                size="sm"
                className="rounded-full gap-1.5"
                onClick={() => setOpenDialogOpen(true)}
                title="Open chain"
            >
                <FolderOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Open</span>
            </Button>
            <Button
                variant="ghost"
                size="sm"
                className="rounded-full gap-1.5"
                onClick={handleSave}
                disabled={!isDirty || isSaving}
                title="Save chain"
            >
                {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Save className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Save</span>
            </Button>
            <Button
                variant="ghost"
                size="sm"
                className="rounded-full gap-1.5"
                onClick={() => setSaveAsOpen(true)}
                title="Save chain as…"
            >
                <SaveAll className="h-4 w-4" />
                <span className="hidden sm:inline">Save As</span>
            </Button>
            <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
                onClick={() => downloadAsJtchain(chain)}
                title="Download as .jtchain file"
            >
                <Download className="h-4 w-4" />
            </Button>

            {/* Dialogs */}
            <ChainOpenDialog open={openDialogOpen} onClose={() => setOpenDialogOpen(false)} />
            <ChainSaveAsDialog open={saveAsOpen} onClose={() => setSaveAsOpen(false)} />

            <Separator orientation="vertical" className="h-5 mx-1" />

            {/* Add steps */}
            <Button
                variant="ghost"
                size="sm"
                className="rounded-full gap-1.5 text-source hover:text-source hover:bg-source/10"
                onClick={() => addLink("JT_MAP")}
                title="Add Map step"
            >
                <Link2 className="h-4 w-4" />
                <span className="hidden sm:inline">+ Add Map</span>
            </Button>
            <Button
                variant="ghost"
                size="sm"
                className="rounded-full gap-1.5 text-secondary hover:text-secondary hover:bg-secondary/10"
                onClick={() => addLink("JT_SCRIPT")}
                title="Add Script step"
            >
                <span className="text-sm font-mono leading-none">{"{}"}</span>
                <span className="hidden sm:inline">+ Add Script</span>
            </Button>

            <Separator orientation="vertical" className="h-5 mx-1" />

            {/* Execute */}
            <Button
                variant="ghost"
                size="sm"
                className="rounded-full gap-1.5 text-accent hover:text-accent-foreground hover:bg-accent/20"
                onClick={() => setExecuteOpen(true)}
                disabled={!executable}
                title={executable ? "Execute chain" : "Configure all steps before executing"}
            >
                <Play className="h-4 w-4" />
                <span className="hidden sm:inline">Execute</span>
            </Button>

            <ChainExecuteDialog open={executeOpen} onClose={() => setExecuteOpen(false)} />

            {/* Resource name + dirty indicator */}
            <div className="flex items-center gap-1.5 ml-auto">
                {currentChainName ? (
                    <span className="text-sm font-medium text-foreground truncate max-w-[160px]">
                        {currentChainName}
                    </span>
                ) : (
                    <span className="text-sm text-muted-foreground italic">Untitled Chain</span>
                )}
                {isDirty && (
                    <span
                        className={cn(
                            "h-1.5 w-1.5 rounded-full bg-primary shrink-0",
                            "shadow-[0_0_6px_oklch(0.78_0.12_45/60%)]",
                        )}
                        title="Unsaved changes"
                    />
                )}
            </div>
        </div>
    )
}
