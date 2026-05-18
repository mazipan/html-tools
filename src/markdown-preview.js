import { marked } from 'marked';

marked.use({ gfm: true });

const editorEl = document.getElementById('editor');
const previewEl = document.getElementById('preview');
const charEl = document.getElementById('stat-chars');
const wordEl = document.getElementById('stat-words');
const lineEl = document.getElementById('stat-lines');

const SAMPLE = `# Markdown Preview

Welcome to the **Markdown Preview** tool. Edit on the left, see the result here instantly.

## Features

- **Bold** and _italic_ text
- ~~Strikethrough~~
- Inline \`code\` and fenced code blocks
- Tables, task lists, and blockquotes (GitHub Flavored Markdown)

## Code example

\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}!\`;
}
console.log(greet('World'));
\`\`\`

## Table

| Language   | Stars | Typed |
|------------|------:|-------|
| TypeScript | ⭐⭐⭐  | Yes   |
| Python     | ⭐⭐⭐  | Optional |
| Go         | ⭐⭐   | Yes   |

## Task list

- [x] Write Markdown
- [x] See live preview
- [ ] Share with friends

## Blockquote

> "Any fool can write code that a computer can understand.
> Good programmers write code that humans can understand."
> — Martin Fowler

---

Links like [mazipan.space](https://mazipan.space) open in a new tab.
`;

function updateStats(text) {
  charEl.textContent = text.length.toLocaleString();
  wordEl.textContent = text.trim() ? text.trim().split(/\s+/).length.toLocaleString() : '0';
  lineEl.textContent = text ? text.split('\n').length.toLocaleString() : '0';
}

function render(text) {
  const html = marked.parse(text);
  previewEl.innerHTML = html;
  // Open all links in a new tab
  previewEl.querySelectorAll('a').forEach((a) => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
  updateStats(text);
}

let debounceTimer;
editorEl.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => render(editorEl.value), 150);
});

// Toolbar actions
document.getElementById('btn-sample').addEventListener('click', () => {
  editorEl.value = SAMPLE;
  render(SAMPLE);
});

document.getElementById('btn-clear').addEventListener('click', () => {
  editorEl.value = '';
  render('');
});

document.getElementById('btn-copy-md').addEventListener('click', async () => {
  await navigator.clipboard.writeText(editorEl.value);
  const btn = document.getElementById('btn-copy-md');
  const orig = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => {
    btn.textContent = orig;
  }, 1500);
});

document.getElementById('btn-copy-html').addEventListener('click', async () => {
  await navigator.clipboard.writeText(marked.parse(editorEl.value));
  const btn = document.getElementById('btn-copy-html');
  const orig = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => {
    btn.textContent = orig;
  }, 1500);
});

document.getElementById('btn-download').addEventListener('click', () => {
  const blob = new Blob([editorEl.value], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'markdown-preview.md';
  a.click();
  URL.revokeObjectURL(url);
});

// Initial render with sample
editorEl.value = SAMPLE;
render(SAMPLE);
