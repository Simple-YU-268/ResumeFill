const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const root = path.resolve(__dirname);
const contentTypes = {
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

(async () => {
  fs.mkdirSync(path.join(root, "tmp"), { recursive: true });
  const server = http.createServer((req, res) => {
    const file = path.resolve(
      root,
      "." + new URL(req.url, "http://fixture.test").pathname,
    );
    if (
      !file.startsWith(root + path.sep) ||
      !fs.existsSync(file) ||
      fs.statSync(file).isDirectory()
    ) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      contentTypes[path.extname(file)] || "text/html;charset=utf-8",
    );
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const popup = await browser.newPage({
      viewport: { width: 620, height: 900 },
    });
    popup.setDefaultTimeout(5000);
    await popup.route("**/*.js", (route) => route.abort());
    await popup.goto(`${base}/popup.html`);
    for (const name of ["扫描页面", "核对匹配", "填写已核对字段"]) {
      await popup.getByRole("region", { name, exact: true }).waitFor();
    }
    assert.equal(
      await popup.evaluate(() => {
        const scan = document.querySelector(".scan-panel");
        const review = document.querySelector(".review-panel");
        const fill = document.querySelector(".fill-panel");
        return Boolean(
          scan.compareDocumentPosition(review) &
            Node.DOCUMENT_POSITION_FOLLOWING &&
          review.compareDocumentPosition(fill) &
            Node.DOCUMENT_POSITION_FOLLOWING
        );
      }),
      true,
      "Popup reading order must be scan, review, then fill",
    );
    assert.equal(await popup.locator("#fill").isDisabled(), true);
    await popup.locator("#scan").focus();
    assert.equal(
      await popup.locator("#scan").evaluate((el) => getComputedStyle(el).outlineWidth),
      "3px",
    );
    assert.equal(
      await popup.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    const fillbar = await popup.locator(".fillbar").boundingBox();
    assert.ok(fillbar.y + fillbar.height <= 901, "Sticky fill action must remain reachable");
    await popup.keyboard.press("Tab");
    assert.equal(
      await popup.evaluate(() => document.activeElement.id),
      "edit",
      "Keyboard order must follow the visible scan actions",
    );
    await popup.screenshot({
      path: path.join(root, "tmp/review-popup.png"),
      fullPage: true,
    });
    await popup.evaluate(() => {
      const fields = document.querySelector("#fields");
      for (let index = 0; index < 30; index++) {
        const row = document.createElement("div");
        row.className = "row";
        const label = document.createElement("label");
        label.textContent = `第 ${index + 1} 个需要人工核对的招聘表字段`;
        const select = document.createElement("select");
        select.id = `fixture-field-${index}`;
        select.append(new Option("基本信息 · 姓名", "basics.name"));
        const input = document.createElement("input");
        input.readOnly = true;
        input.value = "用于检查长中文内容与固定填写操作是否互相遮挡";
        label.append(select, input);
        row.append(label);
        fields.append(row);
      }
    });
    for (const index of [0, 15, 29]) {
      const control = popup.locator(`#fixture-field-${index}`);
      await control.scrollIntoViewIfNeeded();
      assert.equal(
        await control.evaluate((el) => {
          const field = el.getBoundingClientRect();
          const fill = document.querySelector(".fillbar").getBoundingClientRect();
          return field.top < fill.bottom && field.bottom > fill.top;
        }),
        false,
        `Sticky fill action must not cover field ${index + 1}`,
      );
      assert.equal(
        await popup.locator(".fillbar").evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight;
        }),
        true,
      );
    }
    await popup.screenshot({
      path: path.join(root, "tmp/review-popup-fields.png"),
      fullPage: true,
    });
    await popup.close();

    for (const width of [1000, 700, 360]) {
      const options = await browser.newPage({
        viewport: { width, height: 900 },
      });
      const optionsErrors = [];
      options.on("pageerror", (error) => optionsErrors.push(error.message));
      options.setDefaultTimeout(8000);
      await options.route("**/desktop-connect.js", (route) => route.abort());
      await options.addInitScript(() => {
        const local = {
          resume: { basics: { name: "Synthetic Candidate" } },
          adapters: { version: 1, adapters: [] },
          aiSettings: { enabled: false },
        };
        const session = {};
        const result = (store, keys) => {
          if (typeof keys === "string") return { [keys]: store[keys] };
          if (Array.isArray(keys))
            return Object.fromEntries(keys.map((key) => [key, store[key]]));
          return { ...store };
        };
        window.chrome = {
          storage: {
            local: {
              get: async (keys) => result(local, keys),
              set: async (values) => Object.assign(local, values),
              remove: async (keys) => {
                for (const key of Array.isArray(keys) ? keys : [keys]) delete local[key];
              },
            },
            session: {
              get: async (keys) => result(session, keys),
              set: async (values) => Object.assign(session, values),
              remove: async (keys) => {
                for (const key of Array.isArray(keys) ? keys : [keys]) delete session[key];
              },
            },
            onChanged: { addListener: () => {} },
          },
          runtime: { sendMessage: async () => ({}), openOptionsPage: () => {} },
          permissions: { contains: async () => true, request: async () => true },
        };
      });
      await options.goto(`${base}/options.html`);
      await options.locator('[data-profile-path="basics.name"]').waitFor();
      assert.deepEqual(optionsErrors, []);
      for (const name of ["个人资料", "连接桌面端", "AI 字段匹配"]) {
        await options.getByRole("region", { name, exact: true }).waitFor();
      }
      assert.equal(
        await options.evaluate(() => {
          const profile = document.querySelector("#profileSection");
          const desktop = document.querySelector("#desktopSection");
          const ai = document.querySelector("#aiSection");
          return Boolean(
            profile.compareDocumentPosition(desktop) &
              Node.DOCUMENT_POSITION_FOLLOWING &&
            desktop.compareDocumentPosition(ai) &
              Node.DOCUMENT_POSITION_FOLLOWING
          );
        }),
        true,
        "Options reading order must be profile, connection, then AI",
      );
      assert.equal(
        await options.locator("#desktopSyncActions button:visible").count(),
        2,
        "Real options initialization must render both desktop synchronization actions",
      );
      await options.getByRole("link", { name: "个人资料", exact: true }).click();
      assert.equal(await options.evaluate(() => location.hash), "#profileSection");
      await options.locator("#saveAI").click();
      await options.locator("#status").filter({ hasText: "AI 已关闭" }).waitFor();
      assert.equal(
        await options.locator("#status").evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight;
        }),
        true,
        "Status feedback must remain in the viewport after a lower-page action",
      );
      assert.equal(
        await options.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await options.screenshot({
        path: path.join(root, `tmp/review-options-${width}.png`),
        fullPage: true,
      });
      await options.close();
    }

    for (const disabledArt of [false, true]) {
      for (const [width, height] of [
        [1280, 800],
        [700, 900],
      ]) {
        const page = await browser.newPage({ viewport: { width, height } });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        if (disabledArt) await page.route("**/visual.js", (route) => route.abort());
        await page.addInitScript(() => {
          window.rf = {
            profile: async () => ({
              basics: { name: "Synthetic Candidate", gender: "男" },
            }),
            model: async () => ({ enabled: false }),
            status: async () => ({
              running: true,
              connections: [],
              recentActivity: [],
              statistics: { scans: 3, attempted: 10, verified: 8 },
              pairing: {
                pending: [
                  {
                    id: "synthetic-pairing",
                    origin: "chrome-extension://synthetic",
                    browser: "Edge",
                  },
                ],
                approved: [],
              },
            }),
            updateState: async () => ({ phase: "idle" }),
            rejectPairing: async (id) => {
              window.__rejectedPairing = id;
            },
            onUpdate: () => {},
            onPDFProgress: () => {},
            setAutoCheck: async () => {},
          };
        });
        await page.goto(`${base}/desktop/ui/index.html`);
        await page.locator("#service").filter({ hasText: "运行中" }).waitFor();
        assert.deepEqual(errors, []);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        assert.equal(await page.locator(".welcome").count(), 1);
        assert.equal(
          await page.locator(".journey .icon").count(),
          0,
          "Journey steps must not inherit sidebar navigation icons",
        );
        assert.equal(await page.locator("body").getAttribute("class"), "desktop-ui");
        assert.equal(
          await page.locator("#pairingRequests").evaluate((el) =>
            Boolean(el.closest("details,[hidden]")),
          ),
          false,
          "Pairing requests must not be hidden in secondary details",
        );
        const reject = page.getByRole("button", { name: "拒绝", exact: true });
        await reject.waitFor({ state: "visible" });
        await reject.click();
        assert.equal(
          await page.evaluate(() => window.__rejectedPairing),
          "synthetic-pairing",
        );
        await page.locator("button").first().focus();
        assert.equal(
          await page.locator("button").first().evaluate((el) => getComputedStyle(el).outlineWidth),
          "3px",
        );
        await page.screenshot({
          path: path.join(
            root,
            `tmp/review-desktop-${width}${disabledArt ? "-no-art" : ""}.png`,
          ),
        });
        await page.close();
      }
    }
    console.log(
      "PASS: popup scan→review→fill with 30-field fixed-action clearance, live options sync/status in viewport, actionable pending pairing, keyboard order and no horizontal overflow at 360–1280px",
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
