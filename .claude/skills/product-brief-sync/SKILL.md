---
name: product-brief-sync
description: Read this repo's (and SRBS's, when attached) README/docs and write a structured product brief to the Shift Board's "product-briefs" collection, so Growth/Research can cite real product facts instead of guessing. Use when asked to sync, refresh, or update product briefs on the board, or on a weekly cadence / after a meaningful feature change.
---

# Product Brief Sync

Growth and Research run in sandboxes with no access to this repo (or SRBS),
so they can't check README/docs before writing copy or research and end up
guessing at product specifics — features, delivery mechanism, pricing,
metrics. This skill closes that gap: it runs from Engineering's session
(the one with actual repo access), extracts the real facts, and writes them
to a shared board collection Growth/Research can read at the start of every
run.

Requires the board URL. If it isn't already in context for this run, ask
the user/routine prompt for it (it's the same Artifact URL Engineering's
recurring routine reads/writes every run — check the routine's own prompt
or a prior "roles/engineering" board doc for it) rather than guessing one.

## When to run this

- Explicitly asked to "sync product briefs" / "update the product briefs".
- Engineering just shipped a meaningful product/feature change in one of
  the covered repos (new pricing, new delivery mechanism, a major feature).
- It's been roughly a week since `updatedAt` on a repo's brief doc.

Re-running is always safe — each run fully replaces that repo's brief doc
(via `write_db` "set"), it doesn't append.

## Repos covered

- `REALEVR/REALEVR-ESTATES` (this repo) — doc id `realevr-estates`
- `Sendrick01/SRBS` — doc id `srbs`, **only when that repo is actually
  attached/cloned in this session** (its own GitHub org is outside
  REALEVR's normal repo scope — skip it quietly, don't fail the whole run,
  if it isn't present this time; note the gap in your summary instead)

If a future run adds more product repos, extend this list rather than
scattering the logic — same five fields, same collection, new doc id per
repo (kebab-case of the repo name).

## Steps

For each covered repo that is actually present in this session's working
directories:

1. **Read the source material.** At minimum: `README.md` at the repo root,
   and anything under `docs/` (in particular a `docs/PROJECT_BRIEF.md` or
   similar if one exists — that's usually the richest source). Skim
   `package.json` / `shared/schema.ts`-equivalent files only if the docs
   don't already answer "how is this delivered" (e.g. web app vs. requires
   a headset vs. mobile app) — don't go spelunking through the whole
   codebase for this.

2. **Extract these fields** (leave a field `null` rather than guessing if
   the docs don't say):
   - `summary` — one-line description of what the product is.
   - `targetCustomer` — who it's for.
   - `keyFeatures` — array of short phrases, the actual shipped features
     (not the roadmap/aspirational ones — check dates/changelog if the
     docs conflate the two).
   - `deliveryMechanism` — how a customer actually uses it (e.g. "browser,
     no headset required", "iOS app", "web dashboard + WhatsApp bot").
   - `metrics` — any concrete numbers the docs state (users, listings,
     revenue, etc.) — `null` if none are documented, never invented.
   - `pricing` — actual pricing/tiers if documented, else `null`.

3. **Get the current commit** the brief is based on
   (`git rev-parse HEAD` in that repo) for `sourceCommit`, so a stale brief
   is easy to spot later.

4. **Write one document per repo** to the board's `product-briefs`
   collection via Artifact `write_db` (`db_op: "set"`, since this is a
   full refresh each time):

   ```
   collection: "product-briefs"
   doc_id: "<repo-slug>"          e.g. "realevr-estates", "srbs"
   data: {
     repo: "<org>/<repo>",
     summary: "...",
     targetCustomer: "...",
     keyFeatures: ["...", "..."],
     deliveryMechanism: "...",
     metrics: "..." | null,
     pricing: "..." | null,
     sourceCommit: "<sha>",
     updatedAt: "<ISO now>"
   }
   ```

   If you previously read this doc this run (e.g. to check whether it's
   stale before deciding to refresh it), pass that `version` as
   `if_version` on the `set` so a concurrent edit isn't clobbered; if you
   haven't read it, omit `if_version` — a first-time write for a repo has
   nothing to conflict with.

5. **Report what you wrote**, one line per repo, e.g. "realevr-estates
   brief refreshed as of commit ab226cd" — plain confirmation, not a full
   dump of the brief (the board doc is the record).

## For Growth/Research (context, not this skill's job to enforce)

The `product-briefs` collection is meant to be read at the start of every
Growth/Research run instead of assuming product facts. If a brief doc is
missing or its `sourceCommit`/`updatedAt` looks stale relative to recent
Engineering activity, that's a signal to ask Engineering to re-run this
skill rather than proceeding on stale/absent data.
