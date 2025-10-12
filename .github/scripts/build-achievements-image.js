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
      await page.waitForSelector(
        'a[href*="/achievements/"], img[alt*="Achievement"], img[class*="achievement"]',
        { timeout: 15000 }
      );
    } catch (_) {}

    // -------- SCRAPE --------
    items = await page.evaluate(() => {
      const clean = (s) =>
        String(s || "")
          .replace(/^Achievement:\s*/i, "")
          .replace(/\s*x?\s*\d+\s*$/i, "")
          .trim();

      const getTitleFromCard = (card) => {
        const candidates = Array.from(card.querySelectorAll("h3, h4, strong, div, span"))
          .map((el) => (el.textContent || "").trim())
          .filter((t) => t && !/^x?\s*\d+$/i.test(t) && /[A-Za-z]/.test(t) && t.length <= 48);
        return candidates[0] ? clean(candidates[0]) : "";
      };

      
      const getCountFromCard = (card) => {
       
        const text = (card.innerText || "").replace(/\s+/g, " ").trim();

        
        let m = text.match(/(?:^|\s)(?:x|×)\s*(\d+)(?=\s|$)/i);
        if (m) return `x${m[1]}`;

        
        m = text.match(/(\d+)\s*(?:times|vez|veces)/i);
        if (m) return `x${m[1]}`;

        
        const els = Array.from(card.querySelectorAll("span, sup, small, strong, div"));
        for (const el of els) {
          const t = (el.textContent || "").trim();
          if (/^\d+$/.test(t)) {
            const cls = String(el.className || "").toLowerCase();
            const aria = (el.getAttribute("aria-label") || "").toLowerCase();
            const dc = (el.getAttribute("data-view-component") || "").toLowerCase();
            if (cls.includes("counter") || cls.includes("label") || aria.includes("times") || aria.includes("count") || dc.includes("counter")) {
              return `x${t}`;
            }
          }
        }
        return "";
      };

      const cards = Array.from(
        document.querySelectorAll(
          'a[href*="/achievements/"], a[data-hovercard-type="achievement"], div[data-test-selector="profile-collection-card"], article'
        )
      ).filter((el) =>
        el.querySelector(
          'img[class*="achievement"], img[alt*="Achievement"], img[src*="/achievements/"], img[src*="/achievements"]'
        )
      );

      const uniq = new Map();
      for (const card of cards) {
        const img =
          card.querySelector(
            'img[class*="achievement"], img[alt*="Achievement"], img[src*="/achievements/"], img[src*="/achievements"]'
          ) || card.querySelector("img");
        if (!img) continue;

        const src = img.getAttribute("src");
        if (!src) continue;

        const a = card.closest("a") || card.querySelector("a") || card;

        let title = (a.getAttribute?.("aria-label") || a.getAttribute?.("title") || "") || "";
        title = clean(title);
        if (!title) title = getTitleFromCard(card);
        if (!title) title = clean(img.getAttribute("alt") || "Achievement");

        const count = getCountFromCard(card);

        const href =
          (a.getAttribute?.("href") || "").startsWith("http")
            ? a.getAttribute("href")
            : a.getAttribute("href")
            ? `https://github.com${a.getAttribute("href")}`
            : null;

        const key = `${title}__${src}`;
        if (!uniq.has(key)) uniq.set(key, { src, title, count, href });
      }

      if (!uniq.size) {
        const imgs = Array.from(document.querySelectorAll('img[alt*="Achievement"]'));
        for (const i of imgs) {
          const src = i.getAttribute("src");
          if (!src) continue;
          const title = clean(i.getAttribute("alt"));
          uniq.set(`${title}__${src}`, { src, title, count: "", href: null });
        }
      }

      return Array.from(uniq.values());
    });

    await page.close();
  } catch (e) {
    console.error("Scrape error:", e);
  }

  // -------- RENDER --------
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

  const cards = items.length
    ? items
        .map((it) => {
          const label = esc(it.title || "Achievement");
          const href = it.href
            ? it.href.startsWith("http")
              ? it.href
              : `https://github.com${it.href}`
            : URL;

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

          return `
          <a href="${href}" target="_blank" rel="noopener noreferrer" style="text-decoration:none; color:#e5e7eb;">
            <div style="width:${size}px; height:${size}px; margin:0 auto; border-radius:50%; overflow:hidden; box-shadow:0 0 0 2px #1f2937;">
              <img src="${it.src}" alt="${label}" width="${size}" height="${size}" style="display:block; width:100%; height:100%; object-fit:cover;">
            </div>
            <div style="margin-top:10px; text-align:center;">
              <div style="font:600 14px system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',Arial; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:${size}px;">
                ${label}
              </div>
              ${countPill}
            </div>
          </a>`;
        })
        .join("")
    : `<div style="opacity:.8;">No achievements found</div>`;

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>GitHub Achievements - ${esc(USER)}</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      background: #0b1220;
      color: #e5e7eb;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, 'Helvetica Neue', Arial, sans-serif;
    }
    .wrap {
      width: ${width}px;
      min-height: ${height}px;
      padding: 24px;
      box-sizing: border-box;
    }
    h1 {
      margin: 0 0 16px 0;
      font-weight: 800;
      font-size: 22px;
      line-height: 1.2;
      letter-spacing: .2px;
      color: #c7d2fe;
      text-align: center;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(${cols}, ${size}px);
      gap: ${gap}px;
      justify-content: center;
      align-items: start;
    }
    .footer {
      margin-top: 14px;
      font-weight: 500;
      font-size: 12px;
      opacity: .7;
      text-align: center;
    }
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
  console.log(`Saved clean achievements image to ${OUT_FILE} (${items.length} badges).`);
})();
