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
      await page.waitForSelector('img.achievement-badge-card, img[alt^="Achievement"]', { timeout: 15000 });
    } catch (_) {}

    items = await page.evaluate(() => {
      const nodes = Array.from(
        document.querySelectorAll('img.achievement-badge-card, img[alt^="Achievement"], img[src*="/assets/"]')
      );
      const uniq = new Map();
      for (const img of nodes) {
        const src = img.getAttribute("src");
        if (!src) continue;
        const alt = img.getAttribute("alt") || "";
        const looksBadge =
          alt.toLowerCase().includes("achievement") ||
          (img.className || "").toLowerCase().includes("achievement");
        if (!looksBadge) continue;

        const parentA = img.closest("a");
        const title =
          (parentA && (parentA.getAttribute("aria-label") || parentA.getAttribute("title"))) ||
          img.getAttribute("title") ||
          alt.replace(/^Achievement:\s*/i, "");

        let count = "";
        const countNode =
          img.parentElement &&
          (img.parentElement.querySelector("span, sup, div[data-view-component='true']") ||
            img.closest("div")?.querySelector("span, sup"));
        if (countNode) {
          const t = (countNode.textContent || "").trim();
          if (/x\d+/i.test(t)) count = t;
        }

        if (!uniq.has(src)) {
          uniq.set(src, { src, title, count, href: parentA ? parentA.getAttribute("href") : null });
        }
      }
      return Array.from(uniq.values());
    });

    await page.close();
  } catch (e) {
    console.error("Scrape error:", e);
  }


  const cols = 4;                     
  const size = 128;                  
  const gap = 24;                    
  const headerH = 90;                 
  const rows = Math.max(1, Math.ceil(items.length / cols));
  const width = cols * (size + gap) + gap;
  const height = headerH + rows * (size + 36 + gap) + gap;
  const generatedAt = new Date().toISOString();

  const cards = items.length
    ? items.map(it => {
        const label = esc(it.title || "Achievement");
        const count = it.count ? `<span style="opacity:.9"> ${esc(it.count)}</span>` : "";
        const href = it.href ? (it.href.startsWith("http") ? it.href : `https://github.com${it.href}`) : URL;
        return `
        <a href="${href}" target="_blank" rel="noopener noreferrer" style="text-decoration:none; color:#e5e7eb;">
          <div style="width:${size}px; height:${size}px; margin:0 auto; border-radius:50%; overflow:hidden; box-shadow:0 0 0 2px #1f2937;">
            <img src="${it.src}" alt="${label}" width="${size}" height="${size}" style="display:block; width:100%; height:100%; object-fit:cover;">
          </div>
          <div style="margin-top:10px; font: 600 14px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, 'Helvetica Neue', Arial;">
            ${label}${count}
          </div>
        </a>`;
      }).join("")
    : `<div style="opacity:.8;">No achievements found</div>`;

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(USER)} · Achievements</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      background: #0b1220;
      color: #e5e7eb;
    }
    .wrap {
      width: ${width}px;
      min-height: ${height}px;
      padding: 24px;
      box-sizing: border-box;
    }
    h1 {
      margin: 4px 0 12px 0;
      font: 800 22px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, 'Helvetica Neue', Arial;
      letter-spacing:.3px;
      color:#c7d2fe;
      text-align:center;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(${cols}, ${size}px);
      gap: ${gap}px;
      justify-content: center;
    }
    .footer {
      margin-top: 12px;
      font: 500 12px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, 'Helvetica Neue', Arial;
      opacity:.7; text-align:center;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>GitHub Achievements — ${esc(USER)}</h1>
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

  await new Promise(r => setTimeout(r, 600));
  await page2.screenshot({ path: OUT_FILE, fullPage: true });
  await page2.close();

  await browser.close();
  console.log(`Saved clean achievements image to ${OUT_FILE} (${items.length} badges).`);
})();
