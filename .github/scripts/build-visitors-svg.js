// .github/scripts/build-visitors-svg.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.GITHUB_REPOSITORY || "pablobuza014/pablobuza014";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const OUT_DIR = path.resolve(__dirname, "../../assets");
const OUT_SVG = path.join(OUT_DIR, "visitors.svg");
const OUT_JSON = path.join(OUT_DIR, "visitors-history.json");


const fmtDate = (d) => new Date(d).toISOString().slice(0, 10);
const todayISO = () => fmtDate(new Date());
const updatedUTC = () => {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${da} ${hh}:${mm} UTC`;
};
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function readJSON(p, fallback) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; } }
function writeFile(p, data) { fs.writeFileSync(p, data); }
function pad(n, len) { return String(n).padStart(len, "0"); }
function lastNDays(n) {
  const out = []; const d = new Date();
  for (let i = n - 1; i >= 0; i--) { const dt = new Date(d); dt.setDate(d.getDate() - i); out.push(fmtDate(dt)); }
  return out;
}
function escapeXML(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }


async function fetchTraffic() {
  if (!TOKEN) throw new Error("GITHUB_TOKEN ausente.");
  const url = `https://api.github.com/repos/${REPO}/traffic/views`;
  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "visitors-counter-action"
    }
  });
  if (!res.ok) {
    const t = await res.text().catch(()=>"");
    throw new Error(`Traffic API ${res.status}: ${t}`);
  }
  const json = await res.json();
  const map = {};
  for (const v of (json.views || [])) {
    const day = fmtDate(v.timestamp);
    map[day] = Number(v.count || 0);
  }
  return map;
}


function mergeHistory(history, latestMap) {
  const h = { ...(history || {}) };
  for (const [day, count] of Object.entries(latestMap)) {
    h[day] = Math.max(Number(h[day] || 0), Number(count || 0));
  }
  const days = lastNDays(365);
  const merged = {};
  for (const d of days) merged[d] = Number(h[d] || 0);
  return merged;
}


function buildStats(history) {
  const days = Object.keys(history).sort();
  const vals = days.map(d => history[d]);
  const total = vals.reduce((a,b)=>a+b,0);
  const todayKey = todayISO();
  const todayVal = history[todayKey] || 0;
  const last7 = vals.slice(-7);
  const avg7 = last7.length ? Math.round(last7.reduce((a,b)=>a+b,0)/last7.length) : 0;

  
  const lastK = 14;
  const lastKDays = days.slice(-lastK);
  const seriesK = lastKDays.map(d => ({ day: d, v: history[d] || 0 }));
  return { total, today: todayVal, avg7, seriesK, k: lastK };
}

function renderSVG({ total, today, avg7, seriesK, k }) {
  const totalStr = pad(total, 7);
  const w = 420, h = 54, padXY = 6;
  const data = seriesK.map(s => s.v);
  const max = Math.max(1, ...data);
  const step = (w - 2*padXY) / Math.max(1, (data.length - 1));
  const points = data.map((v, i) => {
    const x = padXY + i * step;
    const y = h - padXY - (v / max) * (h - 2 * padXY);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  const updated = updatedUTC();
  const SVG_H = 160;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="760" height="${SVG_H}" role="img" aria-label="Visitors (GitHub Traffic)">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#00E7F7"/><stop offset="50%" stop-color="#7C3AED"/><stop offset="100%" stop-color="#22C55E"/>
    </linearGradient>
    <style>
      .mono{ font:700 24px 'JetBrains Mono',Consolas,monospace }
      .small{ font:700 12px 'JetBrains Mono',Consolas,monospace }
      .label{ fill:#94a3b8 }
      .text{ fill:#cbd5e1 }
    </style>
  </defs>
  <rect width="100%" height="100%" rx="16" fill="#0b1220"/>
  <rect x="1.5" y="1.5" width="757" height="${SVG_H - 3}" rx="14" fill="none" stroke="url(#g)" stroke-width="2"/>

 
  <g transform="translate(24,18)">
    <text class="label" x="0" y="0" font-size="14">VISITORS</text>
  </g>

  <!-- ODOMETER -->
  <g transform="translate(24,46)">
    ${odometer(totalStr)}
  </g>

  <!-- SPARKLINE (k=14 días) -->
  <g transform="translate(300,20)">
    <text class="label small" x="0" y="0">LAST ${k} DAYS</text>
    <rect x="0" y="8" width="420" height="54" rx="8" fill="#0f172a"/>
    ${points ? `<polyline fill="none" stroke="url(#g)" stroke-width="2.5" points="${points}"/>` : ""}
    ${data.length ? landmarkLabels(seriesK) : ""}
  </g>

  <!-- STATS -->
  <g transform="translate(24,125)">
    <text class="small label" x="0" y="0">TODAY</text>
    <text class="small" x="70" y="0" fill="url(#g)">${today}</text>
    <text class="small label" x="130" y="0">AVG(7d)</text>
    <text class="small" x="220" y="0" fill="url(#g)">${avg7}</text>
    <text class="small label" x="300" y="0">UPDATED</text>
    <text class="small text" x="380" y="0">${escapeXML(updated)}</text>
  </g>
</svg>`;
}

function odometer(num){
  
  return num.split("").map((d,i)=>`
    <g transform="translate(${i*34},8)">
      <rect x="0" y="-22" width="30" height="40" rx="8" fill="#0f172a" stroke="#1f2937"/>
      <text class="mono" x="6" y="8" fill="url(#g)">${escapeXML(d)}</text>
    </g>
  `).join("");
}

function landmarkLabels(series){
  if (!series.length) return "";
  const first = series[0].day;
  const last  = series[series.length-1].day;
  
  return `<text class="small label" x="0" y="76">${escapeXML(first)}</text>
          <text class="small label" x="360" y="76">${escapeXML(last)}</text>`;
}


(async () => {
  ensureDir(OUT_DIR);
  const old = readJSON(OUT_JSON, {});
  const latest = await fetchTraffic();
  const merged = mergeHistory(old, latest);
  const stats = buildStats(merged);
  writeFile(OUT_JSON, JSON.stringify(merged, null, 2));
  writeFile(OUT_SVG, renderSVG(stats));
  console.log(`Wrote: ${OUT_SVG} · days=${Object.keys(merged).length} · total=${stats.total}`);
})();
