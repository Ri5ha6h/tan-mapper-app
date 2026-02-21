/**
 * context.tsx — Backward compatibility shim
 *
 * The mapper state is now managed by Zustand in `store.ts`.
 * This file is kept to avoid breaking existing components that import
 * `MapperProvider` or `useMapper`.
 *
 * Migration path:
 *   - Replace `useMapper()` calls with `useMapperStore(selector)` from `./store`
 *   - Once all components are migrated, this file can be deleted
 */
import { createContext, useContext, useReducer } from "react"
import { insertNodeInTree } from "./utils"
import type { ReactNode } from "react"
import type { FileData, Mapping, MappingCondition, MappingTransform, TreeNode } from "./types"

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
    | {
          type: "ADD_TREE_NODE"
          payload: {
              siblingId: string
              side: Side
              position: "above" | "below" | "inside"
              newNode: TreeNode
          }
      }
    | {
          type: "UPDATE_MAPPING_CONDITION"
          payload: {
              mappingId: string
              condition?: MappingCondition
              transform?: MappingTransform
          }
      }

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

        case "ADD_TREE_NODE": {
            const { siblingId, side, position, newNode } = action.payload
            const fileKey = side === "source" ? "source" : "target"
            const file = state[fileKey]
            if (!file || !file.tree) return state
            const updatedTree = insertNodeInTree(file.tree, siblingId, position, newNode)
            if (!updatedTree) return state
            return {
                ...state,
                [fileKey]: { ...file, tree: updatedTree },
            }
        }

        case "UPDATE_MAPPING_CONDITION": {
            const { mappingId, condition, transform } = action.payload
            return {
                ...state,
                mappings: state.mappings.map((m) =>
                    m.id === mappingId ? { ...m, condition, transform } : m,
                ),
            }
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
    addTreeNode: (
        siblingId: string,
        side: Side,
        position: "above" | "below" | "inside",
        newNode: TreeNode,
    ) => void
    updateMappingRule: (
        mappingId: string,
        condition?: MappingCondition,
        transform?: MappingTransform,
    ) => void
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

    const addTreeNode = (
        siblingId: string,
        side: Side,
        position: "above" | "below" | "inside",
        newNode: TreeNode,
    ) => {
        dispatch({ type: "ADD_TREE_NODE", payload: { siblingId, side, position, newNode } })
    }

    const updateMappingRule = (
        mappingId: string,
        condition?: MappingCondition,
        transform?: MappingTransform,
    ) => {
        dispatch({ type: "UPDATE_MAPPING_CONDITION", payload: { mappingId, condition, transform } })
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
                addTreeNode,
                updateMappingRule,
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

// Re-export the new Zustand store for components migrating away from context
export { useMapperStore } from "./store"
