// Regenerates extension and desktop icons from the buddy silhouette.
// Usage: node scripts/build-icons.cjs   (uses Playwright + Edge/Chromium to rasterize SVG)
const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "..");

// Simplified buddy: cream resume paper with face, blue check badge, brand green tile.
// viewBox 0 0 128 128; the simple variant stays legible at 16px.
function iconSVG(simple) {
  const tile = '<rect width="128" height="128" rx="28" fill="#3E6758"/>';
  const paper = simple
    ? '<rect x="34" y="26" width="56" height="72" rx="9" fill="#FFFDF6" stroke="#283F3C" stroke-width="6"/>'
    : '<path d="M46 28H82L96 42V94Q96 102 88 102H46Q38 102 38 94V36Q38 28 46 28Z" fill="#FFFDF6" stroke="#283F3C" stroke-width="5" stroke-linejoin="round"/><path d="M82 28V40Q82 44 86 44H96" fill="#D9DFFD" stroke="#283F3C" stroke-width="4" stroke-linejoin="round"/>';
  const face = simple
    ? ""
    : '<path d="M56 62V69M76 62V69" stroke="#283F3C" stroke-width="6" stroke-linecap="round"/><path d="M57 81Q66 89 75 81" stroke="#283F3C" stroke-width="4" stroke-linecap="round" fill="none"/><ellipse cx="50" cy="74" rx="5" ry="2.6" fill="#F5B5A0"/><ellipse cx="82" cy="74" rx="5" ry="2.6" fill="#F5B5A0"/><circle cx="98" cy="27" r="8" fill="#F6D977"/>';
  const badge = simple
    ? '<circle cx="90" cy="88" r="21" fill="#657FD3" stroke="#283F3C" stroke-width="5"/><path d="M82 88L88 94L100 82" stroke="#FFFDF6" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
    : '<circle cx="92" cy="90" r="18" fill="#657FD3" stroke="#283F3C" stroke-width="4"/><path d="M84 90L90 96L101 84" stroke="#FFFDF6" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">${tile}${paper}${face}${badge}</svg>`;
}

async function render(browser, svg, size, out) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<!doctype html><style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({ path: out, omitBackground: true });
  await page.close();
  console.log("icon", path.relative(root, out), size + "px");
}

(async () => {
  const { chromium } = require("playwright");
  const channel = process.env.BROWSER_CHANNEL || "msedge";
  const browser = await chromium.launch({ channel });
  const iconsDir = path.join(root, "icons");
  fs.mkdirSync(iconsDir, { recursive: true });
  for (const size of [16, 32])
    await render(
      browser,
      iconSVG(true),
      size,
      path.join(iconsDir, `icon-${size}.png`),
    );
  for (const size of [48, 128])
    await render(
      browser,
      iconSVG(false),
      size,
      path.join(iconsDir, `icon-${size}.png`),
    );
  const desktopBuild = path.join(root, "desktop", "build");
  fs.mkdirSync(desktopBuild, { recursive: true });
  await render(browser, iconSVG(false), 256, path.join(desktopBuild, "icon.png"));
  await browser.close();
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
