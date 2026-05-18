import { createHighlighterCore } from '@shikijs/core';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
import langHtml from '@shikijs/langs/html';
import langJs from '@shikijs/langs/javascript';
import themeGithubDark from '@shikijs/themes/github-dark';
import themeGithubLight from '@shikijs/themes/github-light';

(async () => {
  const hl = await createHighlighterCore({
    themes: [themeGithubDark, themeGithubLight],
    langs: [langHtml, langJs],
    engine: createJavaScriptRegexEngine(),
  });

  document.querySelectorAll('pre').forEach(pre => {
    const code = pre.textContent;
    if (!code.trim()) return;
    const lang = code.trimStart().startsWith('<') ? 'html' : 'javascript';
    try {
      const rendered = hl.codeToHtml(code, {
        lang,
        themes: { dark: 'github-dark', light: 'github-light' },
      });
      const tmp = document.createElement('div');
      tmp.innerHTML = rendered;
      const inner = tmp.querySelector('code');
      if (inner) pre.innerHTML = inner.innerHTML;
    } catch { /* keep plain text on error */ }
  });
})();
