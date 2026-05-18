---
description: Reconcile an umbrella issue against the real state of its child issues/PRs and update markers + links
argument-hint: <umbrella-issue-number>
allowed-tools: Bash, Read, TodoWrite, mcp__github__issue_read, mcp__github__pull_request_read, mcp__github__search_issues, mcp__github__search_pull_requests, mcp__github__list_pull_requests, mcp__github__issue_write
---

Sync the umbrella issue **#$ARGUMENTS** in `mazipan/html-tools` so its markers and links match reality. Umbrellas drift fast — child issues close, PRs merge, files land — and AGENTS.md "Tracking issues" is strict that they stay honest. This command is the reconciliation pass.

If `$ARGUMENTS` is empty, ask the user which umbrella to sync. Don't guess.

1. **Read the umbrella.** `mcp__github__issue_read` on `mazipan/html-tools` #$ARGUMENTS. Bail out early if:
   - The issue is closed (umbrellas should stay open while tracking work — surface this and stop).
   - The body doesn't contain the `⬜` / `📝` / `✅` marker vocabulary (it's probably not an umbrella — confirm with the user before continuing).

2. **Parse the body into a checklist.** Walk every bullet that starts with one of the three markers. For each, capture:
   - The raw line (for surgical replacement later).
   - The item name (the text after the marker, before any parenthetical).
   - The current marker (`⬜` / `📝` / `✅`).
   - Any linked issue / PR number (`#NN`) and any file path (`src/<slug>.html`).
   - The section heading it sits under (so a missing-link search can be scoped).
   
   Keep an in-memory list — do not rewrite the body yet.

3. **Plan with TodoWrite.** One todo per bullet, plus a final "rewrite umbrella body" task. Visibility matters because the reconciliation can take a while.

4. **Resolve each bullet against GitHub.** For every item, run the matching probe:
   - **Has a linked `#NN`**: read it with `mcp__github__issue_read` (or `mcp__github__pull_request_read` if it's a PR — try issue first, fall back to PR on 404). Determine state:
     - PR **merged** → target marker is `✅`. Find the canonical artifact path (for new tools, `src/<slug>.html`; for SEO/docs, the touched file). If the bullet doesn't already cite a path, add it.
     - PR **open** or issue **open** → target marker is `📝 spec'd (issue or PR open)`. Keep the `(#NN)` link.
     - Issue **closed as completed** with no PR linked → search `mcp__github__search_pull_requests` for `repo:mazipan/html-tools is:pr closes:#NN` (or scan recent merged PRs). If a merged PR is found, treat as ✅ with the path; if not, flag the bullet in the report so the user can decide (don't silently flip to ✅).
     - Issue **closed as not planned / duplicate** → target marker is `⬜`, append a short note (`— closed as not planned, #NN`). AGENTS.md: "Don't leave dangling `📝` markers."
   - **No linked `#NN`, marker is `⬜`**: search `mcp__github__search_issues` for open issues whose title contains the item name / slug, scoped to `repo:mazipan/html-tools is:open`. Also search `mcp__github__search_pull_requests` for open PRs. If exactly one strong match exists, propose flipping to `📝` and linking it; if multiple or ambiguous, list them in the report and leave the bullet alone.
   - **No linked `#NN`, marker is `✅`**: trust the existing path/citation. Only re-check if the user passes a flag like `--deep` (skip otherwise — these are settled).
   
   Batch the reads where possible (multiple `issue_read` calls in a single message) to keep this fast.

5. **Compute the diff.** Build a list of `(old line → new line)` replacements. Skip bullets where nothing changed. If the diff is empty, report "umbrella already in sync" and stop — don't write a no-op edit.

6. **Rewrite the body surgically.** Fetch the umbrella body fresh (state may have drifted during step 4), then for each `(old, new)` pair do an **exact string replace** — don't reflow sections, don't normalize whitespace, don't touch bullets that didn't change. If any `old` string no longer matches (someone edited the umbrella mid-run), abort that single replacement and flag it in the report. Use `mcp__github__issue_write` (update) once with the rewritten body.

7. **Report** in a compact table or bullet list:
   - `<section> · <item>`: `<old marker> → <new marker>` (`+#NN` / `+path` / `note: …`).
   - Items that need human judgement (ambiguous matches, closed-completed without a merged PR found, mid-run conflicts).
   - End with the umbrella URL and a 1-line summary (`flipped 3, linked 2, flagged 1, untouched 14`).

Rules:

- **One umbrella per run.** If the user wants multiple umbrellas synced, call `/sync-umbrella-issue` once per umbrella — keeps each diff scrutable.
- **Never invent links.** If the search doesn't return a confident match, leave the bullet alone and flag it.
- **Never flip `📝` → `✅` without a merged PR.** A closed-completed issue alone isn't enough — work only counts as shipped when code landed.
- **Never rewrite untouched bullets.** Surgical edits only. The umbrella's history matters; don't churn it.
- **No branching, no `src/` edits, no commits.** This command only touches the umbrella issue body on GitHub.
- If the user is mid-`/plan-new-tools` or `/ship`, those already flip the relevant marker. This command is the periodic reconciliation pass, not a substitute for in-flow updates.
