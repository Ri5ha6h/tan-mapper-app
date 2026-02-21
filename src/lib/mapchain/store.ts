import { create } from "zustand"
import { immer } from "zustand/middleware/immer"
import { v4 as uuid } from "uuid"
import type { MapChain, MapChainLink, MapChainLinkType } from "./types"

// ============================================================
// Default state
// ============================================================

function createDefaultChain(): MapChain {
    return {
        id: uuid(),
        name: "Untitled Chain",
        links: [],
        testInput: "",
    }
}

// ============================================================
// Store interface
// ============================================================

interface MapChainStore {
    // State
    chain: MapChain
    isDirty: boolean
    isSaving: boolean
    saveError: string | null
    currentChainId: string | null
    currentChainName: string | null

    // Chain-level mutations
    setChainName: (name: string) => void
    setTestInput: (input: string) => void

    // Link mutations
    addLink: (type: MapChainLinkType) => void
    removeLink: (id: string) => void
    moveLink: (id: string, direction: "up" | "down") => void
    reorderLinks: (ids: Array<string>) => void
    updateLink: (id: string, patch: Partial<MapChainLink>) => void
    toggleLinkEnabled: (id: string) => void

    // Map picker (for JT_MAP links)
    setLinkMap: (linkId: string, mapId: string, mapName: string) => void

    // Persistence
    loadChain: (chain: MapChain, name: string, id: string | null) => void
    resetChain: () => void
    setDirty: (dirty: boolean) => void
    setSaving: (saving: boolean) => void
    setSaveError: (error: string | null) => void
    setCurrentChain: (name: string, id: string) => void
}

// ============================================================
// Store implementation
// ============================================================

export const useMapChainStore = create<MapChainStore>()(
    immer((set) => ({
        chain: createDefaultChain(),
        isDirty: false,
        isSaving: false,
        saveError: null,
        currentChainId: null,
        currentChainName: null,

        setChainName(name) {
            set((state) => {
                state.chain.name = name
                state.isDirty = true
            })
        },

        setTestInput(input) {
            set((state) => {
                state.chain.testInput = input
                state.isDirty = true
            })
        },

        addLink(type) {
            set((state) => {
                const link: MapChainLink = {
                    id: uuid(),
                    type,
                    name: type === "JT_MAP" ? "New Map" : "New Script",
                    enabled: true,
                    ...(type === "JT_SCRIPT"
                        ? {
                              scriptCode: "// input is available as: input\nreturn input",
                              scriptName: "Script",
                          }
                        : {}),
                }
                state.chain.links.push(link)
                state.isDirty = true
            })
        },

        removeLink(id) {
            set((state) => {
                state.chain.links = state.chain.links.filter((l) => l.id !== id)
                state.isDirty = true
            })
        },

        moveLink(id, direction) {
            set((state) => {
                const idx = state.chain.links.findIndex((l) => l.id === id)
                if (idx === -1) return
                if (direction === "up" && idx > 0) {
                    const tmp = state.chain.links[idx - 1]
                    state.chain.links[idx - 1] = state.chain.links[idx]
                    state.chain.links[idx] = tmp
                }
                if (direction === "down" && idx < state.chain.links.length - 1) {
                    const tmp = state.chain.links[idx + 1]
                    state.chain.links[idx + 1] = state.chain.links[idx]
                    state.chain.links[idx] = tmp
                }
                state.isDirty = true
            })
        },

        reorderLinks(ids) {
            set((state) => {
                state.chain.links = ids
                    .map((id) => state.chain.links.find((l) => l.id === id))
                    .filter((l): l is MapChainLink => Boolean(l))
                state.isDirty = true
            })
        },

        updateLink(id, patch) {
            set((state) => {
                const link = state.chain.links.find((l) => l.id === id)
                if (!link) return
                Object.assign(link, patch)
                state.isDirty = true
            })
        },

        toggleLinkEnabled(id) {
            set((state) => {
                const link = state.chain.links.find((l) => l.id === id)
                if (!link) return
                link.enabled = !link.enabled
                state.isDirty = true
            })
        },

        setLinkMap(linkId, mapId, mapName) {
            set((state) => {
                const link = state.chain.links.find((l) => l.id === linkId)
                if (!link) return
                link.mapId = mapId
                link.mapName = mapName
                link.name = mapName
                state.isDirty = true
            })
        },

        loadChain(chain, name, id) {
            set((state) => {
                state.chain = chain
                state.currentChainName = name
                state.currentChainId = id
                state.isDirty = false
                state.isSaving = false
                state.saveError = null
            })
        },

        resetChain() {
            set((state) => {
                state.chain = createDefaultChain()
                state.currentChainId = null
                state.currentChainName = null
                state.isDirty = false
                state.isSaving = false
                state.saveError = null
            })
        },

        setDirty(dirty) {
            set((state) => {
                state.isDirty = dirty
            })
        },

        setSaving(saving) {
            set((state) => {
                state.isSaving = saving
            })
        },

        setSaveError(error) {
            set((state) => {
                state.saveError = error
            })
        },

        setCurrentChain(name, id) {
            set((state) => {
                state.currentChainName = name
                state.currentChainId = id
            })
        },
    })),
)
