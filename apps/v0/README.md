# LC-Rating v0 Minimal App

This is the only app in the fork. It preserves the older LC-Rating UI and runs as a static, local-only Next.js site.

## Routes

- `/` contest list
- `/zen` difficulty practice
- `/list/slide_window`
- `/list/binary_search`
- `/list/monotonic_stack`
- `/list/grid`
- `/list/bitwise_operations`
- `/list/graph`
- `/list/dynamic_programming`
- `/list/data_structure`
- `/list/math`
- `/list/greedy`
- `/list/trees`
- `/list/string`

## Data

Static JSON data lives in `public/` and is loaded from root paths such as `/contest.json`. The study-list content under `components/containers/List/data/` is also frozen.

## Local Progress

Progress is stored in browser localStorage. The settings modal includes a local backup/import page for manually copying progress JSON. There is no login, backend, or cloud sync.

## Commands

From the repository root:

```bash
pnpm dev
pnpm build
pnpm lint
```

Or directly:

```bash
pnpm --filter lc-rating-v0 dev
pnpm --filter lc-rating-v0 build
```
