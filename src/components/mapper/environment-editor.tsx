import { useState } from "react"
import { Plus, Trash2, ChevronRight } from "lucide-react"
import { v4 as uuidv4 } from "uuid"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useMapperStore, useMapperContext, useScriptLanguage } from "@/lib/mapper/store"
import type {
    GlobalVariable,
    LookupEntry,
    LookupTable,
    TransformFunction,
} from "@/lib/mapper/types"
import { cn } from "@/lib/utils"

// ─── Checkbox helper ────────────────────────────────────────────────────────────

function Checkbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={cn(
                "h-5 w-5 shrink-0 rounded flex items-center justify-center border transition-colors",
                checked
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-border bg-muted/30 hover:border-primary/50",
            )}
        >
            {checked && (
                <svg
                    className="h-3 w-3"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                >
                    <path d="M2 6l3 3 5-5" />
                </svg>
            )}
        </button>
    )
}

// ─── Section wrapper ────────────────────────────────────────────────────────────

function Section({
    title,
    children,
    onAdd,
    addLabel,
}: {
    title: string
    children: React.ReactNode
    onAdd: () => void
    addLabel: string
}) {
    const [collapsed, setCollapsed] = useState(false)
    return (
        <div className="rounded-xl bg-glass-bg backdrop-blur-xl border border-glass-border shadow-sm overflow-hidden">
            <div
                className="flex items-center justify-between px-4 py-3 border-b border-glass-border bg-muted/20 cursor-pointer"
                onClick={() => setCollapsed((v) => !v)}
            >
                <div className="flex items-center gap-2">
                    <ChevronRight
                        className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform duration-200",
                            !collapsed && "rotate-90",
                        )}
                    />
                    <span className="text-sm font-semibold">{title}</span>
                </div>
                <Button
                    variant="outline"
                    size="xs"
                    className="rounded-full"
                    onClick={(e) => {
                        e.stopPropagation()
                        onAdd()
                    }}
                >
                    <Plus className="h-3 w-3 mr-1" />
                    {addLabel}
                </Button>
            </div>
            {!collapsed && <div className="p-3 space-y-2">{children}</div>}
        </div>
    )
}

// ─── Global Variables ────────────────────────────────────────────────────────────

function GlobalVariablesSection() {
    const ctx = useMapperContext()
    const addGlobalVariable = useMapperStore((s) => s.addGlobalVariable)
    const updateGlobalVariable = useMapperStore((s) => s.updateGlobalVariable)
    const removeGlobalVariable = useMapperStore((s) => s.removeGlobalVariable)

    const handleAdd = () => {
        const newVar: GlobalVariable = {
            id: uuidv4(),
            name: "myVar",
            value: "",
            plainTextValue: true,
        }
        addGlobalVariable(newVar)
    }

    return (
        <Section title="Global Variables" onAdd={handleAdd} addLabel="Add Variable">
            {ctx.globalVariables.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                    No global variables
                </p>
            )}
            {ctx.globalVariables.map((v) => (
                <div key={v.id} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                    <Input
                        value={v.name}
                        onChange={(e) => updateGlobalVariable(v.id, { name: e.target.value })}
                        placeholder="name"
                        className="h-8 text-xs font-mono rounded-full"
                    />
                    <Input
                        value={v.value}
                        onChange={(e) => updateGlobalVariable(v.id, { value: e.target.value })}
                        placeholder="value"
                        className="h-8 text-xs font-mono rounded-full"
                    />
                    <div className="flex items-center gap-1">
                        <Checkbox
                            checked={v.plainTextValue}
                            onChange={(val) => updateGlobalVariable(v.id, { plainTextValue: val })}
                        />
                        <span className="text-xs text-muted-foreground">Text</span>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-full h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeGlobalVariable(v.id)}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            ))}
        </Section>
    )
}

// ─── Lookup Tables ────────────────────────────────────────────────────────────────

