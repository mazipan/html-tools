---
description: Commit, push, and open a PR with the template filled in
argument-hint: <issue-number>
allowed-tools: Bash, Read, mcp__github__create_pull_request, mcp__github__issue_read, mcp__github__issue_write
---

Ship the current branch as a PR closing issue **#$ARGUMENTS**. If no issue applies, the user can pass `none` — omit the `Closes` line in that case (don't invent a number).

Before running this command, `/preflight` should have passed. If you're not sure it did, run it first.

1. **Verify branch hygiene**:
   - `git branch --show-current` — must not be `main`.
   - `git fetch origin main` then `git log --oneline origin/main..HEAD` — confirm the commits are on top of `main`, not on top of another in-flight feature branch. AGENTS.md "Pull request rules" is strict about this: **every PR must target `main`**.
   - `git status --short` — if dirty, stage and commit before pushing.

2. **Commit** any pending changes with a Conventional Commit message. Format: `<type>(<scope>): <description>` — lowercase, no trailing period, ≤72 chars. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`, `revert`. Prefer NEW commits over `--amend`. Never `--no-verify`.

3. **Push** with `git push -u origin <current-branch>`. Retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s) only on network errors — not on rejected-non-fast-forward, which means investigate first.

4. **Draft the PR** following `.github/PULL_REQUEST_TEMPLATE.md`. Body must include:
   - `Closes #$ARGUMENTS` as the first line (omit if user passed `none`).
   - A "## What changed" section: 1–2 sentences on the why, not a file list.
   - The checklist from the template, with boxes checked honestly. Don't tick "All logic runs client-side" if you added an external API call; raise it instead.

5. **Open the PR** via `mcp__github__create_pull_request` (repo `mazipan/html-tools`, base `main`, head = current branch). Title follows the same Conventional Commit format as the commit. **Never set base to anything other than `main`** — see AGENTS.md on stacked PRs.

6. **Update the umbrella issue** if this PR closes a child of one (e.g. #27 for new tools, #13 for SEO). Flip the marker to `✅ shipped` only after merge — for now, ensure it's `📝 spec'd` with the PR linked. Use `mcp__github__issue_write` to edit the umbrella body.

7. **Report** the PR URL and ask the user whether to subscribe to PR activity (`mcp__github__subscribe_pr_activity`) so CI failures and review comments wake the session. Don't subscribe without consent.

Do **not** merge the PR. Do **not** force-push. Do **not** push to `main`.
