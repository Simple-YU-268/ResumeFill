# Changelog

## 0.10.1 — 2026-10-16

First public source release. Adds MIT licensing, third-party notices, portable test setup, privacy checks, CI and a clean publication boundary. User-specific development paths and workspace-specific gateway configuration defaults are removed. Personal profiles, screenshots, credentials and research artifacts are excluded.

Includes the 0.10.0 features: Windows desktop management, visual profile editing, enum dropdowns and strict synonym matching, browser autofill Agent, and PDF text extraction followed by optional AI semantic parsing and human review.

## Known limitations

- OCR for scanned/image-only PDFs is not embedded.
- External model configuration is required for PDF semantic parsing. End-to-end protocol tests use a mock upstream; real provider quality varies.
- Extensions are installed through developer mode; no Chrome/Edge store listing is provided.
- Windows installer is unsigned. No automatic application submission is performed.
