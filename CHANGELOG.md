# Changelog

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
