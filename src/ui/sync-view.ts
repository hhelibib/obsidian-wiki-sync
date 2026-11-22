import { ButtonComponent, ItemView, WorkspaceLeaf } from "obsidian";
import { renderWikiSettings } from "../settings";
import type WikiSyncPlugin from "../main";
import type { SyncReport } from "../types";

export const SYNC_VIEW_TYPE = "wiki-sync-view";

export class SyncView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: WikiSyncPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return SYNC_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Wiki.js 同步";
  }

  getIcon(): string {
    return "upload";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("wiki-sync-view");
    root.createEl("h3", { text: "Wiki.js 同步" });
    renderWikiSettings(root.createDiv(), this.plugin);

    const actions = root.createDiv({ cls: "wiki-sync-actions" });
    this.button(actions, "同步全部", () => this.plugin.syncAll());
    this.button(actions, "同步当前笔记", () => this.plugin.syncActive());

    const report = this.plugin.lastReport;
    if (!report) {
      root.createEl("p", {
        cls: "wiki-sync-muted",
        text: "还没有同步。只有写了 wikiPath 的笔记会被推送。",
      });
      return;
    }

    const summary = root.createDiv({ cls: "wiki-sync-summary" });
    summary.createEl("div", {
      text: `新建 ${report.created}，更新 ${report.updated}，未变化 ${report.skipped}，失败 ${report.failed}`,
    });
    summary.createEl("div", {
      cls: "wiki-sync-muted",
      text: `未设置 wikiPath 而跳过 ${report.ignored} 篇 · ${new Date(report.finishedAt).toLocaleString()}`,
    });

    const list = root.createEl("ul", { cls: "wiki-sync-log" });
    for (const item of report.items) {
      const line = list.createEl("li", {
        cls: item.action === "error" ? "wiki-sync-error" : undefined,
        text: `${label(item.action)} ${item.localPath}${item.message ? `：${item.message}` : ""}`,
      });
      if (item.action === "skipped") line.addClass("wiki-sync-muted");
    }
  }

  private button(parent: HTMLElement, text: string, onClick: () => void): void {
    new ButtonComponent(parent).setButtonText(text).onClick(onClick);
  }
}

function label(action: SyncReport["items"][number]["action"]): string {
  switch (action) {
    case "created":
      return "新建";
    case "updated":
      return "更新";
    case "skipped":
      return "跳过";
    case "error":
      return "失败";
  }
}
