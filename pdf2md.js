// PDF -> Markdown, fully client-side. Rebuilds structure from text positions and font sizes.
import * as pdfjsLib from "./lib/pdf.min.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./lib/pdf.worker.min.js", import.meta.url).href;

const MARKER_ONLY = /^([•●▪◦○■□‣▸►·\-–—*]|\d{1,3}[.)]|[a-z][.)])$/;
const BULLET = /^\s*([•●▪◦○■□‣▸►·\-–—*])\s+\S/;
const NUMBER = /^\s*(\d{1,3}|[a-z])[.)]\s+\S/;
const END_PUNCT = /[.!?:]["”')\]]*$/;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const esc = (s) => s.replace(/([*`<])/g, "\\$1");

// ---------- inline rendering ----------
function renderRuns(runs, useB) {
  const m = [];
  for (const r of runs) {
    const p = m[m.length - 1];
    if (p && p.b === r.b && p.i === r.i && p.link === r.link) p.t += r.t; else m.push({ ...r });
  }
  return m.map((r) => {
    const [, lead, core0, trail] = r.t.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!core0) return r.t;
    let core = esc(core0);
    if (r.i) core = `*${core}*`;
    if (useB && r.b) core = `**${core}**`;
    if (r.link) core = `[${core}](${r.link})`;
    return lead + core + trail;
  }).join("");
}

function dropChars(runs, n) {
  const out = [];
  for (const r of runs) {
    if (n >= r.t.length) { n -= r.t.length; continue; }
    out.push(n ? { ...r, t: r.t.slice(n) } : r);
    n = 0;
  }
  return out;
}

