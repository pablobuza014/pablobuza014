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
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let n = 0;
          const step = () => {
            window.scrollBy(0, Math.max(200, window.innerHeight * 0.8));
            n++;
            if (window.innerHeight + window.scrollY >= document.body.scrollHeight || n > 10) resolve();
            else setTimeout(step, 180);
          };
          step();
        });
        window.scrollTo(0, 0);
      });
    } catch (_) {}

    
    try {
      await page.waitForSelector('img[alt^="Achievement"]', { timeout: 15000 });
    } catch (_) {}

    
    items = await page.evaluate(() => {
      
      const all = Array.from(document.querySelectorAll('img[alt^="Achievement"]'));

    
      const bigBadges = all.filter((img) => {
        const r = img.getBoundingClientRect();
        return r.width >= 96 && r.height >= 96;
      });

      const uniq = new Map();

      for (const img of bigBadges) {
        const src = img.getAttribute("src");
        if (!src) continue;

        
        let card = img.closest("a")?.parentElement || img.closest("div") || img.parentElement;

       
        let title = "";
        const a = img.closest("a");
        const titleNode =
          card.querySelector("h3, h4, strong") ||
          card.querySelector('div[dir="auto"]') ||
          (a && (a.querySelector("h3, h4, strong") || a));
        if (titleNode) title = (titleNode.textContent || "").trim();
        if (!title) {
          const aria = (a && (a.getAttribute("aria-label") || a.getAttribute("title"))) || "";
          title = (aria || img.getAttribute("alt") || "").replace(/^Achievement:\s*/i, "").trim();
        }

        
        let count = "";
        const containerRect = (card || img).getBoundingClientRect();
        const area = {
          top: Math.min(containerRect.top, img.getBoundingClientRect().top) - 8,
          left: Math.min(containerRect.left, img.getBoundingClientRect().left) - 8,
          right: Math.max(containerRect.right, img.getBoundingClientRect().right) + 8,
          bottom: Math.max(containerRect.bottom, img.getBoundingClientRect().bottom) + 8,
        };
        const isInside = (el) => {
          const q = el.getBoundingClientRect();
          const cx = (q.left + q.right) / 2;
          const cy = (q.top + q.bottom) / 2;
          return cx >= area.left && cx <= area.right && cy >= area.top && cy <= area.bottom;
        };
        const pill = Array.from(card.querySelectorAll("span, sup"))
          .filter(isInside)
          .map((n) => (n.textContent || "").trim())
          .find((t) => /^x\d+$/i.test(t));
        if (pill) count = pill;

        const href = a ? a.getAttribute("href") : null;

        if (!uniq.has(src)) {
          uniq.set(src, { src, title, count, href });
        }
      }

      return Array.from(uniq.values());
    });

    await page.close();
  } catch (e) {
    console.error("Scrape error:", e);
  }

  
  const size = 128;
  const gap  = 24;
  const headerH = 90;

  const count = Math.max(1, items.length);
  const cols = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(count))));
  const rows = Math.ceil(count / cols);

  const width  = cols * (size + gap) + gap;
  const height = headerH + rows * (size + 36 + gap) + gap;
  const generatedAt = new Date().toISOString();

  const cards = items.length
    ? items
        .map((it) => {
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
        })
        .join("")
    : `<div style="opacity:.8;">No achievements found</div>`;

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(USER)} · Achievements</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; background: #0b1220; color: #e5e7eb; }
    .wrap { width: ${width}px; min-height: ${height}px; padding: 24px; box-sizing: border-box; }
    h1 { margin: 4px 0 12px 0; font: 800 22px/1.2 system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',Arial; letter-spacing:.3px; color:#c7d2fe; text-align:center; }
    .grid { display: grid; grid-template-columns: repeat(${cols}, ${size}px); gap: ${gap}px; justify-content: center; }
    .footer { margin-top: 12px; font: 500 12px system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',Arial; opacity:.7; text-align:center; }
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
  await new Promise((r) => setTimeout(r, 600));
  await page2.screenshot({ path: OUT_FILE, fullPage: true });
  await page2.close();

  await browser.close();
  console.log(`Saved clean achievements image to ${OUT_FILE} (${items.length} badges).`);
})();
