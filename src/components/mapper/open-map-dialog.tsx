import * as React from "react"
import { FileDown, Loader2, Search, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useMapperStore } from "@/lib/mapper/store"
import { loadFromJtmapFile } from "@/lib/mapper/persistence"
import { listMaps, loadMap, deleteMap } from "@/lib/mapper/persistence.server"
import { deserializeMapperState } from "@/lib/mapper/serialization"
import { cn } from "@/lib/utils"

// ─── Types ──────────────────────────────────────────────────────────────────────

interface SavedMapEntry {
    id: string
    name: string
    sourceInputType: string | null
    targetInputType: string | null
    nodeCount: number | null
    createdAt: Date | null
    updatedAt: Date | null
}

// ─── Props ──────────────────────────────────────────────────────────────────────

interface OpenMapDialogProps {
    open: boolean
    onClose: () => void
}

// ─── Relative time helper ────────────────────────────────────────────────────────

function formatRelativeTime(date: Date | string): string {
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

// ─── Map list row ─────────────────────────────────────────────────────────────────

function MapListRow({
    entry,
    onOpen,
    onDelete,
    isLoading,
}: {
    entry: SavedMapEntry
    onOpen: (entry: SavedMapEntry) => void
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
                    {entry.sourceInputType && (
                        <span className="px-1.5 py-0.5 rounded-full text-xs bg-source/10 text-source font-mono shrink-0">
                            {entry.sourceInputType}
                        </span>
                    )}
                    {entry.targetInputType && (
                        <span className="px-1.5 py-0.5 rounded-full text-xs bg-target/10 text-target font-mono shrink-0">
                            {entry.targetInputType}
                        </span>
                    )}
                    {entry.nodeCount != null && (
                        <span className="px-1.5 py-0.5 rounded-full text-xs bg-muted/40 text-muted-foreground shrink-0">
                            {entry.nodeCount} nodes
                        </span>
                    )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                    {entry.updatedAt ? formatRelativeTime(entry.updatedAt) : "unknown"}
                </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full h-7 text-xs gap-1"
                    onClick={() => onOpen(entry)}
                    disabled={isLoading}
                >
                    {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Open"}
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    className="rounded-full h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => onDelete(entry.id, entry.name)}
                    title="Delete"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    )
}

// ─── File drop zone ───────────────────────────────────────────────────────────────

function FileDropZone({
    onFile,
    error,
    fileName,
}: {
    onFile: (file: File) => void
    error: string | null
    fileName: string | null
}) {
    const inputRef = React.useRef<HTMLInputElement>(null)
    const [dragging, setDragging] = React.useState(false)

    function handleDrop(e: React.DragEvent<HTMLDivElement>) {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) onFile(file)
    }

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (file) onFile(file)
        e.target.value = ""
    }

    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center gap-3 py-8 px-4",
                "border-2 border-dashed rounded-xl cursor-pointer transition-colors",
                dragging
                    ? "border-primary bg-primary/5"
                    : "border-glass-border hover:border-primary/50 hover:bg-muted/10",
                error && "border-destructive/50 bg-destructive/5",
            )}
            onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
        >
            <input
                ref={inputRef}
                type="file"
                accept=".jtmap"
                className="hidden"
                onChange={handleChange}
            />
            <FileDown
                className={cn("h-8 w-8", error ? "text-destructive" : "text-muted-foreground")}
            />
            {fileName ? (
                <div className="text-center">
                    <div className="text-sm font-medium text-foreground">{fileName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Click to change file</div>
                </div>
            ) : (
                <div className="text-center">
                    <div className="text-sm font-medium text-foreground">
                        Drop a .jtmap file here
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">or click to browse</div>
                </div>
            )}
            {error && <div className="text-xs text-destructive font-medium">{error}</div>}
        </div>
    )
}

// ─── Main dialog ──────────────────────────────────────────────────────────────────

