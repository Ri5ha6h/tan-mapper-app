import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

const GROOVY_SIDECAR_URL = process.env.GROOVY_SIDECAR_URL || "http://localhost:8090"

// ============================================================
// executeGroovyScript — Send a Groovy script to the sidecar for execution
// ============================================================

export const executeGroovyScript = createServerFn({ method: "POST" })
    .inputValidator(
        z.object({
            script: z.string(),
            input: z.string(),
            timeout: z.number().int().min(1000).max(120000).optional(),
        }),
    )
    .handler(async ({ data }) => {
        const response = await fetch(`${GROOVY_SIDECAR_URL}/execute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                script: data.script,
                input: data.input,
                timeout: data.timeout ?? 30000,
            }),
        })

        if (!response.ok) {
            const text = await response.text()
            throw new Error(`Groovy sidecar error (${response.status}): ${text}`)
        }

        const result = await response.json()
        return result as {
            output: string
            error: string | null
            logs: string[]
            durationMs: number
        }
    })

// ============================================================
// checkGroovySidecar — Check if the Groovy sidecar is available
// ============================================================

export const checkGroovySidecar = createServerFn().handler(async () => {
    try {
        const response = await fetch(`${GROOVY_SIDECAR_URL}/health`, {
            signal: AbortSignal.timeout(3000),
        })
        return { available: response.ok }
    } catch {
        return { available: false }
    }
})
