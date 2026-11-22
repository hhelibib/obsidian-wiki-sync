import {
  ButtonComponent,
  DropdownComponent,
  Notice,
  PluginSettingTab,
  Setting,
  TextComponent,
  type App,
  type SettingDefinitionItem,
} from "obsidian";
import { WikiHttpError, WikiJsClient, siteLabel, type WikiSite } from "./api/wiki-client";
import type WikiSyncPlugin from "./main";
import type { WikiSyncSettings } from "./types";

const RELOAD_SITES = "wiki-sync-reload-sites";

const SETTING_KEYS = [
  "baseUrl",
  "apiToken",
  "siteId",
  "locale",
  "publishState",
  "assetFolder",
  "queueServerRender",
] as const satisfies readonly (keyof WikiSyncSettings)[];

type SettingKey = (typeof SETTING_KEYS)[number];

export function renderWikiSettings(container: HTMLElement, plugin: WikiSyncPlugin): void {
  container.empty();

  new Setting(container)
    .setName("Wiki.js 地址")
    .setDesc("例如 https://book.selflove.top，不要带 /_api。")
    .addText((text) =>
      text.setPlaceholder("https://book.selflove.top").setValue(plugin.settings.baseUrl).onChange(async (value) => {
        plugin.settings.baseUrl = value.trim().replace(/\/+$/, "");
        await plugin.persist();
      }),
    );

  new Setting(container)
    .setName("个人访问令牌")
    .setDesc("在 Wiki.js 个人资料的 Access Tokens 里新建，勾选 pages:write 和 assets:write。不要填管理后台的 API Key，那种令牌不能保存页面。")
    .addText((text) => {
      text.inputEl.type = "password";
      text.setPlaceholder("Bearer token").setValue(plugin.settings.apiToken).onChange(async (value) => {
        plugin.settings.apiToken = value.trim();
        await plugin.persist();
      });
    });

  addSiteSetting(new Setting(container), plugin);

  new Setting(container)
    .setName("默认语言")
    .setDesc("笔记可用 wikiLocale 覆盖。")
    .addText((text) =>
      text.setPlaceholder("zh").setValue(plugin.settings.locale).onChange(async (value) => {
        plugin.settings.locale = value.trim() || "zh";
        await plugin.persist();
      }),
    );

  new Setting(container)
    .setName("默认发布状态")
    .setDesc("笔记可用 wikiPublished 或 wikiPublishState 覆盖。")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("published", "发布")
        .addOption("draft", "草稿")
        .setValue(plugin.settings.publishState)
        .onChange(async (value) => {
          plugin.settings.publishState = value === "draft" ? "draft" : "published";
          await plugin.persist();
        }),
    );

  new Setting(container)
    .setName("附件目录")
    .setDesc("图片和附件上传到这个目录下，并保留 Vault 里的相对文件夹。")
    .addText((text) =>
      text.setPlaceholder("attachments").setValue(plugin.settings.assetFolder).onChange(async (value) => {
        plugin.settings.assetFolder = value.trim() || "attachments";
        await plugin.persist();
      }),
    );

  new Setting(container)
    .setName("排队服务器渲染")
    .setDesc("保存后请求 Wiki.js 用官方 Markdown 管道重渲染。服务器没有 Puppeteer 时会保持插件生成的 HTML。")
    .addToggle((toggle) =>
      toggle.setValue(plugin.settings.queueServerRender).onChange(async (value) => {
        plugin.settings.queueServerRender = value;
        await plugin.persist();
      }),
    );

  new Setting(container)
    .setName("测试连接")
    .setDesc("验证 Token，并解析站点 ID。")
    .addButton((button) =>
      button.setButtonText("测试").onClick(async () => {
        button.setDisabled(true);
        try {
          new Notice(await plugin.testConnection());
          document.dispatchEvent(new Event(RELOAD_SITES));
        } catch (error) {
          new Notice(error instanceof Error ? error.message : String(error));
        } finally {
          button.setDisabled(false);
        }
      }),
    );

  container.createEl("h3", { text: "Frontmatter" });
  container.createEl("pre", {
    text: [
      "---",
      "title: Vue 学习笔记",
      "wikiPath: technology/frontend/vue",
      "wikiTitle: Vue 3 学习笔记",
      "wikiTags:",
      "  - Vue",
      "---",
    ].join("\n"),
  });
}

