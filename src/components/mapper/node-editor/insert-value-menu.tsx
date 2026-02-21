import { Plus } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useMapperStore } from "@/lib/mapper/store"
import { findNodeById } from "@/lib/mapper/node-utils"

interface InsertValueMenuProps {
    /** Called with the string to insert into the focused field */
    onInsert: (value: string) => void
}

const SYSTEM_VARIABLES: Array<{ label: string; value: string }> = [
    { label: "currentDate", value: "new Date().toISOString()" },
    { label: "currentTimestamp", value: "Date.now()" },
    { label: "transactionId", value: "context.transactionId" },
    { label: "sourceId", value: "context.sourceId" },
    { label: "targetId", value: "context.targetId" },
    { label: "empty string", value: "''" },
    { label: "null", value: "null" },
]

export function InsertValueMenu({ onInsert }: InsertValueMenuProps) {
    const state = useMapperStore((s) => s.mapperState)
    const selectedNodeId = useMapperStore((s) => s.selectedTargetNodeId)

    const currentNode = selectedNodeId ? findNodeById(selectedNodeId, state.targetTreeNode!) : null
    const globalVars = state.localContext.globalVariables
    const lookupTables = state.localContext.lookupTables
    const functions = state.localContext.functions
    const sourceRefs = currentNode?.sourceReferences ?? []

    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-full px-2.5 h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors cursor-pointer outline-none">
                <Plus className="h-3.5 w-3.5" />
                Insert
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
                {/* Global Variables */}
                {globalVars.length > 0 && (
                    <>
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                                <span className="text-xs font-medium text-muted-foreground">
                                    Global Variables
                                </span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                                {globalVars.map((v) => (
                                    <DropdownMenuItem key={v.id} onSelect={() => onInsert(v.name)}>
                                        <span className="font-mono text-xs text-primary">
                                            {v.name}
                                        </span>
                                        {v.value && (
                                            <span className="ml-auto text-xs text-muted-foreground truncate max-w-20">
                                                = {v.value}
                                            </span>
                                        )}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSeparator />
                    </>
                )}

                {/* Lookup Tables */}
                {lookupTables.length > 0 && (
                    <>
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                                <span className="text-xs font-medium text-muted-foreground">
                                    Lookup Tables
                                </span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                                {lookupTables.map((t) => (
                                    <DropdownMenuItem
                                        key={t.id}
                                        onSelect={() => onInsert(`lookupTable('${t.name}', value)`)}
                                    >
                                        <span className="font-mono text-xs text-accent">
                                            {t.name}
                                        </span>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSeparator />
                    </>
                )}

                {/* Functions */}
                {functions.length > 0 && (
                    <>
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                                <span className="text-xs font-medium text-muted-foreground">
                                    Functions
                                </span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                                {functions.map((f) => (
                                    <DropdownMenuItem
                                        key={f.id}
                                        onSelect={() => onInsert(`${f.name}()`)}
                                    >
                                        <span className="font-mono text-xs text-secondary">
                                            {f.name}()
                                        </span>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSeparator />
                    </>
                )}

                {/* System Variables */}
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                        <span className="text-xs font-medium text-muted-foreground">
                            System Variables
                        </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        {SYSTEM_VARIABLES.map((sv) => (
                            <DropdownMenuItem key={sv.label} onSelect={() => onInsert(sv.value)}>
                                <span className="font-mono text-xs text-muted-foreground">
                                    {sv.label}
                                </span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>

                {/* Source References from current node */}
                {sourceRefs.length > 0 && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Source References</DropdownMenuLabel>
                        {sourceRefs.map((ref) => (
                            <DropdownMenuItem
                                key={ref.id}
                                onSelect={() => onInsert(ref.variableName)}
                            >
                                <span className="font-mono text-xs text-mapped">
                                    {ref.variableName}
                                </span>
                            </DropdownMenuItem>
                        ))}
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
