;(function () {
  var LS_KEY = 'htmltools-theme';
  var root   = document.documentElement;

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch(e) { return {}; }
  }
  function savePrefs(p) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch(e) {}
  }
  function applyPrefs(p) {
    root.dataset.theme = p.theme || 'dark';
    if (p.accent) root.dataset.accent = p.accent;
    else delete root.dataset.accent;
  }

  // Apply before first paint to avoid flash
  applyPrefs(loadPrefs());

  var ACCENTS = [
    { id: 'indigo', color: '#6366f1', label: 'Indigo' },
    { id: 'blue',   color: '#3b82f6', label: 'Blue'   },
    { id: 'green',  color: '#22c55e', label: 'Green'  },
    { id: 'orange', color: '#f97316', label: 'Orange' },
    { id: 'yellow', color: '#facc15', label: 'Yellow' },
  ];

  function renderPanel(panel) {
    var p      = loadPrefs();
    var theme  = p.theme  || 'dark';
    var accent = p.accent || 'indigo';
    var mini   = !!p.minimized;
    panel.classList.toggle('is-minimized', mini);
    if (mini) {
      panel.innerHTML =
        '<button class="tweaks-minimize" data-action="minimized" data-val="" title="Tweaks" aria-label="Tweaks">' +
          '＋' +
        '</button>';
      return;
    }
    panel.innerHTML =
      '<div class="tweaks-header">' +
        '<h4>Tweaks</h4>' +
        '<button class="tweaks-minimize" data-action="minimized" data-val="1" title="Minimize" aria-label="Minimize">' +
          '－' +
        '</button>' +
      '</div>' +
      '<div class="tweaks-body">' +
        '<div class="tweaks-row">' +
          '<span class="tweaks-label">Theme</span>' +
          '<div class="tweaks-seg">' +
            '<button data-action="theme" data-val="light"' + (theme === 'light' ? ' class="on"' : '') + '>Light</button>' +
            '<button data-action="theme" data-val="dark"'  + (theme === 'dark'  ? ' class="on"' : '') + '>Dark</button>'  +
          '</div>' +
        '</div>' +
        '<div class="tweaks-row">' +
          '<span class="tweaks-label">Accent</span>' +
          '<div class="tweaks-swatches">' +
          ACCENTS.map(function(a) {
            return '<button class="tweaks-swatch' + (accent === a.id ? ' on' : '') + '"' +
              ' data-action="accent" data-val="' + a.id + '"' +
              ' title="' + a.label + '"' +
              ' style="background:' + a.color + '"></button>';
          }).join('') +
          '</div>' +
        '</div>' +
      '</div>';
  }

  document.addEventListener('DOMContentLoaded', function() {
    var panel = document.createElement('div');
    panel.id = 'tweaks-panel';
    document.body.appendChild(panel);
    renderPanel(panel);

    panel.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var p = loadPrefs();
      p[btn.dataset.action] = btn.dataset.val;
      savePrefs(p);
      applyPrefs(p);
      renderPanel(panel);
    });
  });
})();
