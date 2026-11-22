"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => WikiSyncPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian5 = require("obsidian");

// src/api/wiki-client.ts
var import_obsidian = require("obsidian");
var WikiHttpError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
var WikiJsClient = class {
  constructor(baseUrl, apiToken) {
    this.baseUrl = baseUrl;
    this.apiToken = apiToken;
  }
  async whoami() {
    const data = await this.request("GET", "/_api/users/whoami");
    const name = stringField(data, "name") || stringField(data, "email") || stringField(data, "id");
    return name || "\u5DF2\u8BA4\u8BC1";
  }
  async getSite(siteIdOrHostname) {
    const data = await this.request("GET", `/_api/sites/${encodeURIComponent(siteIdOrHostname)}`);
    if (!data?.id) throw new Error("\u7AD9\u70B9\u54CD\u5E94\u91CC\u6CA1\u6709 id");
    return data;
  }
  async listSites() {
    const data = await this.request("GET", "/_api/sites");
    if (!Array.isArray(data)) throw new Error("\u7AD9\u70B9\u5217\u8868\u683C\u5F0F\u65E0\u6CD5\u8BC6\u522B");
    return data.filter(isWikiSite).sort((a, b) => siteLabel(a).localeCompare(siteLabel(b), "zh"));
  }
  async createPage(siteId, page) {
    const data = await this.request("POST", `/_api/sites/${siteId}/pages`, JSON.stringify(page), {
      "Content-Type": "application/json"
    });
    if (!data.page?.id) throw new Error(data.message || "\u521B\u5EFA\u9875\u9762\u6CA1\u6709\u8FD4\u56DE page.id");
    return data.page;
  }
  async updatePage(siteId, pageId, page) {
    const data = await this.request(
      "PATCH",
      `/_api/sites/${siteId}/pages/${pageId}`,
      JSON.stringify(page),
      { "Content-Type": "application/json" }
    );
    if (!data.page?.id) throw new Error(data.message || "\u66F4\u65B0\u9875\u9762\u6CA1\u6709\u8FD4\u56DE page.id");
    return data.page;
  }
  async queueRender(siteId, pageId) {
    await this.request("POST", `/_api/sites/${siteId}/pages/${pageId}/render`);
  }
  async findPage(siteId, wikiPath, locale) {
    const fromTree = await this.findPageInTree(siteId, wikiPath, locale);
    if (fromTree) return fromTree;
    return this.findPageBySearch(siteId, wikiPath, locale);
  }
  async uploadAsset(siteId, fileName, bytes, mime, folderPath, locale) {
    const query = new URLSearchParams({ fileName, locale });
    if (folderPath) query.set("folderPath", folderPath);
    const data = await this.request(
      "POST",
      `/_api/sites/${siteId}/assets?${query.toString()}`,
      bytes,
      { "Content-Type": mime }
    );
    if (!data.asset?.id || !data.asset.fileName) {
      throw new Error(data.message || "\u9644\u4EF6\u4E0A\u4F20\u6CA1\u6709\u8FD4\u56DE asset");
    }
    return data.asset;
  }
  async findPageInTree(siteId, wikiPath, locale) {
    const slash = wikiPath.lastIndexOf("/");
    const parent = slash === -1 ? "" : wikiPath.slice(0, slash);
    const query = new URLSearchParams({
      locale,
      types: "page",
      depth: "1",
      limit: "1000"
    });
    if (parent) query.set("parentPath", parent);
    let items;
    try {
      items = await this.request("GET", `/_api/sites/${siteId}/tree?${query.toString()}`);
    } catch (error) {
      if (error instanceof WikiHttpError && (error.status === 404 || error.status === 400)) return null;
      throw error;
    }
    if (!Array.isArray(items)) return null;
    const match = items.find((item) => {
      if (item.type !== "page" || !item.id) return false;
      const composed = [item.folderPath, item.fileName].filter(Boolean).join("/");
      return composed === wikiPath;
    });
    return match?.id ? { id: match.id, path: wikiPath } : null;
  }
  async findPageBySearch(siteId, wikiPath, locale) {
    const query = new URLSearchParams({
      path: wikiPath,
      locales: locale,
      limit: "20",
      orderBy: "path",
      orderByDirection: "asc"
    });
    const data = await this.request("GET", `/_api/sites/${siteId}/pages/search?${query.toString()}`);
    const hit = data.results?.find((item) => item.path === wikiPath && item.locale === locale && item.id);
    return hit?.id ? { id: hit.id, path: wikiPath } : null;
  }
  async request(method, path, body, headers) {
    const base = this.baseUrl.replace(/\/+$/, "");
    let response;
    try {
      response = await (0, import_obsidian.requestUrl)({
        url: `${base}${path}`,
        method,
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          Accept: "application/json",
          ...headers
        },
        body,
        throw: false
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`\u65E0\u6CD5\u8FDE\u63A5 Wiki.js\uFF1A${message}`);
    }
    if (response.status >= 400) {
      throw new WikiHttpError(response.status, explainWikiError(readError(response)));
    }
    return response.json ?? {};
  }
};
function isSystemApiKey(token) {
  const claims = decodeJwtPayload(token);
  return Array.isArray(claims?.grp) && typeof claims.sub !== "string";
}
function explainWikiError(message) {
  if (/API keys act for groups/i.test(message) || /use a personal access token/i.test(message)) {
    return "\u5F53\u524D Token \u662F\u7BA1\u7406\u540E\u53F0\u7684 API Key\uFF0C\u4E0D\u80FD\u4FDD\u5B58\u9875\u9762\u3002\u8BF7\u7528\u8D26\u53F7\u81EA\u5DF1\u7684\u4E2A\u4EBA\u8BBF\u95EE\u4EE4\u724C\uFF1A\u6253\u5F00 Wiki.js\uFF0C\u8FDB\u5165\u4E2A\u4EBA\u8D44\u6599\u91CC\u7684 Access Tokens\uFF0C\u65B0\u5EFA\u4EE4\u724C\u5E76\u52FE\u9009 pages:write \u548C assets:write\uFF0C\u518D\u7C98\u8D34\u5230\u63D2\u4EF6\u91CC\u3002";
  }
  return message;
}
function decodeJwtPayload(token) {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, "=");
    const json = atob(padded);
    const data = JSON.parse(json);
    return typeof data === "object" && data !== null ? data : null;
  } catch {
    return null;
  }
}
function readError(response) {
  const json = response.json;
  if (typeof json?.message === "string" && json.message.trim()) return json.message.trim();
  if (typeof json?.error === "string" && json.error.trim()) return json.error.trim();
  const text = response.text?.trim();
  if (text) return text.slice(0, 500);
  return `HTTP ${response.status}`;
}
function stringField(data, key) {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function isWikiSite(value) {
  return typeof value === "object" && value !== null && typeof value.id === "string" && value.id.trim() !== "";
}
function siteLabel(site) {
  const title = site.title?.trim();
  const hostname = site.hostname?.trim();
  const name = title && hostname && title !== hostname ? `${title}\uFF08${hostname}\uFF09` : title || hostname || site.id;
  return site.isEnabled === false ? `${name}\uFF08\u5DF2\u505C\u7528\uFF09` : name;
}

// src/settings.ts
var import_obsidian2 = require("obsidian");
var RELOAD_SITES = "wiki-sync-reload-sites";
var SETTING_KEYS = [
  "baseUrl",
  "apiToken",
  "siteId",
  "locale",
  "publishState",
  "assetFolder",
  "queueServerRender"
];
function renderWikiSettings(container, plugin) {
  container.empty();
  new import_obsidian2.Setting(container).setName("Wiki.js \u5730\u5740").setDesc("\u4F8B\u5982 https://book.selflove.top\uFF0C\u4E0D\u8981\u5E26 /_api\u3002").addText(
    (text) => text.setPlaceholder("https://book.selflove.top").setValue(plugin.settings.baseUrl).onChange(async (value) => {
      plugin.settings.baseUrl = value.trim().replace(/\/+$/, "");
      await plugin.persist();
    })
  );
  new import_obsidian2.Setting(container).setName("\u4E2A\u4EBA\u8BBF\u95EE\u4EE4\u724C").setDesc("\u5728 Wiki.js \u4E2A\u4EBA\u8D44\u6599\u7684 Access Tokens \u91CC\u65B0\u5EFA\uFF0C\u52FE\u9009 pages:write \u548C assets:write\u3002\u4E0D\u8981\u586B\u7BA1\u7406\u540E\u53F0\u7684 API Key\uFF0C\u90A3\u79CD\u4EE4\u724C\u4E0D\u80FD\u4FDD\u5B58\u9875\u9762\u3002").addText((text) => {
    text.inputEl.type = "password";
    text.setPlaceholder("Bearer token").setValue(plugin.settings.apiToken).onChange(async (value) => {
      plugin.settings.apiToken = value.trim();
      await plugin.persist();
    });
  });
  addSiteSetting(new import_obsidian2.Setting(container), plugin);
  new import_obsidian2.Setting(container).setName("\u9ED8\u8BA4\u8BED\u8A00").setDesc("\u7B14\u8BB0\u53EF\u7528 wikiLocale \u8986\u76D6\u3002").addText(
    (text) => text.setPlaceholder("zh").setValue(plugin.settings.locale).onChange(async (value) => {
      plugin.settings.locale = value.trim() || "zh";
      await plugin.persist();
    })
  );
  new import_obsidian2.Setting(container).setName("\u9ED8\u8BA4\u53D1\u5E03\u72B6\u6001").setDesc("\u7B14\u8BB0\u53EF\u7528 wikiPublished \u6216 wikiPublishState \u8986\u76D6\u3002").addDropdown(
    (dropdown) => dropdown.addOption("published", "\u53D1\u5E03").addOption("draft", "\u8349\u7A3F").setValue(plugin.settings.publishState).onChange(async (value) => {
      plugin.settings.publishState = value === "draft" ? "draft" : "published";
      await plugin.persist();
    })
  );
  new import_obsidian2.Setting(container).setName("\u9644\u4EF6\u76EE\u5F55").setDesc("\u56FE\u7247\u548C\u9644\u4EF6\u4E0A\u4F20\u5230\u8FD9\u4E2A\u76EE\u5F55\u4E0B\uFF0C\u5E76\u4FDD\u7559 Vault \u91CC\u7684\u76F8\u5BF9\u6587\u4EF6\u5939\u3002").addText(
    (text) => text.setPlaceholder("attachments").setValue(plugin.settings.assetFolder).onChange(async (value) => {
      plugin.settings.assetFolder = value.trim() || "attachments";
      await plugin.persist();
    })
  );
  new import_obsidian2.Setting(container).setName("\u6392\u961F\u670D\u52A1\u5668\u6E32\u67D3").setDesc("\u4FDD\u5B58\u540E\u8BF7\u6C42 Wiki.js \u7528\u5B98\u65B9 Markdown \u7BA1\u9053\u91CD\u6E32\u67D3\u3002\u670D\u52A1\u5668\u6CA1\u6709 Puppeteer \u65F6\u4F1A\u4FDD\u6301\u63D2\u4EF6\u751F\u6210\u7684 HTML\u3002").addToggle(
    (toggle) => toggle.setValue(plugin.settings.queueServerRender).onChange(async (value) => {
      plugin.settings.queueServerRender = value;
      await plugin.persist();
    })
  );
  new import_obsidian2.Setting(container).setName("\u6D4B\u8BD5\u8FDE\u63A5").setDesc("\u9A8C\u8BC1 Token\uFF0C\u5E76\u89E3\u6790\u7AD9\u70B9 ID\u3002").addButton(
    (button) => button.setButtonText("\u6D4B\u8BD5").onClick(async () => {
      button.setDisabled(true);
      try {
        new import_obsidian2.Notice(await plugin.testConnection());
        document.dispatchEvent(new Event(RELOAD_SITES));
      } catch (error) {
        new import_obsidian2.Notice(error instanceof Error ? error.message : String(error));
      } finally {
        button.setDisabled(false);
      }
    })
  );
  container.createEl("h3", { text: "Frontmatter" });
  container.createEl("pre", {
    text: [
      "---",
      "title: Vue \u5B66\u4E60\u7B14\u8BB0",
      "wikiPath: technology/frontend/vue",
      "wikiTitle: Vue 3 \u5B66\u4E60\u7B14\u8BB0",
      "wikiTags:",
      "  - Vue",
      "---"
    ].join("\n")
  });
}
var WikiSyncSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.icon = "settings";
  }
  getControlValue(key) {
    if (!isSettingKey(key)) return void 0;
    return this.plugin.settings[key];
  }
  async setControlValue(key, value) {
    if (!isSettingKey(key)) return;
    assignSetting(this.plugin.settings, key, value);
    await this.plugin.persist();
  }
  getSettingDefinitions() {
    return [
      {
        name: "Wiki.js \u5730\u5740",
        desc: "\u4F8B\u5982 https://book.selflove.top\uFF0C\u4E0D\u8981\u5E26 /_api\u3002",
        control: { type: "text", key: "baseUrl", placeholder: "https://book.selflove.top" }
      },
      {
        name: "\u4E2A\u4EBA\u8BBF\u95EE\u4EE4\u724C",
        desc: "\u5728\u4E2A\u4EBA\u8D44\u6599\u7684 Access Tokens \u91CC\u65B0\u5EFA\uFF0C\u52FE\u9009 pages:write \u548C assets:write\u3002\u4E0D\u8981\u586B\u7BA1\u7406\u540E\u53F0\u7684 API Key\u3002",
        control: { type: "text", key: "apiToken", placeholder: "Bearer token" }
      },
      {
        name: "\u5F53\u524D\u7AD9\u70B9",
        desc: "\u9009\u62E9\u8981\u540C\u6B65\u5230\u7684 Wiki.js \u7AD9\u70B9\u3002",
        render: (setting) => addSiteSetting(setting, this.plugin)
      },
      {
        name: "\u9ED8\u8BA4\u8BED\u8A00",
        desc: "\u7B14\u8BB0\u53EF\u7528 wikiLocale \u8986\u76D6\u3002",
        control: { type: "text", key: "locale", placeholder: "zh" }
      },
      {
        name: "\u9ED8\u8BA4\u53D1\u5E03\u72B6\u6001",
        desc: "\u7B14\u8BB0\u53EF\u7528 wikiPublished \u6216 wikiPublishState \u8986\u76D6\u3002",
        control: {
          type: "dropdown",
          key: "publishState",
          options: { published: "\u53D1\u5E03", draft: "\u8349\u7A3F" }
        }
      },
      {
        name: "\u9644\u4EF6\u76EE\u5F55",
        desc: "\u56FE\u7247\u548C\u9644\u4EF6\u4E0A\u4F20\u5230\u8FD9\u4E2A\u76EE\u5F55\u4E0B\uFF0C\u5E76\u4FDD\u7559 Vault \u91CC\u7684\u76F8\u5BF9\u6587\u4EF6\u5939\u3002",
        control: { type: "text", key: "assetFolder", placeholder: "attachments" }
      },
      {
        name: "\u6392\u961F\u670D\u52A1\u5668\u6E32\u67D3",
        desc: "\u4FDD\u5B58\u540E\u8BF7\u6C42 Wiki.js \u7528\u5B98\u65B9 Markdown \u7BA1\u9053\u91CD\u6E32\u67D3\u3002",
        control: { type: "toggle", key: "queueServerRender" }
      },
      {
        name: "\u6D4B\u8BD5\u8FDE\u63A5",
        desc: "\u9A8C\u8BC1 Token\uFF0C\u5E76\u89E3\u6790\u7AD9\u70B9 ID\u3002",
        render: (setting) => {
          setting.addButton(
            (button) => button.setButtonText("\u6D4B\u8BD5").onClick(async () => {
              button.setDisabled(true);
              try {
                new import_obsidian2.Notice(await this.plugin.testConnection());
                document.dispatchEvent(new Event(RELOAD_SITES));
              } catch (error) {
                new import_obsidian2.Notice(error instanceof Error ? error.message : String(error));
              } finally {
                button.setDisabled(false);
              }
            })
          );
        }
      }
    ];
  }
  display() {
    renderWikiSettings(this.containerEl, this.plugin);
  }
};
function addSiteSetting(setting, plugin) {
  setting.setName("\u5F53\u524D\u7AD9\u70B9").setDesc("\u6253\u5F00\u8BBE\u7F6E\u65F6\u62C9\u53D6\u7AD9\u70B9\u5217\u8868\u3002\u5207\u6362\u540E\uFF0C\u540C\u6B65\u4F1A\u53D1\u5230\u9009\u4E2D\u7684\u7AD9\u70B9\u3002");
  let dropdown;
  let manual;
  let applying = false;
  setting.addDropdown((drop) => {
    dropdown = drop;
    drop.selectEl.addClass("wiki-sync-site-select");
    const current = plugin.settings.siteId;
    drop.addOption(current, current || "\u6B63\u5728\u52A0\u8F7D\u7AD9\u70B9\u2026");
    drop.setValue(current);
    drop.onChange(async (value) => {
      if (applying || !value || value === plugin.settings.siteId) return;
      plugin.settings.siteId = value;
      manual.setValue(value);
      await plugin.persist();
    });
  });
  setting.addText((text) => {
    manual = text;
    text.inputEl.addClass("wiki-sync-hidden");
    text.setPlaceholder("\u7AD9\u70B9 UUID").setValue(plugin.settings.siteId).onChange(async (value) => {
      plugin.settings.siteId = value.trim();
      await plugin.persist();
    });
  });
  let refreshButton;
  setting.addButton((button) => {
    refreshButton = button;
    button.setButtonText("\u5237\u65B0").setTooltip("\u91CD\u65B0\u62C9\u53D6\u7AD9\u70B9\u5217\u8868").onClick(() => {
      void loadSites();
    });
  });
  const abort = new AbortController();
  document.addEventListener(
    RELOAD_SITES,
    () => {
      if (!setting.settingEl.isConnected) {
        abort.abort();
        return;
      }
      void loadSites();
    },
    { signal: abort.signal }
  );
  void loadSites();
  async function loadSites() {
    refreshButton.setDisabled(true);
    if (!plugin.settings.baseUrl.trim() || !plugin.settings.apiToken.trim()) {
      showManual("\u586B\u5199\u5730\u5740\u548C Token \u540E\u70B9\u5237\u65B0\uFF0C\u6216\u76F4\u63A5\u586B\u5199\u7AD9\u70B9 ID\u3002");
      refreshButton.setDisabled(false);
      return;
    }
    try {
      const sites = await new WikiJsClient(plugin.settings.baseUrl, plugin.settings.apiToken).listSites();
      if (!setting.settingEl.isConnected) return;
      if (sites.length === 0) {
        showManual("\u8FD9\u4E2A\u5B9E\u4F8B\u6CA1\u6709\u8FD4\u56DE\u7AD9\u70B9\uFF0C\u8BF7\u624B\u52A8\u586B\u5199\u7AD9\u70B9 ID\u3002");
        return;
      }
      showSites(sites);
    } catch (error) {
      if (!setting.settingEl.isConnected) return;
      showManual(siteListError(error));
    } finally {
      refreshButton.setDisabled(false);
    }
  }
  function showSites(sites) {
    const selected = plugin.settings.siteId.trim();
    const known = new Map(sites.map((site) => [site.id, site]));
    applying = true;
    dropdown.selectEl.replaceChildren();
    if (selected && !known.has(selected)) dropdown.addOption(selected, selected);
    for (const site of sites) dropdown.addOption(site.id, siteLabel(site));
    const next = selected || sites[0].id;
    dropdown.setValue(next);
    dropdown.selectEl.removeClass("wiki-sync-hidden");
    manual.inputEl.addClass("wiki-sync-hidden");
    applying = false;
    const current = known.get(next);
    setting.setDesc(current ? `\u540C\u6B65\u5230 ${siteLabel(current)}\u3002` : "\u9009\u62E9\u8981\u540C\u6B65\u5230\u7684 Wiki.js \u7AD9\u70B9\u3002");
    if (next !== plugin.settings.siteId) {
      plugin.settings.siteId = next;
      void plugin.persist();
    }
  }
  function showManual(message) {
    dropdown.selectEl.addClass("wiki-sync-hidden");
    manual.inputEl.removeClass("wiki-sync-hidden");
    manual.setValue(plugin.settings.siteId);
    setting.setDesc(message);
  }
}
function siteListError(error) {
  if (error instanceof WikiHttpError && (error.status === 401 || error.status === 403)) {
    return "\u5F53\u524D Token \u4E0D\u80FD\u5217\u51FA\u7AD9\u70B9\uFF0C\u9700\u8981 manage:sites\u3001access:admin \u6216 manage:system\u3002\u53EF\u4EE5\u624B\u52A8\u586B\u5199\u7AD9\u70B9 ID\u3002";
  }
  const message = error instanceof Error ? error.message : String(error);
  return `\u62C9\u53D6\u7AD9\u70B9\u5931\u8D25\uFF1A${message}\u3002\u53EF\u4EE5\u624B\u52A8\u586B\u5199\u7AD9\u70B9 ID\u3002`;
}
function isSettingKey(key) {
  return SETTING_KEYS.includes(key);
}
function assignSetting(settings, key, value) {
  switch (key) {
    case "baseUrl":
      settings.baseUrl = String(value ?? "").trim().replace(/\/+$/, "");
      break;
    case "apiToken":
      settings.apiToken = String(value ?? "").trim();
      break;
    case "siteId":
      settings.siteId = String(value ?? "").trim();
      break;
    case "locale":
      settings.locale = String(value ?? "").trim() || "zh";
      break;
    case "publishState":
      settings.publishState = value === "draft" ? "draft" : "published";
      break;
    case "assetFolder":
      settings.assetFolder = String(value ?? "").trim() || "attachments";
      break;
    case "queueServerRender":
      settings.queueServerRender = Boolean(value);
      break;
  }
}

