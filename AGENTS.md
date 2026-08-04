# Repository Guidelines

## Project Structure & Module Organization
- `apps/v0/` is the only application. It is the old LC-Rating UI and is deployed at the website root.
- `apps/v0/app/` contains Next.js App Router routes for the contest list, difficulty practice, search, algorithm templates, and topic lists.
- `apps/v0/components/` contains UI components and page containers.
- `apps/v0/hooks/` contains local browser storage, theme, progress, and static-data hooks.
- `apps/v0/public/` contains frozen static data loaded at runtime, including `contest.json`, `solutions.json`, `tags.json`, `qtags.json`, `ratings.json`, and `zenk.json`.
- `apps/v0/components/containers/List/data/` contains frozen topic-list content.

## Build, Test, and Development Commands
Run from the repo root unless noted.
- `pnpm install` installs workspace dependencies.
- `pnpm dev` starts the v0 Next app.
- `pnpm build` builds the static v0 site.
- `pnpm start` starts the built v0 app locally when supported by Next.
- `pnpm lint` runs the v0 lint command.
- Direct package commands may use `pnpm --filter lc-rating-v0 <script>`.

## Deployment
- Vercel deploys from the repository root using `vercel.json`.
- The build command is `pnpm build`.
- The output directory is `apps/v0/out`.
- The site is served at `/`, with no `/lc-rating` or `/v0` base path.

## Coding Style & Naming Conventions
- Use TypeScript, React, SCSS, Bootstrap, and React-Bootstrap patterns already present in `apps/v0`.
- Components use PascalCase; hooks use `useX` naming.
- Keep changes colocated under `apps/v0/components/`, `apps/v0/hooks/`, `apps/v0/app/`, or `apps/v0/scss/`.
- Avoid reintroducing the removed `apps/web` architecture or shared `packages` workspace.

## Data Policy
- Data is intentionally frozen. Do not add scheduled updaters, scraper workflows, backend sync, or data-generation tooling unless explicitly requested.
- If data is refreshed manually in the future, document the exact source, command, and generated files.

## Progress Storage
- User progress must remain local-only in browser `localStorage`.
- Do not add login, auth tokens, cloud sync, or backend progress APIs.
- Manual export/import of progress JSON in settings is acceptable because it stays user-controlled and local.

## Testing Guidelines
- There is no general test suite.
- Use `pnpm build` as the primary validation for deployability.
- Use `pnpm lint` when dependencies and local tooling are available.

## Commit & Pull Request Guidelines
- Keep commit messages short and descriptive, for example `refactor: simplify v0 deployment`.
- For UI changes, include screenshots or a short route checklist.
- For data changes, call out that frozen static content was changed intentionally.

## Security & Configuration Tips
- Do not commit secrets or add `.env*` files.
- Avoid client-side calls to GitHub, Cloudflare Workers, or other account/sync services unless explicitly requested.
