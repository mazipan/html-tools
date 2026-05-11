---
description: Read a GitHub issue, branch off main, and plan the work
argument-hint: <issue-number>
allowed-tools: Bash, Read, TodoWrite, mcp__github__issue_read, mcp__github__list_issues
---

You're starting work on issue **#$ARGUMENTS** in `mazipan/html-tools`. Follow these steps:

1. **Read the issue** with `mcp__github__issue_read` (repo `mazipan/html-tools`, issue `$ARGUMENTS`). Skim the body, labels, and any linked umbrella issue (e.g. #27 for new tools, #13 for SEO).

2. **Confirm understanding** in 2–3 sentences: what's being asked, which files are likely involved, and any ambiguity worth flagging to the user before coding.

3. **Sync `main` and branch** — never branch off another in-flight branch (see AGENTS.md "Pull request rules"). Run:
   ```bash
   git fetch origin main
   git checkout -b claude/issue-$ARGUMENTS-<short-slug> origin/main
   ```
   Pick `<short-slug>` from the issue title (kebab-case, 2–4 words). If the branch already exists, check it out instead and `git pull --ff-only`.

4. **Update the umbrella issue** if this child belongs to one: flip the marker to `📝 spec'd (issue or PR open)` and link issue #$ARGUMENTS. Don't do this silently — tell the user which umbrella you're touching.

5. **Plan with TodoWrite** — break the work into concrete tasks. For a new tool, the canonical list is in AGENTS.md "Adding a new tool" (steps 1–9). For a bug fix or refactor, list the files to change.

6. **Stop and report**: post the plan back to the user before writing any code. Wait for go-ahead unless the issue is trivially small (single-line fix).
