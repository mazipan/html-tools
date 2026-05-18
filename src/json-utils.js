// Fixes common JS-ish JSON mistakes: unquoted keys, single-quoted strings,
// trailing commas, and // or /* */ comments. Preserves string contents intact.
function sanitizeJson(input) {
  let out = '';
  let i = 0;
  const n = input.length;
  const isIdStart = (c) => /[A-Za-z_$]/.test(c);
  const isIdPart = (c) => /[A-Za-z0-9_$]/.test(c);

  while (i < n) {
    const c = input[i];

    if (c === '"') {
      out += c;
      i++;
      while (i < n) {
        const ch = input[i];
        out += ch;
        if (ch === '\\' && i + 1 < n) {
          out += input[i + 1];
          i += 2;
          continue;
        }
        i++;
        if (ch === '"') break;
      }
      continue;
    }

    if (c === "'") {
      out += '"';
      i++;
      while (i < n) {
        const ch = input[i];
        if (ch === '\\' && i + 1 < n) {
          const nx = input[i + 1];
          out += nx === "'" ? "'" : '\\' + nx;
          i += 2;
          continue;
        }
        if (ch === "'") {
          out += '"';
          i++;
          break;
        }
        if (ch === '"') out += '\\"';
        else out += ch;
        i++;
      }
      continue;
    }

    if (c === '/' && input[i + 1] === '/') {
      while (i < n && input[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && input[i + 1] === '*') {
      i += 2;
      while (i < n && !(input[i] === '*' && input[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (isIdStart(c)) {
      let j = i;
      while (j < n && isIdPart(input[j])) j++;
      const ident = input.slice(i, j);
      let k = j;
      while (k < n && /\s/.test(input[k])) k++;
      const isKey = input[k] === ':' && ident !== 'true' && ident !== 'false' && ident !== 'null';
      out += isKey ? `"${ident}"` : ident;
      i = j;
      continue;
    }

    out += c;
    i++;
  }

  return out.replace(/,(\s*[}\]])/g, '$1');
}

// Returns { value, text, fixed } or throws the original error.
function tolerantParse(raw) {
  try {
    const value = JSON.parse(raw);
    return { value, text: raw, fixed: false };
  } catch (originalErr) {
    const sanitized = sanitizeJson(raw);
    try {
      const value = JSON.parse(sanitized);
      return { value, text: sanitized, fixed: true };
    } catch (_) {
      throw originalErr;
    }
  }
}
