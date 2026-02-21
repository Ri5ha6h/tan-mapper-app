import { createFileRoute, redirect } from "@tanstack/react-router"
import { authClient } from "@/lib/auth-client"
import { MapperFlow } from "@/components/mapper/mapper-flow"

export const Route = createFileRoute("/")({
    beforeLoad: async () => {
        const session = await authClient.getSession()
        if (!session.data) {
            throw redirect({ to: "/login", search: { redirectTo: "/" } })
        }
    },
    component: MapperFlow,
})
