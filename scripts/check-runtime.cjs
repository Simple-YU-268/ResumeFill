const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
function checkRuntime(directory) {
  const root = path.resolve(directory),
    manifest = JSON.parse(
      fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
    );
  const pending = [
    "manifest.json",
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_page,
  ];
  for (const c of manifest.content_scripts || [])
    pending.push(...(c.js || []), ...(c.css || []));
  for (const group of Object.values(manifest.icons || {})) pending.push(group);
  const seen = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    assert.ok(
      !path.isAbsolute(file) && !file.split(/[\\/]/).includes(".."),
      "unsafe runtime reference",
    );
    const full = path.join(root, file);
    assert.ok(fs.existsSync(full), "Missing runtime dependency: " + file);
    assert.ok(!fs.lstatSync(full).isSymbolicLink(), "runtime symlink: " + file);
    if (!/\.(?:html|js|css)$/.test(file)) continue;
    const text = fs.readFileSync(full, "utf8");
    // Only executable/style/asset references; navigation URLs are not dependencies.
    const refs = [];
    if (file.endsWith(".html"))
      for (const m of text.matchAll(
        /<(?:script|link|img)\b[^>]*\b(?:src|href)=["']([^"']+)["']/g,
      ))
        refs.push(m[1]);
    if (file.endsWith(".js"))
      for (const m of text.matchAll(/importScripts\(([^)]+)\)/g))
        for (const a of m[1].matchAll(/['"]([^'"]+)['"]/g)) refs.push(a[1]);
    if (file.endsWith(".js")) {
      for (const m of text.matchAll(/files:\s*\[([^\]]+)\]/g))
        for (const a of m[1].matchAll(/['"]([^'"]+\.js)['"]/g)) refs.push(a[1]);
      for (const m of text.matchAll(/fetch\(['"]([^'"]+\.json)['"]\)/g))
        refs.push(m[1]);
    }
    if (file.endsWith(".css"))
      for (const m of text.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g))
        refs.push(m[1]);
    pending.push(
      ...refs
        .filter((r) => !/^([a-z]+:|#|\/)/i.test(r))
        .map((r) => path.posix.join(path.posix.dirname(file), r)),
    );
  }
  return seen;
}
if (require.main === module) {
  checkRuntime(
    process.argv[2] || path.join(__dirname, "../desktop/resources/extension"),
  );
  console.log("PASS: runtime entrypoint dependencies exist");
}
module.exports = { checkRuntime };
