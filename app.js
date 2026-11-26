import { loadScript, renderHtml, buildPdfBlob, printPdf, needsBrowserPrint } from "./md2pdf.js";

const $ = (s) => document.querySelector(s);
const root = document.documentElement;
const PREVIEW_CHARS = 300000;
let engine = null;
async function getEngine() {
  if (!engine) {
    try { engine = await import("./pdf2md.js"); }
    catch (e) { console.error(e); const err = new Error(e.message || "load failed"); err.name = "EngineLoadError"; throw err; }
  }
  return engine;
}

// ---- Theme ----
const themeBtn = $("#theme");
const isDark = () => (root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
const paintTheme = () => { themeBtn.textContent = isDark() ? "Light mode" : "Dark mode"; themeBtn.setAttribute("aria-pressed", String(isDark())); };
themeBtn.addEventListener("click", () => {
  root.dataset.theme = isDark() ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch {}
  paintTheme();
});
paintTheme();

// ---- Progress + status ----
const pin = $("#pin"), statusEl = $("#status");
function progress(pct, message = "", isError = false) {
  pin.style.left = pct + "%";
  pin.classList.toggle("busy", pct > 0 && pct < 100);
  const step = pct >= 100 ? 2 : pct > 0 ? 1 : 0;
  document.querySelectorAll(".steps span").forEach((el) => el.classList.toggle("on", +el.dataset.s === step));
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}
const fail = (m) => progress(0, m, true);

// ---- Tabs ----
const tabs = [$("#tab-pdf"), $("#tab-md")], panes = [$("#pane-pdf"), $("#pane-md")];
function selectTab(i, focus = false) {
  tabs.forEach((t, j) => { t.setAttribute("aria-selected", String(i === j)); t.tabIndex = i === j ? 0 : -1; panes[j].hidden = i !== j; });
  if (focus) tabs[i].focus();
  if (!busy) progress(0, "");
}
tabs.forEach((t, i) => {
  t.addEventListener("click", () => selectTab(i));
  t.addEventListener("keydown", (e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") selectTab((i + 1) % 2, true); });
});

// ---- Helpers ----
const stem = (n) => n.replace(/\.[^.]+$/, "") || "document";
const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
const textBlob = (t) => new Blob([t], { type: "text/markdown;charset=utf-8" });

// ---- PDF -> Markdown ----
const input = $("#pdf-files"), drop = $("#drop"), toMd = $("#to-md"), cancelBtn = $("#cancel"), zipBtn = $("#zip-all"), clearBtn = $("#clear");
const list = $("#files"), result = $("#result"), out = $("#md-out");
let jobs = [], selected = null, busy = false, cancelled = false, nextId = 1, skipNote = "";

// In-page password dialog (masked input, unlike window.prompt). Resolves to the password or null if cancelled.
const pwDialog = $("#pw-dialog"), pwInput = $("#pw-input");
function askPassword(wrong, name) {
  if (typeof pwDialog?.showModal !== "function") return prompt(wrong ? "Wrong password. Try again:" : `Password for ${name}:`);
  return new Promise((resolve) => {
    $("#pw-msg").textContent = (wrong ? "That password was wrong. Try again for " : "Enter the password for ") + name;
    pwInput.value = ""; pwDialog.returnValue = "";
    pwDialog.addEventListener("close", () => {
      const pw = pwDialog.returnValue === "ok" ? pwInput.value : "";
      pwInput.value = ""; resolve(pw || null);
    }, { once: true });
    pwDialog.showModal(); pwInput.focus();
  });
}

const opts = () => ({ style: $("#o-style").checked, hf: $("#o-hf").checked, pages: $("#o-pages").checked });

function addFiles(files) {
  const pdfs = [...files].filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
  if (!pdfs.length) return fail("Those aren’t PDF files. Choose files ending in .pdf.");
  if (pdfs.length < files.length) { skipNote = ` ${files.length - pdfs.length} file(s) skipped because they aren’t PDFs.`; progress(0, `Skipped ${files.length - pdfs.length} file(s) that aren’t PDFs.`); }
  for (const f of pdfs) jobs.push({ id: nextId++, file: f, state: "queued", md: "", pages: 0, note: "" });
  refresh();
  if (!busy) toMd.click(); // start converting right away
  else progress(+pin.style.left.replace("%", "") || 1, `Added ${pdfs.length} file(s). They’ll convert after the current one.`);
}

function refresh() {
  list.textContent = "";
  for (const j of jobs) {
    const li = document.createElement("li");
    if (j === selected) li.setAttribute("aria-current", "true");
    const name = document.createElement("span"); name.className = "name"; name.textContent = j.file.name;
    const meta = document.createElement("span"); meta.className = "meta";
    meta.textContent = { queued: `${fmtSize(j.file.size)} · waiting`, working: j.note || "converting…", done: `${fmtSize(j.file.size)} · ${j.pages} page${j.pages === 1 ? "" : "s"} · ${j.md.length.toLocaleString()} characters`, error: j.note }[j.state];
    li.append(name, meta);
    if (j.state === "done") {
      for (const [label, fn] of [["Preview", () => select(j)], ["Download .md", () => download(textBlob(j.md), stem(j.file.name) + ".md")]]) {
        const b = document.createElement("button"); b.type = "button"; b.className = "mini"; b.textContent = label; b.addEventListener("click", fn); li.append(b);
      }
    }
    list.append(li);
  }
  const done = jobs.filter((j) => j.state === "done").length;
  const pending = jobs.some((j) => j.state === "queued" || j.state === "error");
  toMd.disabled = busy || !jobs.length;
  toMd.textContent = pending || !jobs.length ? "Convert to Markdown" : "Convert again with these options";
  cancelBtn.hidden = !busy;
  zipBtn.hidden = done < 2 || busy;
  clearBtn.hidden = !jobs.length || busy;
}

function select(j) {
  selected = j;
  const long = j.md.length > PREVIEW_CHARS;
  out.value = long ? j.md.slice(0, PREVIEW_CHARS) + "\n\n… preview truncated. Download the file to get the full text." : j.md;
  $("#out-label").textContent = long ? `Markdown preview (first ${PREVIEW_CHARS.toLocaleString()} of ${j.md.length.toLocaleString()} characters)` : "Markdown preview";
  result.hidden = false;
  refresh();
}

input.addEventListener("change", () => { addFiles(input.files); input.value = ""; });
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
clearBtn.addEventListener("click", () => { jobs = []; selected = null; result.hidden = true; refresh(); progress(0, ""); });
cancelBtn.addEventListener("click", () => { cancelled = true; cancelBtn.disabled = true; progress(+pin.style.left.replace("%", "") || 1, "Cancelling…"); });

function friendly(e) {
  if (e?.name === "EngineLoadError") return "The PDF reader couldn’t start in this browser (" + e.message + "). Try the latest Chrome, Edge, Firefox or Safari, and make sure the site is opened from its web address, not as a local file.";
  if (e?.name === "NoTextError") return "No selectable text found. This looks like a scan or images only, which needs OCR first.";
  if (e?.name === "PasswordException") return "This PDF is password-protected and no valid password was entered.";
  if (e?.name === "InvalidPDFException") return "This doesn’t look like a valid PDF, or it’s damaged.";
  if (/memory|allocation/i.test(e?.message || "")) return "Ran out of memory. Try this file on its own, or close other tabs.";
  return "Couldn’t convert this file.";
}

toMd.addEventListener("click", async () => {
  let queue = jobs.filter((j) => j.state === "queued" || j.state === "error");
  if (!queue.length && jobs.length) { jobs.forEach((j) => { j.state = "queued"; j.md = ""; }); queue = [...jobs]; }
  if (!queue.length) return;
  busy = true; cancelled = false; cancelBtn.disabled = false; refresh();
  let finished = 0, failed = 0;
  for (const [k, j] of queue.entries()) {
    if (cancelled) break;
    j.state = "working"; j.note = "starting…"; refresh();
    try {
      const { pdfToMarkdown } = await getEngine();
      const r = await pdfToMarkdown(j.file, opts(), (i, n) => {
        j.note = `page ${i} of ${n}`;
        const pct = ((k + i / n) / queue.length) * 100;
        progress(Math.min(99, Math.max(1, pct)), `Converting ${j.file.name}: page ${i} of ${n}`);
        if (i % 5 === 0 || i === n) refresh();
      }, () => cancelled, (wrong) => askPassword(wrong, j.file.name));
      j.md = r.markdown; j.pages = r.pages; j.state = "done"; finished++;
      if (!selected || queue.length === 1 || k === queue.length - 1) select(j);
    } catch (e) {
      if (e?.name === "CancelledError") { j.state = "queued"; j.note = ""; break; }
      console.error(e);
      j.state = "error"; j.note = friendly(e); failed++;
    }
  }
  busy = false; refresh();
  const note = skipNote; skipNote = "";
  if (cancelled) progress(0, "Cancelled.");
  else if (failed) progress(finished ? 100 : 0, `${finished} converted, ${failed} failed. See the list for details.${note}`, !finished);
  else progress(100, (finished > 1 ? `Done. ${finished} files converted.` : "Done.") + note);
  if (!cancelled && jobs.some((j) => j.state === "queued")) toMd.click(); // files added while busy
});

$("#dl-md").addEventListener("click", () => selected && download(textBlob(selected.md), stem(selected.file.name) + ".md"));
$("#copy-md").addEventListener("click", async () => {
  if (!selected) return;
  try { await navigator.clipboard.writeText(selected.md); progress(100, "Copied to clipboard."); }
  catch { fail("Couldn’t copy automatically. Use Download .md instead."); }
});
zipBtn.addEventListener("click", async () => {
  progress(50, "Building the .zip…");
  try {
    await loadScript("lib/jszip.min.js");
    const z = new JSZip(), used = new Set();
    for (const j of jobs.filter((x) => x.state === "done")) {
      let n = stem(j.file.name), c = 1, f = n + ".md";
      while (used.has(f)) f = `${n}-${++c}.md`;
      used.add(f); z.file(f, j.md);
    }
    download(await z.generateAsync({ type: "blob", compression: "DEFLATE" }), "markdown-files.zip");
    progress(100, "Done. Your .zip is downloading.");
  } catch (e) { console.error(e); fail("Couldn’t build the .zip."); }
});
$("#send-back").addEventListener("click", () => {
  if (!selected) return;
  if (selected.md.length > 2000000) return fail("This Markdown is too large to edit here. Download it instead.");
  mdIn.value = selected.md; pdfName = stem(selected.file.name);
  $("#md-name").textContent = ""; syncMd(); selectTab(1, true);
});

// ---- Markdown -> PDF ----
const mdIn = $("#md-in"), preview = $("#md-preview"), toPdf = $("#to-pdf"), printBtn = $("#print-pdf");
let pdfName = "document";
const syncMd = () => { const empty = !mdIn.value.trim(); toPdf.disabled = empty; printBtn.disabled = empty; if (!preview.hidden) paintPreview(); };
mdIn.addEventListener("input", syncMd);

async function paintPreview() { preview.innerHTML = await renderHtml(mdIn.value || "*Nothing to preview yet.*"); }
function view(mode) {
  const p = mode === "preview";
  $("#v-write").setAttribute("aria-pressed", String(!p)); $("#v-preview").setAttribute("aria-pressed", String(p));
  mdIn.hidden = p; preview.hidden = !p;
  if (p) paintPreview().catch(() => fail("Couldn’t render the preview."));
}
$("#v-write").addEventListener("click", () => view("write"));
$("#v-preview").addEventListener("click", () => view("preview"));

async function loadMdFile(f) {
  if (!f) return;
  if (f.size > 50 * 1048576) return fail("That text file is larger than 50 MB, which is too big to edit here.");
  mdIn.value = await f.text(); pdfName = stem(f.name);
  $("#md-name").textContent = f.name; syncMd(); progress(0, "File loaded. Create the PDF when you’re ready.");
}
$("#md-file").addEventListener("change", (e) => { loadMdFile(e.target.files[0]); e.target.value = ""; });
mdIn.addEventListener("dragover", (e) => e.preventDefault());
mdIn.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) { e.preventDefault(); loadMdFile(e.dataTransfer.files[0]); } });

async function runPrint(note) {
  progress(50, "Preparing the print view…");
  try { await printPdf(mdIn.value, pdfName, $("#o-size").value); progress(100, note || "In the print dialog, choose Save as PDF as the destination."); }
  catch (e) { console.error(e); fail("Couldn’t open the print view."); }
}
toPdf.addEventListener("click", async () => {
  if (needsBrowserPrint(mdIn.value)) return runPrint("This text has characters (a non-Latin script, emoji, arrows or similar symbols) the direct download can’t draw, so the print dialog opened instead. Choose Save as PDF.");
  toPdf.disabled = true; progress(50, "Building your PDF…");
  try {
    download(await buildPdfBlob(mdIn.value, pdfName, $("#o-size").value), pdfName + ".pdf");
    progress(100, "Done. Your PDF is downloading.");
  } catch (e) { console.error(e); fail("Couldn’t build the PDF. Try “Print or save as PDF” instead."); }
  finally { syncMd(); }
});
printBtn.addEventListener("click", () => runPrint());

refresh();
window.__appReady = true; // last line: only set when the whole file ran without errors