// src/sync/engine.ts
var import_obsidian3 = require("obsidian");

// node_modules/marked/lib/marked.esm.js
function _getDefaults() {
  return {
    async: false,
    breaks: false,
    extensions: null,
    gfm: true,
    hooks: null,
    pedantic: false,
    renderer: null,
    silent: false,
    tokenizer: null,
    walkTokens: null
  };
}
var _defaults = _getDefaults();
function changeDefaults(newDefaults) {
  _defaults = newDefaults;
}
var noopTest = { exec: () => null };
function edit(regex, opt = "") {
  let source = typeof regex === "string" ? regex : regex.source;
  const obj = {
    replace: (name, val) => {
      let valSource = typeof val === "string" ? val : val.source;
      valSource = valSource.replace(other.caret, "$1");
      source = source.replace(name, valSource);
      return obj;
    },
    getRegex: () => {
      return new RegExp(source, opt);
    }
  };
  return obj;
}
var other = {
  codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm,
  outputLinkReplace: /\\([\[\]])/g,
  indentCodeCompensation: /^(\s+)(?:```)/,
  beginningSpace: /^\s+/,
  endingHash: /#$/,
  startingSpaceChar: /^ /,
  endingSpaceChar: / $/,
  nonSpaceChar: /[^ ]/,
  newLineCharGlobal: /\n/g,
  tabCharGlobal: /\t/g,
  multipleSpaceGlobal: /\s+/g,
  blankLine: /^[ \t]*$/,
  doubleBlankLine: /\n[ \t]*\n[ \t]*$/,
  blockquoteStart: /^ {0,3}>/,
  blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g,
  blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm,
  listReplaceTabs: /^\t+/,
  listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g,
  listIsTask: /^\[[ xX]\] /,
  listReplaceTask: /^\[[ xX]\] +/,
  anyLine: /\n.*\n/,
  hrefBrackets: /^<(.*)>$/,
  tableDelimiter: /[:|]/,
  tableAlignChars: /^\||\| *$/g,
  tableRowBlankLine: /\n[ \t]*$/,
  tableAlignRight: /^ *-+: *$/,
  tableAlignCenter: /^ *:-+: *$/,
  tableAlignLeft: /^ *:-+ *$/,
  startATag: /^<a /i,
  endATag: /^<\/a>/i,
  startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i,
  endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i,
  startAngleBracket: /^</,
  endAngleBracket: />$/,
  pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/,
  unicodeAlphaNumeric: /[\p{L}\p{N}]/u,
  escapeTest: /[&<>"']/,
  escapeReplace: /[&<>"']/g,
  escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,
  escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,
  unescapeTest: /&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,
  caret: /(^|[^\[])\^/g,
  percentDecode: /%25/g,
  findPipe: /\|/g,
  splitPipe: / \|/,
  slashPipe: /\\\|/g,
  carriageReturn: /\r\n|\r/g,
  spaceLine: /^ +$/gm,
  notSpaceStart: /^\S*/,
  endingNewline: /\n$/,
  listItemRegex: (bull) => new RegExp(`^( {0,3}${bull})((?:[	 ][^\\n]*)?(?:\\n|$))`),
  nextBulletRegex: (indent) => new RegExp(`^ {0,${Math.min(3, indent - 1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),
  hrRegex: (indent) => new RegExp(`^ {0,${Math.min(3, indent - 1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),
  fencesBeginRegex: (indent) => new RegExp(`^ {0,${Math.min(3, indent - 1)}}(?:\`\`\`|~~~)`),
  headingBeginRegex: (indent) => new RegExp(`^ {0,${Math.min(3, indent - 1)}}#`),
  htmlBeginRegex: (indent) => new RegExp(`^ {0,${Math.min(3, indent - 1)}}<(?:[a-z].*>|!--)`, "i")
};
var newline = /^(?:[ \t]*(?:\n|$))+/;
var blockCode = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
var fences = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
var hr = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
var heading = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
var bullet = /(?:[*+-]|\d{1,9}[.)])/;
var lheadingCore = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/;
var lheading = edit(lheadingCore).replace(/bull/g, bullet).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex();
var lheadingGfm = edit(lheadingCore).replace(/bull/g, bullet).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex();
var _paragraph = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/;
var blockText = /^[^\n]+/;
var _blockLabel = /(?!\s*\])(?:\\.|[^\[\]\\])+/;
var def = edit(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", _blockLabel).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
var list = edit(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, bullet).getRegex();
var _tag = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
var _comment = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
var html = edit(
  "^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))",
  "i"
).replace("comment", _comment).replace("tag", _tag).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
var paragraph = edit(_paragraph).replace("hr", hr).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", _tag).getRegex();
var blockquote = edit(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", paragraph).getRegex();
var blockNormal = {
  blockquote,
  code: blockCode,
  def,
  fences,
  heading,
  hr,
  html,
  lheading,
  list,
  newline,
  paragraph,
  table: noopTest,
  text: blockText
};
var gfmTable = edit(
  "^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)"
).replace("hr", hr).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", _tag).getRegex();
var blockGfm = {
  ...blockNormal,
  lheading: lheadingGfm,
  table: gfmTable,
  paragraph: edit(_paragraph).replace("hr", hr).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", gfmTable).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", _tag).getRegex()
};
var blockPedantic = {
  ...blockNormal,
  html: edit(
    `^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`
  ).replace("comment", _comment).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),
  def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,
  heading: /^(#{1,6})(.*)(?:\n+|$)/,
  fences: noopTest,
  // fences not supported
  lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,
  paragraph: edit(_paragraph).replace("hr", hr).replace("heading", " *#{1,6} *[^\n]").replace("lheading", lheading).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex()
};
var escape = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
var inlineCode = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
var br = /^( {2,}|\\)\n(?!\s*$)/;
var inlineText = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
var _punctuation = /[\p{P}\p{S}]/u;
var _punctuationOrSpace = /[\s\p{P}\p{S}]/u;
var _notPunctuationOrSpace = /[^\s\p{P}\p{S}]/u;
var punctuation = edit(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, _punctuationOrSpace).getRegex();
var _punctuationGfmStrongEm = /(?!~)[\p{P}\p{S}]/u;
var _punctuationOrSpaceGfmStrongEm = /(?!~)[\s\p{P}\p{S}]/u;
var _notPunctuationOrSpaceGfmStrongEm = /(?:[^\s\p{P}\p{S}]|~)/u;
var blockSkip = /\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g;
var emStrongLDelimCore = /^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/;
var emStrongLDelim = edit(emStrongLDelimCore, "u").replace(/punct/g, _punctuation).getRegex();
var emStrongLDelimGfm = edit(emStrongLDelimCore, "u").replace(/punct/g, _punctuationGfmStrongEm).getRegex();
var emStrongRDelimAstCore = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)";
var emStrongRDelimAst = edit(emStrongRDelimAstCore, "gu").replace(/notPunctSpace/g, _notPunctuationOrSpace).replace(/punctSpace/g, _punctuationOrSpace).replace(/punct/g, _punctuation).getRegex();
var emStrongRDelimAstGfm = edit(emStrongRDelimAstCore, "gu").replace(/notPunctSpace/g, _notPunctuationOrSpaceGfmStrongEm).replace(/punctSpace/g, _punctuationOrSpaceGfmStrongEm).replace(/punct/g, _punctuationGfmStrongEm).getRegex();
var emStrongRDelimUnd = edit(
  "^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)",
  "gu"
).replace(/notPunctSpace/g, _notPunctuationOrSpace).replace(/punctSpace/g, _punctuationOrSpace).replace(/punct/g, _punctuation).getRegex();
var anyPunctuation = edit(/\\(punct)/, "gu").replace(/punct/g, _punctuation).getRegex();
var autolink = edit(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
var _inlineComment = edit(_comment).replace("(?:-->|$)", "-->").getRegex();
var tag = edit(
  "^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>"
).replace("comment", _inlineComment).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
var _inlineLabel = /(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/;
var link = edit(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label", _inlineLabel).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
var reflink = edit(/^!?\[(label)\]\[(ref)\]/).replace("label", _inlineLabel).replace("ref", _blockLabel).getRegex();
var nolink = edit(/^!?\[(ref)\](?:\[\])?/).replace("ref", _blockLabel).getRegex();
var reflinkSearch = edit("reflink|nolink(?!\\()", "g").replace("reflink", reflink).replace("nolink", nolink).getRegex();
var inlineNormal = {
  _backpedal: noopTest,
  // only used for GFM url
  anyPunctuation,
  autolink,
  blockSkip,
  br,
  code: inlineCode,
  del: noopTest,
  emStrongLDelim,
  emStrongRDelimAst,
  emStrongRDelimUnd,
  escape,
  link,
  nolink,
  punctuation,
  reflink,
  reflinkSearch,
  tag,
  text: inlineText,
  url: noopTest
};
var inlinePedantic = {
  ...inlineNormal,
  link: edit(/^!?\[(label)\]\((.*?)\)/).replace("label", _inlineLabel).getRegex(),
  reflink: edit(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", _inlineLabel).getRegex()
};
var inlineGfm = {
  ...inlineNormal,
  emStrongRDelimAst: emStrongRDelimAstGfm,
  emStrongLDelim: emStrongLDelimGfm,
  url: edit(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/, "i").replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),
  _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,
  del: /^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,
  text: /^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/
};
var inlineBreaks = {
  ...inlineGfm,
  br: edit(br).replace("{2,}", "*").getRegex(),
  text: edit(inlineGfm.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex()
};
var block = {
  normal: blockNormal,
  gfm: blockGfm,
  pedantic: blockPedantic
};
var inline = {
  normal: inlineNormal,
  gfm: inlineGfm,
  breaks: inlineBreaks,
  pedantic: inlinePedantic
};
var escapeReplacements = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};
var getEscapeReplacement = (ch) => escapeReplacements[ch];
function escape2(html2, encode) {
  if (encode) {
    if (other.escapeTest.test(html2)) {
      return html2.replace(other.escapeReplace, getEscapeReplacement);
    }
  } else {
    if (other.escapeTestNoEncode.test(html2)) {
      return html2.replace(other.escapeReplaceNoEncode, getEscapeReplacement);
    }
  }
  return html2;
}
function cleanUrl(href) {
  try {
    href = encodeURI(href).replace(other.percentDecode, "%");
  } catch {
    return null;
  }
  return href;
}
function splitCells(tableRow, count) {
  const row = tableRow.replace(other.findPipe, (match, offset, str) => {
    let escaped = false;
    let curr = offset;
    while (--curr >= 0 && str[curr] === "\\") escaped = !escaped;
    if (escaped) {
      return "|";
    } else {
      return " |";
    }
  }), cells = row.split(other.splitPipe);
  let i = 0;
  if (!cells[0].trim()) {
    cells.shift();
  }
  if (cells.length > 0 && !cells.at(-1)?.trim()) {
    cells.pop();
  }
  if (count) {
    if (cells.length > count) {
      cells.splice(count);
    } else {
      while (cells.length < count) cells.push("");
    }
  }
  for (; i < cells.length; i++) {
    cells[i] = cells[i].trim().replace(other.slashPipe, "|");
  }
  return cells;
}
function rtrim(str, c, invert) {
  const l = str.length;
  if (l === 0) {
    return "";
  }
  let suffLen = 0;
  while (suffLen < l) {
    const currChar = str.charAt(l - suffLen - 1);
    if (currChar === c && !invert) {
      suffLen++;
    } else if (currChar !== c && invert) {
      suffLen++;
    } else {
      break;
    }
  }
  return str.slice(0, l - suffLen);
}
function findClosingBracket(str, b) {
  if (str.indexOf(b[1]) === -1) {
    return -1;
  }
  let level = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "\\") {
      i++;
    } else if (str[i] === b[0]) {
      level++;
    } else if (str[i] === b[1]) {
      level--;
      if (level < 0) {
        return i;
      }
    }
  }
  if (level > 0) {
    return -2;
  }
  return -1;
}
function outputLink(cap, link2, raw, lexer2, rules) {
  const href = link2.href;
  const title = link2.title || null;
  const text = cap[1].replace(rules.other.outputLinkReplace, "$1");
  lexer2.state.inLink = true;
  const token = {
    type: cap[0].charAt(0) === "!" ? "image" : "link",
    raw,
    href,
    title,
    text,
    tokens: lexer2.inlineTokens(text)
  };
  lexer2.state.inLink = false;
  return token;
}
function indentCodeCompensation(raw, text, rules) {
  const matchIndentToCode = raw.match(rules.other.indentCodeCompensation);
  if (matchIndentToCode === null) {
    return text;
  }
  const indentToCode = matchIndentToCode[1];
  return text.split("\n").map((node) => {
    const matchIndentInNode = node.match(rules.other.beginningSpace);
    if (matchIndentInNode === null) {
      return node;
    }
    const [indentInNode] = matchIndentInNode;
    if (indentInNode.length >= indentToCode.length) {
      return node.slice(indentToCode.length);
    }
    return node;
  }).join("\n");
}
var _Tokenizer = class {
  // set by the lexer
  constructor(options2) {
    __publicField(this, "options");
    __publicField(this, "rules");
    // set by the lexer
    __publicField(this, "lexer");
    this.options = options2 || _defaults;
  }
  space(src) {
    const cap = this.rules.block.newline.exec(src);
    if (cap && cap[0].length > 0) {
      return {
        type: "space",
        raw: cap[0]
      };
    }
  }
  code(src) {
    const cap = this.rules.block.code.exec(src);
    if (cap) {
      const text = cap[0].replace(this.rules.other.codeRemoveIndent, "");
      return {
        type: "code",
        raw: cap[0],
        codeBlockStyle: "indented",
        text: !this.options.pedantic ? rtrim(text, "\n") : text
      };
    }
  }
  fences(src) {
    const cap = this.rules.block.fences.exec(src);
    if (cap) {
      const raw = cap[0];
      const text = indentCodeCompensation(raw, cap[3] || "", this.rules);
      return {
        type: "code",
        raw,
        lang: cap[2] ? cap[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : cap[2],
        text
      };
    }
  }
  heading(src) {
    const cap = this.rules.block.heading.exec(src);
    if (cap) {
      let text = cap[2].trim();
      if (this.rules.other.endingHash.test(text)) {
        const trimmed = rtrim(text, "#");
        if (this.options.pedantic) {
          text = trimmed.trim();
        } else if (!trimmed || this.rules.other.endingSpaceChar.test(trimmed)) {
          text = trimmed.trim();
        }
      }
      return {
        type: "heading",
        raw: cap[0],
        depth: cap[1].length,
        text,
        tokens: this.lexer.inline(text)
      };
    }
  }
  hr(src) {
    const cap = this.rules.block.hr.exec(src);
    if (cap) {
      return {
        type: "hr",
        raw: rtrim(cap[0], "\n")
      };
    }
  }
  blockquote(src) {
    const cap = this.rules.block.blockquote.exec(src);
    if (cap) {
      let lines = rtrim(cap[0], "\n").split("\n");
      let raw = "";
      let text = "";
      const tokens = [];
      while (lines.length > 0) {
        let inBlockquote = false;
        const currentLines = [];
        let i;
        for (i = 0; i < lines.length; i++) {
          if (this.rules.other.blockquoteStart.test(lines[i])) {
            currentLines.push(lines[i]);
            inBlockquote = true;
          } else if (!inBlockquote) {
            currentLines.push(lines[i]);
          } else {
            break;
          }
        }
        lines = lines.slice(i);
        const currentRaw = currentLines.join("\n");
        const currentText = currentRaw.replace(this.rules.other.blockquoteSetextReplace, "\n    $1").replace(this.rules.other.blockquoteSetextReplace2, "");
        raw = raw ? `${raw}
${currentRaw}` : currentRaw;
        text = text ? `${text}
${currentText}` : currentText;
        const top = this.lexer.state.top;
        this.lexer.state.top = true;
        this.lexer.blockTokens(currentText, tokens, true);
        this.lexer.state.top = top;
        if (lines.length === 0) {
          break;
        }
        const lastToken = tokens.at(-1);
        if (lastToken?.type === "code") {
          break;
        } else if (lastToken?.type === "blockquote") {
          const oldToken = lastToken;
          const newText = oldToken.raw + "\n" + lines.join("\n");
          const newToken = this.blockquote(newText);
          tokens[tokens.length - 1] = newToken;
          raw = raw.substring(0, raw.length - oldToken.raw.length) + newToken.raw;
          text = text.substring(0, text.length - oldToken.text.length) + newToken.text;
          break;
        } else if (lastToken?.type === "list") {
          const oldToken = lastToken;
          const newText = oldToken.raw + "\n" + lines.join("\n");
          const newToken = this.list(newText);
          tokens[tokens.length - 1] = newToken;
          raw = raw.substring(0, raw.length - lastToken.raw.length) + newToken.raw;
          text = text.substring(0, text.length - oldToken.raw.length) + newToken.raw;
          lines = newText.substring(tokens.at(-1).raw.length).split("\n");
          continue;
        }
      }
      return {
        type: "blockquote",
        raw,
        tokens,
        text
      };
    }
  }
  list(src) {
    let cap = this.rules.block.list.exec(src);
    if (cap) {
      let bull = cap[1].trim();
      const isordered = bull.length > 1;
      const list2 = {
        type: "list",
        raw: "",
        ordered: isordered,
        start: isordered ? +bull.slice(0, -1) : "",
        loose: false,
        items: []
      };
      bull = isordered ? `\\d{1,9}\\${bull.slice(-1)}` : `\\${bull}`;
      if (this.options.pedantic) {
        bull = isordered ? bull : "[*+-]";
      }
      const itemRegex = this.rules.other.listItemRegex(bull);
      let endsWithBlankLine = false;
      while (src) {
        let endEarly = false;
        let raw = "";
        let itemContents = "";
        if (!(cap = itemRegex.exec(src))) {
          break;
        }
        if (this.rules.block.hr.test(src)) {
          break;
        }
        raw = cap[0];
        src = src.substring(raw.length);
        let line = cap[2].split("\n", 1)[0].replace(this.rules.other.listReplaceTabs, (t) => " ".repeat(3 * t.length));
        let nextLine = src.split("\n", 1)[0];
        let blankLine = !line.trim();
        let indent = 0;
        if (this.options.pedantic) {
          indent = 2;
          itemContents = line.trimStart();
        } else if (blankLine) {
          indent = cap[1].length + 1;
        } else {
          indent = cap[2].search(this.rules.other.nonSpaceChar);
          indent = indent > 4 ? 1 : indent;
          itemContents = line.slice(indent);
          indent += cap[1].length;
        }
        if (blankLine && this.rules.other.blankLine.test(nextLine)) {
          raw += nextLine + "\n";
          src = src.substring(nextLine.length + 1);
          endEarly = true;
        }
        if (!endEarly) {
          const nextBulletRegex = this.rules.other.nextBulletRegex(indent);
          const hrRegex = this.rules.other.hrRegex(indent);
          const fencesBeginRegex = this.rules.other.fencesBeginRegex(indent);
          const headingBeginRegex = this.rules.other.headingBeginRegex(indent);
          const htmlBeginRegex = this.rules.other.htmlBeginRegex(indent);
          while (src) {
            const rawLine = src.split("\n", 1)[0];
            let nextLineWithoutTabs;
            nextLine = rawLine;
            if (this.options.pedantic) {
              nextLine = nextLine.replace(this.rules.other.listReplaceNesting, "  ");
              nextLineWithoutTabs = nextLine;
            } else {
              nextLineWithoutTabs = nextLine.replace(this.rules.other.tabCharGlobal, "    ");
            }
            if (fencesBeginRegex.test(nextLine)) {
              break;
            }
            if (headingBeginRegex.test(nextLine)) {
              break;
            }
            if (htmlBeginRegex.test(nextLine)) {
              break;
            }
            if (nextBulletRegex.test(nextLine)) {
              break;
            }
            if (hrRegex.test(nextLine)) {
              break;
            }
            if (nextLineWithoutTabs.search(this.rules.other.nonSpaceChar) >= indent || !nextLine.trim()) {
              itemContents += "\n" + nextLineWithoutTabs.slice(indent);
            } else {
              if (blankLine) {
                break;
              }
              if (line.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4) {
                break;
              }
              if (fencesBeginRegex.test(line)) {
                break;
              }
              if (headingBeginRegex.test(line)) {
                break;
              }
              if (hrRegex.test(line)) {
                break;
              }
              itemContents += "\n" + nextLine;
            }
            if (!blankLine && !nextLine.trim()) {
              blankLine = true;
            }
            raw += rawLine + "\n";
            src = src.substring(rawLine.length + 1);
            line = nextLineWithoutTabs.slice(indent);
          }
        }
        if (!list2.loose) {
          if (endsWithBlankLine) {
            list2.loose = true;
          } else if (this.rules.other.doubleBlankLine.test(raw)) {
            endsWithBlankLine = true;
          }
        }
        let istask = null;
        let ischecked;
        if (this.options.gfm) {
          istask = this.rules.other.listIsTask.exec(itemContents);
          if (istask) {
            ischecked = istask[0] !== "[ ] ";
            itemContents = itemContents.replace(this.rules.other.listReplaceTask, "");
          }
        }
        list2.items.push({
          type: "list_item",
          raw,
          task: !!istask,
          checked: ischecked,
          loose: false,
          text: itemContents,
          tokens: []
        });
        list2.raw += raw;
      }
      const lastItem = list2.items.at(-1);
      if (lastItem) {
        lastItem.raw = lastItem.raw.trimEnd();
        lastItem.text = lastItem.text.trimEnd();
      } else {
        return;
      }
      list2.raw = list2.raw.trimEnd();
      for (let i = 0; i < list2.items.length; i++) {
        this.lexer.state.top = false;
        list2.items[i].tokens = this.lexer.blockTokens(list2.items[i].text, []);
        if (!list2.loose) {
          const spacers = list2.items[i].tokens.filter((t) => t.type === "space");
          const hasMultipleLineBreaks = spacers.length > 0 && spacers.some((t) => this.rules.other.anyLine.test(t.raw));
          list2.loose = hasMultipleLineBreaks;
        }
      }
      if (list2.loose) {
        for (let i = 0; i < list2.items.length; i++) {
          list2.items[i].loose = true;
        }
      }
      return list2;
    }
  }
  html(src) {
    const cap = this.rules.block.html.exec(src);
    if (cap) {
      const token = {
        type: "html",
        block: true,
        raw: cap[0],
        pre: cap[1] === "pre" || cap[1] === "script" || cap[1] === "style",
        text: cap[0]
      };
      return token;
    }
  }
  def(src) {
    const cap = this.rules.block.def.exec(src);
    if (cap) {
      const tag2 = cap[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " ");
      const href = cap[2] ? cap[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "";
      const title = cap[3] ? cap[3].substring(1, cap[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : cap[3];
      return {
        type: "def",
        tag: tag2,
        raw: cap[0],
        href,
        title
      };
    }
  }
  table(src) {
    const cap = this.rules.block.table.exec(src);
    if (!cap) {
      return;
    }
    if (!this.rules.other.tableDelimiter.test(cap[2])) {
      return;
    }
    const headers = splitCells(cap[1]);
    const aligns = cap[2].replace(this.rules.other.tableAlignChars, "").split("|");
    const rows = cap[3]?.trim() ? cap[3].replace(this.rules.other.tableRowBlankLine, "").split("\n") : [];
    const item = {
      type: "table",
      raw: cap[0],
      header: [],
      align: [],
      rows: []
    };
    if (headers.length !== aligns.length) {
      return;
    }
    for (const align of aligns) {
      if (this.rules.other.tableAlignRight.test(align)) {
        item.align.push("right");
      } else if (this.rules.other.tableAlignCenter.test(align)) {
        item.align.push("center");
      } else if (this.rules.other.tableAlignLeft.test(align)) {
        item.align.push("left");
      } else {
        item.align.push(null);
      }
    }
    for (let i = 0; i < headers.length; i++) {
      item.header.push({
        text: headers[i],
        tokens: this.lexer.inline(headers[i]),
        header: true,
        align: item.align[i]
      });
    }
    for (const row of rows) {
      item.rows.push(splitCells(row, item.header.length).map((cell, i) => {
        return {
          text: cell,
          tokens: this.lexer.inline(cell),
          header: false,
          align: item.align[i]
        };
      }));
    }
    return item;
  }
  lheading(src) {
    const cap = this.rules.block.lheading.exec(src);
    if (cap) {
      return {
        type: "heading",
        raw: cap[0],
        depth: cap[2].charAt(0) === "=" ? 1 : 2,
        text: cap[1],
        tokens: this.lexer.inline(cap[1])
      };
    }
  }
  paragraph(src) {
    const cap = this.rules.block.paragraph.exec(src);
    if (cap) {
      const text = cap[1].charAt(cap[1].length - 1) === "\n" ? cap[1].slice(0, -1) : cap[1];
      return {
        type: "paragraph",
        raw: cap[0],
        text,
        tokens: this.lexer.inline(text)
      };
    }
  }
  text(src) {
    const cap = this.rules.block.text.exec(src);
    if (cap) {
      return {
        type: "text",
        raw: cap[0],
        text: cap[0],
        tokens: this.lexer.inline(cap[0])
      };
    }
  }
  escape(src) {
    const cap = this.rules.inline.escape.exec(src);
    if (cap) {
      return {
        type: "escape",
        raw: cap[0],
        text: cap[1]
      };
    }
  }
  tag(src) {
    const cap = this.rules.inline.tag.exec(src);
    if (cap) {
      if (!this.lexer.state.inLink && this.rules.other.startATag.test(cap[0])) {
        this.lexer.state.inLink = true;
      } else if (this.lexer.state.inLink && this.rules.other.endATag.test(cap[0])) {
        this.lexer.state.inLink = false;
      }
      if (!this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(cap[0])) {
        this.lexer.state.inRawBlock = true;
      } else if (this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(cap[0])) {
        this.lexer.state.inRawBlock = false;
      }
      return {
        type: "html",
        raw: cap[0],
        inLink: this.lexer.state.inLink,
        inRawBlock: this.lexer.state.inRawBlock,
        block: false,
        text: cap[0]
      };
    }
  }
  link(src) {
    const cap = this.rules.inline.link.exec(src);
    if (cap) {
      const trimmedUrl = cap[2].trim();
      if (!this.options.pedantic && this.rules.other.startAngleBracket.test(trimmedUrl)) {
        if (!this.rules.other.endAngleBracket.test(trimmedUrl)) {
          return;
        }
        const rtrimSlash = rtrim(trimmedUrl.slice(0, -1), "\\");
        if ((trimmedUrl.length - rtrimSlash.length) % 2 === 0) {
          return;
        }
      } else {
        const lastParenIndex = findClosingBracket(cap[2], "()");
        if (lastParenIndex === -2) {
          return;
        }
        if (lastParenIndex > -1) {
          const start = cap[0].indexOf("!") === 0 ? 5 : 4;
          const linkLen = start + cap[1].length + lastParenIndex;
          cap[2] = cap[2].substring(0, lastParenIndex);
          cap[0] = cap[0].substring(0, linkLen).trim();
          cap[3] = "";
        }
      }
      let href = cap[2];
      let title = "";
      if (this.options.pedantic) {
        const link2 = this.rules.other.pedanticHrefTitle.exec(href);
        if (link2) {
          href = link2[1];
          title = link2[3];
        }
      } else {
        title = cap[3] ? cap[3].slice(1, -1) : "";
      }
      href = href.trim();
      if (this.rules.other.startAngleBracket.test(href)) {
        if (this.options.pedantic && !this.rules.other.endAngleBracket.test(trimmedUrl)) {
          href = href.slice(1);
        } else {
          href = href.slice(1, -1);
        }
      }
      return outputLink(cap, {
        href: href ? href.replace(this.rules.inline.anyPunctuation, "$1") : href,
        title: title ? title.replace(this.rules.inline.anyPunctuation, "$1") : title
      }, cap[0], this.lexer, this.rules);
    }
  }
  reflink(src, links) {
    let cap;
    if ((cap = this.rules.inline.reflink.exec(src)) || (cap = this.rules.inline.nolink.exec(src))) {
      const linkString = (cap[2] || cap[1]).replace(this.rules.other.multipleSpaceGlobal, " ");
      const link2 = links[linkString.toLowerCase()];
      if (!link2) {
        const text = cap[0].charAt(0);
        return {
          type: "text",
          raw: text,
          text
        };
      }
      return outputLink(cap, link2, cap[0], this.lexer, this.rules);
    }
  }
  emStrong(src, maskedSrc, prevChar = "") {
    let match = this.rules.inline.emStrongLDelim.exec(src);
    if (!match) return;
    if (match[3] && prevChar.match(this.rules.other.unicodeAlphaNumeric)) return;
    const nextChar = match[1] || match[2] || "";
    if (!nextChar || !prevChar || this.rules.inline.punctuation.exec(prevChar)) {
      const lLength = [...match[0]].length - 1;
      let rDelim, rLength, delimTotal = lLength, midDelimTotal = 0;
      const endReg = match[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
      endReg.lastIndex = 0;
      maskedSrc = maskedSrc.slice(-1 * src.length + lLength);
      while ((match = endReg.exec(maskedSrc)) != null) {
        rDelim = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
        if (!rDelim) continue;
        rLength = [...rDelim].length;
        if (match[3] || match[4]) {
          delimTotal += rLength;
          continue;
        } else if (match[5] || match[6]) {
          if (lLength % 3 && !((lLength + rLength) % 3)) {
            midDelimTotal += rLength;
            continue;
          }
        }
        delimTotal -= rLength;
        if (delimTotal > 0) continue;
        rLength = Math.min(rLength, rLength + delimTotal + midDelimTotal);
        const lastCharLength = [...match[0]][0].length;
        const raw = src.slice(0, lLength + match.index + lastCharLength + rLength);
        if (Math.min(lLength, rLength) % 2) {
          const text2 = raw.slice(1, -1);
          return {
            type: "em",
            raw,
            text: text2,
            tokens: this.lexer.inlineTokens(text2)
          };
        }
        const text = raw.slice(2, -2);
        return {
          type: "strong",
          raw,
          text,
          tokens: this.lexer.inlineTokens(text)
        };
      }
    }
  }
  codespan(src) {
    const cap = this.rules.inline.code.exec(src);
    if (cap) {
      let text = cap[2].replace(this.rules.other.newLineCharGlobal, " ");
      const hasNonSpaceChars = this.rules.other.nonSpaceChar.test(text);
      const hasSpaceCharsOnBothEnds = this.rules.other.startingSpaceChar.test(text) && this.rules.other.endingSpaceChar.test(text);
      if (hasNonSpaceChars && hasSpaceCharsOnBothEnds) {
        text = text.substring(1, text.length - 1);
      }
      return {
        type: "codespan",
        raw: cap[0],
        text
      };
    }
  }
  br(src) {
    const cap = this.rules.inline.br.exec(src);
    if (cap) {
      return {
        type: "br",
        raw: cap[0]
      };
    }
  }
  del(src) {
    const cap = this.rules.inline.del.exec(src);
    if (cap) {
      return {
        type: "del",
        raw: cap[0],
        text: cap[2],
        tokens: this.lexer.inlineTokens(cap[2])
      };
    }
  }
  autolink(src) {
    const cap = this.rules.inline.autolink.exec(src);
    if (cap) {
      let text, href;
      if (cap[2] === "@") {
        text = cap[1];
        href = "mailto:" + text;
      } else {
        text = cap[1];
        href = text;
      }
      return {
        type: "link",
        raw: cap[0],
        text,
        href,
        tokens: [
          {
            type: "text",
            raw: text,
            text
          }
        ]
      };
    }
  }
  url(src) {
    let cap;
    if (cap = this.rules.inline.url.exec(src)) {
      let text, href;
      if (cap[2] === "@") {
        text = cap[0];
        href = "mailto:" + text;
      } else {
        let prevCapZero;
        do {
          prevCapZero = cap[0];
          cap[0] = this.rules.inline._backpedal.exec(cap[0])?.[0] ?? "";
        } while (prevCapZero !== cap[0]);
        text = cap[0];
        if (cap[1] === "www.") {
          href = "http://" + cap[0];
        } else {
          href = cap[0];
        }
      }
      return {
        type: "link",
        raw: cap[0],
        text,
        href,
        tokens: [
          {
            type: "text",
            raw: text,
            text
          }
        ]
      };
    }
  }
  inlineText(src) {
    const cap = this.rules.inline.text.exec(src);
    if (cap) {
      const escaped = this.lexer.state.inRawBlock;
      return {
        type: "text",
        raw: cap[0],
        text: cap[0],
        escaped
      };
    }
  }
};
var _Lexer = class __Lexer {
  constructor(options2) {
    __publicField(this, "tokens");
    __publicField(this, "options");
    __publicField(this, "state");
    __publicField(this, "tokenizer");
    __publicField(this, "inlineQueue");
    this.tokens = [];
    this.tokens.links = /* @__PURE__ */ Object.create(null);
    this.options = options2 || _defaults;
    this.options.tokenizer = this.options.tokenizer || new _Tokenizer();
    this.tokenizer = this.options.tokenizer;
    this.tokenizer.options = this.options;
    this.tokenizer.lexer = this;
    this.inlineQueue = [];
    this.state = {
      inLink: false,
      inRawBlock: false,
      top: true
    };
    const rules = {
      other,
      block: block.normal,
      inline: inline.normal
    };
    if (this.options.pedantic) {
      rules.block = block.pedantic;
      rules.inline = inline.pedantic;
    } else if (this.options.gfm) {
      rules.block = block.gfm;
      if (this.options.breaks) {
        rules.inline = inline.breaks;
      } else {
        rules.inline = inline.gfm;
      }
    }
    this.tokenizer.rules = rules;
  }
  /**
   * Expose Rules
   */
  static get rules() {
    return {
      block,
      inline
    };
  }
  /**
   * Static Lex Method
   */
  static lex(src, options2) {
    const lexer2 = new __Lexer(options2);
    return lexer2.lex(src);
  }
  /**
   * Static Lex Inline Method
   */
  static lexInline(src, options2) {
    const lexer2 = new __Lexer(options2);
    return lexer2.inlineTokens(src);
  }
  /**
   * Preprocessing
   */
  lex(src) {
    src = src.replace(other.carriageReturn, "\n");
    this.blockTokens(src, this.tokens);
    for (let i = 0; i < this.inlineQueue.length; i++) {
      const next = this.inlineQueue[i];
      this.inlineTokens(next.src, next.tokens);
    }
    this.inlineQueue = [];
    return this.tokens;
  }
  blockTokens(src, tokens = [], lastParagraphClipped = false) {
    if (this.options.pedantic) {
      src = src.replace(other.tabCharGlobal, "    ").replace(other.spaceLine, "");
    }
    while (src) {
      let token;
      if (this.options.extensions?.block?.some((extTokenizer) => {
        if (token = extTokenizer.call({ lexer: this }, src, tokens)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          return true;
        }
        return false;
      })) {
        continue;
      }
      if (token = this.tokenizer.space(src)) {
        src = src.substring(token.raw.length);
        const lastToken = tokens.at(-1);
        if (token.raw.length === 1 && lastToken !== void 0) {
          lastToken.raw += "\n";
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (token = this.tokenizer.code(src)) {
        src = src.substring(token.raw.length);
        const lastToken = tokens.at(-1);
        if (lastToken?.type === "paragraph" || lastToken?.type === "text") {
          lastToken.raw += "\n" + token.raw;
          lastToken.text += "\n" + token.text;
          this.inlineQueue.at(-1).src = lastToken.text;
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (token = this.tokenizer.fences(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.heading(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.hr(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.blockquote(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.list(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.html(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.def(src)) {
        src = src.substring(token.raw.length);
        const lastToken = tokens.at(-1);
        if (lastToken?.type === "paragraph" || lastToken?.type === "text") {
          lastToken.raw += "\n" + token.raw;
          lastToken.text += "\n" + token.raw;
          this.inlineQueue.at(-1).src = lastToken.text;
        } else if (!this.tokens.links[token.tag]) {
          this.tokens.links[token.tag] = {
            href: token.href,
            title: token.title
          };
        }
        continue;
      }
      if (token = this.tokenizer.table(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.lheading(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      let cutSrc = src;
      if (this.options.extensions?.startBlock) {
        let startIndex = Infinity;
        const tempSrc = src.slice(1);
        let tempStart;
        this.options.extensions.startBlock.forEach((getStartIndex) => {
          tempStart = getStartIndex.call({ lexer: this }, tempSrc);
          if (typeof tempStart === "number" && tempStart >= 0) {
            startIndex = Math.min(startIndex, tempStart);
          }
        });
        if (startIndex < Infinity && startIndex >= 0) {
          cutSrc = src.substring(0, startIndex + 1);
        }
      }
      if (this.state.top && (token = this.tokenizer.paragraph(cutSrc))) {
        const lastToken = tokens.at(-1);
        if (lastParagraphClipped && lastToken?.type === "paragraph") {
          lastToken.raw += "\n" + token.raw;
          lastToken.text += "\n" + token.text;
          this.inlineQueue.pop();
          this.inlineQueue.at(-1).src = lastToken.text;
        } else {
          tokens.push(token);
        }
        lastParagraphClipped = cutSrc.length !== src.length;
        src = src.substring(token.raw.length);
        continue;
      }
      if (token = this.tokenizer.text(src)) {
        src = src.substring(token.raw.length);
        const lastToken = tokens.at(-1);
        if (lastToken?.type === "text") {
          lastToken.raw += "\n" + token.raw;
          lastToken.text += "\n" + token.text;
          this.inlineQueue.pop();
          this.inlineQueue.at(-1).src = lastToken.text;
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (src) {
        const errMsg = "Infinite loop on byte: " + src.charCodeAt(0);
        if (this.options.silent) {
          console.error(errMsg);
          break;
        } else {
          throw new Error(errMsg);
        }
      }
    }
    this.state.top = true;
    return tokens;
  }
  inline(src, tokens = []) {
    this.inlineQueue.push({ src, tokens });
    return tokens;
  }
  /**
   * Lexing/Compiling
   */
  inlineTokens(src, tokens = []) {
    let maskedSrc = src;
    let match = null;
    if (this.tokens.links) {
      const links = Object.keys(this.tokens.links);
      if (links.length > 0) {
        while ((match = this.tokenizer.rules.inline.reflinkSearch.exec(maskedSrc)) != null) {
          if (links.includes(match[0].slice(match[0].lastIndexOf("[") + 1, -1))) {
            maskedSrc = maskedSrc.slice(0, match.index) + "[" + "a".repeat(match[0].length - 2) + "]" + maskedSrc.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex);
          }
        }
      }
    }
    while ((match = this.tokenizer.rules.inline.anyPunctuation.exec(maskedSrc)) != null) {
      maskedSrc = maskedSrc.slice(0, match.index) + "++" + maskedSrc.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
    }
    while ((match = this.tokenizer.rules.inline.blockSkip.exec(maskedSrc)) != null) {
      maskedSrc = maskedSrc.slice(0, match.index) + "[" + "a".repeat(match[0].length - 2) + "]" + maskedSrc.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
    }
    let keepPrevChar = false;
    let prevChar = "";
    while (src) {
      if (!keepPrevChar) {
        prevChar = "";
      }
      keepPrevChar = false;
      let token;
      if (this.options.extensions?.inline?.some((extTokenizer) => {
        if (token = extTokenizer.call({ lexer: this }, src, tokens)) {
          src = src.substring(token.raw.length);
          tokens.push(token);
          return true;
        }
        return false;
      })) {
        continue;
      }
      if (token = this.tokenizer.escape(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.tag(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.link(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.reflink(src, this.tokens.links)) {
        src = src.substring(token.raw.length);
        const lastToken = tokens.at(-1);
        if (token.type === "text" && lastToken?.type === "text") {
          lastToken.raw += token.raw;
          lastToken.text += token.text;
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (token = this.tokenizer.emStrong(src, maskedSrc, prevChar)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.codespan(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.br(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.del(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (token = this.tokenizer.autolink(src)) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      if (!this.state.inLink && (token = this.tokenizer.url(src))) {
        src = src.substring(token.raw.length);
        tokens.push(token);
        continue;
      }
      let cutSrc = src;
      if (this.options.extensions?.startInline) {
        let startIndex = Infinity;
        const tempSrc = src.slice(1);
        let tempStart;
        this.options.extensions.startInline.forEach((getStartIndex) => {
          tempStart = getStartIndex.call({ lexer: this }, tempSrc);
          if (typeof tempStart === "number" && tempStart >= 0) {
            startIndex = Math.min(startIndex, tempStart);
          }
        });
        if (startIndex < Infinity && startIndex >= 0) {
          cutSrc = src.substring(0, startIndex + 1);
        }
      }
      if (token = this.tokenizer.inlineText(cutSrc)) {
        src = src.substring(token.raw.length);
        if (token.raw.slice(-1) !== "_") {
          prevChar = token.raw.slice(-1);
        }
        keepPrevChar = true;
        const lastToken = tokens.at(-1);
        if (lastToken?.type === "text") {
          lastToken.raw += token.raw;
          lastToken.text += token.text;
        } else {
          tokens.push(token);
        }
        continue;
      }
      if (src) {
        const errMsg = "Infinite loop on byte: " + src.charCodeAt(0);
        if (this.options.silent) {
          console.error(errMsg);
          break;
        } else {
          throw new Error(errMsg);
        }
      }
    }
    return tokens;
  }
};
var _Renderer = class {
  // set by the parser
  constructor(options2) {
    __publicField(this, "options");
    __publicField(this, "parser");
    this.options = options2 || _defaults;
  }
  space(token) {
    return "";
  }
  code({ text, lang, escaped }) {
    const langString = (lang || "").match(other.notSpaceStart)?.[0];
    const code = text.replace(other.endingNewline, "") + "\n";
    if (!langString) {
      return "<pre><code>" + (escaped ? code : escape2(code, true)) + "</code></pre>\n";
    }
    return '<pre><code class="language-' + escape2(langString) + '">' + (escaped ? code : escape2(code, true)) + "</code></pre>\n";
  }
  blockquote({ tokens }) {
    const body = this.parser.parse(tokens);
    return `<blockquote>
${body}</blockquote>
`;
  }
  html({ text }) {
    return text;
  }
  heading({ tokens, depth }) {
    return `<h${depth}>${this.parser.parseInline(tokens)}</h${depth}>
`;
  }
  hr(token) {
    return "<hr>\n";
  }
  list(token) {
    const ordered = token.ordered;
    const start = token.start;
    let body = "";
    for (let j = 0; j < token.items.length; j++) {
      const item = token.items[j];
      body += this.listitem(item);
    }
    const type = ordered ? "ol" : "ul";
    const startAttr = ordered && start !== 1 ? ' start="' + start + '"' : "";
    return "<" + type + startAttr + ">\n" + body + "</" + type + ">\n";
  }
  listitem(item) {
    let itemBody = "";
    if (item.task) {
      const checkbox = this.checkbox({ checked: !!item.checked });
      if (item.loose) {
        if (item.tokens[0]?.type === "paragraph") {
          item.tokens[0].text = checkbox + " " + item.tokens[0].text;
          if (item.tokens[0].tokens && item.tokens[0].tokens.length > 0 && item.tokens[0].tokens[0].type === "text") {
            item.tokens[0].tokens[0].text = checkbox + " " + escape2(item.tokens[0].tokens[0].text);
            item.tokens[0].tokens[0].escaped = true;
          }
        } else {
          item.tokens.unshift({
            type: "text",
            raw: checkbox + " ",
            text: checkbox + " ",
            escaped: true
          });
        }
      } else {
        itemBody += checkbox + " ";
      }
    }
    itemBody += this.parser.parse(item.tokens, !!item.loose);
    return `<li>${itemBody}</li>
`;
  }
  checkbox({ checked }) {
    return "<input " + (checked ? 'checked="" ' : "") + 'disabled="" type="checkbox">';
  }
  paragraph({ tokens }) {
    return `<p>${this.parser.parseInline(tokens)}</p>
`;
  }
  table(token) {
    let header = "";
    let cell = "";
    for (let j = 0; j < token.header.length; j++) {
      cell += this.tablecell(token.header[j]);
    }
    header += this.tablerow({ text: cell });
    let body = "";
    for (let j = 0; j < token.rows.length; j++) {
      const row = token.rows[j];
      cell = "";
      for (let k = 0; k < row.length; k++) {
        cell += this.tablecell(row[k]);
      }
      body += this.tablerow({ text: cell });
    }
    if (body) body = `<tbody>${body}</tbody>`;
    return "<table>\n<thead>\n" + header + "</thead>\n" + body + "</table>\n";
  }
  tablerow({ text }) {
    return `<tr>
${text}</tr>
`;
  }
  tablecell(token) {
    const content = this.parser.parseInline(token.tokens);
    const type = token.header ? "th" : "td";
    const tag2 = token.align ? `<${type} align="${token.align}">` : `<${type}>`;
    return tag2 + content + `</${type}>
`;
  }
  /**
   * span level renderer
   */
  strong({ tokens }) {
    return `<strong>${this.parser.parseInline(tokens)}</strong>`;
  }
  em({ tokens }) {
    return `<em>${this.parser.parseInline(tokens)}</em>`;
  }
  codespan({ text }) {
    return `<code>${escape2(text, true)}</code>`;
  }
  br(token) {
    return "<br>";
  }
  del({ tokens }) {
    return `<del>${this.parser.parseInline(tokens)}</del>`;
  }
  link({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    const cleanHref = cleanUrl(href);
    if (cleanHref === null) {
      return text;
    }
    href = cleanHref;
    let out = '<a href="' + href + '"';
    if (title) {
      out += ' title="' + escape2(title) + '"';
    }
    out += ">" + text + "</a>";
    return out;
  }
  image({ href, title, text, tokens }) {
    if (tokens) {
      text = this.parser.parseInline(tokens, this.parser.textRenderer);
    }
    const cleanHref = cleanUrl(href);
    if (cleanHref === null) {
      return escape2(text);
    }
    href = cleanHref;
    let out = `<img src="${href}" alt="${text}"`;
    if (title) {
      out += ` title="${escape2(title)}"`;
    }
    out += ">";
    return out;
  }
  text(token) {
    return "tokens" in token && token.tokens ? this.parser.parseInline(token.tokens) : "escaped" in token && token.escaped ? token.text : escape2(token.text);
  }
};
var _TextRenderer = class {
  // no need for block level renderers
  strong({ text }) {
    return text;
  }
  em({ text }) {
    return text;
  }
  codespan({ text }) {
    return text;
  }
  del({ text }) {
    return text;
  }
  html({ text }) {
    return text;
  }
  text({ text }) {
    return text;
  }
  link({ text }) {
    return "" + text;
  }
  image({ text }) {
    return "" + text;
  }
  br() {
    return "";
  }
};
var _Parser = class __Parser {
  constructor(options2) {
    __publicField(this, "options");
    __publicField(this, "renderer");
    __publicField(this, "textRenderer");
    this.options = options2 || _defaults;
    this.options.renderer = this.options.renderer || new _Renderer();
    this.renderer = this.options.renderer;
    this.renderer.options = this.options;
    this.renderer.parser = this;
    this.textRenderer = new _TextRenderer();
  }
  /**
   * Static Parse Method
   */
  static parse(tokens, options2) {
    const parser2 = new __Parser(options2);
    return parser2.parse(tokens);
  }
  /**
   * Static Parse Inline Method
   */
  static parseInline(tokens, options2) {
    const parser2 = new __Parser(options2);
    return parser2.parseInline(tokens);
  }
  /**
   * Parse Loop
   */
  parse(tokens, top = true) {
    let out = "";
    for (let i = 0; i < tokens.length; i++) {
      const anyToken = tokens[i];
      if (this.options.extensions?.renderers?.[anyToken.type]) {
        const genericToken = anyToken;
        const ret = this.options.extensions.renderers[genericToken.type].call({ parser: this }, genericToken);
        if (ret !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "paragraph", "text"].includes(genericToken.type)) {
          out += ret || "";
          continue;
        }
      }
      const token = anyToken;
      switch (token.type) {
        case "space": {
          out += this.renderer.space(token);
          continue;
        }
        case "hr": {
          out += this.renderer.hr(token);
          continue;
        }
        case "heading": {
          out += this.renderer.heading(token);
          continue;
        }
        case "code": {
          out += this.renderer.code(token);
          continue;
        }
        case "table": {
          out += this.renderer.table(token);
          continue;
        }
        case "blockquote": {
          out += this.renderer.blockquote(token);
          continue;
        }
        case "list": {
          out += this.renderer.list(token);
          continue;
        }
        case "html": {
          out += this.renderer.html(token);
          continue;
        }
        case "paragraph": {
          out += this.renderer.paragraph(token);
          continue;
        }
        case "text": {
          let textToken = token;
          let body = this.renderer.text(textToken);
          while (i + 1 < tokens.length && tokens[i + 1].type === "text") {
            textToken = tokens[++i];
            body += "\n" + this.renderer.text(textToken);
          }
          if (top) {
            out += this.renderer.paragraph({
              type: "paragraph",
              raw: body,
              text: body,
              tokens: [{ type: "text", raw: body, text: body, escaped: true }]
            });
          } else {
            out += body;
          }
          continue;
        }
        default: {
          const errMsg = 'Token with "' + token.type + '" type was not found.';
          if (this.options.silent) {
            console.error(errMsg);
            return "";
          } else {
            throw new Error(errMsg);
          }
        }
      }
    }
    return out;
  }
  /**
   * Parse Inline Tokens
   */
  parseInline(tokens, renderer = this.renderer) {
    let out = "";
    for (let i = 0; i < tokens.length; i++) {
      const anyToken = tokens[i];
      if (this.options.extensions?.renderers?.[anyToken.type]) {
        const ret = this.options.extensions.renderers[anyToken.type].call({ parser: this }, anyToken);
        if (ret !== false || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(anyToken.type)) {
          out += ret || "";
          continue;
        }
      }
      const token = anyToken;
      switch (token.type) {
        case "escape": {
          out += renderer.text(token);
          break;
        }
        case "html": {
          out += renderer.html(token);
          break;
        }
        case "link": {
          out += renderer.link(token);
          break;
        }
        case "image": {
          out += renderer.image(token);
          break;
        }
        case "strong": {
          out += renderer.strong(token);
          break;
        }
        case "em": {
          out += renderer.em(token);
          break;
        }
        case "codespan": {
          out += renderer.codespan(token);
          break;
        }
        case "br": {
          out += renderer.br(token);
          break;
        }
        case "del": {
          out += renderer.del(token);
          break;
        }
        case "text": {
          out += renderer.text(token);
          break;
        }
        default: {
          const errMsg = 'Token with "' + token.type + '" type was not found.';
          if (this.options.silent) {
            console.error(errMsg);
            return "";
          } else {
            throw new Error(errMsg);
          }
        }
      }
    }
    return out;
  }
};
var _a;
var _Hooks = (_a = class {
  constructor(options2) {
    __publicField(this, "options");
    __publicField(this, "block");
    this.options = options2 || _defaults;
  }
  /**
   * Process markdown before marked
   */
  preprocess(markdown) {
    return markdown;
  }
  /**
   * Process HTML after marked is finished
   */
  postprocess(html2) {
    return html2;
  }
  /**
   * Process all tokens before walk tokens
   */
  processAllTokens(tokens) {
    return tokens;
  }
  /**
   * Provide function to tokenize markdown
   */
  provideLexer() {
    return this.block ? _Lexer.lex : _Lexer.lexInline;
  }
  /**
   * Provide function to parse tokens
   */
  provideParser() {
    return this.block ? _Parser.parse : _Parser.parseInline;
  }
}, __publicField(_a, "passThroughHooks", /* @__PURE__ */ new Set([
  "preprocess",
  "postprocess",
  "processAllTokens"
])), _a);
var Marked = class {
  constructor(...args) {
    __publicField(this, "defaults", _getDefaults());
    __publicField(this, "options", this.setOptions);
    __publicField(this, "parse", this.parseMarkdown(true));
    __publicField(this, "parseInline", this.parseMarkdown(false));
    __publicField(this, "Parser", _Parser);
    __publicField(this, "Renderer", _Renderer);
    __publicField(this, "TextRenderer", _TextRenderer);
    __publicField(this, "Lexer", _Lexer);
    __publicField(this, "Tokenizer", _Tokenizer);
    __publicField(this, "Hooks", _Hooks);
    this.use(...args);
  }
  /**
   * Run callback for every token
   */
  walkTokens(tokens, callback) {
    let values = [];
    for (const token of tokens) {
      values = values.concat(callback.call(this, token));
      switch (token.type) {
        case "table": {
          const tableToken = token;
          for (const cell of tableToken.header) {
            values = values.concat(this.walkTokens(cell.tokens, callback));
          }
          for (const row of tableToken.rows) {
            for (const cell of row) {
              values = values.concat(this.walkTokens(cell.tokens, callback));
            }
          }
          break;
        }
        case "list": {
          const listToken = token;
          values = values.concat(this.walkTokens(listToken.items, callback));
          break;
        }
        default: {
          const genericToken = token;
          if (this.defaults.extensions?.childTokens?.[genericToken.type]) {
            this.defaults.extensions.childTokens[genericToken.type].forEach((childTokens) => {
              const tokens2 = genericToken[childTokens].flat(Infinity);
              values = values.concat(this.walkTokens(tokens2, callback));
            });
          } else if (genericToken.tokens) {
            values = values.concat(this.walkTokens(genericToken.tokens, callback));
          }
        }
      }
    }
    return values;
  }
  use(...args) {
    const extensions = this.defaults.extensions || { renderers: {}, childTokens: {} };
    args.forEach((pack) => {
      const opts = { ...pack };
      opts.async = this.defaults.async || opts.async || false;
      if (pack.extensions) {
        pack.extensions.forEach((ext) => {
          if (!ext.name) {
            throw new Error("extension name required");
          }
          if ("renderer" in ext) {
            const prevRenderer = extensions.renderers[ext.name];
            if (prevRenderer) {
              extensions.renderers[ext.name] = function(...args2) {
                let ret = ext.renderer.apply(this, args2);
                if (ret === false) {
                  ret = prevRenderer.apply(this, args2);
                }
                return ret;
              };
            } else {
              extensions.renderers[ext.name] = ext.renderer;
            }
          }
          if ("tokenizer" in ext) {
            if (!ext.level || ext.level !== "block" && ext.level !== "inline") {
              throw new Error("extension level must be 'block' or 'inline'");
            }
            const extLevel = extensions[ext.level];
            if (extLevel) {
              extLevel.unshift(ext.tokenizer);
            } else {
              extensions[ext.level] = [ext.tokenizer];
            }
            if (ext.start) {
              if (ext.level === "block") {
                if (extensions.startBlock) {
                  extensions.startBlock.push(ext.start);
                } else {
                  extensions.startBlock = [ext.start];
                }
              } else if (ext.level === "inline") {
                if (extensions.startInline) {
                  extensions.startInline.push(ext.start);
                } else {
                  extensions.startInline = [ext.start];
                }
              }
            }
          }
          if ("childTokens" in ext && ext.childTokens) {
            extensions.childTokens[ext.name] = ext.childTokens;
          }
        });
        opts.extensions = extensions;
      }
      if (pack.renderer) {
        const renderer = this.defaults.renderer || new _Renderer(this.defaults);
        for (const prop in pack.renderer) {
          if (!(prop in renderer)) {
            throw new Error(`renderer '${prop}' does not exist`);
          }
          if (["options", "parser"].includes(prop)) {
            continue;
          }
          const rendererProp = prop;
          const rendererFunc = pack.renderer[rendererProp];
          const prevRenderer = renderer[rendererProp];
          renderer[rendererProp] = (...args2) => {
            let ret = rendererFunc.apply(renderer, args2);
            if (ret === false) {
              ret = prevRenderer.apply(renderer, args2);
            }
            return ret || "";
          };
        }
        opts.renderer = renderer;
      }
      if (pack.tokenizer) {
        const tokenizer = this.defaults.tokenizer || new _Tokenizer(this.defaults);
        for (const prop in pack.tokenizer) {
          if (!(prop in tokenizer)) {
            throw new Error(`tokenizer '${prop}' does not exist`);
          }
          if (["options", "rules", "lexer"].includes(prop)) {
            continue;
          }
          const tokenizerProp = prop;
          const tokenizerFunc = pack.tokenizer[tokenizerProp];
          const prevTokenizer = tokenizer[tokenizerProp];
          tokenizer[tokenizerProp] = (...args2) => {
            let ret = tokenizerFunc.apply(tokenizer, args2);
            if (ret === false) {
              ret = prevTokenizer.apply(tokenizer, args2);
            }
            return ret;
          };
        }
        opts.tokenizer = tokenizer;
      }
      if (pack.hooks) {
        const hooks = this.defaults.hooks || new _Hooks();
        for (const prop in pack.hooks) {
          if (!(prop in hooks)) {
            throw new Error(`hook '${prop}' does not exist`);
          }
          if (["options", "block"].includes(prop)) {
            continue;
          }
          const hooksProp = prop;
          const hooksFunc = pack.hooks[hooksProp];
          const prevHook = hooks[hooksProp];
          if (_Hooks.passThroughHooks.has(prop)) {
            hooks[hooksProp] = (arg) => {
              if (this.defaults.async) {
                return Promise.resolve(hooksFunc.call(hooks, arg)).then((ret2) => {
                  return prevHook.call(hooks, ret2);
                });
              }
              const ret = hooksFunc.call(hooks, arg);
              return prevHook.call(hooks, ret);
            };
          } else {
            hooks[hooksProp] = (...args2) => {
              let ret = hooksFunc.apply(hooks, args2);
              if (ret === false) {
                ret = prevHook.apply(hooks, args2);
              }
              return ret;
            };
          }
        }
        opts.hooks = hooks;
      }
      if (pack.walkTokens) {
        const walkTokens2 = this.defaults.walkTokens;
        const packWalktokens = pack.walkTokens;
        opts.walkTokens = function(token) {
          let values = [];
          values.push(packWalktokens.call(this, token));
          if (walkTokens2) {
            values = values.concat(walkTokens2.call(this, token));
          }
          return values;
        };
      }
      this.defaults = { ...this.defaults, ...opts };
    });
    return this;
  }
  setOptions(opt) {
    this.defaults = { ...this.defaults, ...opt };
    return this;
  }
  lexer(src, options2) {
    return _Lexer.lex(src, options2 ?? this.defaults);
  }
  parser(tokens, options2) {
    return _Parser.parse(tokens, options2 ?? this.defaults);
  }
  parseMarkdown(blockType) {
    const parse2 = (src, options2) => {
      const origOpt = { ...options2 };
      const opt = { ...this.defaults, ...origOpt };
      const throwError = this.onError(!!opt.silent, !!opt.async);
      if (this.defaults.async === true && origOpt.async === false) {
        return throwError(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
      }
      if (typeof src === "undefined" || src === null) {
        return throwError(new Error("marked(): input parameter is undefined or null"));
      }
      if (typeof src !== "string") {
        return throwError(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(src) + ", string expected"));
      }
      if (opt.hooks) {
        opt.hooks.options = opt;
        opt.hooks.block = blockType;
      }
      const lexer2 = opt.hooks ? opt.hooks.provideLexer() : blockType ? _Lexer.lex : _Lexer.lexInline;
      const parser2 = opt.hooks ? opt.hooks.provideParser() : blockType ? _Parser.parse : _Parser.parseInline;
      if (opt.async) {
        return Promise.resolve(opt.hooks ? opt.hooks.preprocess(src) : src).then((src2) => lexer2(src2, opt)).then((tokens) => opt.hooks ? opt.hooks.processAllTokens(tokens) : tokens).then((tokens) => opt.walkTokens ? Promise.all(this.walkTokens(tokens, opt.walkTokens)).then(() => tokens) : tokens).then((tokens) => parser2(tokens, opt)).then((html2) => opt.hooks ? opt.hooks.postprocess(html2) : html2).catch(throwError);
      }
      try {
        if (opt.hooks) {
          src = opt.hooks.preprocess(src);
        }
        let tokens = lexer2(src, opt);
        if (opt.hooks) {
          tokens = opt.hooks.processAllTokens(tokens);
        }
        if (opt.walkTokens) {
          this.walkTokens(tokens, opt.walkTokens);
        }
        let html2 = parser2(tokens, opt);
        if (opt.hooks) {
          html2 = opt.hooks.postprocess(html2);
        }
        return html2;
      } catch (e) {
        return throwError(e);
      }
    };
    return parse2;
  }
  onError(silent, async) {
    return (e) => {
      e.message += "\nPlease report this to https://github.com/markedjs/marked.";
      if (silent) {
        const msg = "<p>An error occurred:</p><pre>" + escape2(e.message + "", true) + "</pre>";
        if (async) {
          return Promise.resolve(msg);
        }
        return msg;
      }
      if (async) {
        return Promise.reject(e);
      }
      throw e;
    };
  }
};
var markedInstance = new Marked();
function marked(src, opt) {
  return markedInstance.parse(src, opt);
}
marked.options = marked.setOptions = function(options2) {
  markedInstance.setOptions(options2);
  marked.defaults = markedInstance.defaults;
  changeDefaults(marked.defaults);
  return marked;
};
marked.getDefaults = _getDefaults;
marked.defaults = _defaults;
marked.use = function(...args) {
  markedInstance.use(...args);
  marked.defaults = markedInstance.defaults;
  changeDefaults(marked.defaults);
  return marked;
};
marked.walkTokens = function(tokens, callback) {
  return markedInstance.walkTokens(tokens, callback);
};
marked.parseInline = markedInstance.parseInline;
marked.Parser = _Parser;
marked.parser = _Parser.parse;
marked.Renderer = _Renderer;
marked.TextRenderer = _TextRenderer;
marked.Lexer = _Lexer;
marked.lexer = _Lexer.lex;
marked.Tokenizer = _Tokenizer;
marked.Hooks = _Hooks;
marked.parse = marked;
var options = marked.options;
var setOptions = marked.setOptions;
var use = marked.use;
var walkTokens = marked.walkTokens;
var parseInline = marked.parseInline;
var parser = _Parser.parse;
var lexer = _Lexer.lex;

// src/content/markdown.ts
var FENCE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
async function transformMarkdown(source, resolveWiki, resolveLocal) {
  const warnings = [];
  const output = [];
  let cursor = 0;
  for (const match of source.matchAll(FENCE)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      output.push(await transformProse(source.slice(cursor, index), resolveWiki, resolveLocal, warnings));
    }
    output.push(match[0]);
    cursor = index + match[0].length;
  }
  if (cursor < source.length) {
    output.push(await transformProse(source.slice(cursor), resolveWiki, resolveLocal, warnings));
  }
  return { markdown: output.join(""), warnings };
}
async function transformProse(source, resolveWiki, resolveLocal, warnings) {
  const pieces = tokenizeProse(source);
  let output = "";
  for (const piece of pieces) {
    if (piece.kind === "text" || piece.kind === "code") {
      output += piece.text;
      continue;
    }
    if (piece.kind === "wiki") {
      const resolved2 = await resolveWiki(piece.target, piece.heading, piece.embed);
      output += renderResolved(piece.embed, piece.label || piece.target, resolved2, piece.raw, warnings);
      continue;
    }
    const resolved = await resolveLocal(piece.href, piece.embed);
    if (!resolved) {
      output += piece.embed ? `![${piece.label}](${piece.href})` : `[${piece.label}](${piece.href})`;
      continue;
    }
    output += renderResolved(
      piece.embed,
      piece.label || resolved.label || piece.href,
      resolved,
      piece.embed ? `![${piece.label}](${piece.href})` : `[${piece.label}](${piece.href})`,
      warnings
    );
  }
  return output;
}
function renderResolved(embed, label2, resolved, fallback, warnings) {
  if (resolved.warning) warnings.push(resolved.warning);
  if (!resolved.href) return fallback;
  const text = escapeLinkLabel(resolved.label || label2);
  const href = resolved.href;
  return embed ? `![${text}](${href})` : `[${text}](${href})`;
}
function escapeLinkLabel(label2) {
  return label2.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}
function tokenizeProse(source) {
  const pieces = [];
  let text = "";
  let index = 0;
  const flush = () => {
    if (text) {
      pieces.push({ kind: "text", text });
      text = "";
    }
  };
  while (index < source.length) {
    if (source[index] === "`") {
      const end = source.indexOf("`", index + 1);
      if (end !== -1) {
        flush();
        pieces.push({ kind: "code", text: source.slice(index, end + 1) });
        index = end + 1;
        continue;
      }
    }
    const wiki = readWikiLink(source, index);
    if (wiki) {
      flush();
      pieces.push(wiki.piece);
      index = wiki.next;
      continue;
    }
    const md = readMarkdownLink(source, index);
    if (md) {
      flush();
      pieces.push(md.piece);
      index = md.next;
      continue;
    }
    text += source[index];
    index += 1;
  }
  flush();
  return pieces;
}
function readWikiLink(source, index) {
  const embed = source.startsWith("![[", index);
  const start = embed ? index : source.startsWith("[[", index) ? index : -1;
  if (start === -1) return void 0;
  const contentStart = start + (embed ? 3 : 2);
  const end = source.indexOf("]]", contentStart);
  if (end === -1) return void 0;
  const raw = source.slice(start, end + 2);
  const inner = source.slice(contentStart, end);
  const aliasAt = inner.indexOf("|");
  const targetPart = aliasAt === -1 ? inner : inner.slice(0, aliasAt);
  const label2 = aliasAt === -1 ? void 0 : inner.slice(aliasAt + 1);
  const headingAt = targetPart.indexOf("#");
  const target = (headingAt === -1 ? targetPart : targetPart.slice(0, headingAt)).trim();
  const heading2 = headingAt === -1 ? void 0 : targetPart.slice(headingAt + 1).trim();
  if (!target) return void 0;
  return {
    piece: { kind: "wiki", embed, raw, target, heading: heading2, label: label2 },
    next: end + 2
  };
}
function readMarkdownLink(source, index) {
  const embed = source.startsWith("![", index);
  if (!embed && source[index] !== "[") return void 0;
  const labelStart = index + (embed ? 2 : 1);
  const labelEnd = source.indexOf("]", labelStart);
  if (labelEnd === -1 || source[labelEnd + 1] !== "(") return void 0;
  const hrefStart = labelEnd + 2;
  const hrefEnd = source.indexOf(")", hrefStart);
  if (hrefEnd === -1) return void 0;
  const label2 = source.slice(labelStart, labelEnd);
  let href = source.slice(hrefStart, hrefEnd).trim();
  let title;
  const titleMatch = href.match(/^(\S+)\s+(["'].*["'])$/);
  if (titleMatch) {
    href = titleMatch[1];
    title = titleMatch[2];
  }
  if (!isLocalHref(href)) return void 0;
  return {
    piece: { kind: "mdlink", embed, label: label2, href, title },
    next: hrefEnd + 1
  };
}
function isLocalHref(href) {
  const lower = href.toLowerCase();
  if (!href || href.startsWith("#") || href.startsWith("/")) return false;
  return !/^[a-z][a-z0-9+.-]*:/.test(lower);
}
function stripHeading(href) {
  const hash = href.indexOf("#");
  if (hash === -1) return { path: href };
  return { path: href.slice(0, hash), heading: decodeURIComponent(href.slice(hash + 1)) };
}

// src/content/paths.ts
var PUBLISH_STATES = ["draft", "published", "scheduled"];
function normalizeWikiPath(input) {
  return input.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\s+/g, "-").replace(/_+/g, "-").replace(/\/{2,}/g, "/").toLowerCase();
}
function sanitizeFolderPath(input) {
  return input.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\s+/g, "-").replace(/\/{2,}/g, "/");
}
function publicHref(locale, folderPath, fileName, heading2) {
  const segments = [locale, ...folderPath.split("/"), fileName].filter((segment) => segment.length > 0).map((segment) => encodeURIComponent(segment));
  let href = `/${segments.join("/")}`;
  if (heading2?.trim()) {
    const slug = heading2.trim().toLowerCase().replace(/\s+/g, "-");
    href += `#${encodeURIComponent(slug)}`;
  }
  return href;
}
function pageHref(locale, wikiPath, heading2) {
  const segments = [locale, ...wikiPath.split("/")].filter((segment) => segment.length > 0).map((segment) => encodeURIComponent(segment));
  let href = `/${segments.join("/")}`;
  if (heading2?.trim()) {
    const slug = heading2.trim().toLowerCase().replace(/\s+/g, "-");
    href += `#${encodeURIComponent(slug)}`;
  }
  return href;
}
function asString(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : void 0;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return void 0;
}
function readPublishState(value, publishedFlag, fallback) {
  const explicit = asString(value);
  if (explicit && PUBLISH_STATES.includes(explicit)) {
    return explicit;
  }
  if (typeof publishedFlag === "boolean") {
    return publishedFlag ? "published" : "draft";
  }
  return fallback;
}
var TAG_PATTERN = /^[\p{L}\p{M}\p{N} ._-]+$/u;
function readTags(value) {
  if (value == null) return void 0;
  const raw = Array.isArray(value) ? value : [value];
  const tags = [];
  const rejected = [];
  for (const item of raw) {
    const tag2 = asString(item);
    if (!tag2) continue;
    if (!TAG_PATTERN.test(tag2)) {
      rejected.push(tag2);
      continue;
    }
    tags.push(tag2);
  }
  return { tags, rejected };
}
function truncate(value, max) {
  return value.length <= max ? value : value.slice(0, max);
}
function mimeType(fileName) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const table = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    avif: "image/avif",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    webm: "video/webm",
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
    zip: "application/zip"
  };
  return table[extension] ?? "application/octet-stream";
}
async function sha256Text(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return hex(digest);
}
async function sha256Bytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return hex(digest);
}
function hex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// src/sync/engine.ts
var FORMAT_VERSION = 2;
var MAX_ASSET_BYTES = 10 * 1024 * 1024;
marked.use({ gfm: true, breaks: false });
async function syncFiles(app, settings, store, files) {
  const startedAt = Date.now();
  const client = new WikiJsClient(settings.baseUrl, settings.apiToken);
  const siteId = await resolveSiteId(client, settings);
  const items = [];
  let ignored = 0;
  for (const file of files) {
    const frontmatter = await readFrontmatter(app, file);
    const wikiPath = normalizeWikiPath(asString(frontmatter?.wikiPath) ?? "");
    if (!wikiPath) {
      ignored += 1;
      continue;
    }
    items.push(await syncOne(app, client, settings, store, siteId, file, frontmatter, wikiPath));
  }
  const report = {
    startedAt,
    finishedAt: Date.now(),
    created: items.filter((item) => item.action === "created").length,
    updated: items.filter((item) => item.action === "updated").length,
    skipped: items.filter((item) => item.action === "skipped").length,
    ignored,
    failed: items.filter((item) => item.action === "error").length,
    items
  };
  return report;
}
async function resolveSiteId(client, settings) {
  if (settings.siteId.trim()) return settings.siteId.trim();
  const site = await client.getSite("current");
  settings.siteId = site.id;
  return site.id;
}
async function syncOne(app, client, settings, store, siteId, file, frontmatter, wikiPath) {
  try {
    if (wikiPath.length > 255) {
      throw new Error("wikiPath \u8D85\u8FC7 255 \u4E2A\u5B57\u7B26");
    }
    const source = await app.vault.read(file);
    const body = stripFrontmatter(source, app, file);
    const locale = asString(frontmatter?.wikiLocale) || settings.locale.trim() || "zh";
    const title = truncate(asString(frontmatter?.wikiTitle) || asString(frontmatter?.title) || file.basename, 255);
    const description = truncate(asString(frontmatter?.wikiDescription) || asString(frontmatter?.description) || "", 255);
    const tags = readTags(frontmatter?.wikiTags ?? frontmatter?.tags);
    const publishState = readPublishState(frontmatter?.wikiPublishState, frontmatter?.wikiPublished, settings.publishState);
    const assetHashes = await hashReferencedAssets(app, file);
    const contentHash = await sha256Text(
      JSON.stringify({
        version: FORMAT_VERSION,
        wikiPath,
        title,
        description,
        locale,
        publishState,
        tags: tags?.tags ?? null,
        body,
        assetHashes
      })
    );
    const existing = store.records[file.path];
    if (existing?.siteId === siteId && existing.pageId && existing.contentHash === contentHash && existing.wikiPath === wikiPath && existing.status === "synced") {
      return { localPath: file.path, wikiPath, action: "skipped", message: "\u5185\u5BB9\u6CA1\u6709\u53D8\u5316" };
    }
    const warnings = [];
    if (tags?.rejected.length) {
      warnings.push(`\u5DF2\u5FFD\u7565\u4E0D\u7B26\u5408 Wiki.js \u89C4\u5219\u7684\u6807\u7B7E\uFF1A${tags.rejected.join("\u3001")}`);
    }
    const transformed = await transformMarkdown(
      body,
      (target, heading2, embed) => resolveWikiLink(app, client, settings, store, siteId, file, locale, target, heading2, embed),
      (href, embed) => resolveMarkdownLink(app, client, settings, store, siteId, file, locale, href, embed)
    );
    warnings.push(...transformed.warnings);
    const html2 = await marked.parse(transformed.markdown);
    const page = {
      path: wikiPath,
      title,
      editor: "markdown",
      content: transformed.markdown,
      render: typeof html2 === "string" ? html2 : String(html2),
      description,
      locale,
      publishState
    };
    if (tags) page.tags = tags.tags;
    const saved = await savePage(client, siteId, existing?.pageId, page, wikiPath, locale);
    if (settings.queueServerRender) {
      try {
        await client.queueRender(siteId, saved.page.id);
      } catch (error) {
        if (!(error instanceof WikiHttpError) || error.status !== 503) {
          warnings.push(`\u670D\u52A1\u5668\u91CD\u65B0\u6E32\u67D3\u672A\u6392\u961F\uFF1A${errorMessage(error)}`);
        }
      }
    }
    store.records[file.path] = {
      localPath: file.path,
      siteId,
      pageId: saved.page.id,
      wikiPath: saved.page.path || wikiPath,
      contentHash,
      lastSyncTime: Date.now(),
      status: "synced"
    };
    await store.persist();
    return {
      localPath: file.path,
      wikiPath: saved.page.path || wikiPath,
      action: saved.created ? "created" : "updated",
      message: warnings.length ? warnings.join("\uFF1B") : void 0
    };
  } catch (error) {
    const message = errorMessage(error);
    const previous = store.records[file.path];
    store.records[file.path] = {
      localPath: file.path,
      siteId,
      pageId: previous?.siteId === siteId ? previous.pageId : void 0,
      wikiPath,
      contentHash: previous?.contentHash ?? "",
      lastSyncTime: previous?.lastSyncTime ?? 0,
      status: "error",
      lastError: message
    };
    await store.persist();
    return { localPath: file.path, wikiPath, action: "error", message };
  }
}
async function savePage(client, siteId, pageId, page, wikiPath, locale) {
  if (pageId) {
    try {
      return { page: await client.updatePage(siteId, pageId, page), created: false };
    } catch (error) {
      if (!(error instanceof WikiHttpError) || error.status !== 404) throw error;
    }
  }
  const found = await client.findPage(siteId, wikiPath, locale);
  if (found) return { page: await client.updatePage(siteId, found.id, page), created: false };
  try {
    return { page: await client.createPage(siteId, page), created: true };
  } catch (error) {
    if (!(error instanceof WikiHttpError) || error.status !== 409 && error.status !== 400) throw error;
    const again = await client.findPage(siteId, wikiPath, locale);
    if (!again) throw error;
    return { page: await client.updatePage(siteId, again.id, page), created: false };
  }
}
async function resolveWikiLink(app, client, settings, store, siteId, source, locale, target, heading2, embed) {
  const dest = app.metadataCache.getFirstLinkpathDest(target, source.path);
  if (!dest) {
    return { warning: `${source.path}\uFF1A\u627E\u4E0D\u5230 [[${target}]]` };
  }
  if (dest.extension === "md") {
    const link2 = await pageLink(app, locale, dest, heading2);
    if (embed && link2.href) {
      link2.warning = link2.warning ? `${link2.warning}\uFF1B\u672A\u5C55\u5F00\u5D4C\u5165 ![[${target}]]` : `${source.path}\uFF1A\u672A\u5C55\u5F00\u5D4C\u5165 ![[${target}]]\uFF0C\u5DF2\u6539\u6210\u9875\u9762\u94FE\u63A5`;
    }
    return link2;
  }
  return uploadLinkedFile(app, client, settings, store, siteId, source, locale, dest, embed);
}
async function resolveMarkdownLink(app, client, settings, store, siteId, source, locale, href, embed) {
  if (!isLocalHref(href)) return void 0;
  const decoded = stripHeading(safeDecode(href));
  const dest = app.metadataCache.getFirstLinkpathDest(decoded.path, source.path);
  if (!dest) {
    return { warning: `${source.path}\uFF1A\u627E\u4E0D\u5230\u672C\u5730\u94FE\u63A5 ${href}` };
  }
  if (dest.extension === "md") return pageLink(app, locale, dest, decoded.heading);
  return uploadLinkedFile(app, client, settings, store, siteId, source, locale, dest, embed);
}
async function pageLink(app, locale, dest, heading2) {
  const frontmatter = app.metadataCache.getFileCache(dest)?.frontmatter;
  const wikiPath = normalizeWikiPath(asString(frontmatter?.wikiPath) ?? "");
  if (!wikiPath) {
    return { warning: `${dest.path} \u6CA1\u6709 wikiPath\uFF0C\u5185\u90E8\u94FE\u63A5\u4FDD\u6301\u539F\u6837` };
  }
  const targetLocale = asString(frontmatter?.wikiLocale) || locale;
  return { href: pageHref(targetLocale, wikiPath, heading2), label: asString(frontmatter?.wikiTitle) || dest.basename };
}
async function uploadLinkedFile(app, client, settings, store, siteId, source, locale, dest, embed) {
  if (dest.stat.size > MAX_ASSET_BYTES) {
    return { warning: `${source.path}\uFF1A${dest.name} \u8D85\u8FC7 10 MB\uFF0C\u672A\u4E0A\u4F20` };
  }
  const bytes = await app.vault.readBinary(dest);
  const hash = await sha256Bytes(bytes);
  const cached = store.assets[dest.path];
  if (cached?.siteId === siteId && cached.hash === hash) {
    return { href: publicHref(locale, cached.folderPath, cached.fileName), label: dest.basename };
  }
  const folderPath = sanitizeFolderPath(
    [settings.assetFolder.trim() || "attachments", dest.parent?.path === "/" ? "" : dest.parent?.path ?? ""].filter(Boolean).join("/")
  );
  const asset = await client.uploadAsset(siteId, dest.name, bytes, mimeType(dest.name), folderPath, locale);
  store.assets[dest.path] = {
    localPath: dest.path,
    siteId,
    assetId: asset.id,
    folderPath: asset.folderPath ?? folderPath,
    fileName: asset.fileName,
    hash,
    lastUploadTime: Date.now()
  };
  await store.persist();
  return {
    href: publicHref(locale, asset.folderPath ?? folderPath, asset.fileName),
    label: embed ? "" : dest.basename
  };
}
async function hashReferencedAssets(app, source) {
  const hashes = {};
  const cache = app.metadataCache.getFileCache(source);
  const links = [...cache?.embeds ?? [], ...cache?.links ?? []];
  for (const link2 of links) {
    const dest = app.metadataCache.getFirstLinkpathDest(link2.link.split("#")[0], source.path);
    if (!dest || dest.extension === "md" || dest.stat.size > MAX_ASSET_BYTES) continue;
    if (hashes[dest.path]) continue;
    hashes[dest.path] = await sha256Bytes(await app.vault.readBinary(dest));
  }
  return hashes;
}
function stripFrontmatter(source, app, file) {
  const position = app.metadataCache.getFileCache(file)?.frontmatterPosition;
  if (position) return source.slice(position.end.offset).replace(/^\r?\n/, "");
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}
async function readFrontmatter(app, file) {
  const cached = app.metadataCache.getFileCache(file)?.frontmatter;
  if (cached) return cached;
  const source = await app.vault.read(file);
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return void 0;
  try {
    const parsed = (0, import_obsidian3.parseYaml)(match[1]);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    return void 0;
  }
  return void 0;
}
function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/types.ts
var DEFAULT_SETTINGS = {
  baseUrl: "https://book.selflove.top",
  apiToken: "",
  siteId: "",
  locale: "zh",
  publishState: "published",
  assetFolder: "attachments",
  queueServerRender: true
};

// src/ui/sync-view.ts
var import_obsidian4 = require("obsidian");
var SYNC_VIEW_TYPE = "wiki-sync-view";
var SyncView = class extends import_obsidian4.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() {
    return SYNC_VIEW_TYPE;
  }
  getDisplayText() {
    return "Wiki.js \u540C\u6B65";
  }
  getIcon() {
    return "upload";
  }
  async onOpen() {
    this.render();
  }
  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass("wiki-sync-view");
    root.createEl("h3", { text: "Wiki.js \u540C\u6B65" });
    renderWikiSettings(root.createDiv(), this.plugin);
    const actions = root.createDiv({ cls: "wiki-sync-actions" });
    this.button(actions, "\u540C\u6B65\u5168\u90E8", () => this.plugin.syncAll());
    this.button(actions, "\u540C\u6B65\u5F53\u524D\u7B14\u8BB0", () => this.plugin.syncActive());
    const report = this.plugin.lastReport;
    if (!report) {
      root.createEl("p", {
        cls: "wiki-sync-muted",
        text: "\u8FD8\u6CA1\u6709\u540C\u6B65\u3002\u53EA\u6709\u5199\u4E86 wikiPath \u7684\u7B14\u8BB0\u4F1A\u88AB\u63A8\u9001\u3002"
      });
      return;
    }
    const summary = root.createDiv({ cls: "wiki-sync-summary" });
    summary.createEl("div", {
      text: `\u65B0\u5EFA ${report.created}\uFF0C\u66F4\u65B0 ${report.updated}\uFF0C\u672A\u53D8\u5316 ${report.skipped}\uFF0C\u5931\u8D25 ${report.failed}`
    });
    summary.createEl("div", {
      cls: "wiki-sync-muted",
      text: `\u672A\u8BBE\u7F6E wikiPath \u800C\u8DF3\u8FC7 ${report.ignored} \u7BC7 \xB7 ${new Date(report.finishedAt).toLocaleString()}`
    });
    const list2 = root.createEl("ul", { cls: "wiki-sync-log" });
    for (const item of report.items) {
      const line = list2.createEl("li", {
        cls: item.action === "error" ? "wiki-sync-error" : void 0,
        text: `${label(item.action)} ${item.localPath}${item.message ? `\uFF1A${item.message}` : ""}`
      });
      if (item.action === "skipped") line.addClass("wiki-sync-muted");
    }
  }
  button(parent, text, onClick) {
    new import_obsidian4.ButtonComponent(parent).setButtonText(text).onClick(onClick);
  }
};
function label(action) {
  switch (action) {
    case "created":
      return "\u65B0\u5EFA";
    case "updated":
      return "\u66F4\u65B0";
    case "skipped":
      return "\u8DF3\u8FC7";
    case "error":
      return "\u5931\u8D25";
  }
}

// src/main.ts
var WikiSyncPlugin = class extends import_obsidian5.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    this.records = {};
    this.assets = {};
    this.lastReport = null;
    this.syncing = false;
  }
  async onload() {
    await this.loadStoredData();
    try {
      this.addSettingTab(new WikiSyncSettingTab(this.app, this));
    } catch (error) {
      console.error("Wiki Sync failed to register settings", error);
      new import_obsidian5.Notice(`Wiki Sync \u8BBE\u7F6E\u9875\u6CE8\u518C\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`, 0);
    }
    this.registerView(SYNC_VIEW_TYPE, (leaf) => new SyncView(leaf, this));
    this.addRibbonIcon("upload", "Wiki.js \u540C\u6B65", () => {
      void this.activateView();
    });
    this.addCommand({
      id: "open-sync-view",
      name: "\u6253\u5F00 Wiki.js \u540C\u6B65\u9762\u677F",
      callback: () => {
        void this.activateView();
      }
    });
    this.addCommand({
      id: "sync-all",
      name: "\u540C\u6B65\u5168\u90E8\u5E26 wikiPath \u7684\u7B14\u8BB0",
      callback: () => {
        void this.syncAll();
      }
    });
    this.addCommand({
      id: "sync-active",
      name: "\u540C\u6B65\u5F53\u524D\u7B14\u8BB0\u5230 Wiki.js",
      callback: () => {
        void this.syncActive();
      }
    });
  }
  async loadStoredData() {
    const data = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...data?.settings };
    this.records = data?.records ?? {};
    this.assets = data?.assets ?? {};
    if (this.bindExistingRecordsToSite()) await this.persist();
  }
  async persist() {
    const data = {
      settings: this.settings,
      records: this.records,
      assets: this.assets
    };
    await this.saveData(data);
  }
  async testConnection() {
    this.assertConfigured();
    const client = new WikiJsClient(this.settings.baseUrl, this.settings.apiToken);
    let user = "Token \u5DF2\u63A5\u53D7";
    try {
      user = await client.whoami();
    } catch (error) {
      if (!(error instanceof WikiHttpError) || error.status !== 403) throw error;
    }
    const site = await client.getSite(this.settings.siteId.trim() || "current");
    this.settings.siteId = site.id;
    await this.persist();
    return `\u5DF2\u8FDE\u63A5 ${user} \xB7 \u7AD9\u70B9 ${site.title || site.hostname || site.id}`;
  }
  bindExistingRecordsToSite() {
    const siteId = this.settings.siteId.trim();
    if (!siteId) return false;
    let changed = false;
    for (const record of Object.values(this.records)) {
      if (!record.siteId) {
        record.siteId = siteId;
        changed = true;
      }
    }
    for (const asset of Object.values(this.assets)) {
      if (!asset.siteId) {
        asset.siteId = siteId;
        changed = true;
      }
    }
    return changed;
  }
  async syncAll() {
    await this.runSync(this.app.vault.getMarkdownFiles());
  }
  async syncActive() {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new import_obsidian5.Notice("\u8BF7\u5148\u6253\u5F00\u4E00\u7BC7 Markdown \u7B14\u8BB0");
      return;
    }
    await this.runSync([file]);
  }
  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(SYNC_VIEW_TYPE);
    if (existing.length > 0) {
      await this.app.workspace.revealLeaf(existing[0]);
      this.refreshView();
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      new import_obsidian5.Notice("\u65E0\u6CD5\u6253\u5F00\u540C\u6B65\u9762\u677F");
      return;
    }
    await leaf.setViewState({ type: SYNC_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
  async runSync(files) {
    if (this.syncing) {
      new import_obsidian5.Notice("\u540C\u6B65\u6B63\u5728\u8FDB\u884C");
      return;
    }
    try {
      this.assertConfigured();
    } catch (error) {
      new import_obsidian5.Notice(error instanceof Error ? error.message : String(error));
      return;
    }
    this.syncing = true;
    const notice = new import_obsidian5.Notice("\u6B63\u5728\u540C\u6B65\u5230 Wiki.js\u2026", 0);
    try {
      this.lastReport = await syncFiles(this.app, this.settings, {
        records: this.records,
        assets: this.assets,
        persist: () => this.persist()
      }, files);
      await this.persist();
      const report = this.lastReport;
      notice.hide();
      new import_obsidian5.Notice(`\u540C\u6B65\u5B8C\u6210\uFF1A\u65B0\u5EFA ${report.created}\uFF0C\u66F4\u65B0 ${report.updated}\uFF0C\u5931\u8D25 ${report.failed}`);
      this.refreshView();
    } catch (error) {
      notice.hide();
      new import_obsidian5.Notice(error instanceof Error ? error.message : String(error));
    } finally {
      this.syncing = false;
    }
  }
  refreshView() {
    for (const leaf of this.app.workspace.getLeavesOfType(SYNC_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof SyncView) view.render();
    }
  }
  assertConfigured() {
    if (!this.settings.baseUrl.trim()) throw new Error("\u8BF7\u5148\u586B\u5199 Wiki.js \u5730\u5740");
    if (!this.settings.apiToken.trim()) throw new Error("\u8BF7\u5148\u586B\u5199\u4E2A\u4EBA\u8BBF\u95EE\u4EE4\u724C");
    if (isSystemApiKey(this.settings.apiToken)) {
      throw new Error(explainWikiError("use a personal access token"));
    }
    let url;
    try {
      url = new URL(this.settings.baseUrl);
    } catch {
      throw new Error("Wiki.js \u5730\u5740\u4E0D\u662F\u6709\u6548\u7684 URL");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Wiki.js \u5730\u5740\u9700\u8981\u4EE5 http:// \u6216 https:// \u5F00\u5934");
    }
  }
};
