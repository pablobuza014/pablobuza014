// .github/scripts/build-achievements-image.js
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const USER = process.env.GH_USERNAME || "pablobuza014";
const OUT_DIR = "assets";
const OUT_FILE = path.join(OUT_DIR, "achievements.png");
const URL = `https://github.com/${USER}?tab=achievements`;

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  let items = [];
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    );
    await page.goto(URL, { waitUntil: "networkidle2" });

    try {
      await page.waitForSelector('a[href*="/achievements/"], img[alt*="Achievement"], img[class*="achievement"]', { timeout: 15000 });
    } catch (_) {}

    items = await page.evaluate(() => {
      
      const cleanTitle = (s) =>
        String(s || "")
          .replace(/^Achievement:\s*/i, "")
          .replace(/\s*(?:x|×)?\s*\d+\s*$/i, "")
          .trim();

      const norm = (s) => cleanTitle(s).toLowerCase().replace(/\s+/g, " ").trim();

      const looksBadgeImg = (img) =>
        !!img &&
        (img.matches('img[class*="achievement"]') ||
          (img.alt || "").toLowerCase().includes("achievement") ||
          (img.src || "").includes("/achievements"));

      const getTitleFromCard = (card, img) => {
        
        const a = card.closest("a") || card.querySelector("a");
        let title = (a?.getAttribute("aria-label") || a?.getAttribute("title") || "").trim();
        title = cleanTitle(title);
        if (title) return title;

        
        const candidates = Array.from(card.querySelectorAll("h3,h4,strong,div,span"))
          .map((el) => (el.textContent || "").trim())
          .filter((t) => t && !/^(?:x|×)?\s*\d+$/i.test(t) && /[A-Za-z]/.test(t) && t.length <= 48);
        if (candidates[0]) return cleanTitle(candidates[0]);

       
        return cleanTitle(img?.alt || "Achievement");
      };

      const getCountFromWithinCard = (card) => {
       
        const exact = Array.from(card.querySelectorAll("span, sup, small, strong, div"))
          .map((el) => (el.textContent || "").trim())
          .find((t) => /^(?:x|×)\s*\d+$/i.test(t));
        if (exact) return exact.replace(/\s+/g, "").toLowerCase().replace("×", "x");

        
        const txt = (card.innerText || "").replace(/\s+/g, " ").trim();
        let m = txt.match(/(?:^|\s)(?:x|×)\s*(\d+)(?=\s|$)/i);
        if (m) return `x${m[1]}`;

        
        m = txt.match(/(\d+)\s*(?:times|vez|veces)/i);
        if (m) return `x${m[1]}`;

        
        const els = Array.from(card.querySelectorAll("span, sup, small, strong, div"));
        for (const el of els) {
          const t = (el.textContent || "").trim();
          if (/^\d+$/.test(t)) {
            const cls = String(el.className || "").toLowerCase();
            const aria = (el.getAttribute("aria-label") || "").toLowerCase();
            const dc = (el.getAttribute("data-view-component") || "").toLowerCase();
            if (cls.includes("label") || cls.includes("counter") || aria.includes("times") || aria.includes("count") || dc.includes("counter")) {
              return `x${t}`;
            }
          }
        }
        return "";
      };

      
      const imgs = Array.from(
        document.querySelectorAll(
          'img[class*="achievement"], img[alt*="Achievement"], img[src*="/achievements/"], img[src*="/achievements"]'
        )
      ).filter(looksBadgeImg);

      const cards = [];
      for (const img of imgs) {
        
        let card =
          img.closest('[data-test-selector="profile-collection-card"]') ||
          img.closest("li, article, .Box, .border, .rounded-2") ||
          img.closest("a") ||
          img.parentElement;

        if (!card) continue;

        const title = getTitleFromCard(card, img);
        const count = getCountFromWithinCard(card);
        const link = (card.closest("a") || card.querySelector("a"))?.getAttribute("href") || null;

        
        const rect = card.getBoundingClientRect();
        cards.push({
          src: img.getAttribute("src"),
          title,
          count,
          href: link ? (link.startsWith("http") ? link : `https://github.com${link}`) : null,
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        });
      }

      
      const uniq = new Map();
      for (const it of cards) {
        const key = `${norm(it.title)}__${it.src}`;
        if (!uniq.has(key)) uniq.set(key, it);
      }
      const items = Array.from(uniq.values());

      
      
      const byTitle = new Map(items.map((it) => [norm(it.title), it]));

      
      const pillNodes = Array.from(document.querySelectorAll("span, sup, small, strong, div")).filter((el) => {
        const t = (el.textContent || "").trim();
        return /^(?:x|×)\s*\d+$/i.test(t);
      });

      
      const numericPills = Array.from(document.querySelectorAll("span, sup, small, strong, div")).filter((el) => {
        const t = (el.textContent || "").trim();
        if (!/^\d+$/.test(t)) return false;
        const cls = String(el.className || "").toLowerCase();
        const dc = (el.getAttribute("data-view-component") || "").toLowerCase();
        return cls.includes("label") || cls.includes("counter") || dc.includes("counter");
      });

      const allPills = [...pillNodes, ...numericPills];

      
      const textNodes = Array.from(document.querySelectorAll("h3,h4,strong,span,div")).filter((el) => {
        const t = (el.textContent || "").trim();
        return t && /[A-Za-z]/.test(t) && t.length <= 60;
      });

      function rectOf(el) {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, midY: r.y + r.height / 2, midX: r.x + r.width / 2 };
      }

      for (const pill of allPills) {
        const t = (pill.textContent || "").trim();
        const val = /^(?:x|×)\s*(\d+)$/i.test(t) ? RegExp.$1 : /^\d+$/.test(t) ? t : "";
        if (!val) continue;
        const pillRect = rectOf(pill);

       
        let best = null;
        let bestDist = Infinity;
        for (const tn of textNodes) {
          const tt = cleanTitle((tn.textContent || "").trim());
          if (!tt) continue;
          const r = rectOf(tn);
          
          const dy = Math.abs(r.midY - pillRect.midY);
          const dx = Math.abs(r.midX - pillRect.midX);
          const score = dy * 3 + dx;
          if (score < bestDist) {
            bestDist = score;
            best = { el: tn, title: tt };
          }
        }

        if (best) {
          const key = norm(best.title);
          const item = byTitle.get(key);
          if (item && !item.count) item.count = `x${val}`;
        }
      }

      
      for (const it of items) {
        if (it.count) continue;
        const candidate = Array.from(document.querySelectorAll('a[href*="/achievements/"]')).find((a) => {
          const label = cleanTitle(a.getAttribute("aria-label") || a.getAttribute("title") || "");
          return label && norm(label) === norm(it.title);
        });
        if (candidate) {
          const txt = (candidate.getAttribute("aria-label") || candidate.getAttribute("title") || "").trim();
          const m = txt.match(/(\d+)\s*(?:times|vez|veces)/i) || txt.match(/(?:x|×)\s*(\d+)/i);
          if (m) it.count = `x${m[1]}`;
        }
      }

      
      return items.map(({ src, title, count, href }) => ({ src, title, count: count || "", href }));
    });

  } catch (e) {
    console.error("Scrape error:", e);
  }

  // ====== RENDER  ======
  const cols = 4;
  const size = 128;
  const gap = 24;
  const headerH = 80;
  const nameH = 34;
  const countH = 24;

  const rows = Math.max(1, Math.ceil(items.length / cols));
  const width = cols * (size + gap) + gap;
  const height = headerH + rows * (size + nameH + countH + gap) + gap;
  const generatedAt = new Date().toISOString();

  const cards = (items && items.length
    ? items
    : [{ src: "", title: "No achievements found", count: "", href: null }]
  )
    .map((it) => {
      const label = esc(it.title || "Achievement");
      const href = it.href ? it.href : URL;
      const countPill = it.count
        ? `<div style="
              display:inline-block;
              margin-top:6px;
              padding:2px 8px;
              font:700 12px system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',Arial;
              border-radius:999px;
              background:#f9a8d4;
              color:#111827;
              box-shadow:0 0 0 1px rgba(0,0,0,.25) inset;
            ">${esc(it.count)}</div>`
        : "";

      const imgBlock = it.src
        ? `<div style="width:${size}px; height:${size}px; margin:0 auto; border-radius:50%; overflow:hidden; box-shadow:0 0 0 2px #1f2937;">
             <img src="${it.src}" alt="${label}" width="${size}" height="${size}" style="display:block; width:100%; height:100%; object-fit:cover;">
           </div>`
        : `<div style="width:${size}px; height:${size}px; margin:0 auto; border-radius:50%; box-shadow:0 0 0 2px #1f2937; display:flex; align-items:center; justify-content:center; opacity:.6;">—</div>`;

      return `
      <a href="${href}" target="_blank" rel="noopener noreferrer" style="text-decoration:none; color:#e5e7eb;">
        ${imgBlock}
        <div style="margin-top:10px; text-align:center;">
          <div style="font:600 14px system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',Arial; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:${size}px;">
            ${label}
          </div>
          ${countPill}
        </div>
      </a>`;
    })
    .join("");

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>GitHub Achievements - ${esc(USER)}</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; background: #0b1220; color: #e5e7eb; font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, 'Helvetica Neue', Arial, sans-serif; }
    .wrap { width: ${width}px; min-height: ${height}px; padding: 24px; box-sizing: border-box; }
    h1 { margin: 0 0 16px 0; font-weight: 800; font-size: 22px; line-height: 1.2; letter-spacing: .2px; color: #c7d2fe; text-align: center; }
    .grid { display: grid; grid-template-columns: repeat(${cols}, ${size}px); gap: ${gap}px; justify-content: center; align-items: start; }
    .footer { margin-top: 14px; font-weight: 500; font-size: 12px; opacity: .7; text-align: center; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>GitHub Achievements - ${esc(USER)}</h1>
    <div class="grid">
      ${cards}
    </div>
    <div class="footer">Auto-updated · ${esc(generatedAt)}</div>
  </div>
</body>
</html>`;

  const page2 = await browser.newPage();
  await page2.setViewport({ width: width + 48, height: Math.min(height + 48, 8000) });
  await page2.setContent(html, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 600));
  await page2.screenshot({ path: OUT_FILE, fullPage: true });
  await page2.close();

  await browser.close();
  console.log(`Saved clean achievements image to ${OUT_FILE} (${items?.length || 0} badges).`);
})();
