import { useEffect, useRef, useState } from "react"
import { useMapperStore } from "@/lib/mapper/store"
import { findNodeById } from "@/lib/mapper/node-utils"
import type { FlatReference } from "@/lib/mapper/types"

interface ConnectionLinesProps {
    sourceRefs: Map<string, HTMLElement>
    targetRefs: Map<string, HTMLElement>
    containerRef: React.RefObject<HTMLElement | null>
}

interface Connection {
    id: string
    sourceNodeId: string
    targetNodeId: string
    isLoop: boolean
    isValid: boolean
}

interface Line {
    id: string
    x1: number
    y1: number
    x2: number
    y2: number
    isLoop: boolean
    isValid: boolean
}

export function ConnectionLines({ sourceRefs, targetRefs, containerRef }: ConnectionLinesProps) {
    const references = useMapperStore((s) => s.mapperState.references)
    const sourceTree = useMapperStore((s) => s.mapperState.sourceTreeNode)
    const targetTree = useMapperStore((s) => s.mapperState.targetTreeNode)
    const removeReference = useMapperStore((s) => s.removeReference)
    const [lines, setLines] = useState<Array<Line>>([])
    const updateRef = useRef<(() => void) | undefined>(undefined)

    // Build Connection objects from FlatReference[]
    const buildConnections = (): Connection[] => {
        return references.map((ref: FlatReference) => {
            const sourceValid = !!sourceTree && !!findNodeById(ref.sourceNodeId, sourceTree)
            const targetValid = !!targetTree && !!findNodeById(ref.targetNodeId, targetTree)
            return {
                id: ref.id,
                sourceNodeId: ref.sourceNodeId,
                targetNodeId: ref.targetNodeId,
                isLoop: !!ref.isLoop,
                isValid: sourceValid && targetValid,
            }
        })
    }

    const updateLines = () => {
        if (!containerRef.current) return

        const containerRect = containerRef.current.getBoundingClientRect()
        const connections = buildConnections()
        const newLines: Array<Line> = []

        for (const conn of connections) {
            const sourceEl = sourceRefs.get(conn.sourceNodeId)
            const targetEl = targetRefs.get(conn.targetNodeId)

            if (!sourceEl || !targetEl) continue

            const sourceRect = sourceEl.getBoundingClientRect()
            const targetRect = targetEl.getBoundingClientRect()

            const x1 = sourceRect.right - containerRect.left
            const y1 = sourceRect.top + sourceRect.height / 2 - containerRect.top
            const x2 = targetRect.left - containerRect.left
            const y2 = targetRect.top + targetRect.height / 2 - containerRect.top

            newLines.push({
                id: conn.id,
                x1,
                y1,
                x2,
                y2,
                isLoop: conn.isLoop,
                isValid: conn.isValid,
            })
        }

        setLines(newLines)
    }

    updateRef.current = updateLines

    useEffect(() => {
        updateLines()
    }, [references, sourceRefs, targetRefs, containerRef]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const scrollAreas = container.querySelectorAll("[data-slot='scroll-area-viewport']")

        const handleUpdate = () => {
            requestAnimationFrame(() => {
                updateRef.current?.()
            })
        }

        scrollAreas.forEach((area) => area.addEventListener("scroll", handleUpdate))
        window.addEventListener("resize", handleUpdate)

        const observer = new MutationObserver(handleUpdate)
        observer.observe(container, { childList: true, subtree: true })

        return () => {
            scrollAreas.forEach((area) => area.removeEventListener("scroll", handleUpdate))
            window.removeEventListener("resize", handleUpdate)
            observer.disconnect()
        }
    }, [containerRef])

    return (
        <svg
            className="absolute inset-0 pointer-events-none overflow-visible"
            style={{ zIndex: 10 }}
        >
            <defs>
                {/* Regular mapping gradient: peach → lavender */}
                <linearGradient id="line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="oklch(0.78 0.12 45)" />
                    <stop offset="100%" stopColor="oklch(0.72 0.10 290)" />
                </linearGradient>
                {/* Loop reference gradient: solid mint */}
                <linearGradient id="loop-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="oklch(0.75 0.1 175)" />
                    <stop offset="100%" stopColor="oklch(0.75 0.1 175)" />
                </linearGradient>
                {/* Broken reference: red */}
                <linearGradient id="broken-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="oklch(0.65 0.2 25)" />
                    <stop offset="100%" stopColor="oklch(0.65 0.2 25)" />
                </linearGradient>
                <filter id="line-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
                <filter id="loop-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {lines.map((line) => {
                const dx = Math.abs(line.x2 - line.x1) * 0.5
                const path = `M ${line.x1} ${line.y1} C ${line.x1 + dx} ${line.y1}, ${line.x2 - dx} ${line.y2}, ${line.x2} ${line.y2}`

                const gradientId = !line.isValid
                    ? "broken-gradient"
                    : line.isLoop
                      ? "loop-gradient"
                      : "line-gradient"
                const filterId = line.isLoop ? "loop-glow" : "line-glow"
                const dashArray = line.isLoop ? "4 6" : "6 4"
                const sourceColor = !line.isValid
                    ? "oklch(0.65 0.2 25)"
                    : line.isLoop
                      ? "oklch(0.75 0.1 175)"
                      : "oklch(0.78 0.12 45)"
                const targetColor = !line.isValid
                    ? "oklch(0.65 0.2 25)"
                    : line.isLoop
                      ? "oklch(0.75 0.1 175)"
                      : "oklch(0.72 0.10 290)"

                return (
                    <g key={line.id}>
                        {/* Wide invisible hit target */}
                        <path
                            d={path}
                            fill="none"
                            stroke="transparent"
                            strokeWidth={16}
                            className="pointer-events-auto cursor-pointer"
                            onClick={() => removeReference(line.id)}
                        />
                        {/* Visible path */}
                        <path
                            d={path}
                            fill="none"
                            stroke={`url(#${gradientId})`}
                            strokeWidth={line.isLoop ? 1.5 : 2}
                            strokeDasharray={dashArray}
                            filter={`url(#${filterId})`}
                            style={{ animation: "flow-dash 1s linear infinite" }}
                        />
                        {/* Source dot */}
                        <circle
                            cx={line.x1}
                            cy={line.y1}
                            r={4}
                            fill={sourceColor}
                            style={{ animation: "dot-pulse 2s ease-in-out infinite" }}
                        />
                        {/* Target dot */}
                        <circle
                            cx={line.x2}
                            cy={line.y2}
                            r={4}
                            fill={targetColor}
                            style={{ animation: "dot-pulse 2s ease-in-out infinite 0.5s" }}
                        />
                    </g>
                )
            })}
        </svg>
    )
}
