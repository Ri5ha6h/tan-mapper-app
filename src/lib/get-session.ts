import { auth } from "@/lib/auth"
import { getRequest } from "@tanstack/react-start/server"

export async function getAuthSession() {
    const request = getRequest()
    const session = await auth.api.getSession({
        headers: request.headers,
    })
    return session
}
