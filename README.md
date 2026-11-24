# Markdown & PDF converter (static site)

Pure HTML, CSS and JavaScript. No server, no database, no build step. All conversion happens in the visitor's browser, so files are never uploaded and this site sets no size limit.

## Deploy on Vercel

Option A, dashboard: push this folder to a Git repository, then in Vercel choose **Add New > Project**, import it, set **Framework Preset = Other**, leave Build Command and Output Directory empty, and deploy.

Option B, CLI: `npm i -g vercel`, then run `vercel --prod` inside this folder.

Run it locally: `python3 -m http.server 8080` and open http://localhost:8080. Do not double-click index.html: browsers block its scripts when opened as a local file (the page shows a message explaining this).

## What it does

PDF to Markdown (pdf.js): converts automatically when you add files, multiple files at once with a .zip download, page-by-page progress with cancel, password-protected PDFs, headings by font size, two-column layouts, tables, nested lists, bold/italic, links, wrapped-paragraph repair, repeated header/footer removal, optional page-break markers.

Markdown to PDF: live preview, A4 or Letter. "Download PDF" builds a PDF directly (Latin, Greek, Cyrillic). Bengali, Arabic, Hindi, Japanese, Chinese, Korean and emoji automatically use "Print or save as PDF", which uses the browser's own text engine.

## Limits to know about

- Size is limited by the visitor's device memory, not by this site. Very large PDFs (hundreds of MB) need a desktop browser and may be slow.
- Scanned PDFs (images of text) have no text to extract. OCR is not included.
- Images inside PDFs are not extracted. Complex layouts, formulas and multi-line table cells can come out imperfect, and lopsided column blocks may interleave. Skim the result.
- Direct PDF output supports `data:` images (PNG/JPEG) only; use the print route for remote images.

## Files

`index.html`, `style.css`, `app.js` (UI), `pdf2md.js` (extraction), `md2pdf.js` (PDF output), `lib/` (pdf.js 4.10.38 legacy build, marked 15.0.12, pdfmake 0.2.20, JSZip 3.10.1, all bundled so nothing loads from a CDN), `fonts/`, `vercel.json` (cache and security headers only).

See `THIRD-PARTY.md` for licenses.