export function OpenMapDialog({ open, onClose }: OpenMapDialogProps) {
    const loadState = useMapperStore((s) => s.loadState)

    const [savedMaps, setSavedMaps] = React.useState<SavedMapEntry[]>([])
    const [search, setSearch] = React.useState("")
    const [openError, setOpenError] = React.useState<string | null>(null)
    const [isLoadingList, setIsLoadingList] = React.useState(false)
    const [loadingMapId, setLoadingMapId] = React.useState<string | null>(null)

    // File tab state
    const [droppedFile, setDroppedFile] = React.useState<File | null>(null)
    const [fileName, setFileName] = React.useState<string | null>(null)
    const [fileError, setFileError] = React.useState<string | null>(null)
    const [fileParsedOk, setFileParsedOk] = React.useState(false)
    const [parsedFileState, setParsedFileState] = React.useState<
        Awaited<ReturnType<typeof loadFromJtmapFile>>["state"] | null
    >(null)

    // Refresh saved maps list whenever dialog opens
    React.useEffect(() => {
        if (open) {
            setSearch("")
            setOpenError(null)
            setLoadingMapId(null)
            setDroppedFile(null)
            setFileName(null)
            setFileError(null)
            setFileParsedOk(false)
            setParsedFileState(null)
            fetchMaps()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    async function fetchMaps() {
        setIsLoadingList(true)
        try {
            const maps = await listMaps()
            setSavedMaps(maps)
        } catch (err) {
            setOpenError(err instanceof Error ? err.message : "Failed to fetch maps")
            setSavedMaps([])
        } finally {
            setIsLoadingList(false)
        }
    }

    async function handleOpenSaved(entry: SavedMapEntry) {
        setLoadingMapId(entry.id)
        setOpenError(null)
        try {
            const stateData = await loadMap({ data: { id: entry.id } })
            // Server returns the raw state object — deserialize via JSON round-trip
            const json = JSON.stringify(stateData)
            const state = deserializeMapperState(json)
            loadState(state, entry.name, entry.id)
            onClose()
        } catch (err) {
            setOpenError(
                err instanceof Error
                    ? err.message
                    : `Could not load "${entry.name}" — data may be missing or corrupt.`,
            )
        } finally {
            setLoadingMapId(null)
        }
    }

    async function handleDelete(id: string, name: string) {
        if (!window.confirm(`Delete "${name}"?`)) return
        try {
            await deleteMap({ data: { id } })
            await fetchMaps()
        } catch (err) {
            setOpenError(err instanceof Error ? err.message : "Failed to delete map")
        }
    }

    async function handleFile(file: File) {
        setFileName(file.name)
        setFileError(null)
        setFileParsedOk(false)
        setParsedFileState(null)
        setDroppedFile(file)

        const result = await loadFromJtmapFile(file)
        if (result.error || !result.state) {
            setFileError(result.error ?? "Failed to parse file")
            setFileParsedOk(false)
        } else {
            setFileParsedOk(true)
            setParsedFileState(result.state)
        }
    }

    function handleOpenFile() {
        if (!parsedFileState || !droppedFile) return
        loadState(parsedFileState, droppedFile.name.replace(/\.jtmap$/i, ""), null)
        onClose()
    }

    const filteredMaps = savedMaps.filter((e) =>
        e.name.toLowerCase().includes(search.toLowerCase()),
    )

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Open Mapper</DialogTitle>
                </DialogHeader>

                <Tabs defaultValue="saved" className="mt-2">
                    <TabsList className="w-full">
                        <TabsTrigger value="saved" className="flex-1">
                            Saved Maps
                            {savedMaps.length > 0 && (
                                <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-mono">
                                    {savedMaps.length}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="file" className="flex-1">
                            Open File
                        </TabsTrigger>
                    </TabsList>

                    {/* ── Saved Maps tab ── */}
                    <TabsContent value="saved" className="mt-4">
                        {savedMaps.length > 0 && (
                            <div className="relative mb-3">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Filter by name…"
                                    className={cn(
                                        "w-full pl-8 pr-3 py-2 text-sm rounded-full",
                                        "bg-muted/20 border border-glass-border",
                                        "placeholder:text-muted-foreground",
                                        "focus:outline-none focus:ring-2 focus:ring-ring/50",
                                    )}
                                />
                            </div>
                        )}

                        {openError && (
                            <div className="mb-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                                {openError}
                            </div>
                        )}

                        <div className="max-h-64 overflow-y-auto rounded-xl">
                            {isLoadingList ? (
                                <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    <span className="text-sm">Loading maps…</span>
                                </div>
                            ) : filteredMaps.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                                    <FileDown className="h-8 w-8 opacity-30" />
                                    <span className="text-sm">
                                        {savedMaps.length === 0
                                            ? "No saved maps yet."
                                            : "No matches found."}
                                    </span>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-1 p-1">
                                    {filteredMaps.map((entry) => (
                                        <MapListRow
                                            key={entry.id}
                                            entry={entry}
                                            onOpen={handleOpenSaved}
                                            onDelete={handleDelete}
                                            isLoading={loadingMapId === entry.id}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    {/* ── Open File tab ── */}
                    <TabsContent value="file" className="mt-4">
                        <FileDropZone onFile={handleFile} error={fileError} fileName={fileName} />

                        {fileParsedOk && (
                            <div className="mt-3 text-sm text-accent bg-accent/10 border border-accent/20 rounded-lg px-3 py-2">
                                File parsed successfully. Click Open to load it.
                            </div>
                        )}

                        <div className="flex justify-end gap-2 mt-4">
                            <Button variant="ghost" className="rounded-full" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button
                                className="rounded-full"
                                onClick={handleOpenFile}
                                disabled={!fileParsedOk}
                            >
                                Open
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}
