// .github/scripts/screenshot-achievements.js

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const USER = process.env.GH_USERNAME || "pablobuza014";
const OUT_DIR = "assets";
const OUT_FILE = path.join(OUT_DIR, "achievements.png");
const URL = `https://github.com/${USER}?tab=achievements`;

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  );

  await page.goto(URL, { waitUntil: "networkidle2" });


  try {
    await page.waitForSelector('img.achievement-badge-card, img[alt^="Achievement"]', { timeout: 15000 });
  } catch (_) {}


  const fullHeight = await page.evaluate(() => Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight
  ));
  await page.setViewport({ width: 1280, height: Math.min(fullHeight, 5000) });
  await page.waitForTimeout(800);


  const clip = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll(
      'img.achievement-badge-card, img[alt^="Achievement"]'
    ));
    if (!imgs.length) return null;

    const rects = imgs.map(img => {
      const r = img.getBoundingClientRect();
      return { top: r.top + window.scrollY, left: r.left + window.scrollX, right: r.right + window.scrollX, bottom: r.bottom + window.scrollY };
    });

    const pad = 24;
    const top = Math.max(0, Math.min(...rects.map(r => r.top)) - pad);
    const left = Math.max(0, Math.min(...rects.map(r => r.left)) - pad);
    const right = Math.max(...rects.map(r => r.right)) + pad;
    const bottom = Math.max(...rects.map(r => r.bottom)) + pad;
    return { x: left, y: top, width: right - left, height: bottom - top };
  });

  if (clip) {

    await page.setViewport({ width: Math.max(1280, Math.ceil(clip.x + clip.width) + 10), height: Math.min(fullHeight, Math.ceil(clip.y + clip.height) + 10) });
    await page.screenshot({ path: OUT_FILE, clip });
  } else {
    await page.screenshot({ path: OUT_FILE, fullPage: true });
  }

  await browser.close();
  console.log(`Saved achievements screenshot to ${OUT_FILE}`);
})();
