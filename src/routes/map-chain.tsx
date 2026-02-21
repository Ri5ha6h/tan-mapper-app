import { createFileRoute, redirect } from "@tanstack/react-router"
import { authClient } from "@/lib/auth-client"
import { ChainView } from "@/components/mapchain/chain-view"

export const Route = createFileRoute("/map-chain")({
    beforeLoad: async () => {
        const session = await authClient.getSession()
        if (!session.data) {
            throw redirect({ to: "/login", search: { redirectTo: "/map-chain" } })
        }
    },
    component: ChainView,
})