export class WikiSyncSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: WikiSyncPlugin,
  ) {
    super(app, plugin);
    this.icon = "settings";
  }

  override getControlValue(key: string): unknown {
    if (!isSettingKey(key)) return undefined;
    return this.plugin.settings[key];
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    if (!isSettingKey(key)) return;
    assignSetting(this.plugin.settings, key, value);
    await this.plugin.persist();
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: "Wiki.js 地址",
        desc: "例如 https://book.selflove.top，不要带 /_api。",
        control: { type: "text", key: "baseUrl", placeholder: "https://book.selflove.top" },
      },
      {
        name: "个人访问令牌",
        desc: "在个人资料的 Access Tokens 里新建，勾选 pages:write 和 assets:write。不要填管理后台的 API Key。",
        control: { type: "text", key: "apiToken", placeholder: "Bearer token" },
      },
      {
        name: "当前站点",
        desc: "选择要同步到的 Wiki.js 站点。",
        render: (setting) => addSiteSetting(setting, this.plugin),
      },
      {
        name: "默认语言",
        desc: "笔记可用 wikiLocale 覆盖。",
        control: { type: "text", key: "locale", placeholder: "zh" },
      },
      {
        name: "默认发布状态",
        desc: "笔记可用 wikiPublished 或 wikiPublishState 覆盖。",
        control: {
          type: "dropdown",
          key: "publishState",
          options: { published: "发布", draft: "草稿" },
        },
      },
      {
        name: "附件目录",
        desc: "图片和附件上传到这个目录下，并保留 Vault 里的相对文件夹。",
        control: { type: "text", key: "assetFolder", placeholder: "attachments" },
      },
      {
        name: "排队服务器渲染",
        desc: "保存后请求 Wiki.js 用官方 Markdown 管道重渲染。",
        control: { type: "toggle", key: "queueServerRender" },
      },
      {
        name: "测试连接",
        desc: "验证 Token，并解析站点 ID。",
        render: (setting) => {
          setting.addButton((button) =>
            button.setButtonText("测试").onClick(async () => {
              button.setDisabled(true);
              try {
                new Notice(await this.plugin.testConnection());
                document.dispatchEvent(new Event(RELOAD_SITES));
              } catch (error) {
                new Notice(error instanceof Error ? error.message : String(error));
              } finally {
                button.setDisabled(false);
              }
            }),
          );
        },
      },
    ];
  }

  override display(): void {
    renderWikiSettings(this.containerEl, this.plugin);
  }
}

function addSiteSetting(setting: Setting, plugin: WikiSyncPlugin): void {
  setting.setName("当前站点").setDesc("打开设置时拉取站点列表。切换后，同步会发到选中的站点。");

  let dropdown!: DropdownComponent;
  let manual!: TextComponent;
  let applying = false;

  setting.addDropdown((drop) => {
    dropdown = drop;
    drop.selectEl.addClass("wiki-sync-site-select");
    const current = plugin.settings.siteId;
    drop.addOption(current, current || "正在加载站点…");
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
    text.setPlaceholder("站点 UUID").setValue(plugin.settings.siteId).onChange(async (value) => {
      plugin.settings.siteId = value.trim();
      await plugin.persist();
    });
  });

  let refreshButton!: ButtonComponent;
  setting.addButton((button) => {
    refreshButton = button;
    button.setButtonText("刷新").setTooltip("重新拉取站点列表").onClick(() => {
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
    { signal: abort.signal },
  );

  void loadSites();

  async function loadSites(): Promise<void> {
    refreshButton.setDisabled(true);
    if (!plugin.settings.baseUrl.trim() || !plugin.settings.apiToken.trim()) {
      showManual("填写地址和 Token 后点刷新，或直接填写站点 ID。");
      refreshButton.setDisabled(false);
      return;
    }

    try {
      const sites = await new WikiJsClient(plugin.settings.baseUrl, plugin.settings.apiToken).listSites();
      if (!setting.settingEl.isConnected) return;
      if (sites.length === 0) {
        showManual("这个实例没有返回站点，请手动填写站点 ID。");
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

  function showSites(sites: WikiSite[]): void {
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
    setting.setDesc(current ? `同步到 ${siteLabel(current)}。` : "选择要同步到的 Wiki.js 站点。");
    if (next !== plugin.settings.siteId) {
      plugin.settings.siteId = next;
      void plugin.persist();
    }
  }

  function showManual(message: string): void {
    dropdown.selectEl.addClass("wiki-sync-hidden");
    manual.inputEl.removeClass("wiki-sync-hidden");
    manual.setValue(plugin.settings.siteId);
    setting.setDesc(message);
  }
}

function siteListError(error: unknown): string {
  if (error instanceof WikiHttpError && (error.status === 401 || error.status === 403)) {
    return "当前 Token 不能列出站点，需要 manage:sites、access:admin 或 manage:system。可以手动填写站点 ID。";
  }
  const message = error instanceof Error ? error.message : String(error);
  return `拉取站点失败：${message}。可以手动填写站点 ID。`;
}

function isSettingKey(key: string): key is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(key);
}

function assignSetting(settings: WikiSyncSettings, key: SettingKey, value: unknown): void {
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
