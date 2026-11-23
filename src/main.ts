import { Notice, Plugin, TFile } from "obsidian";
import { WikiHttpError, WikiJsClient, explainWikiError, isSystemApiKey } from "./api/wiki-client";
import { WikiSyncSettingTab } from "./settings";
import { syncFiles } from "./sync/engine";
import { DEFAULT_SETTINGS, type StoredData, type SyncReport, type WikiSyncSettings } from "./types";
import { SYNC_VIEW_TYPE, SyncView } from "./ui/sync-view";

export default class WikiSyncPlugin extends Plugin {
  settings: WikiSyncSettings = { ...DEFAULT_SETTINGS };
  records: StoredData["records"] = {};
  assets: StoredData["assets"] = {};
  lastReport: SyncReport | null = null;
  private syncing = false;

  async onload(): Promise<void> {
    await this.loadStoredData();
    try {
      this.addSettingTab(new WikiSyncSettingTab(this.app, this));
    } catch (error) {
      console.error("Wiki Sync failed to register settings", error);
      new Notice(`Wiki Sync 设置页注册失败：${error instanceof Error ? error.message : String(error)}`, 0);
    }
    this.registerView(SYNC_VIEW_TYPE, (leaf) => new SyncView(leaf, this));
    this.addRibbonIcon("upload", "Wiki.js 同步", () => {
      void this.activateView();
    });
    this.addCommand({
      id: "open-sync-view",
      name: "打开 Wiki.js 同步面板",
      callback: () => {
        void this.activateView();
      },
    });
    this.addCommand({
      id: "sync-all",
      name: "同步全部带 wikiPath 的笔记",
      callback: () => {
        void this.syncAll();
      },
    });
    this.addCommand({
      id: "sync-active",
      name: "同步当前笔记到 Wiki.js",
      callback: () => {
        void this.syncActive();
      },
    });
  }

  async loadStoredData(): Promise<void> {
    const data = (await this.loadData()) as Partial<StoredData> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...data?.settings };
    this.records = data?.records ?? {};
    this.assets = data?.assets ?? {};
    if (this.bindExistingRecordsToSite()) await this.persist();
  }

  async persist(): Promise<void> {
    const data: StoredData = {
      settings: this.settings,
      records: this.records,
      assets: this.assets,
    };
    await this.saveData(data);
  }

  async testConnection(): Promise<string> {
    this.assertConfigured();
    const client = new WikiJsClient(this.settings.baseUrl, this.settings.apiToken);
    let user = "Token 已接受";
    try {
      user = await client.whoami();
    } catch (error) {
      if (!(error instanceof WikiHttpError) || error.status !== 403) throw error;
    }
    const site = await client.getSite(this.settings.siteId.trim() || "current");
    this.settings.siteId = site.id;
    await this.persist();
    const primary = site.locales?.primary?.trim();
    const active = site.locales?.active?.filter((code) => code.trim()).join("、");
    const localeText = primary ? ` · 主语言 ${primary}${active && active !== primary ? `（已启用 ${active}）` : ""}` : "";
    return `已连接 ${user} · 站点 ${site.title || site.hostname || site.id}${localeText}`;
  }

  private bindExistingRecordsToSite(): boolean {
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

  async syncAll(): Promise<void> {
    await this.runSync(this.app.vault.getMarkdownFiles());
  }

  async syncActive(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new Notice("请先打开一篇 Markdown 笔记");
      return;
    }
    await this.runSync([file]);
  }

  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(SYNC_VIEW_TYPE);
    if (existing.length > 0) {
      await this.app.workspace.revealLeaf(existing[0]);
      this.refreshView();
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      new Notice("无法打开同步面板");
      return;
    }
    await leaf.setViewState({ type: SYNC_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  private async runSync(files: TFile[]): Promise<void> {
    if (this.syncing) {
      new Notice("同步正在进行");
      return;
    }
    try {
      this.assertConfigured();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
      return;
    }

    this.syncing = true;
    const notice = new Notice("正在同步到 Wiki.js…", 0);
    try {
      this.lastReport = await syncFiles(this.app, this.settings, {
        records: this.records,
        assets: this.assets,
        persist: () => this.persist(),
      }, files);
      await this.persist();
      const report = this.lastReport;
      notice.hide();
      new Notice(`同步完成：新建 ${report.created}，更新 ${report.updated}，失败 ${report.failed}`);
      this.refreshView();
    } catch (error) {
      notice.hide();
      new Notice(error instanceof Error ? error.message : String(error));
    } finally {
      this.syncing = false;
    }
  }

  private refreshView(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(SYNC_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof SyncView) view.render();
    }
  }

  private assertConfigured(): void {
    if (!this.settings.baseUrl.trim()) throw new Error("请先填写 Wiki.js 地址");
    if (!this.settings.apiToken.trim()) throw new Error("请先填写个人访问令牌");
    if (isSystemApiKey(this.settings.apiToken)) {
      throw new Error(explainWikiError("use a personal access token"));
    }
    let url: URL;
    try {
      url = new URL(this.settings.baseUrl);
    } catch {
      throw new Error("Wiki.js 地址不是有效的 URL");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Wiki.js 地址需要以 http:// 或 https:// 开头");
    }
  }
}
