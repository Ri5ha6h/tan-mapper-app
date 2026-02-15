# CLAUDE.md

## Development Commands

All commands use `bun`:

```sh
bun dev          # Start dev server on port 4008
bun run build    # Production build
bun run preview  # Preview production build
bun test         # Run tests (vitest)
bun run lint     # ESLint
bun run format   # Prettier
bun run check    # Prettier --write + ESLint --fix
```

## Tech Stack

- **Framework**: TanStack Start (TanStack Router + Nitro server)
- **UI**: React 19, Tailwind CSS v4, shadcn/ui (base-maia style with Base UI headless primitives)
- **Build**: Vite 7, TypeScript (strict mode)
- **Testing**: Vitest + Testing Library
- **Icons**: lucide-react

## Architecture

- **Routing**: File-based routing via TanStack Router — route files live in `src/routes/`
- **UI Components**: `src/components/ui/` (shadcn/ui components)
- **App Components**: `src/components/` (project-specific components)
- **Utilities**: `src/lib/utils.ts` (`cn()` class merge helper)
- **Styles**: `src/styles.css` (Tailwind v4 + CSS variables for theming)

## Key Conventions

- **Path alias**: `@/*` maps to `src/*`
- **Formatting**: No semicolons, single quotes (Prettier — see `prettier.config.js`)
- **Class merging**: Use `cn()` from `@/lib/utils` (clsx + tailwind-merge)
- **Component variants**: CVA (`class-variance-authority`) for variant props (see `button.tsx`)
- **Data attributes**: Components use `data-slot="component-name"` for identification
- **Named exports**: UI components use named exports (`export { Select, SelectTrigger, ... }`)
- **Base UI primitives**: shadcn/ui components wrap `@base-ui/react` headless primitives

## Adding UI Components

```sh
bunx shadcn add <component>
```

Config is in `components.json` — uses base-maia style, RSC disabled, stone base color, lucide icons.
