//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"

export default [
    ...tanstackConfig,
    {
        ignores: [
            ".output",
            "dist",
            "dist-ssr",
            "node_modules",
            ".DS_Store",
            ".nitro",
            ".tanstack",
            ".wrangler",
            ".vinxi",
            "todos.json",
            "/prompts",
        ],
    },
]
