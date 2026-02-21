import type { ChainStepResult, MapChainLink } from "./types"
import { loadMapForChainExecution } from "@/lib/mapper/persistence.server"
import { deserializeMapperState } from "@/lib/mapper/serialization"
import { executeScript, generateScript } from "@/lib/mapper/engine"
import { generateGroovyScript } from "@/lib/mapper/groovy-engine"
import { executeGroovyScript } from "@/lib/mapper/groovy-executor.server"

// ============================================================
// Public types
// ============================================================

export interface ChainExecutionOptions {
    onStepStart: (linkId: string) => void
    onStepComplete: (result: ChainStepResult) => void
    onChainComplete: (finalOutput: string) => void
    onChainError: (linkId: string, error: string) => void
}

// ============================================================
// isChainExecutable helper
// ============================================================

/**
 * Returns true if all enabled links in the chain are fully configured.
 * Disabled links are always considered valid (they pass-through input).
 */
export function isChainExecutable(links: Array<MapChainLink>): boolean {
    if (links.length === 0) return false
    return links.every((link) => {
        if (!link.enabled) return true // disabled steps don't block
        if (link.type === "JT_MAP") return Boolean(link.mapId)
        // JT_SCRIPT
        return Boolean(link.scriptCode?.trim())
    })
}

// ============================================================
// Chain execution
// ============================================================

/**
 * Executes a map chain sequentially.
 * Calls callbacks for each step so the UI can update in real-time.
 * Never throws — all errors are reported via onStepComplete / onChainError.
 */
export async function executeChain(
    links: Array<MapChainLink>,
    input: string,
    options: ChainExecutionOptions,
): Promise<void> {
    let currentInput = input

    for (const link of links) {
        if (!link.enabled) {
            options.onStepComplete({
                linkId: link.id,
                status: "skipped",
                output: currentInput, // pass through unchanged
                error: null,
                durationMs: 0,
            })
            continue
        }

        options.onStepStart(link.id)
        const start = performance.now()

        try {
            let output: string

            if (link.type === "JT_MAP") {
                // Load the map from server
                if (!link.mapId) throw new Error("No map selected for this step")
                const stateData = await loadMapForChainExecution({
                    data: { mapId: link.mapId },
                })
                // Server returns raw JSONB — deserialize via JSON round-trip
                const json = JSON.stringify(stateData)
                const mapState = deserializeMapperState(json)

                // Generate and execute the transformation script
                const srcType = mapState.sourceInputType.toLowerCase() as "json" | "xml"
                const tgtType = mapState.targetInputType.toLowerCase() as "json" | "xml"
                const isGroovy = mapState.scriptLanguage === "groovy"

                if (isGroovy) {
                    // Groovy: generate Groovy script and execute on sidecar
                    const script = generateGroovyScript(mapState, srcType, tgtType)
                    const groovyResult = await executeGroovyScript({
                        data: { script, input: currentInput, timeout: 30 },
                    })
                    if (groovyResult.error) throw new Error(groovyResult.error)
                    output = groovyResult.output ?? ""
                } else {
                    // JavaScript: generate JS script and execute in-process
                    const script = generateScript(mapState, srcType, tgtType)
                    const result = await executeScript(script, currentInput, mapState.localContext)
                    if (result.error) throw new Error(result.error)
                    output = result.output
                }
            } else {
                // JT_SCRIPT: execute inline JS script
                // Script must accept 'input' (string) and return a string
                const scriptBody = link.scriptCode ?? ""
                const fn = new Function("input", `"use strict";\n${scriptBody}`)
                const result = fn(currentInput) as unknown
                output = result != null ? String(result) : ""
            }

            const durationMs = performance.now() - start
            options.onStepComplete({
                linkId: link.id,
                status: "done",
                output,
                error: null,
                durationMs,
            })

            currentInput = output // output becomes next step's input
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err)
            options.onStepComplete({
                linkId: link.id,
                status: "error",
                output: "",
                error,
                durationMs: performance.now() - start,
            })
            options.onChainError(link.id, error)
            return // stop chain on first error
        }
    }

    options.onChainComplete(currentInput)
}