// ---------- page extraction ----------
function makeLine(items, seg, page) {
  items.sort((p, q) => p.x - q.x);
  let cells = [], cell = null, prev = null;
  for (const it of items) {
    const ref = prev ? Math.max(prev.size, it.size) : it.size;
    const gap = prev ? it.x - (prev.x + prev.w) : 0;
    if (!prev || gap > ref * 1.1) { cell = { x0: it.x, x1: it.x + it.w, runs: [] }; cells.push(cell); }
    else if (gap > ref * 0.15 && !/\s$/.test(prev.s) && !/^\s/.test(it.s))
      cell.runs.push({ t: " ", b: prev.b && it.b, i: prev.i && it.i, link: prev.link === it.link ? prev.link : null });
    cell.runs.push({ t: it.s, b: it.b, i: it.i, link: it.link });
    cell.x1 = Math.max(cell.x1, it.x + it.w);
    prev = it;
  }
  const text = (c) => c.runs.map((r) => r.t).join("");
  if (cells.length >= 2 && MARKER_ONLY.test(text(cells[0]).trim())) { // "•    item" is a list marker, not a table
    const [a, b, ...rest] = cells;
    cells = [{ x0: a.x0, x1: b.x1, runs: [...a.runs, { t: " " }, ...b.runs] }, ...rest];
  }
  cells.forEach((c) => (c.plain = text(c).trim()));
  const runs = cells.flatMap((c, k) => (k ? [{ t: " " }, ...c.runs] : c.runs));
  const raw = runs.map((r) => r.t).join("");
  const chars = new Map();
  for (const it of items) chars.set(Math.round(it.size * 2) / 2, (chars.get(Math.round(it.size * 2) / 2) || 0) + it.s.length);
  const size = [...chars.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const visible = runs.filter((r) => r.t.trim());
  return {
    cells, runs, raw, plain: raw.replace(/\s+/g, " ").trim(), seg, page, size,
    x: cells[0].x0, x1: cells[cells.length - 1].x1, y: items[0].y,
    bold: visible.length > 0 && visible.every((r) => r.b),
  };
}

function groupRows(items) {
  const sorted = [...items].sort((p, q) => p.y - q.y || p.x - q.x), rows = [];
  for (const it of sorted) {
    const r = rows[rows.length - 1];
    if (r && Math.abs(it.y - r.y) <= Math.max(it.size, r.size) * 0.4) { r.items.push(it); r.size = Math.max(r.size, it.size); }
    else rows.push({ y: it.y, size: it.size, items: [it] });
  }
  return rows;
}
const medianOf = (arr) => { const s = [...arr].sort((x, y) => x - y); return s[s.length >> 1] ?? 0; };
const crosses = (i, gx) => i.x < gx - 2 && i.x + i.w > gx + 2;

// Finds a vertical gutter: the lowest-coverage band in the middle of the page that sits clearly
// below the coverage on both sides. Works even if the two columns aren't vertically aligned.
function findGutter(items, W) {
  if (items.length < 16) return null;
  const n = Math.ceil(W) + 2, cov = new Uint16Array(n);
  for (const it of items) for (let k = Math.max(0, Math.floor(it.x)); k <= Math.min(n - 1, Math.ceil(it.x + it.w)); k++) cov[k]++;
  const lo = Math.floor(W * 0.3), hi = Math.ceil(W * 0.7);
  const slice = (a, z) => Array.from({ length: Math.max(0, Math.floor(z) - Math.ceil(a) + 1) }, (_, k) => cov[Math.ceil(a) + k]);
  let min = Infinity;
  for (let k = lo; k <= hi; k++) min = Math.min(min, cov[k]);
  let best = null, start = -1;
  for (let k = lo; k <= hi + 1; k++) {
    if (k <= hi && cov[k] <= min + 1) { if (start < 0) start = k; }
    else if (start >= 0) { if (k - start >= 8 && (!best || k - start > best[1] - best[0])) best = [start, k]; start = -1; }
  }
  if (!best) return null;
  const gx = (best[0] + best[1]) / 2, gm = medianOf(slice(best[0], best[1]));
  if (medianOf(slice(W * 0.14, W * 0.27)) - gm < 4 || medianOf(slice(W * 0.73, W * 0.84)) - gm < 4) return null;
  const side = (pred) => { const r = groupRows(items.filter(pred)); return r.length ? [r.length, r.reduce((t, x) => t + x.items.reduce((u, i) => u + i.s.length, 0), 0) / r.length] : [0, 0]; };
  const [ln, la] = side((i) => i.x + i.w <= gx + 2), [rn, ra] = side((i) => i.x >= gx - 2);
  return ln >= 4 && rn >= 4 && la >= 25 && ra >= 25 ? gx : null;
}

async function extractPage(page, opts) {
  const [vx0, vy0, vx1, vy1] = page.view;
  const W = vx1 - vx0, H = vy1 - vy0;
  const tc = await page.getTextContent();
  const fonts = {};
  let links = [];
  if (opts.style) {
    try {
      await page.getOperatorList(); // loads fonts so their real names (…-Bold, …-Italic) are known
      for (const id of Object.keys(tc.styles)) {
        if (!page.commonObjs.has(id)) continue;
        const f = page.commonObjs.get(id), n = f.name || "";
        fonts[id] = { b: !!f.bold || /bold|black|heavy|semibold|demibold/i.test(n), i: !!f.italic || /italic|oblique/i.test(n) };
      }
    } catch { /* styles are optional */ }
    try { links = (await page.getAnnotations()).filter((a) => a.subtype === "Link" && a.url).map((a) => ({ r: a.rect, url: a.url })); } catch {}
  }
  const items = [];
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    const [a, b, c, d, e, f] = it.transform;
    if (Math.abs(b) > Math.abs(a) * 0.7) continue; // skip rotated text (watermarks, side labels)
    const size = Math.hypot(c, d) || it.height || 10, st = fonts[it.fontName] || {};
    const base = { x: e - vx0, y: H - (f - vy0), size, b: !!st.b, i: !!st.i };
    const cy = f + size * 0.3;
    const hit = links.find((l) => cy >= l.r[1] && cy <= l.r[3] && Math.min(e + it.width, l.r[2]) - Math.max(e, l.r[0]) > 0);
    if (!hit) { items.push({ ...base, s: it.str, w: it.width, link: null }); continue; }
    const len = it.str.length, per = it.width / len;
    let ca = Math.round((hit.r[0] - e) / per), cb = Math.round((hit.r[2] - e) / per);
    ca = Math.max(0, ca); cb = Math.min(len, cb);
    const near = (k, ok) => { for (let d = 0; d <= len; d++) { if (k - d >= 0 && ok(k - d)) return k - d; if (k + d <= len && ok(k + d)) return k + d; } return k; };
    ca = near(ca, (k) => k === 0 || it.str[k - 1] === " ");   // snap to the nearest word boundary
    cb = near(cb, (k) => k === len || it.str[k] === " ");
    for (const [a, z, link] of [[0, ca, null], [ca, cb, hit.url], [cb, len, null]])
      if (z > a) items.push({ ...base, x: base.x + a * per, s: it.str.slice(a, z), w: (z - a) * per, link });
  }
  const gx = findGutter(items, W), lines = [];
  if (!gx) groupRows(items).forEach((r) => lines.push(makeLine(r.items, "0")));
  else {
    // Short two-sided rows (table-like) and anything crossing the gutter are full-width; the rest is column text.
    const shortBoth = new Set();
    for (const r of groupRows(items)) {
      const l = r.items.filter((i) => i.x + i.w / 2 < gx), q = r.items.filter((i) => i.x + i.w / 2 >= gx);
      const len = (a) => a.reduce((t, i) => t + i.s.length, 0);
      if (l.length && q.length && Math.max(len(l), len(q)) < 25) r.items.forEach((i) => shortBoth.add(i));
    }
    const full = [], left = [], right = [];
    for (const it of items) (crosses(it, gx) || shortBoth.has(it) ? full : it.x + it.w / 2 < gx ? left : right).push(it);
    const fr = groupRows(full), lr = groupRows(left), rr = groupRows(right);
    const segOf = (y) => fr.filter((f) => f.y < y - 1).length;
    let group = 0;
    for (let k = 0; k <= fr.length; k++) {
      const l = lr.filter((r) => segOf(r.y) === k), q = rr.filter((r) => segOf(r.y) === k);
      if (l.length || q.length) { l.forEach((r) => lines.push(makeLine(r.items, group + "L"))); q.forEach((r) => lines.push(makeLine(r.items, group + "R"))); group++; }
      if (k < fr.length) lines.push(makeLine(fr[k].items, group + "f"));
    }
  }
  const bySeg = {};
  for (const l of lines) (bySeg[l.seg] ||= []).push(l.x1 - l.x);
  const w90 = {};
  for (const k in bySeg) { const s = bySeg[k].sort((a, b) => a - b); w90[k] = s[Math.floor((s.length - 1) * 0.9)]; }
  return { lines, H, w90 };
}

