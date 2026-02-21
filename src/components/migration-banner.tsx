import { useState, useEffect, useCallback } from "react"
import { Loader2, X, Upload, CheckCircle2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
    detectLocalStorageData,
    migrateLocalStorageToServer,
    clearLocalStorageData,
} from "@/lib/migrate-local-data"
import type { MigrationResult } from "@/lib/migrate-local-data"

type BannerState =
    | { kind: "detecting" }
    | { kind: "hidden" }
    | { kind: "prompt"; mapCount: number; chainCount: number }
    | { kind: "migrating" }
    | { kind: "success"; result: MigrationResult }
    | { kind: "error"; result: MigrationResult }

const DISMISS_KEY = "jtmapper:migration-dismissed"

export function MigrationBanner() {
    const [state, setState] = useState<BannerState>({ kind: "detecting" })

    useEffect(() => {
        // Don't show if previously dismissed
        if (typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY)) {
            setState({ kind: "hidden" })
            return
        }

        const { mapCount, chainCount } = detectLocalStorageData()
        if (mapCount === 0 && chainCount === 0) {
            setState({ kind: "hidden" })
        } else {
            setState({ kind: "prompt", mapCount, chainCount })
        }
    }, [])

    const handleImport = useCallback(async () => {
        setState({ kind: "migrating" })
        try {
            const result = await migrateLocalStorageToServer()
            if (result.errors.length > 0 && result.mapsImported + result.chainsImported === 0) {
                setState({ kind: "error", result })
            } else {
                setState({ kind: "success", result })
            }
        } catch (err) {
            setState({
                kind: "error",
                result: {
                    mapsImported: 0,
                    chainsImported: 0,
                    errors: [err instanceof Error ? err.message : "Unknown error"],
                },
            })
        }
    }, [])

    const handleDismiss = useCallback(() => {
        if (typeof window !== "undefined") {
            localStorage.setItem(DISMISS_KEY, "1")
        }
        setState({ kind: "hidden" })
    }, [])

    const handleClearAndDismiss = useCallback(() => {
        clearLocalStorageData()
        handleDismiss()
    }, [handleDismiss])

    if (state.kind === "detecting" || state.kind === "hidden") {
        return null
    }

    return (
        <div
            className={cn(
                "relative z-10 mx-6 mt-3 rounded-xl border px-4 py-3",
                "bg-glass-bg backdrop-blur-xl shadow-lg animate-fade-in-up",
                state.kind === "error"
                    ? "border-destructive/30"
                    : state.kind === "success"
                      ? "border-accent/30"
                      : "border-primary/30",
            )}
        >
            <div className="flex items-start gap-3">
                {/* Icon */}
                <div className="mt-0.5 shrink-0">
                    {state.kind === "migrating" && (
                        <Loader2 className="size-5 text-primary animate-spin" />
                    )}
                    {state.kind === "prompt" && <Upload className="size-5 text-primary" />}
                    {state.kind === "success" && <CheckCircle2 className="size-5 text-accent" />}
                    {state.kind === "error" && (
                        <AlertTriangle className="size-5 text-destructive" />
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {state.kind === "prompt" && (
                        <>
                            <p className="text-sm">
                                Found{" "}
                                <span className="font-medium text-primary">
                                    {state.mapCount} map{state.mapCount !== 1 ? "s" : ""}
                                </span>
                                {state.chainCount > 0 && (
                                    <>
                                        {" "}
                                        and{" "}
                                        <span className="font-medium text-secondary">
                                            {state.chainCount} chain
                                            {state.chainCount !== 1 ? "s" : ""}
                                        </span>
                                    </>
                                )}{" "}
                                saved in this browser. Would you like to import them to your
                                account?
                            </p>
                            <div className="mt-2.5 flex items-center gap-2">
                                <Button size="sm" onClick={handleImport}>
                                    Import Now
                                </Button>
                                <Button size="sm" variant="ghost" onClick={handleDismiss}>
                                    Dismiss
                                </Button>
                            </div>
                        </>
                    )}

                    {state.kind === "migrating" && (
                        <p className="text-sm text-muted-foreground">Importing your data...</p>
                    )}

                    {state.kind === "success" && (
                        <>
                            <p className="text-sm">
                                Successfully imported{" "}
                                <span className="font-medium text-accent">
                                    {state.result.mapsImported} map
                                    {state.result.mapsImported !== 1 ? "s" : ""}
                                </span>
                                {state.result.chainsImported > 0 && (
                                    <>
                                        {" "}
                                        and{" "}
                                        <span className="font-medium text-accent">
                                            {state.result.chainsImported} chain
                                            {state.result.chainsImported !== 1 ? "s" : ""}
                                        </span>
                                    </>
                                )}
                                .
                            </p>
                            {state.result.errors.length > 0 && (
                                <p className="mt-1 text-xs text-destructive">
                                    {state.result.errors.length} failed:{" "}
                                    {state.result.errors.slice(0, 3).join(", ")}
                                </p>
                            )}
                            <div className="mt-2.5 flex items-center gap-2">
                                <Button size="sm" variant="outline" onClick={handleClearAndDismiss}>
                                    Clear browser data &amp; close
                                </Button>
                                <Button size="sm" variant="ghost" onClick={handleDismiss}>
                                    Close
                                </Button>
                            </div>
                        </>
                    )}

                    {state.kind === "error" && (
                        <>
                            <p className="text-sm text-destructive">Migration failed</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {state.result.errors.slice(0, 3).join(", ")}
                            </p>
                            <div className="mt-2.5 flex items-center gap-2">
                                <Button size="sm" onClick={handleImport}>
                                    Retry
                                </Button>
                                <Button size="sm" variant="ghost" onClick={handleDismiss}>
                                    Dismiss
                                </Button>
                            </div>
                        </>
                    )}
                </div>

                {/* Close button */}
                {(state.kind === "prompt" ||
                    state.kind === "success" ||
                    state.kind === "error") && (
                    <button
                        onClick={handleDismiss}
                        className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
                        aria-label="Dismiss"
                    >
                        <X className="size-4" />
                    </button>
                )}
            </div>
        </div>
    )
}