function LookupTableRow({ table }: { table: LookupTable }) {
    const [expanded, setExpanded] = useState(false)
    const updateLookupTable = useMapperStore((s) => s.updateLookupTable)
    const removeLookupTable = useMapperStore((s) => s.removeLookupTable)
    const addLookupEntry = useMapperStore((s) => s.addLookupEntry)
    const updateLookupEntry = useMapperStore((s) => s.updateLookupEntry)
    const removeLookupEntry = useMapperStore((s) => s.removeLookupEntry)

    const handleAddEntry = () => {
        const entry: LookupEntry = {
            id: uuidv4(),
            key: "",
            value: "",
            plainTextValue: true,
        }
        addLookupEntry(table.id, entry)
        setExpanded(true)
    }

    return (
        <div className="rounded-lg border border-glass-border overflow-hidden">
            <div
                className="flex items-center gap-2 px-3 py-2 bg-muted/20 cursor-pointer"
                onClick={() => setExpanded((v) => !v)}
            >
                <ChevronRight
                    className={cn(
                        "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 shrink-0",
                        expanded && "rotate-90",
                    )}
                />
                <Input
                    value={table.name}
                    onChange={(e) => updateLookupTable(table.id, { name: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="tableName"
                    className="h-7 text-xs font-mono rounded-full flex-1"
                />
                <Button
                    variant="outline"
                    size="xs"
                    className="rounded-full shrink-0"
                    onClick={(e) => {
                        e.stopPropagation()
                        handleAddEntry()
                    }}
                >
                    <Plus className="h-3 w-3 mr-1" />
                    Entry
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    className="rounded-full h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={(e) => {
                        e.stopPropagation()
                        removeLookupTable(table.id)
                    }}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
            {expanded && (
                <div className="p-2 space-y-1 bg-muted/10">
                    {table.entries.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-1">No entries</p>
                    )}
                    {table.entries.map((entry) => (
                        <div
                            key={entry.id}
                            className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center"
                        >
                            <Input
                                value={entry.key}
                                onChange={(e) =>
                                    updateLookupEntry(table.id, entry.id, { key: e.target.value })
                                }
                                placeholder="key"
                                className="h-7 text-xs font-mono rounded-full"
                            />
                            <Input
                                value={entry.value}
                                onChange={(e) =>
                                    updateLookupEntry(table.id, entry.id, { value: e.target.value })
                                }
                                placeholder="value"
                                className="h-7 text-xs font-mono rounded-full"
                            />
                            <div className="flex items-center gap-1">
                                <Checkbox
                                    checked={entry.plainTextValue}
                                    onChange={(val) =>
                                        updateLookupEntry(table.id, entry.id, {
                                            plainTextValue: val,
                                        })
                                    }
                                />
                                <span className="text-xs text-muted-foreground">Text</span>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="rounded-full h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => removeLookupEntry(table.id, entry.id)}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function LookupTablesSection() {
    const ctx = useMapperContext()
    const addLookupTable = useMapperStore((s) => s.addLookupTable)

    const handleAdd = () => {
        const table: LookupTable = {
            id: uuidv4(),
            name: "myTable",
            entries: [],
        }
        addLookupTable(table)
    }

    return (
        <Section title="Lookup Tables" onAdd={handleAdd} addLabel="Add Table">
            {ctx.lookupTables.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">No lookup tables</p>
            )}
            {ctx.lookupTables.map((table) => (
                <LookupTableRow key={table.id} table={table} />
            ))}
        </Section>
    )
}

// ─── Functions ────────────────────────────────────────────────────────────────────

function FunctionRow({ fn, isGroovy }: { fn: TransformFunction; isGroovy: boolean }) {
    const updateFunction = useMapperStore((s) => s.updateFunction)
    const removeFunction = useMapperStore((s) => s.removeFunction)

    return (
        <div className="rounded-lg border border-glass-border overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/20">
                <span className="text-xs font-mono text-muted-foreground flex-1 truncate">
                    {fn.name || "function"}
                </span>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    className="rounded-full h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeFunction(fn.id)}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
            <Textarea
                value={fn.body}
                onChange={(e) => updateFunction(fn.id, { body: e.target.value })}
                placeholder={
                    isGroovy
                        ? "def myFunc(a, b) { return a + b }"
                        : "function myFunc(a, b) { return a + b; }"
                }
                className="text-xs font-mono rounded-none border-0 border-t border-glass-border resize-y min-h-[80px]"
                spellCheck={false}
            />
        </div>
    )
}

function FunctionsSection() {
    const ctx = useMapperContext()
    const addFunction = useMapperStore((s) => s.addFunction)
    const scriptLanguage = useScriptLanguage()
    const isGroovy = scriptLanguage === "groovy"

    const handleAdd = () => {
        const fn: TransformFunction = {
            id: uuidv4(),
            name: "myFunction",
            body: isGroovy
                ? "def myFunction(value) {\n  return value\n}"
                : "function myFunction(value) {\n  return value;\n}",
        }
        addFunction(fn)
    }

    return (
        <Section title="Functions" onAdd={handleAdd} addLabel="Add Function">
            {ctx.functions.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">No functions</p>
            )}
            {ctx.functions.map((fn) => (
                <FunctionRow key={fn.id} fn={fn} isGroovy={isGroovy} />
            ))}
        </Section>
    )
}

// ─── Scripts ────────────────────────────────────────────────────────────────────

function ScriptsSection() {
    const ctx = useMapperContext()
    const setPrologScript = useMapperStore((s) => s.setPrologScript)
    const setEpilogScript = useMapperStore((s) => s.setEpilogScript)
    const scriptLanguage = useScriptLanguage()
    const isGroovy = scriptLanguage === "groovy"

    return (
        <div className="space-y-3">
            <div className="rounded-xl bg-glass-bg backdrop-blur-xl border border-glass-border shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-glass-border bg-muted/20">
                    <span className="text-sm font-semibold">Prolog Script</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Executed before the main mapping ({isGroovy ? "Groovy" : "JavaScript"})
                    </p>
                </div>
                <Textarea
                    value={ctx.prologScript ?? ""}
                    onChange={(e) => setPrologScript(e.target.value || null)}
                    placeholder={
                        isGroovy
                            ? "// Groovy code to run before mapping..."
                            : "// Code to run before mapping..."
                    }
                    className="text-xs font-mono rounded-none border-0 resize-y min-h-[100px]"
                    spellCheck={false}
                />
            </div>

            <div className="rounded-xl bg-glass-bg backdrop-blur-xl border border-glass-border shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-glass-border bg-muted/20">
                    <span className="text-sm font-semibold">Epilog Script</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Executed after the main mapping ({isGroovy ? "Groovy" : "JavaScript"})
                    </p>
                </div>
                <Textarea
                    value={ctx.epilogScript ?? ""}
                    onChange={(e) => setEpilogScript(e.target.value || null)}
                    placeholder={
                        isGroovy
                            ? "// Groovy code to run after mapping..."
                            : "// Code to run after mapping..."
                    }
                    className="text-xs font-mono rounded-none border-0 resize-y min-h-[100px]"
                    spellCheck={false}
                />
            </div>
        </div>
    )
}

// ─── Main ────────────────────────────────────────────────────────────────────────

export function EnvironmentEditor() {
    return (
        <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
                <GlobalVariablesSection />
                <LookupTablesSection />
                <FunctionsSection />
                <ScriptsSection />
            </div>
        </ScrollArea>
    )
}
