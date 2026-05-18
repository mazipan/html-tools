import semver from 'semver';

const versionEl   = document.getElementById('sv-version');
const rangeEl     = document.getElementById('sv-range');
const resultEl    = document.getElementById('sv-result');
const breakdownEl = document.getElementById('sv-breakdown');
const expansionEl = document.getElementById('sv-expansion');

function check() {
  const raw     = versionEl.value.trim();
  const rawRange = rangeEl.value.trim();

  resultEl.className = 'sv-result';
  resultEl.textContent = '';
  breakdownEl.innerHTML = '';
  expansionEl.textContent = '';

  if (!raw && !rawRange) return;

  const ver = semver.valid(raw);
  if (!ver) {
    resultEl.classList.add('warn-bar');
    resultEl.textContent = `⚠️  "${raw || '(empty)'}" is not a valid semver version`;
    return;
  }

  // Version breakdown
  const parsed = semver.parse(ver);
  breakdownEl.innerHTML = [
    ['Major',          parsed.major],
    ['Minor',          parsed.minor],
    ['Patch',          parsed.patch],
    ['Pre-release',    parsed.prerelease.length ? parsed.prerelease.join('.') : '—'],
    ['Build metadata', parsed.build.length      ? parsed.build.join('.')      : '—'],
  ].map(([label, val]) =>
    `<div class="sv-chip"><span class="sv-chip-label">${label}</span><strong>${val}</strong></div>`
  ).join('');

  if (!rawRange) return;

  // Range expansion
  const expanded = semver.validRange(rawRange);
  if (expanded === null) {
    resultEl.classList.add('warn-bar');
    resultEl.textContent = `⚠️  "${rawRange}" is not a valid semver range`;
    return;
  }
  expansionEl.textContent = rawRange === expanded ? expanded : `${rawRange}  →  ${expanded}`;

  // Satisfies check
  const ok = semver.satisfies(ver, rawRange);
  resultEl.classList.add(ok ? 'success-bar' : 'error-bar');
  resultEl.textContent = ok
    ? `✅  ${ver}  satisfies  ${rawRange}`
    : `❌  ${ver}  does not satisfy  ${rawRange}`;
}

versionEl.addEventListener('input', check);
rangeEl.addEventListener('input', check);

// Sample chips
document.querySelectorAll('[data-range]').forEach(chip => {
  chip.addEventListener('click', () => {
    rangeEl.value = chip.dataset.range;
    check();
  });
});

// Initial check (pre-filled values)
check();
