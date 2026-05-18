// Syntax-highlight all <pre> blocks in design-system.html using Shiki.
// Runs after DOMContentLoaded; replaces pre.innerHTML with Shiki-colored spans
// while keeping all existing classes (bg, border, padding) on the <pre> itself.
// Copy buttons still work: pre.textContent returns plain code text after innerHTML swap.
import { createHighlighterCore } from '@shikijs/core';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
import langHtml from '@shikijs/langs/html';
import langJs from '@shikijs/langs/javascript';
import themeGithubDark from '@shikijs/themes/github-dark';

(async () => {
  const hl = await createHighlighterCore({
    themes: [themeGithubDark],
    langs: [langHtml, langJs],
    engine: createJavaScriptRegexEngine(),
  });

  document.querySelectorAll('pre').forEach(pre => {
    const code = pre.textContent;
    if (!code.trim()) return;
    // Auto-detect: HTML snippets start with < (tags or comments); everything else is JS.
    const lang = code.trimStart().startsWith('<') ? 'html' : 'javascript';
    try {
      const rendered = hl.codeToHtml(code, { lang, theme: 'github-dark' });
      const tmp = document.createElement('div');
      tmp.innerHTML = rendered;
      const inner = tmp.querySelector('code');
      // Replace pre contents with highlighted spans; existing <pre> classes stay.
      if (inner) pre.innerHTML = inner.innerHTML;
    } catch { /* keep plain text on error */ }
  });
})();
