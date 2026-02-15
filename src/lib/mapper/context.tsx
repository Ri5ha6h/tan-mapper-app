import { createContext, useContext, useReducer } from "react"
import type { ReactNode } from "react"
import type { FileData, Mapping } from "./types"

type Side = "source" | "target"

interface MapperState {
    source: FileData | null
    target: FileData | null
    mappings: Array<Mapping>
    sourceExpanded: Set<string>
    targetExpanded: Set<string>
}

type MapperAction =
    | { type: "SET_SOURCE"; payload: FileData | null }
    | { type: "SET_TARGET"; payload: FileData | null }
    | { type: "ADD_MAPPING"; payload: Mapping }
    | { type: "REMOVE_MAPPING"; payload: string }
    | { type: "REMOVE_MAPPINGS_FOR_NODE"; payload: { nodeId: string; side: Side } }
    | { type: "SET_MAPPINGS"; payload: Array<Mapping> }
    | { type: "TOGGLE_EXPAND"; payload: { nodeId: string; side: Side } }

const initialState: MapperState = {
    source: null,
    target: null,
    mappings: [],
    sourceExpanded: new Set(),
    targetExpanded: new Set(),
}

function mapperReducer(state: MapperState, action: MapperAction): MapperState {
    switch (action.type) {
        case "SET_SOURCE":
            return {
                ...state,
                source: action.payload,
                mappings: [],
                sourceExpanded: new Set(),
            }

        case "SET_TARGET":
            return {
                ...state,
                target: action.payload,
                mappings: [],
                targetExpanded: new Set(),
            }

        case "ADD_MAPPING": {
            // prevent duplicates
            const exists = state.mappings.some(
                (m) =>
                    m.sourceId === action.payload.sourceId &&
                    m.targetId === action.payload.targetId,
            )
            if (exists) return state
            return {
                ...state,
                mappings: [...state.mappings, action.payload],
            }
        }

        case "REMOVE_MAPPING":
            return {
                ...state,
                mappings: state.mappings.filter((m) => m.id !== action.payload),
            }

        case "REMOVE_MAPPINGS_FOR_NODE": {
            const { nodeId, side } = action.payload
            return {
                ...state,
                mappings: state.mappings.filter((m) =>
                    side === "source" ? m.sourceId !== nodeId : m.targetId !== nodeId,
                ),
            }
        }

        case "SET_MAPPINGS":
            return {
                ...state,
                mappings: action.payload,
            }

        case "TOGGLE_EXPAND": {
            const key = action.payload.side === "source" ? "sourceExpanded" : "targetExpanded"
            const next = new Set(state[key])
            if (next.has(action.payload.nodeId)) {
                next.delete(action.payload.nodeId)
            } else {
                next.add(action.payload.nodeId)
            }
            return { ...state, [key]: next }
        }

        default:
            return state
    }
}

interface MapperContextValue extends MapperState {
    setSource: (data: FileData | null) => void
    setTarget: (data: FileData | null) => void
    addMapping: (sourceId: string, targetId: string) => void
    removeMapping: (id: string) => void
    removeMappingsForNode: (nodeId: string, side: Side) => void
    setMappings: (mappings: Array<Mapping>) => void
    toggleExpand: (nodeId: string, side: Side) => void
    isExpanded: (nodeId: string, side: Side) => boolean
}

const MapperContext = createContext<MapperContextValue | null>(null)

export function MapperProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(mapperReducer, initialState)

    const setSource = (data: FileData | null) => {
        dispatch({ type: "SET_SOURCE", payload: data })
    }

    const setTarget = (data: FileData | null) => {
        dispatch({ type: "SET_TARGET", payload: data })
    }

    const addMapping = (sourceId: string, targetId: string) => {
        const mapping: Mapping = {
            id: `${sourceId}::${targetId}`,
            sourceId,
            targetId,
        }
        dispatch({ type: "ADD_MAPPING", payload: mapping })
    }

    const removeMapping = (id: string) => {
        dispatch({ type: "REMOVE_MAPPING", payload: id })
    }

    const removeMappingsForNode = (nodeId: string, side: Side) => {
        dispatch({ type: "REMOVE_MAPPINGS_FOR_NODE", payload: { nodeId, side } })
    }

    const setMappings = (mappings: Array<Mapping>) => {
        dispatch({ type: "SET_MAPPINGS", payload: mappings })
    }

    const toggleExpand = (nodeId: string, side: Side) => {
        dispatch({ type: "TOGGLE_EXPAND", payload: { nodeId, side } })
    }

    const isExpanded = (nodeId: string, side: Side) => {
        return side === "source"
            ? state.sourceExpanded.has(nodeId)
            : state.targetExpanded.has(nodeId)
    }

    return (
        <MapperContext.Provider
            value={{
                ...state,
                setSource,
                setTarget,
                addMapping,
                removeMapping,
                removeMappingsForNode,
                setMappings,
                toggleExpand,
                isExpanded,
            }}
        >
            {children}
        </MapperContext.Provider>
    )
}

export function useMapper() {
    const ctx = useContext(MapperContext)
    if (!ctx) {
        throw new Error("useMapper must be used within MapperProvider")
    }
    return ctx
}
