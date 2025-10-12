// Visit Counter

export default {
  async fetch(req, env, ctx) {
    try {
      const url = new URL(req.url);
      
      const slug = (url.pathname.replace(/^\/+|\/+$/g, "") || "counter").replace(/\.svg$/i, "");
      const ua = req.headers.get("user-agent") || "";
      const country = (req.cf && req.cf.country) ? String(req.cf.country) : "XX";
      const ip = req.headers.get("CF-Connecting-IP") || req.headers.get("x-forwarded-for") || "";
      const now = new Date();
      const dayKey = now.toISOString().slice(0, 10);

      
      const badUA = /(bot|crawl|spider|preview|renderer|uptime|monitor|statuscake|pingdom|curl|wget)/i;
      const isBad = badUA.test(ua) || !ua.trim();
      
      if (isBad) return svgResponse(renderSVG(await readStats(env.VISITS, slug), slug), 200);

      
      const salt = dayKey;
      const uid = await sha256Hex(`${country}|${ip}|${ua}|${salt}`);
      const seenKey = `seen:${slug}:${uid}`;
      const seen = await env.VISITS.get(seenKey);
      if (!seen) {
        
        await env.VISITS.put(seenKey, "1", { expirationTtl: 36 * 3600 });
        await increment(env.VISITS, slug, dayKey, country);
      }

      const stats = await readStats(env.VISITS, slug);
      return svgResponse(renderSVG(stats, slug), 200);
    } catch (e) {
      return new Response("error", { status: 500 });
    }
  },
};

async function increment(KV, slug, dayKey, country) {
  
  const totalKey = `total:${slug}`;
  const total = parseInt((await KV.get(totalKey)) || "0", 10) + 1;
  await KV.put(totalKey, String(total));

  
  const dayKeyFull = `day:${slug}:${dayKey}`;
  const day = parseInt((await KV.get(dayKeyFull)) || "0", 10) + 1;
  await KV.put(dayKeyFull, String(day));

  
  const ccKey = `cc:${slug}:${country}`;
  const cc = parseInt((await KV.get(ccKey)) || "0", 10) + 1;
  await KV.put(ccKey, String(cc));

  
  const listKey = `days:${slug}`;
  let days = JSON.parse((await KV.get(listKey)) || "[]");
  if (!days.includes(dayKey)) days.push(dayKey);

  if (days.length > 60) days = days.slice(days.length - 60);
  await KV.put(listKey, JSON.stringify(days));
}

async function readStats(KV, slug) {
  const total = parseInt((await KV.get(`total:${slug}`)) || "0", 10);

  
  const list = JSON.parse((await KV.get(`days:${slug}`)) || "[]");
  const last30 = lastNDays(30);
  const series = [];
  for (const d of last30) {
    const v = parseInt((await KV.get(`day:${slug}:${d}`)) || "0", 10);
    series.push({ day: d, v });
  }

  const today = series[series.length - 1]?.v || 0;
  const last7 = series.slice(-7).map(x => x.v);
  const avg7 = last7.length ? Math.round(last7.reduce((a,b)=>a+b,0) / last7.length) : 0;


  const ccCounts = {};

  const commons = ["ES","US","DE","FR","TR","IT","GB","PT","MA","KZ","KE","XX"];
  for (const cc of commons) {
    const n = parseInt((await KV.get(`cc:${slug}:${cc}`)) || "0", 10);
    if (n) ccCounts[cc] = n;
  }
  const topCountry = Object.keys(ccCounts).sort((a,b)=>ccCounts[b]-ccCounts[a])[0] || "XX";

  return { total, series, today, avg7, topCountry };
}

function renderSVG({ total, series, today, avg7, topCountry }, slug) {
  
  const totalStr = String(total).padStart(7, "0");

  
  const w = 420, h = 54, pad = 6;
  const data = series.map(s => s.v);
  const max = Math.max(1, ...data);
  const step = (w - 2*pad) / Math.max(1, data.length - 1);
  const points = data.map((v,i) => {
    const x = pad + i*step;
    const y = h - pad - (v / max) * (h - 2*pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const path = points ? `M ${points.replace(" ", " L ")}`.replace(/ /g, " L ") : "";

  
  const flag = ccToFlag(topCountry);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="760" height="140" role="img" aria-label="Visitors for ${escapeXML(slug)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#00E7F7"/><stop offset="50%" stop-color="#7C3AED"/><stop offset="100%" stop-color="#22C55E"/>
    </linearGradient>
    <style>
      .mono{ font:700 24px 'JetBrains Mono',Consolas,monospace }
      .small{ font:700 13px 'JetBrains Mono',Consolas,monospace }
      .label{ fill:#94a3b8 }
    </style>
  </defs>
  <rect width="100%" height="100%" rx="16" fill="#0b1220"/>
  <rect x="1.5" y="1.5" width="757" height="137" rx="14" fill="none" stroke="url(#g)" stroke-width="2"/>

  <!-- ODOMETER -->
  <g transform="translate(24,32)">
    <text class="label" x="0" y="-6">VISITORS</text>
    ${odometer(totalStr)}
  </g>

  <!-- SPARKLINE -->
  <g transform="translate(300,24)">
    <text class="label small" x="0" y="0">LAST 30 DAYS</text>
    <rect x="0" y="8" width="420" height="54" rx="8" fill="#0f172a"/>
    ${path ? `<polyline fill="none" stroke="url(#g)" stroke-width="2.5" points="${points}"/>` : ""}
  </g>

  <!-- STATS -->
  <g transform="translate(24,100)">
    <text class="small label" x="0" y="0">TODAY</text>
    <text class="small" x="70" y="0" fill="url(#g)">${today}</text>

    <text class="small label" x="130" y="0">AVG(7d)</text>
    <text class="small" x="220" y="0" fill="url(#g)">${avg7}</text>

    <text class="small label" x="300" y="0">TOP</text>
    <text class="small" x="338" y="0">${flag} ${escapeXML(topCountry)}</text>
  </g>
</svg>`;
}

function odometer(num) {
  
  return num.split("").map((d,i) => `
    <g transform="translate(${i*34},8)">
      <rect x="0" y="-22" width="30" height="40" rx="8" fill="#0f172a" stroke="#1f2937"/>
      <text class="mono" x="6" y="8" fill="url(#g)">${escapeXML(d)}</text>
    </g>
  `).join("");
}

function ccToFlag(cc) {
  if (!cc || cc.length !== 2) return "🏳️";
  const codePoints = [...cc.toUpperCase()].map(c => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function lastNDays(n) {
  const out = [];
  const d = new Date();
  for (let i = n-1; i >= 0; i--) {
    const dt = new Date(d); dt.setDate(d.getDate() - i);
    out.push(dt.toISOString().slice(0,10));
  }
  return out;
}

async function sha256Hex(s) {
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

function escapeXML(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function svgResponse(svg, status=200) {
  return new Response(svg, {
    status,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "access-control-allow-origin": "*"
    }
  });
}
