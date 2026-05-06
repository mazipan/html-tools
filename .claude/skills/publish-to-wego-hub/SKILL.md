---
name: publish-to-wego-hub
description: Upload files to Wego Hub (internal.wego.com/hub). Publishes HTML reports, PDFs, or other static files to a shared internal URL. Invoke with /publish-to-wego-hub <slug> <file> [file2 ...].
---

# Publish to Wego Hub

Upload one or more files to `internal.wego.com/hub` under a slug. Files are served at `https://internal.wego.com/hub/apps/{slug}/{filename}`.

If an uploaded file is named `index.html`, the response `url` points directly at `.../{slug}/index.html`.

## Arguments

- `<slug>`: group name for the upload (e.g. `stale-prs`, `cost-report`). Lowercase alphanumeric + internal hyphens, 1–64 chars, no leading/trailing hyphen. Pass the literal string `auto` (or omit the form field) to auto-generate a slug like `pub-{timestamp}-{rand}`.
- `<file> [file2 ...]`: one or more file paths to upload (max 20 files per request).
- Optional: `--description "<text>"` to set a human-readable description on the slug.

## API

- **Endpoint**: `POST https://internal.wego.com/hub/api/publish`
- **Auth**: Bearer token via `HUB_DEPLOY_TOKEN` env var
- **Form fields**: `slug` (string, optional — omit or pass `auto` to auto-generate), `description` (string, optional), `file` (multipart, repeatable)
- **Limits**: 10 MB per file, 50 MB total per upload, **max 20 files** per request
- **Behavior**: re-uploading same slug + filename overwrites the file and creates a version snapshot
- **Response**: `{ status: "ok", data: { slug, url, files: [filename, ...] } }`
- **Envs**: production `internal.wego.com`, staging `internal-staging.wego.com`, local dev `http://localhost:8787`
- **Live API docs** (Swagger): https://internal.wego.com/hub/api/docs · OpenAPI spec: https://internal.wego.com/hub/api

## First-time setup

If `HUB_DEPLOY_TOKEN` is not set in the environment, walk the user through these steps:

1. **Login**: Open https://internal.wego.com/hub/auth/login in a browser and sign in with your `@wego.com` Google Workspace account.
2. **Create a deploy token**: Go to https://internal.wego.com/hub/tokens, enter a name (e.g. `claude-code-laptop`), and click "Create token". Copy the token immediately — it is only shown once.
3. **Set the env var**: Add `HUB_DEPLOY_TOKEN` to your shell profile or Claude Code settings so it persists across sessions. Do NOT hardcode tokens in scripts or commit them.

## Workflow

### 1. Validate inputs

- Slug: 1–64 chars, `^[a-z0-9][a-z0-9-]*[a-z0-9]$` (or single `[a-z0-9]`). No leading/trailing hyphen. Or pass `auto` to let the server generate one.
- At least one file path required; no more than 20.
- Verify each file exists and is under 10 MB; total under 50 MB.

### 2. Check for deploy token

Look for `HUB_DEPLOY_TOKEN` in the environment. If not set, guide the user through the first-time setup above.

### 3. Upload

```bash
TMPOUT=$(mktemp)
time_start=$(python3 -c "import time; print(int(time.time()*1000))")

curl -sS -X POST https://internal.wego.com/hub/api/publish \
  -H "Authorization: Bearer $HUB_DEPLOY_TOKEN" \
  -F "slug=SLUG_HERE" \
  -F "file=@/path/to/file1" \
  -F "file=@/path/to/file2" \
  -o "$TMPOUT"
# Optional extras:
#   -F "description=Short human-readable summary"
#   (omit -F "slug=..." or use -F "slug=auto" to auto-generate the slug)

time_end=$(python3 -c "import time; print(int(time.time()*1000))")
elapsed=$(python3 -c "print($time_end - $time_start)")

python3 -c "
import json
with open('$TMPOUT') as f:
    data = json.load(f)
if data.get('status') == 'ok':
    slug = data['data']['slug']
    base = f\"https://internal.wego.com/hub/apps/{slug}\"
    for f in data['data']['files']:
        print(f'  {base}/{f}')
else:
    print(f'Error: {data}')
"
echo \"Completed in \${elapsed}ms\"
rm -f \"\$TMPOUT\"
```

For multiple files, add multiple `-F "file=@..."` flags in the same curl call.

The printer derives each file URL from `slug` + filename (not from the response `url`), so an `index.html` upload prints the canonical per-file path.

### 4. Report

Print each uploaded file's full URL and the time taken. Example output:

```
  https://internal.wego.com/hub/apps/stale-prs/report.html
  https://internal.wego.com/hub/apps/stale-prs/data.json
Completed in 4565ms
```

## Wego Hub reference

- **Upload UI**: https://internal.wego.com/hub/uploads
- **Directory**: https://internal.wego.com/hub/directory
- **Token management**: https://internal.wego.com/hub/tokens
- **Docs**: https://internal.wego.com/hub/docs
- **Swagger API docs**: https://internal.wego.com/hub/api/docs

## Alternative: remote MCP

Wego Hub also exposes a remote MCP endpoint at `https://internal.wego.com/hub/mcp` with `hub_upload_files` and `hub_publish` tools (same Bearer token). Prefer this skill's HTTP flow for shell/CI usage; use the MCP tools when already connected to the endpoint from Claude Code / Claude Desktop. See [`README.md`](../../../README.md#mcp-integration) for setup.

## Source of truth (optional — read only when needed)

This skill ships inside the Wego Hub repo. If its behavior seems stale, an error message is unfamiliar, or the API has changed in a way this doc doesn't cover, consult the source:

- [`src/routes/api/publish.ts`](../../../src/routes/api/publish.ts) — publish endpoint contract (slug rules, auto-gen, response shape, `index.html` behavior)
- [`src/services/file-uploads/upload-workflow.ts`](../../../src/services/file-uploads/upload-workflow.ts) — limits (`MAX_FILE_SIZE`, `MAX_FILE_COUNT`), validation, errors
- [`src/services/file-uploads/storage.ts`](../../../src/services/file-uploads/storage.ts) — `isValidSlug` regex, content-type map

Do **not** read these files by default — this skill's documentation is the primary interface. Fall back to source only when (a) an unexpected error appears, (b) the user reports mismatched behavior, or (c) a feature not described here is needed. Keep context minimal.
