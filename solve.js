// A fast drop-in for csv-reader 1.0.0: run(input) answers {columns, rows, errors}
// exactly as csv-reader does for every input, but quicker.
//
// One left-to-right pass over the text. Fields are sliced out of the input
// instead of being built up one character at a time, and a quoted field takes
// a shortcut when its content holds no doubled quotes and no line breaks.
// The broken-row policy is csv-reader's own:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled,
//     "" inside it is one quote, and each CRLF or lone CR inside it is read as LF;
//     what follows its closing quote, up to the next comma or line break, is
//     appended as it stands (quote_junk, when the field ends); a quote that never
//     closes is a literal character, and the text after it is read again as
//     unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character;
//   - fields stay strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the
//     records after it (every record when header is false), each padded with ""
//     (short_row, with fields: its field count) or cut (long_row, with extra:
//     the cut fields) to the first record's width;
//   - each error is {code, line, row}: line the 1-based line its record starts
//     on, row its record's index in rows (null for the header), in the order met.

const COMMA = 0; // the field ended at a comma: the record goes on
const BREAK = 1; // the field ended at a line break: the record ends
const END = 2; // the field ended at the end of the text: the record ends

const QUOTE = 34; // "
const COMMA_CH = 44; // ,
const LF = 10; // \n
const CR = 13; // \r
const BOM = 0xFEFF;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const s = String(input.text);
  const header = input.header === true;
  const n = s.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let p = 0; // the index of the next character to read
  let line = 1; // the line that character is on

  if (n > 0 && s.charCodeAt(0) === BOM) p = 1;

  // How the last field read ended, and whether it opened with a quote.
  let endKind = END;
  let lastQuoted = false;

  function addError(code, recLine, recRow) {
    errors.push({ code, line: recLine, row: recRow });
  }

  // The kept characters of s[start..stop], with any dropped CRs cut out.
  // drops holds the positions of the CRs dropped inside the range, if any.
  function keptText(start, stop, drops) {
    if (drops === null) return s.slice(start, stop);
    let out = s.slice(start, drops[0]);
    for (let k = 1; k < drops.length; k++) {
      out += s.slice(drops[k - 1] + 1, drops[k]);
    }
    out += s.slice(drops[drops.length - 1] + 1, stop);
    return out;
  }

  // Reads an unquoted field starting at `start`: up to the next comma or line
  // break. A CR not followed by LF is dropped (stray_cr). Returns the field,
  // sets endKind, and moves p past the terminator.
  function readPlain(start, recLine, recRow) {
    let j = start;
    let drops = null;
    while (j < n) {
      const c = s.charCodeAt(j);
      if (c === COMMA_CH) {
        p = j + 1;
        endKind = COMMA;
        return keptText(start, j, drops);
      }
      if (c === LF) {
        p = j + 1;
        line += 1;
        endKind = BREAK;
        return keptText(start, j, drops);
      }
      if (c === CR) {
        if (j + 1 < n && s.charCodeAt(j + 1) === LF) {
          p = j + 2;
          line += 1;
          endKind = BREAK;
          return keptText(start, j, drops);
        }
        addError('stray_cr', recLine, recRow);
        if (drops === null) drops = [];
        drops.push(j);
        j += 1;
        continue;
      }
      j += 1;
    }
    p = n;
    endKind = END;
    return keptText(start, j, drops);
  }

  // Builds a quoted field's content from s[from..to]: "" collapses to one
  // quote, and every CRLF or lone CR inside it is read as one LF. Counts the
  // lines the content spans. Only called when the content is not a plain slice.
  function buildQuoted(from, to) {
    let out = '';
    let q = from;
    while (q < to) {
      const c = s.charCodeAt(q);
      if (c === QUOTE) {
        out += '"';
        q += 2;
        continue;
      }
      if (c === CR) {
        out += '\n';
        line += 1;
        q += q + 1 < to && s.charCodeAt(q + 1) === LF ? 2 : 1;
        continue;
      }
      if (c === LF) {
        out += '\n';
        line += 1;
        q += 1;
        continue;
      }
      // A run of ordinary characters: slice it out whole.
      let r = q + 1;
      while (r < to) {
        const d = s.charCodeAt(r);
        if (d === QUOTE || d === CR || d === LF) break;
        r += 1;
      }
      out += s.slice(q, r);
      q = r;
    }
    return out;
  }

  // Reads a quoted field whose opening quote is at p. Returns its value,
  // sets endKind and lastQuoted, and moves p past the terminator.
  function readQuoted(recLine, recRow) {
    const open = p;
    // The closing quote is the first quote whose next character is not a quote.
    let k = s.indexOf('"', open + 1);
    let doubled = false;
    while (k !== -1 && k + 1 < n && s.charCodeAt(k + 1) === QUOTE) {
      doubled = true;
      k = s.indexOf('"', k + 2);
    }
    if (k === -1) {
      // The quote never closes: it is a literal character, and the text after
      // it is read again as an unquoted field.
      addError('unterminated_quote', recLine, recRow);
      lastQuoted = false;
      return readPlain(open, recLine, recRow);
    }
    // The content is s[open + 1 .. k]. When it holds no doubled quote and no
    // line break it is a plain slice; otherwise it is built up.
    const firstCr = s.indexOf('\r', open + 1);
    const firstLf = s.indexOf('\n', open + 1);
    const hasBreak = (firstCr !== -1 && firstCr < k) || (firstLf !== -1 && firstLf < k);
    const value = !doubled && !hasBreak ? s.slice(open + 1, k) : buildQuoted(open + 1, k);
    lastQuoted = true;
    const after = k + 1;
    if (after >= n) {
      p = n;
      endKind = END;
      return value;
    }
    const c = s.charCodeAt(after);
    if (c === COMMA_CH) {
      p = after + 1;
      endKind = COMMA;
      return value;
    }
    if (c === LF) {
      p = after + 1;
      line += 1;
      endKind = BREAK;
      return value;
    }
    if (c === CR && after + 1 < n && s.charCodeAt(after + 1) === LF) {
      p = after + 2;
      line += 1;
      endKind = BREAK;
      return value;
    }
    // What follows the closing quote is appended as it stands, up to the next
    // comma or line break; quote_junk fires when anything was kept.
    const junk = readPlain(after, recLine, recRow);
    if (junk.length > 0) addError('quote_junk', recLine, recRow);
    return value + junk;
  }

  while (true) {
    // Lines with no characters are no records.
    while (p < n) {
      const c = s.charCodeAt(p);
      if (c === LF) {
        p += 1;
        line += 1;
      } else if (c === CR && p + 1 < n && s.charCodeAt(p + 1) === LF) {
        p += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (p >= n) break;

    const recLine = line;
    const recRow = header && columns === null ? null : rows.length;
    const fields = [];
    do {
      if (s.charCodeAt(p) === QUOTE) {
        fields.push(readQuoted(recLine, recRow));
      } else {
        lastQuoted = false;
        fields.push(readPlain(p, recLine, recRow));
      }
    } while (endKind === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recLine, row: recRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recLine, row: recRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
