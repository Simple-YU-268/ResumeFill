# Public release privacy review

Reviewed for v0.23.0 on 2026-10-21. Earlier reviews: v0.22.0, v0.18.0 and v0.12.0.

The desktop-to-extension difference preview stays on the local authenticated connection. No profile values are sent to AI by this flow. Only selected changes are applied; website-learned answers and local-only fields are preserved, and a single pre-sync profile backup is stored in the extension's trusted local storage. Tests use synthetic profiles and isolated browser directories.

Two product screenshots in `docs/images/` were rendered from synthetic data and visually reviewed. They contain no real candidate information. Only their exact paths and SHA-256 hashes are allowed by the publication scanner; changed images require another review, and other PNG/JPEG files remain blocked. These are documentation assets, not screenshots of the user's live application pages.

The development workspace contains private files. This review applies only to the Git publication inventory and freshly built release runtime, not to every file elsewhere on the machine.

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
