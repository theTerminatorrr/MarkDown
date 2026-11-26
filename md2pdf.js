// Markdown -> PDF, fully client-side.
const loaded = {};
export function loadScript(src) {
  return (loaded[src] ||= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = () => rej(new Error("Couldn’t load " + src));
    document.head.appendChild(s);
  }));
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Decodes every HTML entity (&copy;, &rarr;, &#8212; ...) the way the browser preview does.
let decoder = null;
const unesc = (s) => {
  s = String(s);
  if (!s.includes("&")) return s;
  if (typeof document === "undefined") // fallback if there is no DOM
    return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  decoder ||= document.createElement("textarea"); // a textarea never runs markup
  decoder.innerHTML = s;
  return decoder.value;
};
const UNSAFE = /^\s*(javascript|vbscript|data):/i;

// The direct PDF uses the bundled Roboto font. Any character outside this list (CJK, Arabic, Indic, emoji,
// arrows, check marks, box-drawing ...) would come out blank, so those documents use the browser print route.
// The list is the exact set of characters present in all four bundled Roboto weights.
const FONT_OK = /^[\t\n\r\u0020-\u007E\u00A0-\u017F\u018F\u0192\u01A0-\u01A1\u01AF-\u01B0\u01F0\u01FA-\u01FF\u0218-\u021B\u0237\u0259\u02BC\u02C6-\u02C7\u02C9\u02D8-\u02DD\u02F3\u0300-\u0301\u0303\u0309\u030F\u0323\u0384-\u038A\u038C\u038E-\u03A1\u03A3-\u03CE\u03D1-\u03D2\u03D6\u0400-\u0486\u0488-\u0513\u1E00-\u1E01\u1E3E-\u1E3F\u1E80-\u1E85\u1E9E\u1EA0-\u1EF9\u1F4D\u2000-\u200B\u2010-\u2011\u2013-\u2015\u2017-\u201E\u2020-\u2022\u2025-\u2027\u2030\u2032-\u2033\u2039-\u203A\u203C\u2044\u2070\u2074-\u208E\u20A3-\u20A4\u20A6-\u20AC\u20B1\u20B9-\u20BA\u20BC-\u20BD\u2105\u2113\u2116\u2122\u2126\u212E\u215B-\u215E\u2202\u2206\u220F\u2211-\u2212\u221A\u221E\u222B\u2248\u2260\u2264-\u2265\u25CA\uEE01-\uEE02\uF6C3\uFB01-\uFB04\uFEFF\uFFFC-\uFFFD]*$/u;
const hasEntity = (md) => /&(#\d+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/.test(md);
export const needsBrowserPrint = (md) => !FONT_OK.test(md) || (hasEntity(md) && !FONT_OK.test(unesc(md)));

// ---------- HTML (preview + print route). Raw HTML in Markdown is shown as text, never run. ----------
export async function renderHtml(md) {
  await loadScript("lib/marked.umd.js");
  const m = new marked.Marked({
    gfm: true,
    renderer: {
      html: (t) => esc(t.text),
      link(t) {
        const body = this.parser.parseInline(t.tokens);
        return UNSAFE.test(t.href) ? body : `<a href="${esc(t.href)}" target="_blank" rel="noopener noreferrer">${body}</a>`;
      },
      image: (t) => (/^\s*(javascript|vbscript):/i.test(t.href) ? esc(t.text)
        : `<img src="${esc(t.href)}" alt="${esc(t.text)}"${t.title ? ` title="${esc(t.title)}"` : ""}>`),
    },
  });
  return m.parse(md);
}

const PRINT_CSS = (size) => `
@font-face{font-family:Jost;font-weight:400;src:url(fonts/jost-latin-400-normal.woff2)}
@font-face{font-family:Jost;font-weight:400;font-style:italic;src:url(fonts/jost-latin-400-italic.woff2)}
@font-face{font-family:Jost;font-weight:500;src:url(fonts/jost-latin-500-normal.woff2)}
@font-face{font-family:Jost;font-weight:600;src:url(fonts/jost-latin-600-normal.woff2)}
@page{size:${size === "LETTER" ? "letter" : "A4"};margin:20mm 18mm 22mm}
*{print-color-adjust:exact;-webkit-print-color-adjust:exact}
html{font:10.5pt/1.6 Jost,"Noto Sans","Segoe UI",system-ui,sans-serif;color:#22305a}
body{margin:0}
h1,h2,h3,h4,h5,h6{font-weight:500;line-height:1.15;margin:1.5em 0 .5em;break-after:avoid;color:#3f5eaa}
h1{font-size:28pt;color:#5F82C6;margin-top:0}h2{font-size:19pt}h3{font-size:14.5pt}h4,h5,h6{font-size:12pt}
p,ul,ol,blockquote,table,pre{margin:0 0 .9em}a{color:#3f5eaa}
code,pre{font-family:ui-monospace,Menlo,Consolas,"DejaVu Sans Mono",monospace;font-size:9pt}
code{background:#FFF2C9;padding:.1em .35em;border-radius:3px}
pre{background:#FFF2C9;border-left:3px solid #CBD7EF;padding:.8em 1em;white-space:pre-wrap;overflow-wrap:anywhere;break-inside:avoid}
pre code{background:none;padding:0}
blockquote{border-left:3px solid #CBD7EF;padding-left:1em;color:#4b5b8a;margin-left:0}
table{border-collapse:collapse;width:100%;font-size:9.5pt}
th,td{border:1px solid #CBD7EF;padding:.35em .6em;text-align:left;vertical-align:top}th{background:#CBD7EF;font-weight:600}
img{max-width:100%}hr{border:0;border-top:1px solid #CBD7EF;margin:1.5em 0}tr{break-inside:avoid}`;

export async function printPdf(md, title, size) {
  const body = await renderHtml(md);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  const oldTitle = document.title;
  const done = () => { document.title = oldTitle; frame.remove(); };
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS(size)}</style></head><body>${body}</body></html>`;
  await new Promise((res) => { frame.onload = res; document.body.appendChild(frame); });
  const w = frame.contentWindow;
  await Promise.all([w.document.fonts.ready, ...[...w.document.images].map((i) => i.decode().catch(() => {}))]);
  document.title = title; // browsers suggest this as the file name
  w.onafterprint = done;
  setTimeout(done, 10 * 60 * 1000);
  w.focus();
  w.print();
}

// ---------- direct PDF via pdfmake (selectable text, no dialog) ----------
const C = { h1: "#5F82C6", h: "#3f5eaa", line: "#CBD7EF", butter: "#FFF2C9", muted: "#4b5b8a", ink: "#22305a" };
const latin1 = (s) => /^[\u0000-\u00FF]*$/.test(s);

function inl(tokens, st = {}) {
  const out = [];
  for (const t of tokens || []) {
    switch (t.type) {
      case "strong": out.push(...inl(t.tokens, { ...st, bold: true })); break;
      case "em": out.push(...inl(t.tokens, { ...st, italics: true })); break;
      case "del": out.push(...inl(t.tokens, { ...st, decoration: "lineThrough" })); break;
      case "link": out.push(...inl(t.tokens, UNSAFE.test(t.href) ? st : { ...st, link: t.href, color: C.h, decoration: "underline" })); break;
      case "codespan": { const s = unesc(t.text); out.push({ ...st, text: s, font: latin1(s) ? "Mono" : "Roboto", fontSize: 9.5, background: C.butter }); break; }
      case "image": out.push({ ...st, text: unesc(t.text || ""), italics: true }); break;
      case "br": out.push({ text: "\n" }); break;
      case "html": out.push({ ...st, text: t.text }); break;
      default:
        if (t.tokens) out.push(...inl(t.tokens, st));
        else out.push({ ...st, text: unesc(t.text ?? t.raw ?? "") });
    }
  }
  return out;
}

function blocks(tokens) {
  const out = [];
  for (const t of tokens) {
    switch (t.type) {
      case "heading":
        out.push({ text: inl(t.tokens), fontSize: [26, 20, 16, 13.5, 12, 11][t.depth - 1], bold: t.depth > 1, color: t.depth === 1 ? C.h1 : C.h, margin: [0, t.depth === 1 ? 0 : 12, 0, 6] });
        break;
      case "paragraph":
      case "text":
        if (t.tokens?.length === 1 && t.tokens[0].type === "image" && /^data:image\/(png|jpe?g)/i.test(t.tokens[0].href))
          out.push({ image: t.tokens[0].href, fit: [480, 640], margin: [0, 0, 0, 8] });
        else out.push({ text: t.tokens ? inl(t.tokens) : unesc(t.text), margin: [0, 0, 0, t.type === "text" ? 3 : 8] });
        break;
      case "list": {
        const items = t.items.map((it) => {
          const st = blocks(it.tokens);
          if (it.task) { // GitHub-style task item: keep the checkbox state
            const box = { text: it.checked ? "[x] " : "[ ] ", font: "Mono" };
            if (st[0] && Array.isArray(st[0].text)) st[0].text.unshift(box); else st.unshift({ text: [box] });
          }
          return { stack: st };
        });
        out.push(t.ordered ? { ol: items, start: Number(t.start) || 1, margin: [0, 0, 0, 8] } : { ul: items, margin: [0, 0, 0, 8] });
        break;
      }
      case "code": {
        const font = latin1(t.text) ? "Mono" : "Roboto";
        out.push({
          table: { widths: ["*"], body: [[{ text: t.text, font, fontSize: 9, preserveLeadingSpaces: true }]] },
          layout: { fillColor: () => C.butter, hLineWidth: () => 0, vLineWidth: (i) => (i === 0 ? 3 : 0), vLineColor: () => C.line, paddingLeft: () => 9, paddingRight: () => 9, paddingTop: () => 7, paddingBottom: () => 7 },
          margin: [0, 0, 0, 9],
        });
        break;
      }
      case "blockquote":
        out.push({
          table: { widths: ["*"], body: [[{ stack: blocks(t.tokens), color: C.muted }]] },
          layout: { hLineWidth: () => 0, vLineWidth: (i) => (i === 0 ? 3 : 0), vLineColor: () => C.line, paddingLeft: () => 9, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
          margin: [0, 0, 0, 8],
        });
        break;
      case "table": {
        const head = t.header.map((h, i) => ({ text: inl(h.tokens), bold: true, fillColor: C.line, alignment: t.align[i] || "left" }));
        const rows = t.rows.map((r) => r.map((c, i) => ({ text: inl(c.tokens), alignment: t.align[i] || "left" })));
        out.push({
          table: { headerRows: 1, widths: t.header.map(() => "*"), body: [head, ...rows] },
          layout: { hLineColor: () => C.line, vLineColor: () => C.line, hLineWidth: () => 0.7, vLineWidth: () => 0.7, paddingTop: () => 4, paddingBottom: () => 4 },
          fontSize: 9.5, margin: [0, 0, 0, 10],
        });
        break;
      }
      case "hr":
        out.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: 480, y2: 0, lineWidth: 1, lineColor: C.line }], margin: [0, 8, 0, 12] });
        break;
      case "html":
        out.push({ text: t.text.trim(), color: C.muted, margin: [0, 0, 0, 8] });
        break;
    }
  }
  return out;
}

let monoLoaded = false;
export async function buildPdfBlob(md, title, size) {
  await loadScript("lib/marked.umd.js");
  await loadScript("lib/pdfmake.min.js");
  await loadScript("lib/vfs_fonts.js");
  if (!monoLoaded) { // bundled monospace font for code
    const buf = new Uint8Array(await (await fetch("fonts/roboto-mono-latin-400-normal.woff")).arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    pdfMake.addVirtualFileSystem({ ...globalThis.vfs, "mono.woff": btoa(bin) });
    monoLoaded = true;
  }
  pdfMake.fonts = {
    Roboto: { normal: "Roboto-Regular.ttf", bold: "Roboto-Medium.ttf", italics: "Roboto-Italic.ttf", bolditalics: "Roboto-MediumItalic.ttf" },
    Mono: { normal: "mono.woff", bold: "mono.woff", italics: "mono.woff", bolditalics: "mono.woff" },
  };
  const docDef = {
    pageSize: size === "LETTER" ? "LETTER" : "A4",
    pageMargins: [57, 60, 57, 66],
    info: { title },
    defaultStyle: { font: "Roboto", fontSize: 10.5, lineHeight: 1.25, color: C.ink },
    content: blocks(marked.lexer(md)),
    footer: (n) => ({ text: String(n), alignment: "center", fontSize: 9, color: "#7898D0", margin: [0, 26, 0, 0] }),
  };
  if (!docDef.content.length) docDef.content = [{ text: " " }];
  return new Promise((res, rej) => {
    try { pdfMake.createPdf(docDef).getBlob(res); } catch (e) { rej(e); }
  });
}
