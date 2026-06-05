# Conventions

## Coding conventions

- All processing must stay client-side — never add a server dependency or external API call.
- Match the dark UI style: `bg-gray-950` body, `border-gray-800` borders, `text-gray-200` base text, blue hover accents (`hover:border-blue-400`).
- Each tool page has a shared site header with a back-link to `index.html`.
- Build output goes to `dist/` — do not commit this directory.
- **HTML pages keep stable filenames** (`index.html`, `image-converter.html`, etc.) — they're entry bundles, served at predictable URLs. **Every other asset Parcel emits gets a content hash** in the filename (`styles.{hash}.css`, `theme.{hash}.js`, `json-utils.{hash}.js`, …). Hashed assets are cached forever (`Cache-Control: public, max-age=31536000, immutable` via `_headers`); HTML revalidates after 60s so a deploy propagates within ~60s.
- Per-tool logic stays in an inline `<script>` at the bottom of each HTML file (see `.ai/CONTRIBUTING.md` step 9). Only **shared** helpers (`theme.js`, `json-utils.js`, `image-utils.js`) live as separate hashed bundles so they cache once across the suite. **Exception:** if the tool needs `import` / `import()` from an npm package (like `snippet-to-image` does for Shiki), put the body in a sibling `src/<slug>.js` and reference it via `<script type="module" src="<slug>.js"></script>`. Parcel won't code-split bare-specifier imports out of an inline module — it minifies the body in place and leaves the imports unresolved.
- Parcel's default resolver needs `@parcel/resolver-default.packageExports: true` in `package.json` to honor the `exports` field of npm packages — it's already enabled at the root and must stay enabled for any tool that imports from subpath entries (`@shikijs/themes/github-dark`, etc.).

## Pull request rules

- **Every PR must include a `Closes #<issue_number>` line** in the PR description (or the commit message that lands on `main`) so GitHub auto-closes the linked issue on merge. If there is no related issue, omit the line — don't invent a number.
- **Every PR must target `main`. Never set a PR's base to another in-flight PR's branch.** Merged must mean deployed.
- Stacked PRs (one PR's base = another PR's branch) are a silent footgun: when the dependency merges into `main`, GitHub does **not** auto-rebase the stacked PR. Merging the stacked PR while its base still points at the now-defunct feature branch lands the merge commit on that dead branch instead of `main` — the PR shows as "Merged" but the changes never ship.
- If a branch genuinely needs commits from another in-flight PR, either (a) wait for the dependency to merge first and rebase onto `main`, or (b) absorb the rebase pain at merge time. Never use a non-`main` base as a shortcut.

## Tracking issues

Umbrella issues are the source of truth for what's planned, in flight, and shipped. Keep them honest:

- **When you open a child issue or PR for an item on an umbrella**, immediately edit the umbrella to flip that item's marker and link the child. Use `✅ shipped` / `📝 spec'd (issue or PR open)` / `⬜ not started`.
- **When a PR merges**, flip the umbrella marker to ✅ and link the file path (e.g. `src/<slug>.html`) so the umbrella shows what actually exists, not just what was intended.
- Don't leave dangling `📝` markers — if a child issue is closed without shipping, flip back to ⬜ with a one-line note.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/). Format: `<type>(<optional scope>): <description>`.

Types: `feat` (new user-facing capability), `fix` (bug fix), `docs`, `style` (formatting / CSS / non-behavioral UI tweaks), `refactor`, `perf`, `test`, `chore`, `build`, `ci`, `revert`.

Rules: present-tense description, lowercase first letter, no trailing period. Keep the subject line ≤72 characters; put detail in the body. Use a `BREAKING CHANGE:` footer when applicable.

Examples:
- `feat: add bun run preview script`
- `fix(spacing): tighten bottom-section vertical padding`
- `docs: document semantic landmarks convention`
- `refactor(build): extract jsonLdForPage helper`

## Git hooks

This project uses **lefthook** to run `biome format --write` as a pre-commit hook, and **GitHub Actions** to enforce formatting in CI.

**Never use `--no-verify` (or `-n`) when committing.** The pre-commit hook runs the formatter — skipping it means unformatted code enters the repo and will fail the CI `Format check` job.

If a commit fails because the hook reformatted files, stage the changes and commit again — do not bypass the hook to avoid that step.
