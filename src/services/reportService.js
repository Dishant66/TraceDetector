import { ENGINES } from './analysisService.js'
import { severityMeta, categoryMeta } from '../data/taxonomy.js'
import { formatBytes } from '../utils/file.js'

/**
 * Report export.
 *
 * Produces a single self-contained .html file (image embedded, overlays drawn,
 * opens straight into the browser's print / "Save as PDF" dialog) and a
 * machine-readable .json export. No server round-trip, no dependencies.
 */

export async function downloadHtmlReport(analysis) {
  const html = await buildReportHtml(analysis)
  triggerDownload(new Blob([html], { type: 'text/html;charset=utf-8' }), fileName(analysis, 'html'))
}

export function downloadJsonReport(analysis) {
  const payload = {
    tool: 'TraceDetector',
    generatedAt: analysis.createdAt,
    engine: analysis.engine,
    engineLabel: analysis.engineLabel,
    model: analysis.model,
    isDemoData: analysis.engine === 'demo',
    image: {
      name: analysis.image.name,
      type: analysis.image.type,
      size: analysis.image.size,
      width: analysis.image.width,
      height: analysis.image.height,
    },
    risk: analysis.risk,
    summary: analysis.summary,
    findings: analysis.findings.map(({ id, category, type, severity, confidence, description, evidence, recommendation, locationHint, box, source }) => ({
      id,
      category,
      type,
      severity,
      confidence,
      description,
      evidence,
      recommendation,
      locationHint,
      box,
      source,
    })),
    checklist: analysis.checklist,
    metadata: analysis.metadata,
    capabilities: analysis.capabilities,
  }
  triggerDownload(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    fileName(analysis, 'json'),
  )
}

/* ----------------------------------------------------------------------- */

