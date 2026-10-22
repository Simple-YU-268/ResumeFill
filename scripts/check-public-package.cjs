/* Never echo matched text: findings may themselves be confidential. */
const fs = require("node:fs"),
  path = require("node:path"),
  cp = require("node:child_process");
const root = path.resolve(__dirname, "..");
function identityValues(profile) {
  const result = [];
  function walk(data) {
    for (const [key, value] of Object.entries(data || {})) {
      if (value && typeof value === "object") walk(value);
      else if (
        /^(name|phone|email|idNumber|idCard|wechat)$/i.test(key) &&
        typeof value === "string" &&
        value.trim().length >= (/[\u3400-\u9fff]/u.test(value) ? 2 : 3)
      )
        result.push(value.trim());
    }
  }
  walk(profile.basics);
  walk(profile.family);
  return [...new Set(result)];
}
function redactPath(file, identity) {
  let result = file;
  for (const value of identity)
    for (const form of [value, encodeURIComponent(value)])
      result = result.split(form).join("[redacted]");
  return result;
}
function run(scanRoot = root) {
  const root = path.resolve(scanRoot);
  const findings = [];
  let checked = 0;
  const identity = [];
  if (process.env.RF_PRIVACY_REFERENCE)
    identity.push(
      ...identityValues(
        JSON.parse(fs.readFileSync(process.env.RF_PRIVACY_REFERENCE, "utf8")),
      ),
    );
  const forbiddenPath =
    /(^|\/)(node_modules|research|my-materials|backups|tmp|\.env(?:\..*)?)(\/|$)|(^|\/)(resume|config|connection|agent-checkpoint|application-checkpoint)\.json$|\.(?:png|jpe?g|pdf|docx?|pem|key|pfx|log|pid|zip|exe)$/i;
  // Only these visually reviewed, synthetic-data product screenshots may be public.
  // A changed image must be reviewed again; a matching filename alone is insufficient.
  const publicImages = {
    "docs/images/desktop-overview.png":
      "a8d3ad506c0fb5be03fd68f9ed24cd1c778b75e19a8cb39e7ebbba247a1bf75b",
    "docs/images/profile-editor.png":
      "6ec7ce37cd63a9715f73ed74ac65b3d3ab40e2b41f69842ffb1d1a59154ec1c3",
  };
  function approvedImage(file) {
    return (
      Object.hasOwn(publicImages, file) &&
      require("node:crypto")
        .createHash("sha256")
        .update(fs.readFileSync(path.join(root, file)))
        .digest("hex") === publicImages[file]
    );
  }
  function inspect(file, buffer, vendor = false) {
    checked++;
    const text = buffer.toString("utf8");
    const rules = [];
    if (
      !vendor &&
      /(?:[A-Za-z]:[\\/]Users[\\/](?!Public[\\/])[^\s'"\\/]+)|\/(?:Users|home)\/(?!runner\/|user\/)[^\s'"/]+\//.test(
        text,
      )
    )
      rules.push("user-specific-absolute-path");
    if (
      identity.some(
        (value) =>
          text.includes(value) ||
          buffer.includes(Buffer.from(value, "utf16le")),
      )
    )
      rules.push("matches-private-identity");
    if (
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{24,})\b/.test(
        text,
      )
    )
      rules.push("credential-pattern");
    if (rules.length) findings.push({ file, rules });
  }
  const files = cp
    .execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { cwd: root, encoding: "utf8" },
    )
    .split("\0")
    .filter(Boolean);
  for (const file of new Set(files)) {
    if (forbiddenPath.test(file) && !approvedImage(file))
      findings.push({ file, rules: ["unexpected-publish-path"] });
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    if (fs.lstatSync(full).isSymbolicLink()) {
      findings.push({ file, rules: ["symlink"] });
      continue;
    }
    inspect(file, fs.readFileSync(full));
  }
  if (process.argv.includes("--artifacts")) {
    const artifactRoot =
      process.env.RF_ARTIFACT_DIR ||
      path.join(root, "dist/desktop/win-unpacked");
    const app = path.join(artifactRoot, "resources/app.asar");
    const asar = require(
      path.join(root, "desktop/node_modules/@electron/asar"),
    );
    for (const name of asar.listPackage(app)) {
      const relative = name.replace(/^[/\\]/, "");
      if (!relative) continue;
      try {
        const stat = asar.statFile(app, relative);
        if (stat.files) continue;
        inspect(
          "app.asar/" + relative,
          asar.extractFile(app, relative),
          /^node_modules[\\/]/.test(relative),
        );
        if (/(^|\/)(resume|config|connection)\.json$|test\.cjs$/.test(relative))
          findings.push({
            file: "app.asar/" + relative,
            rules: ["unexpected-runtime-file"],
          });
      } catch (e) {
        findings.push({ file: relative, rules: ["unreadable-artifact"] });
      }
    }
    const runtime = path.join(artifactRoot, "resources/agent");
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else {
          const rel = path.relative(runtime, full).replaceAll("\\", "/");
          if (/(^|\/)(resume|config|connection)\.json$|test\.cjs$/.test(rel))
            findings.push({
              file: "agent/" + rel,
              rules: ["unexpected-runtime-file"],
            });
          inspect("agent/" + rel, fs.readFileSync(full));
        }
      }
    }
    walk(runtime);
  }
  console.log(
    JSON.stringify(
      {
        result: findings.length ? "FAIL" : "PASS",
        checked,
        identityReferenceUsed: !!process.env.RF_PRIVACY_REFERENCE,
        findings: findings.map((f) => ({
          ...f,
          file: redactPath(f.file, identity),
        })),
      },
      null,
      2,
    ),
  );
  if (findings.length) process.exitCode = 1;
}
module.exports = { identityValues, redactPath, run };
if (require.main === module) {
  try {
    run();
  } catch {
    console.log(
      JSON.stringify({
        result: "FAIL",
        findings: [
          { file: "[scan input]", rules: ["unreadable-input-or-artifact"] },
        ],
      }),
    );
    process.exitCode = 1;
  }
}