// ---------- document-level analysis ----------
function stripHeadersFooters(pages) {
  const N = pages.length, counts = new Map();
  const key = (l) => l.plain.replace(/\d+/g, "#").toLowerCase();
  const margin = (l, H) => l.y < H * 0.09 || l.y > H * 0.91;
  for (const p of pages) {
    const seen = new Set();
    for (const l of p.lines) if (margin(l, p.H) && !seen.has(key(l))) { seen.add(key(l)); counts.set(key(l), (counts.get(key(l)) || 0) + 1); }
  }
  const need = Math.max(3, Math.ceil(N * 0.4));
  for (const p of pages)
    p.lines = p.lines.filter((l) => !(margin(l, p.H) && ((N >= 3 && counts.get(key(l)) >= need) || /^(page\s*)?\d+(\s*(of|\/)\s*\d+)?$/i.test(l.plain))));
}

function analyze(pages) {
  const sizeChars = new Map();
  let total = 0, bold = 0;
  for (const p of pages) for (const l of p.lines) {
    const n = l.plain.length;
    sizeChars.set(l.size, (sizeChars.get(l.size) || 0) + n);
    total += n; if (l.bold) bold += n;
  }
  const body = [...sizeChars.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 10;
  const big = [...sizeChars.entries()].filter(([s, n]) => s >= body * 1.18 && n / total < 0.1).map(([s]) => s).sort((a, b) => b - a).slice(0, 4);
  const levels = new Map(big.map((s, i) => [s, i + 1]));
  const dys = [];
  for (const p of pages) for (let i = 1; i < p.lines.length; i++) {
    const a = p.lines[i - 1], b = p.lines[i], dy = b.y - a.y;
    if (a.seg === b.seg && Math.abs(a.size - body) < 0.6 && Math.abs(b.size - body) < 0.6 && dy > body * 0.8 && dy < body * 2.2) dys.push(dy);
  }
  return { body, levels, lead: median(dys) || body * 1.2, boldRatio: total ? bold / total : 0 };
}

function buildTable(ls, useB) {
  const iv = ls.flatMap((l) => l.cells.map((c) => [c.x0, c.x1])).sort((a, b) => a[0] - b[0]);
  const cols = [];
  for (const [a, b] of iv) { const c = cols[cols.length - 1]; if (c && a <= c[1]) c[1] = Math.max(c[1], b); else cols.push([a, b]); }
  if (cols.length < 2 || cols.length > 12) return null;
  return ls.map((l) => {
    const row = cols.map(() => "");
    for (const c of l.cells) {
      const mid = (c.x0 + c.x1) / 2, k = Math.max(0, cols.findIndex(([a, b]) => mid >= a && mid <= b));
      row[k] = (row[k] ? row[k] + " " : "") + renderRuns(c.runs, useB).trim().replace(/\|/g, "\\|");
    }
    return row;
  });
}

function groupTables(lines, lead, useB) {
  const out = [];
  const cand = (l) => l.cells.length >= 2 && l.cells.length <= 12 && l.cells.every((c) => c.plain.length <= 60);
  for (let i = 0; i < lines.length;) {
    if (!cand(lines[i])) { out.push({ line: lines[i++] }); continue; }
    let j = i + 1;
    while (j < lines.length && cand(lines[j]) && lines[j].seg === lines[i].seg && lines[j].y > lines[j - 1].y && lines[j].y - lines[j - 1].y <= lead * 3) j++;
    const rows = j - i >= 2 ? buildTable(lines.slice(i, j), useB) : null;
    if (rows) { out.push({ rows }); i = j; } else out.push({ line: lines[i++] });
  }
  return out;
}

const join = (a, b) => (/[A-Za-z]-$/.test(a) && /^[a-z]/.test(b) ? a.slice(0, -1) + b : a + " " + b);

function assemble(pages, opts) {
  const A = analyze(pages), useB = A.boldRatio < 0.5;
  const blocks = [];
  let para = null, prev = null, listXs = null;
  const flush = () => {
    if (!para) return;
    if (para.t === "p" && para.n === 1 && para.bold && para.plain.length <= 80 && !/[.,;:!?]$/.test(para.plain))
      blocks.push({ t: "h", level: Math.max(2, Math.min(6, A.levels.size + 1)), text: esc(para.plain) });
    else blocks.push(para);
    para = null;
  };
  for (const p of pages) {
    if (opts.pages) { flush(); blocks.push({ t: "raw", text: `<!-- Page ${p.n} -->` }); prev = null; }
    for (const g of groupTables(p.lines, A.lead, useB)) {
      if (g.rows) { flush(); blocks.push({ t: "table", rows: g.rows }); prev = null; listXs = null; continue; }
      const L = g.line;
      L.page = p.n;
      const text = renderRuns(L.runs, useB).trim();
      const lvl = A.levels.get(L.size);
      if (lvl && L.plain.length <= 140 && !/[.,;]$/.test(L.plain)) {
        flush();
        const last = blocks[blocks.length - 1];
        if (last && last.t === "h" && last.level === lvl && prev && prev.page === L.page && prev.seg === L.seg && L.y - prev.y < L.size * 1.7) last.text += " " + esc(L.plain);
        else blocks.push({ t: "h", level: lvl, text: esc(L.plain) });
        prev = L; listXs = null; continue;
      }
      const flow = prev && prev.page === L.page && prev.seg === L.seg;
      const mk = L.raw.match(BULLET) ? "b" : L.raw.match(NUMBER) ? "n" : null;
      if (mk) {
        const m = L.raw.match(mk === "b" ? /^\s*(\S+)\s+/ : /^\s*(\d{1,3}|[a-z])[.)]\s+/);
        if (!(para && para.t === "li")) listXs = [];
        flush();
        let level = listXs.findIndex((x) => Math.abs(x - L.x) < 4);
        if (level < 0) { listXs.push(L.x); listXs.sort((a, b) => a - b); level = listXs.findIndex((x) => Math.abs(x - L.x) < 4); }
        level = Math.min(level, 5);
        para = { t: "li", ordered: mk === "n", marker: mk === "n" ? m[1] : "-", level, x: L.x, text: renderRuns(dropChars(L.runs, m[0].length), useB).trim(), prevLine: L };
        prev = L; continue;
      }
      let cont = false;
      if (para && para.t !== "raw") {
        if (flow) {
          const dy = L.y - prev.y;
          cont = dy > 0 && dy <= A.lead * 1.45 && Math.abs(L.size - prev.size) < 1.2;
          if (cont && para.t === "p") {
            if (L.x - prev.x > L.size * 0.8) cont = false;
            if (cont && prev.x1 - prev.x < 0.72 * (p.w90[prev.seg] || 1e9) && END_PUNCT.test(prev.raw.trim())) cont = false;
            if (cont && prev.bold && !L.bold) cont = false;
          }
          if (cont && para.t === "li" && L.x < para.x - L.size * 0.6) cont = false;
        } else {
          cont = !opts.pages && !END_PUNCT.test(prev.raw.trim()) && /^[a-z(]/.test(L.raw.trim());
        }
      }
      if (cont) {
        para.text = join(para.text, text);
        if (para.t === "p") { para.plain = join(para.plain, L.plain); para.n++; para.bold = para.bold && L.bold; }
      } else {
        flush();
        listXs = null;
        para = { t: "p", text, plain: L.plain, n: 1, bold: L.bold };
      }
      prev = L;
    }
  }
  flush();
  let out = "";
  blocks.forEach((b, i) => {
    let s;
    if (b.t === "h") s = "#".repeat(b.level) + " " + b.text;
    else if (b.t === "li") s = "    ".repeat(b.level) + (b.ordered && /\d/.test(b.marker) ? b.marker + ". " : (b.ordered ? "- " + b.marker + ") " : "- ")) + b.text;
    else if (b.t === "table") {
      const w = Math.max(...b.rows.map((r) => r.length)), line = (r) => "| " + r.join(" | ") + " |";
      s = [line(b.rows[0]), "| " + Array(w).fill("---").join(" | ") + " |", ...b.rows.slice(1).map(line)].join("\n");
    } else if (b.t === "raw") s = b.text;
    else s = /^(#{1,6}\s|>|[-+]\s|\d+[.)]\s)/.test(b.text) ? "\\" + b.text : b.text;
    const pb = blocks[i - 1], tight = b.t === "li" && pb && pb.t === "li" && !(b.level === 0 && b.ordered !== pb.ordered);
    out += i === 0 ? s : (tight ? "\n" : "\n\n") + s;
  });
  return out.trim();
}

// ---------- public API ----------
export class NoTextError extends Error { name = "NoTextError"; }
export class CancelledError extends Error { name = "CancelledError"; }

export async function pdfToMarkdown(file, opts, onProgress, isCancelled, askPassword) {
  const url = URL.createObjectURL(file);
  const task = pdfjsLib.getDocument({
    url, isEvalSupported: false, cMapPacked: true,
    cMapUrl: new URL("./lib/cmaps/", import.meta.url).href,
  });
  task.onPassword = (update, reason) => {
    const pw = askPassword && askPassword(reason === 2);
    if (pw) update(pw); else task.destroy();
  };
  let doc;
  try {
    doc = await task.promise;
    const pages = [], n = doc.numPages;
    for (let i = 1; i <= n; i++) {
      if (isCancelled()) throw new CancelledError();
      const page = await doc.getPage(i);
      const data = await extractPage(page, opts);
      data.n = i; pages.push(data);
      page.cleanup();
      onProgress(i, n);
      if (i % 8 === 0) await new Promise((r) => setTimeout(r));
    }
    if (opts.hf) stripHeadersFooters(pages);
    if (!pages.some((p) => p.lines.length)) throw new NoTextError();
    return { markdown: assemble(pages, opts), pages: n };
  } finally {
    URL.revokeObjectURL(url);
    if (doc) doc.destroy();
  }
}
