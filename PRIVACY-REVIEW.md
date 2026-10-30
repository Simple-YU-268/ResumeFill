# Public release privacy review

Reviewed for v0.27.2 on 2026-10-30. The Impeccable UX/UI refactor preserves local-only profile and credential behavior; visual and integration tests use synthetic records and no live applicant screenshots.

Earlier reviews: v0.27.1, v0.24.x, v0.23.0, v0.22.0, v0.18.0 and v0.12.0.

The desktop-to-extension difference preview stays on the local authenticated connection. No profile values are sent to AI by this flow. Only selected changes are applied; website-learned answers and local-only fields are preserved, and a single pre-sync profile backup is stored in the extension's trusted local storage. Tests use synthetic profiles and isolated browser directories.

Two product screenshots in `docs/images/` were rendered from synthetic data and visually reviewed. They contain no real candidate information. The extension and desktop icons in `icons/` and `desktop/build/icon.png` are generated from a vector buddy silhouette by `scripts/build-icons.cjs` and contain no personal content. Only these exact paths and SHA-256 hashes are allowed by the publication scanner; changed images require another review, and other PNG/JPEG files remain blocked. These are documentation and brand assets, not screenshots of the user's live application pages.

The development workspace contains private files. This review applies only to the Git publication inventory and freshly built release runtime, not to every file elsewhere on the machine.

## 0.26.0 document and record boundaries

Work record types are local metadata and excluded from matching candidates. Record assignments are bound to document-local modules, topology and a canonical SHA-256 profile digest; they are not sent to a model. Document chooser URLs omit query strings and fragments. Diagnostics contain reason codes and frame IDs, not field values. Cross-origin and opaque documents are not filled. Open shadow roots are processed within their own label/menu roots; closed roots are not inspected. Architecture fixtures use only synthetic records and local servers.

## 0.27.0 bounded recovery

Recovery model packets contain only opaque field IDs, control types, categorical failure codes and fixed budgets. No labels, URLs, selectors or profile values are sent by recovery planning. Local identity keys remain on the authenticated local connection. Rebinding requires the same document/root/container and unique identity. Tests and screenshots use synthetic profiles. Live verification failed authentication before inference; no successful real-model claim is made.

## Publication boundary

- Only this standalone repository is published. External research folders, candidate documents, job-tracking records and browser profiles are outside its scope.
- Personal resume JSON, images, PDFs, checkpoints, local configuration, connection tokens, logs, installed dependencies and build outputs are ignored by Git. Ignored files must never be force-added.
- Tests use synthetic candidates and temporary directories, including generated image-only PDFs for real offline OCR tests. Machine-specific home-directory paths have been replaced with portable dependencies or environment configuration.
- Runtime resources use an explicit file allowlist. Personal profile, pairing tickets and connection files are created in user data after installation and are not bundled.

## Local secrets (0.16.0)

- The desktop encrypts the gateway token and provider API key at rest with Electron safeStorage (DPAPI on Windows). Plaintext configurations are migrated on first launch. A configuration sealed on another machine fails closed rather than decrypting silently.
- Connection files contain only a one-time pairing code, valid for 10 minutes and invalidated after redemption or a newer export. The long-lived token stays in the gateway process and the extension session store; it is never written by the extension or included in exported files.
- The loopback gateway rejects desktop, Agent, webpage-OCR and pairing requests without an extension Origin, and records desktop sync actions in a bounded in-memory audit (no profile values are logged).
- Update checks contact only the GitHub API and release asset CDN for this repository; they carry no personal data, profile content or credentials. Startup checks can be disabled. Downloads and installation require the user to invoke the one-click update or staged controls; unsaved edits and active tasks block installation.
- Model provider keys continue to reside only in the desktop configuration and are never imported into the extension.

## Checks

`npm run privacy` scans tracked and publishable untracked files for forbidden paths, user-specific absolute paths, private-key material and common access-token formats. Findings identify only file names and rule names, never matched content.

For the local review, the scanner was also given an external private reference file through the `RF_PRIVACY_REFERENCE` environment variable. Known identity/contact fields were compared without writing them into the repository or scan report. Neither the reference file nor its values are published.

`npm run privacy:artifacts` additionally inspects first-party source in the built ASAR and allowlisted gateway/extension runtime resources. Binary attachments are freshly built from this reviewed source; old local packages and screenshots are not release attachments.

These checks supplement source and staged-diff review. Pattern matching cannot prove the absence of every possible personal fact or credential. Contributors must rerun the checks and inspect outgoing changes before publishing.

Webpage OCR screenshots are sent only to the authenticated local desktop endpoint on explicit user action, processed in memory, and not included in Git, logs or release assets. The screenshot is not sent to an external model. Input-region masking reduces OCR of existing form values; it is not a complete redaction of all personal content visible on the page.

## 0.24–0.25 additional boundaries

- Family information, including family.father.idNumber, remains local. Automatic family learning is opt-in, off by default; uncertain relationships, masked identifiers and conflicts are not silently saved. All family synchronization requires sensitive-item review.
- AI dropdown matching requires user value-sharing consent and now rejects identity numbers, bank accounts and private contact fields. Local unique matches and numeric ambiguity decisions do not call the model. Field matching still excludes values by default; bounded basic candidate expansion sends paths only.
- Web OCR reuses one local child process, retains language models in memory, and disposes it after five idle minutes, cancellation, error or shutdown. Screenshots are processed in memory and are not logged or stored. No OCR cloud service is used.
- Aggregate statistics contain counters only; no field labels, values, page addresses or prompts. Extension counters stay in trusted local storage; desktop aggregates them over the authenticated loopback connection and stores local counter snapshots. No external telemetry is sent.
- AI calibration events (0.25.3) record only timestamp, event kind, model name, gateway hostname, resume field path (such as `basics.email`) and a 0–1 confidence number — never resume values, option text, page labels, URLs or prompts. They stay in the extension's trusted local storage in a 500-entry ring and are never sent anywhere; recording failures are silently ignored and cannot block filling.
- Corrupt settings are backed up locally before creating safe defaults; model keys are cleared and old automatic grants are not copied into the replacement configuration.
- Publication scanning covers two-character Chinese names, family identities, redacted finding paths and vendor archive content; any archive read failure fails the gate. Prepared resource directories are recreated and executable/style references are verified.

This is a code and synthetic-fixture review, not evidence that the current live application page or a real model provider passed end-to-end verification.


## 0.27.1 Element controls

Live-page inspection was limited to control markup and opening/closing menus; no applicant values were changed or submitted. Public tests use synthetic profiles and locally constructed Element-compatible markup, not copied personal records or screenshots. Dropdown ownership remains document/root scoped; describedby targets must contain a recognized menu. Cascade paths require an exact hierarchy and verified displayed output.
