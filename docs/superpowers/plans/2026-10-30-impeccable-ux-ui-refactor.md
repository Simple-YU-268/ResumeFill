# Impeccable UX/UI Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the desktop manager, extension popup, and options page into a clearer Operate-mode interface using Impeccable's layout, adapt, and polish guidance without changing product behavior.

**Architecture:** Keep the existing Electron, static HTML, CSS, and vanilla JavaScript architecture. Reorder existing controls into task-oriented semantic regions, centralize visual tokens and responsive states in the shared stylesheets, and preserve every existing control ID and `data-action` contract.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript, Electron 44, Playwright 1.58, Impeccable 4.8 detector.

**Spec:** Direct user request to use https://github.com/pbakaus/impeccable for UX/UI refactoring; `AGENTS.md` visual and privacy constraints. The user explicitly chose direct implementation, so no separate design interview or spec document is required.

## Global Constraints

- Preserve the playful, simple illustration style, rounded controls, bright accents, and shared `buddy.svg` asset.
- Preserve all scanning, matching, filling, pairing, profile, model, update, and privacy behavior.
- Do not add a frontend framework, remote font, new runtime dependency, personal data, credential, or real profile fixture.
- Keep keyboard focus visible, body text contrast at WCAG AA or better, and layouts free of horizontal overflow at 620px popup width, 700px narrow desktop width, and 1280px wide desktop width.
- Remove decorative eyebrow labels and nested-card styling; use proximity, headings, and whitespace before containers.
- Keep DOM order aligned with visual and keyboard order.

## Review Focus

- Popup with no scanned fields must still explain the next action and keep fill disabled.
- Popup with many fields must retain a reachable sticky fill action without covering field controls.
- Options status and desktop synchronization actions must remain visible after being moved into task-oriented regions.
- Desktop pairing requests must not be hidden inside collapsed secondary details.
- Narrow and zoomed layouts must wrap controls without changing focus order or clipping long Chinese copy.

---

### Task 1: Pin the New Information Architecture with Failing UI Tests

**Files:**
- Modify: `review-visual-test.cjs`

**Interfaces:**
- Consumes: Existing static HTML and Playwright visual fixture.
- Produces: Assertions for `.primary-flow`, `.scan-panel`, `.review-panel`, `.fill-panel`, `#profileSection`, `#desktopSection`, `#aiSection`, and `#desktopSyncActions`; desktop and extension overflow checks.

- [ ] **Step 1: Write the failing structural and responsive tests**

Assert that popup DOM order is scan, review, then fill; options DOM order is profile, desktop connection, then AI; the options synchronization target exists; all three surfaces have no decorative `.eyebrow`; and rendered pages have no horizontal overflow.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node review-visual-test.cjs`
Expected: FAIL because the new task-region hooks and options ordering do not exist.

- [ ] **Step 3: Commit the test**

```bash
git add review-visual-test.cjs
git commit -m "test: pin task-oriented UI structure"
```

### Task 2: Rebuild the Shared Visual System and Three Surface Layouts

**Files:**
- Modify: `theme.css`
- Modify: `style.css`
- Modify: `profile-editor.css`
- Modify: `popup.html`
- Modify: `options.html`
- Modify: `options.js:54-55`
- Modify: `desktop/ui/index.html`
- Modify: `desktop/ui/style.css`

**Interfaces:**
- Consumes: The structure assertions from Task 1 and all existing element IDs, profile editor selectors, and desktop `data-action` names.
- Produces: Shared semantic panels, compact progress navigation, consistent form/button states, responsive grids, and the existing `desktopActions` insertion into `#desktopSyncActions`.

- [ ] **Step 1: Implement the popup task path**

Create a compact brand header and three-step progress strip; group scanning in `.scan-panel`, field matching in `.review-panel`, and overwrite/save/fill controls in `.fill-panel`. Keep advanced tools collapsed and preserve all existing IDs.

- [ ] **Step 2: Implement the options information architecture**

Place the profile editor and save actions first, desktop connection second, AI third, and JSON/rules/statistics in progressive-disclosure regions. Add anchored settings navigation and render desktop synchronization buttons into `#desktopSyncActions`.

- [ ] **Step 3: Implement the desktop hierarchy**

Keep four top-level sections. Separate service operation from updates and privacy/activity details, keep pairing requests visible, and make the welcome/progress treatment compact at wide and narrow widths.

- [ ] **Step 4: Implement shared visual and responsive styling**

Use the existing green, cream, blue, and apricot palette with semantic hover/active/disabled/focus states. Apply a 4px spacing rhythm, 12–16px card radii, one border or one soft shadow per elevation, fixed product-UI type sizes, 44px coarse-pointer targets, and structural breakpoints.

- [ ] **Step 5: Run the structural and visual test**

Run: `npm --prefix desktop run prepare:resources && node review-visual-test.cjs`
Expected: PASS; screenshots are produced for desktop at 1280×800 and 700×900 and extension surfaces at their target widths.

- [ ] **Step 6: Commit the implementation**

```bash
git add theme.css style.css profile-editor.css popup.html options.html options.js desktop/ui/index.html desktop/ui/style.css
git commit -m "refactor: clarify desktop and extension UX"
```

### Task 3: Verify Real Workflows and Run the Impeccable Detector

**Files:**
- Modify only if verification finds a scoped regression: files from Task 2 or `review-visual-test.cjs`

**Interfaces:**
- Consumes: Completed UI and existing real Electron/extension integration suites.
- Produces: Verified real workflows, responsive screenshots, detector findings resolved or explicitly justified, and a clean privacy/diff review.

- [ ] **Step 1: Run real browser and desktop workflows**

Run: `node extension-test.cjs && node desktop/extension-test.cjs && node desktop/ui-test.cjs`
Expected: PASS for installed-extension scanning/filling/profile operations, desktop synchronization, and actual Electron rendering.

- [ ] **Step 2: Inspect rendered states in a batch**

Review wide/narrow desktop and popup/options screenshots for hierarchy, text clipping, contrast, focus, sticky-action overlap, empty states, and missing artwork. Correct only confirmed defects and rerun the affected checks.

- [ ] **Step 3: Run Impeccable once over the changed markup**

Run: `./.impeccable-tool/.agents/skills/impeccable/scripts/impeccable.cmd detect --json popup.html options.html desktop/ui/index.html`
Expected: exit 0, or every exit-2 finding is fixed or recorded as a narrow intentional exception.

- [ ] **Step 4: Run regression, formatting, and privacy checks**

Run: `npm test && npm run format:check && npm run privacy && git diff --check`
Expected: all commands PASS. If pre-existing unrelated failures occur, record them without expanding scope.

- [ ] **Step 5: Remove temporary tooling/artifacts and review the final diff**

Delete `.impeccable-tool` and unneeded generated screenshots; keep source changes only. Confirm no personal data, credentials, or generated runtime resources are staged.

- [ ] **Step 6: Commit verification fixes if any**

```bash
git add <scoped-verification-fixes>
git commit -m "fix: polish responsive UI states"
```
