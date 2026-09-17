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

## Data Sources and Attribution

Problem ratings are not calculated by this project. They come from
[zerotrac/leetcode_problem_rating](https://github.com/zerotrac/leetcode_problem_rating)
(MIT License, Copyright (c) 2021 Shuxin Chen), which derives them with an Elo /
maximum-likelihood model over weekly and biweekly contest results. That project
also covers contest problems only, which is why the pool here starts at
question 828 rather than 1.

The frozen files were taken from that repository at a pinned revision:

```text
commit 51cf4dc36ad22ca55583f3375b979a8bd1a4bece   (weekly-contest-518)
file   https://raw.githubusercontent.com/zerotrac/leetcode_problem_rating/51cf4dc36ad22ca55583f3375b979a8bd1a4bece/data.json
```

`data.json` provides, per question: rating, English title, Chinese title,
title slug, contest slug, problem index, and the contest name in both
languages. The frozen files here were produced from it in two ways:

- `zenk.json`, `contest.json`, `tags.json`, `qtags.json` keep their Chinese
  fields, and ratings match upstream exactly.
- `titles-en.json` is generated as `{ question_id: English title }`. It is a
  separate file rather than a field inside `zenk.json` so the same strings are
  stored once and readers using the Chinese UI never download them.
- `contest.json` gains `contest.title_en`, taken from upstream's `ContestID_en`
  (for example `weekly-contest-478` -> `Weekly Contest 478`). Only 566 entries,
  so these stay inline.

Upstream English titles are the official ones for almost every problem, but a
few use their own casing (for example `1d` where LeetCode writes `1D`), and one
question in this pool (3235) is absent upstream and falls back to title-casing
its slug.

If the data is ever refreshed, pin the new upstream commit here and record how
each file was derived.

## Progress Storage

Progress is local to the user's browser. Clearing browser site data will remove progress. Users can use Settings -> Backup/import progress to manually copy progress JSON between browsers.
