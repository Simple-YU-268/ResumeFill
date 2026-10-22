const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const VERSION = require("./package.json").version;
class Controller {
  constructor(directory, runtime, protector = null) {
    this.directory = directory;
    this.runtime = runtime;
    this.protector =
      protector &&
      typeof protector.protect === "function" &&
      typeof protector.unprotect === "function"
        ? protector
        : null;
    this.gateway = null;
    this.webOCR = new (require("./web-ocr.cjs").WebOCR)();
    this.connections = new Map();
    this.audit = [];
    this.statistics = {
      totals: require("./statistics.cjs").empty(),
      clients: {},
    };
    try {
      this.statistics = require("./statistics.cjs").normalize(
        JSON.parse(
          fs.readFileSync(path.join(directory, "statistics.json"), "utf8"),
        ),
      );
    } catch {}
    this.pairingTicket = null;
    fs.mkdirSync(directory, { recursive: true });
    this.configFile = path.join(directory, "config.json");
    if (!fs.existsSync(this.configFile))
      this.write(
        this.configFile,
        this._seal({
          port: 17322,
          token: crypto.randomBytes(32).toString("hex"),
          upstream: {
            enabled: false,
            endpoint: "https://api.openai.com/v1/chat/completions",
            model: "",
            apiKey: "",
            jsonMode: true,
          },
        }),
      );
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(this.configFile, "utf8"));
      if (
        !raw ||
        typeof raw !== "object" ||
        Array.isArray(raw) ||
        !raw.upstream ||
        typeof raw.upstream !== "object"
      )
        throw Error("invalid config");
    } catch {
      const backup = path.join(directory, "backups");
      fs.mkdirSync(backup, { recursive: true });
      fs.copyFileSync(
        this.configFile,
        path.join(backup, "damaged-config-" + Date.now() + ".json"),
      );
      this.configRecovered = true;
      raw = this._seal({
        port: 17322,
        token: crypto.randomBytes(32).toString("hex"),
        desktopGrants: [],
        upstream: {
          enabled: false,
          endpoint: "https://api.openai.com/v1/chat/completions",
          model: "",
          apiKey: "",
          jsonMode: true,
        },
      });
      this.write(this.configFile, raw);
    }
    try {
      this.config = this._open(raw);
    } catch {
      this.lockedRaw = raw;
      this.credentialRecovery = true;
      this.config = {
        port: raw.port || 17322,
        token: "",
        updates: raw.updates,
        upstream: {
          enabled: false,
          endpoint:
            raw.upstream?.endpoint ||
            "https://api.openai.com/v1/chat/completions",
          model: raw.upstream?.model || "",
          jsonMode: !!raw.upstream?.jsonMode,
          apiKey: "",
        },
      };
    }
    if (
      !this.credentialRecovery &&
      this.protector &&
      (typeof raw.token === "string" ||
        (typeof raw.upstream?.apiKey === "string" && raw.upstream.apiKey))
    )
      this.write(this.configFile, this._seal(this.config));
  }
  requireCredentials() {
    if (this.credentialRecovery)
      throw Error(
        "本机加密凭据无法读取，请先在管理中心恢复连接凭据；原配置尚未改动",
      );
  }
  recoverCredentials() {
    if (!this.credentialRecovery) return this.status();
    if (!this.protector) throw Error("本机加密不可用，未修改原配置");
    const folder = path.join(this.directory, "backups");
    fs.mkdirSync(folder, { recursive: true });
    this.write(
      path.join(folder, "locked-config-" + Date.now() + ".json"),
      this.lockedRaw,
    );
    const config = {
      ...this.config,
      token: crypto.randomBytes(32).toString("hex"),
      desktopGrants: [],
      upstream: { ...this.config.upstream, enabled: false, apiKey: "" },
    };
    this.write(this.configFile, this._seal(config));
    this.config = config;
    this.credentialRecovery = false;
    this.lockedRaw = null;
    this.autoPairing = null;
    return this.status();
  }
  _seal(config) {
    if (!this.protector) return config;
    const { token, upstream, ...rest } = config;
    const { apiKey, ...pub } = upstream || {};
    return {
      ...rest,
      secrets: "safeStorage-v1",
      tokenProtected: { v: 1, data: this.protector.protect(String(token)) },
      upstream: {
        ...pub,
        apiKeyProtected: apiKey
          ? { v: 1, data: this.protector.protect(String(apiKey)) }
          : null,
      },
    };
  }
  _open(raw) {
    const config = { ...raw };
    delete config.secrets;
    if (raw.tokenProtected) {
      if (!this.protector)
        throw Error("配置密钥已加密，但本机加密不可用，请在新版桌面端中打开");
      try {
        config.token = this.protector.unprotect(raw.tokenProtected.data);
      } catch {
        throw Error("本机配置密钥解密失败，配置可能来自其他设备");
      }
    }
    delete config.tokenProtected;
    config.upstream = { ...(raw.upstream || {}) };
    if (raw.upstream?.apiKeyProtected) {
      if (!this.protector) throw Error("配置密钥已加密，但本机加密不可用");
      try {
        config.upstream.apiKey = this.protector.unprotect(
          raw.upstream.apiKeyProtected.data,
        );
      } catch {
        throw Error("模型密钥解密失败，请重新填写并保存");
      }
    }
    delete config.upstream.apiKeyProtected;
    return config;
  }
  write(file, data) {
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }
  profile() {
    const file = path.join(this.directory, "resume.json");
    return fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file))
      : { basics: {}, education: [], work: [], projects: [] };
  }
  saveProfile(value) {
    if (
      !value ||
      Array.isArray(value) ||
      typeof value !== "object" ||
      JSON.stringify(value).length > 1500000
    )
      throw Error("简历必须是 JSON 对象，且小于 1.5 MB");
    const text = JSON.stringify(value);
    if (/"(?:__proto__|prototype|constructor)"\s*:/.test(text))
      throw Error("资料含不支持的键名");
    this.write(path.join(this.directory, "resume.json"), value);
    return this.profile();
  }
  connection() {
    this.requireCredentials();
    const code = crypto.randomBytes(32).toString("hex");
    this.pairingTicket = { code, expiresAt: Date.now() + 600000 };
    return {
      kind: "resumefill-pairing",
      version: 1,
      endpoint: `http://127.0.0.1:${this.config.port}/v1/chat/completions`,
      model: "resumefill-local",
      code,
      expiresAt: this.pairingTicket.expiresAt,
    };
  }
  redeemPairing(code) {
    const ticket = this.pairingTicket;
    if (!ticket || Date.now() > ticket.expiresAt) {
      this.pairingTicket = null;
      return null;
    }
    if (typeof code !== "string") return null;
    const a = Buffer.from(code),
      b = Buffer.from(ticket.code);
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
    this.pairingTicket = null;
    return this.config.token;
  }
  pairing() {
    if (!this.autoPairing)
      this.autoPairing = new (require("./pairing.cjs").DesktopPairing)({
        grants: () =>
          Array.isArray(this.config.desktopGrants)
            ? this.config.desktopGrants
            : [],
        secret: () => this.config.token,
        save: (grants) => {
          this.requireCredentials();
          this.config = { ...this.config, desktopGrants: grants };
          this.write(this.configFile, this._seal(this.config));
        },
      });
    return this.autoPairing;
  }
  async start() {
    this.requireCredentials();
    if (this.gateway) return this.status();
    const { createGateway } = require(
      path.join(this.runtime, "local-server/server.cjs"),
    );
    const gateway = createGateway({
      ...this.config,
      version: VERSION,
      pairing: {
        redeem: (code) => this.redeemPairing(code),
        automatic: (input, origin) => this.pairing().request(input, origin),
      },
      sessionAuth: (token, origin) =>
        this.pairing().authenticate(token, origin),
      webOCR: (input, options) => this.webOCR.recognize(input, options),
      desktopHandler: (action, input) => {
        this.audit.push({
          at: Date.now(),
          action,
          clientId:
            typeof input?.clientId === "string"
              ? input.clientId.slice(0, 80)
              : null,
        });
        while (this.audit.length > 50) this.audit.shift();
        if (action === "heartbeat") {
          if (
            typeof input.clientId !== "string" ||
            !/^[-\w]{1,80}$/.test(input.clientId)
          )
            throw Error("客户端无效");
          if (input.metrics) {
            const key = crypto
              .createHash("sha256")
              .update(input.clientId)
              .digest("hex");
            const next = require("./statistics.cjs").merge(
              this.statistics,
              input.metrics,
              key,
            );
            if (JSON.stringify(next) !== JSON.stringify(this.statistics)) {
              this.write(path.join(this.directory, "statistics.json"), next);
              this.statistics = next;
            }
          }
          this.connections.set(input.clientId, {
            browser: String(input.browser || "Chromium").slice(0, 30),
            version: String(input.version || "").slice(0, 20),
            at: Date.now(),
            task: input.task || null,
          });
          while (this.connections.size > 20)
            this.connections.delete(this.connections.keys().next().value);
          return { ok: true };
        }
        if (action === "pull") return { resume: this.profile() };
        if (action === "push") {
          this.saveProfile(input.resume);
          return { ok: true };
        }
        throw Error("操作无效");
      },
    });
    try {
      await gateway.listen();
    } catch (e) {
      if (
        e.code === "EADDRINUSE" &&
        [17322, 17323].includes(this.config.port)
      ) {
        this.config = { ...this.config, port: this.config.port + 1 };
        this.write(this.configFile, this._seal(this.config));
        return this.start();
      }
      throw e;
    }
    this.gateway = gateway;
    this.startupError = null;
    return this.status();
  }
  async stop() {
    this.webOCR.cancel();
    if (this.gateway) {
      await this.gateway.close();
      this.gateway = null;
    }
    return this.status();
  }
  status() {
    return {
      statistics: this.statistics.totals,
      configRecovered: !!this.configRecovered,
      startupError: this.startupError || null,
      credentialRecovery: !!this.credentialRecovery,
      running: !!this.gateway,
      port: this.config.port,
      engine: this.config.upstream.enabled ? "upstream" : "local-rules",
      directory: this.directory,
      secretsProtected: !!this.protector,
      updatesAutoCheck: this.config.updates?.autoCheck !== false,
      pairing: this.pairing().status(),
      connections: [...this.connections.values()].filter(
        (c) => Date.now() - c.at < 90000,
      ),
      recentActivity: this.audit.slice(-10).reverse(),
    };
  }
  setAutoCheck(value) {
    this.requireCredentials();
    this.config = { ...this.config, updates: { autoCheck: !!value } };
    this.write(this.configFile, this._seal(this.config));
    return this.status();
  }
  model() {
    const { apiKey, ...publicModel } = this.config.upstream;
    return { ...publicModel, hasKey: !!apiKey };
  }
  async saveModel(input) {
    this.requireCredentials();
    const AI = require(path.join(this.runtime, "ai.js"));
    const normalized = input.enabled
      ? AI.settings(input)
      : {
          enabled: false,
          endpoint: this.config.upstream.endpoint,
          model: input.model || "",
          jsonMode: !!input.jsonMode,
        };
    const config = {
      ...this.config,
      upstream: {
        ...normalized,
        apiKey: input.clearKey
          ? ""
          : AI.normalizeKey(input.apiKey) ||
            (new URL(normalized.endpoint).origin ===
            new URL(this.config.upstream.endpoint).origin
              ? this.config.upstream.apiKey
              : "") ||
            "",
      },
    };
    const running = !!this.gateway;
    await this.stop();
    this.write(this.configFile, this._seal(config));
    this.config = config;
    if (running) await this.start();
    return this.model();
  }
  async testModel() {
    this.requireCredentials();
    if (!this.config.upstream.enabled)
      throw Object.assign(Error("请先启用并保存模型"), {
        code: "RF_MODEL_DISABLED",
      });
    const AI = require(path.join(this.runtime, "ai.js")),
      { createGateway } = require(
        path.join(this.runtime, "local-server/server.cjs"),
      );
    const apiKey = AI.normalizeKey(this.config.upstream.apiKey);
    if (
      new URL(this.config.upstream.endpoint).hostname === "openrouter.ai" &&
      !apiKey
    )
      throw Object.assign(
        Error("模型未保存 OpenRouter API 密钥，请填写后保存再测试"),
        { code: "RF_MODEL_KEY_MISSING" },
      );
    const gateway = createGateway({
      ...this.config,
      upstream: { ...this.config.upstream, apiKey },
      port: 0,
      cacheTtlMs: 0,
      version: VERSION,
    });
    const started = Date.now();
    try {
      const address = await gateway.listen();
      const id = "probe-" + crypto.randomBytes(8).toString("hex");
      const packet = AI.build(
        [{ id, label: "电子邮箱", section: "basics", type: "email" }],
        { "basics.email": "synthetic@example.invalid" },
        { shareValues: false },
      );
      const response = await fetch(
        "http://127.0.0.1:" + address.port + "/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + this.config.token,
          },
          body: JSON.stringify(
            AI.requestBody({ model: "resumefill-local" }, packet),
          ),
          signal: AbortSignal.timeout(25000),
          redirect: "error",
        },
      );
      const data = await response.json();
      if (!response.ok) {
        const code = String(data.error || "").match(/HTTP (\d{3})/)?.[1];
        throw Object.assign(
          Error(
            code
              ? "模型调用失败，" +
                  AI.httpError(Number(code), this.config.upstream.endpoint)
              : "模型响应无效、网络异常或超时",
          ),
          { code: code ? "RF_MODEL_HTTP" : "RF_MODEL_PROTOCOL" },
        );
      }
      if (data.gateway?.engine !== "upstream" || data.gateway.cacheHit)
        throw Object.assign(Error("测试未经过真实模型"), {
          code: "RF_MODEL_PROTOCOL",
        });
      const result = AI.parseResponse(
        data.choices?.[0]?.message?.content,
        packet,
      );
      if (
        !result.accepted.some(
          (m) => m.fieldId === id && m.path === "basics.email",
        )
      )
        throw Object.assign(Error("模型未通过字段匹配协议验证"), {
          code: "RF_MODEL_PROTOCOL",
        });
      return {
        ok: true,
        latencyMs: Date.now() - started,
        route: "desktop → local gateway → model",
        checks: ["authentication", "response JSON", "field matching"],
        syntheticOnly: true,
      };
    } catch (e) {
      if (e.code) throw e;
      throw Object.assign(Error("模型网络连接失败或超时"), {
        code: "RF_MODEL_NETWORK",
      });
    } finally {
      await gateway.close();
    }
  }
}
module.exports = { Controller };
