# Repository Guidelines

## Style Guide
- Don't add any external dependencies appart from SpacetimeDB
- Keep solutions maximally simple in terms of lines of code (while not sacrificing typing or variable names)
- no bloat, boilerplate reptetive logic

## Project Structure & Module Organization
- `src/` holds the Vite + TypeScript frontend. Entry points live in `src/main.ts` and markup helpers in `src/html.ts`.
- `spacetimedb/` is the database module with its own `package.json` and build/publish scripts.
- `docs/` is the build target for GitHub Pages.

## Build, Test, and Development Commands
- `npm run dev` — start the Vite dev server for the dashboard.
- `npm run build` — build for GitHub Pages (`BUILD_TARGET=gh-pages`).
