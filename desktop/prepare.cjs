const fs = require("node:fs"),
  path = require("node:path");
const source = path.resolve(__dirname, ".."),
  dest = path.join(__dirname, "resources");
if (
  path.resolve(dest) !== path.join(source, "desktop", "resources") ||
  (fs.existsSync(dest) && fs.lstatSync(dest).isSymbolicLink())
)
  throw Error("Unsafe runtime destination");
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
  fs.copyFileSync(path.join(source, file), path.join(dest, file));
fs.writeFileSync(
  path.join(__dirname, "ui/regions.js"),
  "window.ResumeRegions=" +
    fs.readFileSync(path.join(source, "data/regions.json"), "utf8") +
    ";",
);
fs.copyFileSync(
  path.join(source, "matcher.js"),
  path.join(__dirname, "ui/matcher.js"),
);
fs.copyFileSync(
  path.join(source, "field-labels.js"),
  path.join(__dirname, "ui/field-labels.js"),
);
const extension = path.join(dest, "extension");
fs.mkdirSync(extension, { recursive: true });
const files = require("../scripts/runtime-files.cjs");
for (const f of files)
  fs.copyFileSync(path.join(source, f), path.join(extension, f));
fs.cpSync(path.join(source, "data"), path.join(extension, "data"), {
  recursive: true,
});
for (const f of [
  "ai.js",
  "matcher.js",
  "option-match.js",
  "answers.js",
  "metrics.js",
])
  fs.copyFileSync(path.join(source, f), path.join(dest, f));
fs.mkdirSync(path.join(dest, "local-server"), { recursive: true });
for (const f of ["server.cjs", "agent.cjs"])
  fs.copyFileSync(
    path.join(source, "local-server", f),
    path.join(dest, "local-server", f),
  );
console.log(
  "Packaged only allowlisted runtime files; no personal profile or credentials.",
);

const ocrData = path.join(dest, "ocr-data");
fs.mkdirSync(ocrData, { recursive: true });
for (const lang of ["eng", "chi_sim", "chi_tra"]) {
  const pkg = path.dirname(
    require.resolve("@tesseract.js-data/" + lang + "/package.json"),
  );
  fs.copyFileSync(
    path.join(pkg, "4.0.0_best_int", lang + ".traineddata.gz"),
    path.join(ocrData, lang + ".traineddata.gz"),
  );
}

fs.writeFileSync(
  path.join(ocrData, "NOTICE.txt"),
  "Local OCR uses Tesseract.js and tesseract.js-core (Apache-2.0). Language packages @tesseract.js-data/eng, chi_sim and chi_tra version 1.0.0 declare MIT. Data variant: 4.0.0_best_int. See https://github.com/naptha/tessdata and https://github.com/naptha/tesseract.js .",
);

for (const f of ["theme.css", "visual.js", "buddy.svg"])
  fs.copyFileSync(path.join(source, f), path.join(__dirname, "ui", f));

fs.writeFileSync(
  path.join(dest, "package.json"),
  JSON.stringify({ version: require("../package.json").version }),
);
require("../scripts/check-runtime.cjs").checkRuntime(extension);

for (const file of [
  "profile-editor.js",
  "structured-fields.js",
  "profile-editor.css",
  "metrics.js",
])
  fs.copyFileSync(path.join(source, file), path.join(__dirname, "ui", file));
