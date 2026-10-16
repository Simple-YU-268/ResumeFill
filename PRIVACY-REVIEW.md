# Public release privacy review

Reviewed for v0.12.0 on 2026-10-16.

The development workspace contains private files. This review applies only to the Git publication inventory and freshly built release runtime, not to every file elsewhere on the machine.

## Publication boundary

- Only this standalone repository is published. External research folders, candidate documents, job-tracking records and browser profiles are outside its scope.
- Personal resume JSON, images, PDFs, checkpoints, local configuration, connection tokens, logs, installed dependencies and build outputs are ignored by Git. Ignored files must never be force-added.
- Tests use synthetic candidates and temporary directories, including generated image-only PDFs for real offline OCR tests. Machine-specific home-directory paths have been replaced with portable dependencies or environment configuration.
- Runtime resources use an explicit file allowlist. Personal profile and connection files are created in user data after installation and are not bundled.

## Checks

`npm run privacy` scans tracked and publishable untracked files for forbidden paths, user-specific absolute paths, private-key material and common access-token formats. Findings identify only file names and rule names, never matched content.

For the local review, the scanner was also given an external private reference file through the `RF_PRIVACY_REFERENCE` environment variable. Known identity/contact fields were compared without writing them into the repository or scan report. Neither the reference file nor its values are published.

`npm run privacy:artifacts` additionally inspects first-party source in the built ASAR and allowlisted gateway/extension runtime resources. Binary attachments are freshly built from this reviewed source; old local packages and screenshots are not release attachments.

These checks supplement source and staged-diff review. Pattern matching cannot prove the absence of every possible personal fact or credential. Contributors must rerun the checks and inspect outgoing changes before publishing.

Webpage OCR screenshots are sent only to the authenticated local desktop endpoint on explicit user action, processed in memory, and not included in Git, logs or release assets. The screenshot is not sent to an external model. Input-region masking reduces OCR of existing form values; it is not a complete redaction of all personal content visible on the page.
