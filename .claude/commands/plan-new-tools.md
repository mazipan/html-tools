---
description: Plan a new tool from a brief, then file a child issue and flip the umbrella marker
argument-hint: <tool brief or name>
allowed-tools: Bash, Read, Glob, AskUserQuestion, TodoWrite, WebFetch, WebSearch, mcp__github__issue_read, mcp__github__search_issues, mcp__github__issue_write, mcp__github__add_issue_comment
---

Plan a new tool end-to-end — from a one-line brief to a filed GitHub issue with a full spec, and (if a live umbrella exists) the umbrella marker flipped. **Stop there.** Implementation is `/start-issue` + `/new-tool` + `/ship`.

The brief: **$ARGUMENTS**

1. **Ground the brief in the codebase.** Read `AGENTS.md` and `src/tools.json`. Pick the existing tool whose shape most resembles the proposed one (e.g. `og-image-builder.html` for canvas image output, `regex-tester.html` for single-input live tools, `json-sort.html` for JSON-text tools, `image-cropper.html` for single-file image tools) and skim it so the plan reuses real partials, real classes, and the real inline-script pattern. Don't invent new conventions.

2. **Find a live umbrella (or confirm there is none).** The umbrella is the open tracking issue for new-tool ideas.
   - Read issue #27. If it is **open**, use it as the umbrella — find the matching bullet (note exact wording for the flip in step 7). If the tool isn't listed, surface this to the user before continuing.
   - If #27 is **closed**, search for another open umbrella: `mcp__github__search_issues` with `repo:mazipan/html-tools label:epic is:open`. Use the first result whose title/body matches "new tool ideas" or similar. If none is found, **proceed without an umbrella** — do not invent one and do not reopen a closed issue.
   - Either way, also search for the tool slug / name. If an open spec issue already exists, stop and tell the user — don't file a duplicate.

3. **Clarify scope.** Use `AskUserQuestion` (≤4 questions; skip entirely if the brief is unambiguous) to lock in only what the plan can't decide on its own — typical decisions: tech approach when a heavier library is on the table (e.g. Shiki vs Prism vs hand-rolled tokenizer), MVP cuts vs v2 scope, tool name / slug / icon if not obvious, category placement when more than one fits. **Don't ask anything AGENTS.md or the reference tool already answers.**

4. **Draft the plan inline.** Match the shape of existing spec issues (read #40, #52, #55 for reference):
   - Header table: **Slug / Name / Icon / Category / Path**.
   - One-line summary of what the tool does.
   - UI layout sketch (controls column + preview/output column).
   - Tech choices table — one row per choice (library, bundling, render target, fonts, debouncing, etc.) with a one-sentence "why".
   - File checklist mapped to AGENTS.md "Adding a new tool" steps 1–9.
   - 4–5 suggested FAQs (real questions, not marketing copy).
   - Risks / open before merge.
   - Explicit **"out of scope for v1"** list when applicable.
   
   Use tables and bullets where they read faster than prose. Keep it terse.

5. **File the child issue.** `mcp__github__issue_write` (create) on `mazipan/html-tools`:
   - **Title**: `feat: add <Tool Name> tool` (match #52, #55).
   - **Body**: the plan from step 4, lightly restructured — add a top `## Summary` paragraph, then an `Umbrella: #<N>` line right under it **only if a live umbrella was found in step 2** (omit the line entirely if there is no open umbrella), and an `## Acceptance` checklist at the end mirroring AGENTS.md "Adding a new tool".
   - **Labels**: `enhancement`, `new-tool`.
   - Do **not** assign anyone or set a milestone unless the user asks.

6. **Update the umbrella — only if one is open.** If step 2 found a live umbrella:
   - Attempt a surgical body edit via `mcp__github__issue_write` (update): replace only the matching bullet, flipping `⬜` → `📝 spec'd (issue or PR open)` and appending `(#<new-issue>)`. Don't rewrite surrounding sections.
   - If the body is too long for a safe PUT (the API may truncate it on read), fall back to `mcp__github__add_issue_comment` on the umbrella issue — post a comment describing the marker change needed, matching the format of existing sync comments on #27. Never silently skip this step.
   - If there is no live umbrella, skip this step entirely and note the omission in the report.

7. **Report back** in 2–3 lines: new issue URL, umbrella status ("flipped *Tool Name* ⬜ → 📝, linked #X" or "no open umbrella found — issue filed standalone"), and the suggested next command — typically `/start-issue <new-number>`.

Rules:

- **Never branch, never edit `src/`, never commit.** This command ends at "issue filed + umbrella updated (if applicable)."
- **This skill is scoped to new tools.** If the brief is for non-tool work (SEO, internal infra, docs), say so and exit.
- **Use `TodoWrite` at the start** so progress is visible. Mark each step done as it lands.
- **Don't invent issue numbers, labels, or umbrella sections.** Read first, write second.
- **Never reopen a closed umbrella issue.** If the previous umbrella is closed, find a new open one or proceed without.
