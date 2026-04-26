# AGENTS.md

## Project Overview

Single-page Vite + React + TypeScript application using Tailwind CSS with Radix UI components.

## Commands

- `npm run dev` - Start dev server
- `npm run build` - TypeScript check, then build (`tsc -b && vite build`)
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## Path Alias

`@` maps to `./src` (configured in `tsconfig.json` and `vite.config.ts`)

## Routes

- `/` - Home page (ChatDemo, ServicesHub, Models, HowItWorks, Pricing, CTA, Footer components)
- `/profissionais` - ProfessionalsPage with booking modal

## Key Configurations

- Dark mode via `ThemeContext` using class and `[data-theme="dark"]` selectors
- Tailwind custom colors: `navy-*`, `amber-*`
- Custom animations: `float`, `pulse-glow`, `fade-in-up`, `scale-in`, etc.

## UI Components

All Radix UI-based components in `src/components/ui/` (shadcn/ui style). Reusable pages in `src/pages/` and sections in `src/sections/`.