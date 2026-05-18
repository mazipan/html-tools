import { createHighlighterCore } from '@shikijs/core';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
import langHtml from '@shikijs/langs/html';
import langJs from '@shikijs/langs/javascript';
import themeDracula from '@shikijs/themes/dracula';
import themeNightOwlLight from '@shikijs/themes/night-owl-light';

(async () => {
  const hl = await createHighlighterCore({
    themes: [themeDracula, themeNightOwlLight],
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
        themes: { dark: 'dracula', light: 'night-owl-light' },
        defaultColor: 'dark',
      });
      const tmp = document.createElement('div');
      tmp.innerHTML = rendered;
      const inner = tmp.querySelector('code');
      if (inner) pre.innerHTML = inner.innerHTML;

      const wrapper = pre.closest('.ds-snippet');
      if (wrapper && !wrapper.querySelector('.ds-lang-badge')) {
        const LANG_SHORT = { javascript: 'js', typescript: 'ts', markdown: 'md', python: 'py', ruby: 'rb', shellscript: 'sh' };
        const badge = document.createElement('span');
        badge.className = 'ds-lang-badge';
        badge.textContent = LANG_SHORT[lang] ?? lang;
        wrapper.appendChild(badge);
      }
    } catch { /* keep plain text on error */ }
  });
})();
