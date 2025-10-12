const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const USER = process.env.GH_USERNAME || "pablobuza014";
const README_PATH = process.env.README_PATH || "README.md";
const ACH_URL = `https://github.com/${USER}?tab=achievements`;

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

(async () => {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  let items = [];
  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    );

    await page.goto(ACH_URL, { waitUntil: "networkidle2" });

    try {
      await page.waitForSelector(
        'img.achievement-badge-card, img[alt^="Achievement"], img[src*="/assets/"]',
        { timeout: 15000 }
      );
    } catch (_) {
    }

    items = await page.evaluate(() => {
      const nodes = Array.from(
        document.querySelectorAll(
          'img.achievement-badge-card, img[alt^="Achievement"], img[src*="/assets/"]'
        )
      );

      const uniq = new Map();
      for (const img of nodes) {
        const src = img.getAttribute("src");
        if (!src) continue;

        const alt = img.getAttribute("alt") || "";
        const looksLikeBadge =
          alt.toLowerCase().includes("achievement") ||
          (img.className || "").toLowerCase().includes("achievement");

        if (!looksLikeBadge) continue;

        const parentA = img.closest("a");
        const title =
          (parentA && (parentA.getAttribute("aria-label") || parentA.getAttribute("title"))) ||
          img.getAttribute("title") ||
          alt;

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
  } catch (err) {
    console.error("Error while scraping achievements:", err);
  } finally {
    await browser.close();
  }

  let innerSlides = "";
  if (items.length) {
    innerSlides = items
      .map((it) => {
        const href = it.href
          ? it.href.startsWith("http")
            ? it.href
            : `https://github.com${it.href}`
          : ACH_URL;
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
  } else {
    innerSlides = `
      <a href="${ACH_URL}" target="_blank" rel="noopener noreferrer" title="Open your GitHub Achievements"
         style="flex:0 0 auto; scroll-snap-align:center; display:inline-block; text-align:center; margin:0 6px;">
        <img src="https://github.githubassets.com/favicons/favicon.svg" alt="GitHub" width="64" height="64"
             style="opacity:0.8; display:block; margin:0 auto;" />
        <div style="font-size:0.85em; opacity:0.8; margin-top:6px;">Open Achievements</div>
      </a>
    `;
    console.warn("No achievements found: writing fallback block so the Action confirms insertion.");
  }

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
    ${innerSlides}
  </div>
  <div style="font-size:0.85em; opacity:0.8; margin-top:6px;">
    Swipe to explore all · Source: <a href="${ACH_URL}">GitHub Achievements</a>
  </div>
</div>`.trim();

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
