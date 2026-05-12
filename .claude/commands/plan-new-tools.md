---
description: Plan a new tool from a brief, then file a child issue and flip the umbrella marker
argument-hint: <tool brief or name>
allowed-tools: Bash, Read, Glob, AskUserQuestion, TodoWrite, WebFetch, WebSearch, mcp__github__issue_read, mcp__github__search_issues, mcp__github__issue_write
---

Plan a new tool end-to-end — from a one-line brief to a filed GitHub issue with a full spec, plus the umbrella #27 marker flipped. **Stop there.** Implementation is `/start-issue` + `/new-tool` + `/ship`.

The brief: **$ARGUMENTS**

1. **Ground the brief in the codebase.** Read `AGENTS.md` and `src/tools.json`. Pick the existing tool whose shape most resembles the proposed one (e.g. `og-image-builder.html` for canvas image output, `regex-tester.html` for single-input live tools, `json-sort.html` for JSON-text tools, `image-cropper.html` for single-file image tools) and skim it so the plan reuses real partials, real classes, and the real inline-script pattern. Don't invent new conventions.

2. **Check the umbrella.** `mcp__github__issue_read` on `mazipan/html-tools` #27 to find the matching bullet.
   - **Already listed** (most common): note the exact wording — the plan will flip ⬜ → 📝 once the child issue is filed.
   - **Not listed**: surface this to the user before continuing. Either add a bullet under the right section in step 7, or proceed without one — but never skip the umbrella silently.
   
   Also `mcp__github__search_issues` for the slug / tool name. If an open spec issue already exists, stop and tell the user — don't file a duplicate.

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
   - **Body**: the plan from step 4, lightly restructured — add a top `## Summary` paragraph, a `Umbrella: #27` line right under it, and an `## Acceptance` checklist at the end mirroring AGENTS.md "Adding a new tool".
   - **Labels**: `enhancement`, `new-tool`.
   - Do **not** assign anyone or set a milestone unless the user asks.

7. **Update umbrella #27.** `mcp__github__issue_write` (update). Fetch the current body, then replace **only** the matching bullet — flip `⬜` to `📝 spec'd (issue or PR open)` and append `(#<new-issue>)` after the tool name. Surgical edit: don't rewrite surrounding sections, don't reflow other bullets. If the bullet wasn't there in step 2, insert it under the correct section now.

8. **Report back** in 2–3 lines: new issue URL, umbrella diff summary ("flipped *Code snippet to image* ⬜ → 📝, linked #X"), and the suggested next command — typically `/start-issue <new-number>`.

Rules:

- **Never branch, never edit `src/`, never commit.** This command ends at "issue filed + umbrella updated."
- **#27 is the new-tool umbrella.** If the brief is for non-tool work (SEO under #13, internal infra, docs), say so and exit — this command is scoped to new tools.
- **Use `TodoWrite` at the start** so progress is visible. Mark each step done as it lands.
- **Don't invent issue numbers, labels, or umbrella sections.** Read first, write second.
