# LC-Rating Minimal

A frozen, local-only LeetCode practice site based on the original v0 UI of LC-Rating.

This fork keeps the older Bootstrap-style interface and removes the newer app, cloud login, progress sync backend, and automated problem update workflows. All problem, contest, rating, tag, and solution data is bundled as static content. User progress is stored only in each browser's localStorage.

## What Is Included

- Contest list with Q1-Q4 problem ratings.
- Difficulty practice page at `/zen`.
- Topic study lists under `/list/*`.
- Local-only attempt log with felt-difficulty bands and spaced-repetition review dates.
- Manual local progress export/import in site settings.
- Dark/light theme from the old v0 UI.

## What Is Not Included

- No login or user accounts.
- No cloud progress sync.
- No backend API.
- No scheduled data refresh.
- No newer `apps/web` UI.

## Project Structure

```text
apps/v0/                 # The only app, deployed at the site root
apps/v0/public/          # Frozen static JSON data loaded by the browser
apps/v0/components/      # Old UI components and study-list renderers
apps/v0/hooks/           # Local storage, theme, and data hooks
apps/v0/scss/            # Bootstrap-era styling
vercel.json              # Vercel static deployment config
```

## Development

Run from the repository root:

```bash
pnpm install
pnpm dev
```

The root scripts delegate to `apps/v0`:

```bash
pnpm build
pnpm start
pnpm lint
```

For direct package commands:

```bash
pnpm --filter lc-rating-v0 dev
pnpm --filter lc-rating-v0 build
```

## Vercel Deployment

Deploy the repository root. `vercel.json` runs `pnpm build` and publishes `apps/v0/out`.

The site is served at `/`, so static files are loaded from root paths such as `/contest.json`.

## Data Policy

Data is intentionally frozen. To refresh problem/rating/solution data later, reintroduce a deliberate data-generation workflow and document the exact source and command. Until then, avoid adding updater scripts or backend dependencies.

## Progress Storage

Progress is local to the user's browser. Clearing browser site data will remove progress. Users can use Settings -> Backup/import progress to manually copy progress JSON between browsers.
