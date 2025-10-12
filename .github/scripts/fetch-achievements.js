const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const USER = process.env.GH_USERNAME || "pablobuza014";
const README_PATH = process.env.README_PATH || "README.md";
const ACH_URL = `https://github.com/pablobuza014?tab=achievements`;

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

(async () => {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  );

  await page.goto(ACH_URL, { waitUntil: "networkidle2" });


  const items = await page.evaluate(() => {
    
    const candidates = Array.from(document.querySelectorAll('img.achievement-badge-card, img[src*="githubassets.com/assets/"]'));


    const uniq = new Map();
    for (const img of candidates) {
      const src = img.getAttribute("src");
      const alt = img.getAttribute("alt") || "";
      const parentA = img.closest("a");
      const title =
        (parentA && (parentA.getAttribute("aria-label") || parentA.getAttribute("title"))) ||
        img.getAttribute("title") ||
        alt;

      let count = "";
      const countNode =
        img.parentElement &&
        (img.parentElement.querySelector('span, sup, div[data-view-component="true"]') ||
          img.closest("div")?.querySelector('span, sup'));
      if (countNode) {
        const t = (countNode.textContent || "").trim();
        if (/x\d+/.test(t)) count = t;
      }

      if (src && !uniq.has(src)) {
        uniq.set(src, {
          src,
          alt,
          title,
          count,
          href: parentA ? parentA.getAttribute("href") : null,
        });
      }
    }
    return Array.from(uniq.values());
  });

  await browser.close();

  if (!items.length) {
    console.error("No achievements found – selector might need an update.");
    process.exit(0);
  }

  const slides = items
    .map((it) => {
      const href = it.href
        ? (it.href.startsWith("http") ? it.href : `https://github.com${it.href}`)
        : `https://github.com/${USER}?tab=achievements`;
      const label = it.alt || it.title || "Achievement";
      const tip = [label, it.count ? `(${it.count})` : ""].filter(Boolean).join(" ");

      return `
        <a
          href="${href}"
          target="_blank"
          rel="noopener noreferrer"
          title="${esc(tip)}"
          style="flex:0 0 auto; scroll-snap-align:center; display:inline-block; text-align:center; margin:0 6px;"
        >
          <img src="${it.src}" alt="${esc(label)}" width="88" height="88" style="border-radius:12px; display:block; margin:0 auto;" />
          ${it.count ? `<div style="font-size:0.8em; opacity:0.8; margin-top:4px;">${esc(it.count)}</div>` : ""}
        </a>
      `;
    })
    .join("\n");

  const block = `
<!-- auto-generated: achievements slider -->
<div align="center">
  <h3>🏅 GitHub Achievements</h3>
  <div
    style="
      display:flex;
      gap:6px;
      overflow-x:auto;
      padding:10px 6px;
      border:1px solid #2b2f36;
      border-radius:12px;
      scroll-snap-type:x mandatory;
      -webkit-overflow-scrolling:touch;
    "
  >
    ${slides}
  </div>
  <div style="font-size:0.85em; opacity:0.8; margin-top:6px;">
      Swipe to explore all · Source: <a href="${ACH_URL}">GitHub Achievements</a>
  </div>
</div>
`.trim();


  const readmeFullPath = path.resolve(process.cwd(), README_PATH);
  const md = fs.readFileSync(readmeFullPath, "utf8");

  const start = "<!-- ACHIEVEMENTS:START -->";
  const end = "<!-- ACHIEVEMENTS:END -->";
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`, "m");

  const replaced = md.match(pattern)
    ? md.replace(pattern, `${start}\n${block}\n${end}`)
    : md + `\n\n${start}\n${block}\n${end}\n`;

  fs.writeFileSync(readmeFullPath, replaced);
  console.log(`Inserted ${items.length} achievements into README.`);
})();
