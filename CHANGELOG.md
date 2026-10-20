# Changelog

## Unreleased — engineering

- CI now runs every automated suite: desktop extension sync, Electron UI profile editing, PDF import flow and the version consistency check (scripts/check-version.cjs asserts package.json, desktop/package.json and manifest.json stay aligned). New npm scripts: test:desktop, test:electron, test:all, version:check.
- The installer build workflow also uploads latest.yml and the NSIS blockmap, so CI-built releases can feed in-app updates.
- Electron GUI tests (ui-test, pdf-test, auth-ui-test) skip gracefully with a clear message when no display session is available locally; they still fail hard in CI.
- Docs: MIGRATION.md renamed to FEATURES-0.2.md to match the FEATURES-*.md series; personal record-keeping statements removed from public feature records.

## 0.18.0 — 2026-10-20

Adds in-app updates for the Windows desktop via electron-updater against GitHub Releases. The overview section gains "check for updates" with an inline state line (checking / available / downloading / ready / error), on-demand download and restart-to-install; downloads never start automatically and installation requires an explicit click. A persisted "check on startup" toggle (default on) controls the silent startup check, which runs only in installed builds. Update verification uses the SHA-512 metadata in latest.yml; releases now attach latest.yml and the NSIS blockmap. The installer remains unsigned; Windows may show a SmartScreen prompt. Checking for updates contacts the GitHub API and the release asset CDN only; no personal data is sent. Update checks are unavailable in unpackaged development runs.

## 0.17.0 — 2026-10-20

Review and connection UX. Field mapping options now show human-readable Chinese labels (section, record ordinal and field name) with the JSON path demoted to a tooltip; unresolved and required-missing rows sort to the top of the review list. The popup converges on a single primary action per stage (scan → review → fill), groups Agent/AI/OCR/scope utilities into a collapsed advanced section, and adds a sticky fill bar plus a result card with per-field retry for failed fills. Status messages distinguish errors visually. One-step desktop pairing: the desktop gains a "copy pairing code" action and the extension options page gains a desktop-connection card that redeems a pasted pairing payload, saves the gateway settings and stores the token in session storage in a single click; a connection state line shows connected or expired. Shared design tokens unify colors, spacing, radii and focus rings across the extension and desktop UI; low-contrast helper text, control borders and the disabled-primary style are corrected, and empty states are provided for connections and audit lists. DOM ids and accessible names are unchanged; browser and installed-extension regression tests cover the new ordering, human labels, paste pairing and result card.

## 0.16.0 — 2026-10-19

Security hardening for local secrets and the loopback gateway. The desktop now encrypts the gateway token and provider API key at rest with Electron safeStorage (DPAPI on Windows). Plaintext configurations are migrated on first launch; a sealed configuration without local encryption fails closed instead of falling back to plaintext. Connection files become one-time pairing tickets: the long-lived token never leaves the gateway, the extension redeems the code through the loopback gateway into session storage only, codes expire after 10 minutes, are invalidated on redemption or replacement, and pairing attempts are rate-limited. Desktop, Agent and webpage-OCR endpoints now require an extension Origin even with a valid token; the pairing endpoint requires one as well. Desktop sync actions (pull/push/heartbeat) are recorded in a bounded in-memory audit surfaced in the management UI. Gateway, desktop and PDF errors carry stable RF_* codes instead of regex text matching, and version strings for /health and the upstream User-Agent are derived from package metadata. Legacy long-token connection files remain accepted for standalone gateways; the desktop no longer exports them.

## 0.15.0 — 2026-10-19

Completes the A–E matching upgrade: nearest-left table labels and strict DT/DD ownership with nested-help filtering; shared numeric interval matching with explicit open/closed boundaries and monthly/annual salary isolation; ARIA-first async dropdown ownership and enabled candidate checks; user-selected container preview/fill with per-record path restrictions and stale-scope rejection; unresolved-only model requests with at most 12 relevant paths per field and per-field response validation. Indexed virtual lists retain the 500-item / 40-page bound; unindexed or incomplete lists remain manual.

Desktop model testing now saves current form inputs first, trims pasted credential whitespace/Bearer prefixes, and provides actionable 401/402/403 diagnostics without echoing provider bodies or secrets. OpenRouter missing-key tests stop locally. Browser extension session keys remain session-only; PDF and field matching share normalized credentials. After updating the saved credential, live OpenRouter qwen/qwen3.8-flash authentication and installed-extension semantic matching passed on a synthetic page: three unresolved fields, five candidate paths, no resume values sent, four independently verified browser fields. The model suggestion flow took 10.8 seconds in this run. Deterministic regression tests use a mock HTTP upstream.

Adds numeric/privacy unit tests, scoped browser and installed-extension interaction tests, and an actual Electron save-and-test/401 regression. No competitor private API or proprietary code is included.

## 0.14.0 — 2026-10-16

Adds independently implemented dropdown ownership tracking for reused portals, bounded complete indexed virtual-list enumeration before selection, confirmation invalidation when recycled DOM semantics change, grouped-radio and DT/DD labels, and opaque region-level hints. Includes public-package static REA findings for Nowcoder, Tata and Deepipe with explicit server/runtime unknowns and browser regression tests.

## 0.13.0 — 2026-10-16

Adds local province/city/county selectors with dependent resets and region codes across profile location fields. Native date/month controls preserve date precision and ongoing experiences. Imported values remain unchanged until edited.

Adds official DeepSeek, Kimi and OpenAI templates in desktop and extension settings. Desktop model tests now traverse an authenticated uncached loopback gateway and require a valid synthetic field match. Rejects malformed/empty responses, isolates saved credentials when changing provider origins, and disables thinking for supported DeepSeek/Kimi models in field, option and PDF requests. All three public endpoints returned HTTP 401 without credentials; authenticated OpenRouter inference with qwen/qwen3.8-flash passed both the production gateway field-matching path and PDF semantic parsing using synthetic data. Also normalizes base URLs to Chat Completions endpoints and improves PDF 404 diagnostics.

## 0.12.0 — 2026-10-16

Adds local webpage OCR for missing image/Canvas labels, authenticated loopback screenshot processing, input-region masking, DPI coordinate conversion, human-reviewed DOM bindings and stale-page rejection. DOM labels remain authoritative. Includes actual Edge capture/fill/readback tests at DPR 2 and preserves the existing PDF OCR flow.

## 0.11.0 — 2026-10-16

Adds embedded offline OCR for scanned and mixed PDFs, simplified/traditional Chinese and English language packs, page-level progress, cancellation, force-OCR mode and low-confidence review warnings. OCR text uses the existing explicit AI consent and reviewed JSON merge flow. Tests cover real image-only PDF extraction with network disabled and the complete mocked-model save workflow.

OCR is heuristic and may require forced mode or manual correction for difficult scans.

## 0.10.1 — 2026-10-16

First public source release. Adds MIT licensing, third-party notices, portable test setup, privacy checks, CI and a clean publication boundary. User-specific development paths and workspace-specific gateway configuration defaults are removed. Personal profiles, screenshots, credentials and research artifacts are excluded.

Includes the 0.10.0 features: Windows desktop management, visual profile editing, enum dropdowns and strict synonym matching, browser autofill Agent, and PDF text extraction followed by optional AI semantic parsing and human review.

## Known limitations

- OCR accuracy varies with scan quality; handwriting, rotation and complex layouts require manual review.
- External model configuration is required for PDF semantic parsing. End-to-end protocol tests use a mock upstream; real provider quality varies.
- Extensions are installed through developer mode; no Chrome/Edge store listing is provided.
- Windows installer is unsigned. No automatic application submission is performed.
