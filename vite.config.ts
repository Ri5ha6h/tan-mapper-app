import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import viteTsConfigPaths from "vite-tsconfig-paths"
import tailwindcss from "@tailwindcss/vite"
import { nitro } from "nitro/vite"

const config = defineConfig({
    plugins: [
        devtools(),
        nitro(),
        // this is the plugin that enables path aliases
        viteTsConfigPaths({
            projects: ["./tsconfig.json"],
        }),
        tailwindcss(),
        tanstackStart(),
        viteReact(),
  ],
  optimizeDeps: {
      exclude: [
          'better-auth',
          '@better-auth/core',
          '@better-auth/core/env',
          '@better-auth/core/error',
          '@better-auth/core/db',
          '@better-auth/core/db/adapter',
          '@better-auth/core/api',
          '@better-auth/core/context',
          '@better-auth/core/oauth2',
          '@better-auth/core/social-providers',
          '@better-auth/core/utils',
          '@better-auth/utils',
          '@better-auth/utils/random',
          '@better-auth/utils/hex',
          '@better-auth/utils/hash',
          '@better-auth/utils/base64',
          '@better-auth/utils/binary',
          '@better-auth/utils/hmac',
          '@better-auth/telemetry',
          'postgres',
      ],
  },
})

export default config
