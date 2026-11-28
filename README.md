# Markdown & PDF

A free converter that turns **PDF files into Markdown** and **Markdown into PDF**, entirely in your browser. Nothing is uploaded, nothing is stored on a server, and there is no account, build step or backend. The whole site is plain HTML, CSS and JavaScript.

## Why it exists

Most online converters send your documents to someone else's server. This one does not. Your files are read and converted on your own device, so contracts, notes, research papers and drafts stay private. It also works offline once the page has loaded, and it can be hosted for free on any static host.

## What it does

### PDF to Markdown

Drop in one or more PDFs and conversion starts automatically.

- Rebuilds structure from the text itself: headings (from font size), paragraphs, bullet and numbered lists, nested lists, tables, bold, italic and links
- Handles two-column layouts and repairs paragraphs that were wrapped by the PDF
- Removes repeated headers, footers and page numbers (optional)
- Can insert a marker at each page break (optional)
- Converts several files in one go and downloads them together as a `.zip`
- Shows page-by-page progress and can be cancelled at any time
- Opens password-protected PDFs through a masked password prompt
- Download the result as a `.md` file, copy it to the clipboard, or send it straight to the Markdown to PDF tab

### Markdown to PDF

Drop in a Markdown file (`.md`, `.markdown` or `.txt`), or choose **Write Markdown here** to type or paste your own. The editor includes a live preview.

- A4 or Letter page size
- **Download PDF** builds the file directly and supports Latin, Greek and Cyrillic text, headings, lists, task lists, tables, code blocks, quotes, links and embedded images
- **Print or save as PDF** uses the browser's own text engine, which covers scripts the built-in font cannot draw: Bengali, Arabic, Hindi, Japanese, Chinese, Korean, emoji, and symbols such as arrows and check marks. The app switches to it automatically when your text needs it

## Using it

1. Open the site.
2. Choose **PDF to Markdown** or **Markdown to PDF**.
3. Add your file or paste your text, then download the result.

A light and dark theme are included. The theme follows your device and can be switched with the button in the corner.

## Run it locally

The page must be opened from a web address, because browsers block scripts on pages opened as plain files. From this folder run:

```
python3 -m http.server 8080
```

then visit http://localhost:8080.

## Deploy

**GitHub Pages:** push this folder to a repository, open **Settings > Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, and save. The site appears at `https://<user>.github.io/<repo>/`. All paths are relative, so it works inside a sub-folder. The empty `.nojekyll` file makes GitHub publish the files exactly as they are.

**Vercel:** import the repository, set the framework preset to **Other**, leave the build command and output directory empty, and deploy. `vercel.json` adds caching and basic security headers; GitHub Pages ignores it.

## How it works

- `pdf2md.js` reads every page with pdf.js, groups text into lines using its position and font size, finds columns, headings, lists and tables, then assembles Markdown. Special characters in the PDF text are escaped so they do not turn into accidental formatting.
- `md2pdf.js` parses Markdown with marked. The direct route converts it into a pdfmake document using bundled Roboto fonts. The print route renders sanitised HTML in a hidden frame and opens the browser's print dialog. Raw HTML in the Markdown is shown as text and never executed.
- `app.js` runs the interface: tabs, the file queue, progress, the password dialog, downloads and the theme switch.

## Limits

- Speed and size depend on your device's memory, not on the site. Very large PDFs are best handled on a desktop browser.
- Scanned PDFs (pictures of text) contain no text to extract. OCR is not included.
- Images inside PDFs are not extracted. Complex layouts, formulas and tables with multi-line cells can come out imperfect, so skim the result.
- The editor accepts text files up to 50 MB, and converted text longer than 2,000,000 characters cannot be sent back to the editor.
- The direct PDF route embeds `data:` images (PNG or JPEG) only. Use the print route for images hosted elsewhere.

## Project structure

| Path | Purpose |
|---|---|
| `index.html` | Page markup |
| `style.css` | Gradient interface, light and dark themes |
| `app.js` | Interface logic |
| `pdf2md.js` | PDF to Markdown engine |
| `md2pdf.js` | Markdown to PDF engine |
| `lib/` | pdf.js 4.10.38, marked 15.0.12, pdfmake 0.2.20, JSZip 3.10.1, all bundled so nothing loads from a CDN |
| `fonts/` | Jost and Roboto Mono |
| `vercel.json` | Headers for Vercel hosting |
| `.nojekyll` | Publishing setting for GitHub Pages |

## Credits

Built by Jahidul Islam Jony. Powered by pdf.js, marked, pdfmake and JSZip. See `THIRD-PARTY.md` for their licenses.