async function buildReportHtml(analysis) {
  const engine = ENGINES[analysis.engine]
  const imageSrc = await toEmbeddable(analysis.image.dataUrl)
  const date = new Date(analysis.createdAt)

  const overlays = analysis.findings
    .filter((f) => f.box)
    .map(
      (f) => `<span class="box sev-${f.severity}" style="left:${pct(f.box.x)};top:${pct(f.box.y)};width:${pct(
        f.box.w,
      )};height:${pct(f.box.h)}"><i>${f.index}</i></span>`,
    )
    .join('')

  const findings = analysis.findings
    .map(
      (f) => `
      <article class="finding sev-${f.severity}">
        <header>
          <span class="num">${f.index}</span>
          <div>
            <h3>${esc(f.type)}</h3>
            <p class="meta">${esc(categoryMeta(f.category).label)} · confidence ${Math.round(
              (f.confidence || 0) * 100,
            )}%${f.locationHint ? ` · ${esc(f.locationHint)}` : ''}</p>
          </div>
          <span class="pill">${esc(severityMeta(f.severity).label)}</span>
        </header>
        <p>${esc(f.description)}</p>
        ${f.evidence ? `<p class="evidence"><strong>Detected:</strong> <code>${esc(f.evidence)}</code></p>` : ''}
        <p class="rec"><strong>Recommendation:</strong> ${esc(f.recommendation)}</p>
      </article>`,
    )
    .join('')

  const checklist = analysis.checklist
    .map(
      (item) => `<li class="${item.status}"><span class="mark">${
        item.status === 'clear' ? '✓' : item.status === 'risk' ? '✕' : '?'
      }</span><div><strong>${esc(item.label)}</strong><em>${esc(item.detail)}</em></div></li>`,
    )
    .join('')

  const metaRows = Object.entries(analysis.metadata?.tags || {})
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(String(v))}</td></tr>`)
    .join('')

  const counts = analysis.risk.counts

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>TraceDetector Report — ${esc(analysis.image.name)}</title>
<style>
  :root{--ink:#121726;--muted:#6b7488;--line:#e4e8f0;--critical:#d92d20;--high:#e86a1c;--medium:#c99a06;--low:#2f7fe0;--safe:#19a06a}
  *{box-sizing:border-box}
  body{margin:0;background:#f5f7fb;color:var(--ink);font:15px/1.6 Inter,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  .page{max-width:900px;margin:0 auto;padding:40px 28px 72px}
  .bar{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:28px}
  .brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px;letter-spacing:-.02em}
  .dot{width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#4f7cff,#7c4dff)}
  button{font:inherit;padding:10px 18px;border-radius:999px;border:1px solid var(--line);background:#fff;cursor:pointer}
  button:hover{background:#eef2fb}
  .card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:24px;margin-bottom:20px}
  .engine{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;font-size:12.5px;font-weight:600;background:#eef2ff;color:#3b4ea8}
  .engine.demo{background:#fff4e5;color:#9a5b00}
  .engine.local{background:#e8f6ef;color:#14714a}
  .note{margin:14px 0 0;padding:12px 14px;border-radius:10px;background:#f7f8fc;color:var(--muted);font-size:13.5px}
  .score{display:flex;align-items:center;gap:26px;flex-wrap:wrap}
  .ring{width:124px;height:124px;border-radius:50%;display:grid;place-items:center;flex:none;
        background:conic-gradient(var(--accent) calc(var(--v)*1%), #eceff6 0);}
  .ring span{width:96px;height:96px;border-radius:50%;background:#fff;display:grid;place-items:center;font-size:30px;font-weight:700}
  h1{font-size:26px;margin:0 0 6px;letter-spacing:-.02em}
  h2{font-size:17px;margin:0 0 14px;letter-spacing:-.01em}
  .muted{color:var(--muted)}
  .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
  .chip{padding:5px 12px;border-radius:999px;font-size:12.5px;font-weight:600;border:1px solid var(--line)}
  .chip b{font-weight:700}
  .shot{position:relative;display:inline-block;max-width:100%;border-radius:12px;overflow:hidden;border:1px solid var(--line)}
  .shot img{display:block;max-width:100%;height:auto}
  .box{position:absolute;border:2px solid var(--critical);border-radius:4px;box-shadow:0 0 0 9999px rgba(0,0,0,0)}
  .box i{position:absolute;top:-11px;left:-11px;width:22px;height:22px;border-radius:50%;background:var(--critical);color:#fff;font:700 11px/22px Inter,sans-serif;text-align:center;font-style:normal}
  .box.sev-high,.box.sev-high i{border-color:var(--high);background-color:var(--high)}
  .box.sev-high{background:transparent}
  .box.sev-medium,.box.sev-medium i{border-color:var(--medium);background-color:var(--medium)}
  .box.sev-medium{background:transparent}
  .box.sev-low,.box.sev-low i{border-color:var(--low);background-color:var(--low)}
  .box.sev-low{background:transparent}
  .finding{border:1px solid var(--line);border-left:4px solid var(--critical);border-radius:12px;padding:16px 18px;margin-bottom:12px;background:#fff;break-inside:avoid}
  .finding.sev-high{border-left-color:var(--high)}.finding.sev-medium{border-left-color:var(--medium)}.finding.sev-low{border-left-color:var(--low)}
  .finding header{display:flex;gap:12px;align-items:flex-start;margin-bottom:8px}
  .finding h3{margin:0;font-size:15.5px}
  .finding .num{flex:none;width:24px;height:24px;border-radius:50%;background:#121726;color:#fff;font-size:12px;font-weight:700;display:grid;place-items:center}
  .finding .meta{margin:2px 0 0;font-size:12.5px;color:var(--muted)}
  .finding .pill{margin-left:auto;flex:none;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:4px 10px;border-radius:999px;background:#f1f3f9}
  .finding p{margin:6px 0}
  .finding code{background:#f2f4f9;padding:2px 6px;border-radius:5px;font-size:13px;word-break:break-all}
  .rec{font-size:14px;color:#273045}
  ul.check{list-style:none;padding:0;margin:0;display:grid;gap:10px}
  ul.check li{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:10px;background:#f8fafc;border:1px solid var(--line)}
  ul.check li.risk{background:#fef4f4;border-color:#f7d7d7}
  ul.check li.unknown{background:#f8f9fc}
  ul.check .mark{flex:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;background:#d9f2e6;color:#14714a}
  ul.check li.risk .mark{background:#fbdcdc;color:#b4232a}
  ul.check li.unknown .mark{background:#e9ecf4;color:#6b7488}
  ul.check em{display:block;font-style:normal;font-size:13px;color:var(--muted);margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:13.5px}
  th{text-align:left;color:var(--muted);font-weight:600;padding:7px 12px 7px 0;white-space:nowrap;vertical-align:top}
  td{padding:7px 0;word-break:break-word}
  footer{color:var(--muted);font-size:12.5px;text-align:center;margin-top:30px}
  @media print{body{background:#fff}.page{padding:0;max-width:none}.card{break-inside:avoid;border-color:#ddd}.no-print{display:none}}
</style></head>
<body><div class="page">
  <div class="bar">
    <div class="brand"><span class="dot"></span>TraceDetector</div>
    <button class="no-print" onclick="window.print()">Print / Save as PDF</button>
  </div>

  <div class="card">
    <span class="engine ${analysis.engine}">${esc(engine.label)}${
      analysis.model ? ` · ${esc(analysis.model)}` : ''
    }</span>
    <h1 style="margin-top:14px">Privacy Report</h1>
    <p class="muted" style="margin:0">${esc(analysis.image.name)} · ${
      analysis.image.width && analysis.image.height
        ? `${analysis.image.width}×${analysis.image.height} · `
        : ''
    }${formatBytes(analysis.image.size)} · generated ${date.toLocaleString()}</p>
    <div class="note">${esc(engine.disclaimer)}</div>
  </div>

  <div class="card score">
    <div class="ring" style="--v:${analysis.risk.score};--accent:${accentFor(analysis.risk.level)}">
      <span>${analysis.risk.score}</span>
    </div>
    <div style="flex:1;min-width:260px">
      <h2 style="margin-bottom:4px">${esc(analysis.risk.label)} · ${esc(analysis.risk.headline)}</h2>
      <p class="muted" style="margin:0">${esc(analysis.summary || analysis.risk.detail)}</p>
      <div class="chips">
        <span class="chip" style="color:var(--critical)"><b>${counts.critical}</b> Critical</span>
        <span class="chip" style="color:var(--high)"><b>${counts.high}</b> High</span>
        <span class="chip" style="color:var(--medium)"><b>${counts.medium}</b> Medium</span>
        <span class="chip" style="color:var(--low)"><b>${counts.low}</b> Low</span>
      </div>
    </div>
  </div>

  ${
    imageSrc
      ? `<div class="card"><h2>Image findings</h2><div class="shot"><img src="${imageSrc}" alt="Analysed image"/>${overlays}</div>
         <p class="muted" style="font-size:13px;margin-bottom:0">${
           overlays
             ? 'Numbered boxes mark regions reported by the analysis engine.'
             : 'The engine did not report coordinates for these findings, so no regions are highlighted.'
         }</p></div>`
      : ''
  }

  <div class="card"><h2>Findings (${analysis.findings.length})</h2>${
    findings || '<p class="muted">No findings were reported for this image.</p>'
  }</div>

  <div class="card"><h2>Before you share this image</h2><ul class="check">${checklist}</ul></div>

  ${
    metaRows
      ? `<div class="card"><h2>Embedded file metadata</h2><table>${metaRows}</table></div>`
      : ''
  }

  <footer>Generated by TraceDetector — know what your image reveals before you share it.<br/>
  ${
    analysis.engine === 'demo'
      ? 'This report contains demo sample data and does not describe a real image.'
      : 'Automated analysis is an aid, not a guarantee. Always review the image yourself.'
  }</footer>
</div></body></html>`
}

function accentFor(level) {
  return (
    { critical: '#d92d20', high: '#e86a1c', medium: '#c99a06', low: '#2f7fe0', safe: '#19a06a' }[level] ||
    '#2f7fe0'
  )
}

async function toEmbeddable(src) {
  if (!src) return ''
  if (src.startsWith('data:')) return src
  try {
    const response = await fetch(src)
    const blob = await response.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => resolve('')
      reader.readAsDataURL(blob)
    })
  } catch {
    return ''
  }
}

function fileName(analysis, ext) {
  const base = (analysis.image.name || 'image').replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]+/gi, '-')
  const stamp = new Date(analysis.createdAt).toISOString().slice(0, 10)
  return `tracedetector-report-${base}-${stamp}.${ext}`
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

function pct(value) {
  return `${(value * 100).toFixed(2)}%`
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
