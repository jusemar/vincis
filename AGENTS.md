# AGENTS.md

## Project Overview

Single-page Vite + React + TypeScript application using Tailwind CSS with Radix UI components.
Migrated to **feature-based architecture** per `regras.md`.

## Commands

- `npm run dev` - Start dev server
- `npm run build` - TypeScript check, then build (`tsc -b && vite build`)
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## Path Alias

`@` maps to `./src` (configured in `tsconfig.json` and `vite.config.ts`)

## Routes

| Route | Component | Feature |
|-------|-----------|---------|
| `/` | Home `(ChatDemo, Banners, ServicesHub, HowItWorks, CTA)` + `Footer` | `home` |
| `/precos` | `PricingPage` + `Models` | `precos` |
| `/profissionais` | `ProfessionalsPage` + `ProfessionalCard, BookingModal, FilterBar` | `profissionais` |
| `/parceiros` | `PaginaParceiros` | `parceiros` |
| `/perfil-profissionalv3` | `PerfilProfissional` | `perfis` |
| `/perfil-profissional` | `PerfilProfissionalV2` | `perfis` |
| `/perfil-colaborador` | `PerfilColaborador` | `perfis` |
| `/admin` / `/admin/:page` | `AdminDashboard` | `admin` |

## Feature Structure

```
src/features/<dominio>/
├── components/     # UI components re-exported via index.ts
├── actions/        # (future) server actions / mutations
├── queries/        # (future) data fetching
├── schemas/        # (future) Zod/validation schemas
├── lib/            # (future) business logic
├── types/          # (future) type definitions
├── constants/      # (future) constants
└── index.ts       # barrel exports
```

## Existing Features

- **home** — Landing page sections (ChatDemo, ServicesHub, HowItWorks, CTA, Banners, Hero, Pricing)
- **precos** — PricingPage, Models section
- **profissionais** — ProfessionalsPage, ProfessionalCard, BookingModal, FilterBar
- **perfis** — PerfilProfissional, PerfilProfissionalV2, PerfilColaborador, perfil sections
- **parceiros** — PaginaParceiros
- **admin** — AdminDashboard + all subpages + atendimentos Kanban

## Shared Components

```
src/components/
├── ui/             # shadcn/ui components (Radix-based)
└── shared/         # Navigation, ThemeToggle, Footer
```

## Key Configurations

- Dark mode via `ThemeContext` using class and `[data-theme="dark"]` selectors
- Tailwind custom colors: `navy-*`, `amber-*`
- Custom animations: `float`, `pulse-glow`, `fade-in-up`, `scale-in`, etc.

## Known Divergences from regras.md

- Project uses Vite + React (not Next.js App Router)
- No backend, no Drizzle ORM, no PostgreSQL (frontend-only SPA)
- `actions/`, `queries/`, `schemas/`, `lib/`, `types/`, `constants/` dirs exist but are empty (awaiting backend)
- RBAC, multiempresa, auditoria not implemented yet
- No `app/` directory (Vite uses `src/`)
- `src/admin` migrated to `src/features/admin` (regras.md says no pages inside features)
