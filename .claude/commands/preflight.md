---
description: Run generators + build and surface any drift before shipping
allowed-tools: Bash, Read
---

Run the pre-ship checks so the commit doesn't land with stale generated files or a broken build.

1. **Stash awareness**: run `git status --short`. If there are uncommitted changes, note them — the generator output below will be mixed in, and the user needs to know which files are theirs vs. regenerated.

2. **Regenerate** in this order:
   ```bash
   npm run generate:favicon
   npm run generate:sections
   ```
   `generate:sections` is idempotent (sentinel-wrapped regions), so re-running can't duplicate. `generate:favicon` only rewrites PNGs when emojis or tool entries changed.

3. **Show drift**: `git status --short` and `git diff --stat`. Call out anything generated that wasn't expected — especially favicon PNGs (the user may have forgotten to update an emoji) or sentinel-wrapped regions in tool HTMLs (means `tools.json` was edited without re-running generators).

4. **Build**: `npm run build`. If it fails, stop and surface the error verbatim — don't try to fix it without the user's input.

5. **Optional spot check**: if the change touches a tool page or shared styles, suggest `npm run preview` and tell the user which URLs to open. Don't start the preview server yourself unless asked.

6. **Report** in a few lines: what regenerated, whether the build passed, and whether anything looks suspicious. End with a yes/no on "safe to commit".
