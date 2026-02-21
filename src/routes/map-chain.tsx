import { createFileRoute } from "@tanstack/react-router"
import { ChainView } from "@/components/mapchain/chain-view"

export const Route = createFileRoute("/map-chain")({
    component: ChainView,
})
