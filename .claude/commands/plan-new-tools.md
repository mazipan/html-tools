---
description: Plan a new tool from a brief, then file a child issue
argument-hint: <tool brief or name>
allowed-tools: Bash, Read, Glob, AskUserQuestion, TodoWrite, WebFetch, WebSearch, mcp__github__issue_read, mcp__github__search_issues, mcp__github__issue_write
---

Plan a new tool end-to-end — from a one-line brief to a filed GitHub issue with a full spec. **Stop there.** Implementation is `/start-issue` + `/new-tool` + `/ship`.

The brief: **$ARGUMENTS**

1. **Ground the brief in the codebase.** Read `AGENTS.md` and `src/tools.json`. Pick the existing tool whose shape most resembles the proposed one (e.g. `og-image-builder.html` for canvas image output, `regex-tester.html` for single-input live tools, `json-sort.html` for JSON-text tools, `image-cropper.html` for single-file image tools) and skim it so the plan reuses real partials, real classes, and the real inline-script pattern. Don't invent new conventions.

2. **Check for duplicates.** `mcp__github__search_issues` for the slug / tool name. If an open spec issue already exists, stop and tell the user — don't file a duplicate.

3. **Clarify scope.** Use `AskUserQuestion` (≤4 questions; skip entirely if the brief is unambiguous) to lock in only what the plan can't decide on its own — typical decisions: tech approach when a heavier library is on the table (e.g. Shiki vs Prism vs hand-rolled tokenizer), MVP cuts vs v2 scope, tool name / slug / icon if not obvious, category placement when more than one fits. **Don't ask anything AGENTS.md or the reference tool already answers.**

4. **Draft the plan inline.** Match the shape of existing spec issues (read #52, #55 for reference):
   - Header table: **Slug / Name / Icon / Category / Path**.
   - One-line summary of what the tool does.
   - UI layout sketch (controls column + preview/output column).
   - Tech choices table — one row per choice (library, bundling, render target, fonts, debouncing, etc.) with a one-sentence "why".
   - File checklist mapped to AGENTS.md "Adding a new tool" steps 1–9.
   - 4–5 suggested FAQs (real questions, not marketing copy).
   - Risks / open before merge.
   - Explicit **"out of scope for v1"** list when applicable.

   Use tables and bullets where they read faster than prose. Keep it terse.

5. **File the issue.** `mcp__github__issue_write` (create) on `mazipan/html-tools`:
   - **Title**: `feat: add <Tool Name> tool` (match #52, #55).
   - **Body**: the plan from step 4, lightly restructured — add a top `## Summary` paragraph and an `## Acceptance` checklist at the end mirroring AGENTS.md "Adding a new tool".
   - **Labels**: `enhancement`, `new-tool`.
   - Do **not** assign anyone or set a milestone unless the user asks.

6. **Report back** in 2–3 lines: new issue URL and the suggested next command — typically `/start-issue <new-number>`.

Rules:

- **Never branch, never edit `src/`, never commit.** This command ends at "issue filed."
- **This skill is scoped to new tools.** If the brief is for non-tool work (SEO, internal infra, docs), say so and exit.
- **Use `TodoWrite` at the start** so progress is visible. Mark each step done as it lands.
- **Don't invent issue numbers or labels.** Read first, write second.
