export interface WikiSyncSettings {
  baseUrl: string;
  apiToken: string;
  siteId: string;
  locale: string;
  publishState: "published" | "draft";
  assetFolder: string;
  queueServerRender: boolean;
}

export const DEFAULT_SETTINGS: WikiSyncSettings = {
  baseUrl: "https://book.selflove.top",
  apiToken: "",
  siteId: "",
  locale: "zh",
  publishState: "published",
  assetFolder: "attachments",
  queueServerRender: true,
};

export interface PageRecord {
  localPath: string;
  siteId?: string;
  pageId?: string;
  wikiPath: string;
  contentHash: string;
  lastSyncTime: number;
  status: "synced" | "error";
  lastError?: string;
}

export interface AssetRecord {
  localPath: string;
  siteId?: string;
  assetId: string;
  folderPath: string;
  fileName: string;
  hash: string;
  lastUploadTime: number;
}

export interface StoredData {
  settings: WikiSyncSettings;
  records: Record<string, PageRecord>;
  assets: Record<string, AssetRecord>;
}

export type SyncAction = "created" | "updated" | "skipped" | "error";

export interface SyncItemResult {
  localPath: string;
  wikiPath?: string;
  action: SyncAction;
  message?: string;
}

export interface SyncReport {
  startedAt: number;
  finishedAt: number;
  created: number;
  updated: number;
  skipped: number;
  ignored: number;
  failed: number;
  items: SyncItemResult[];
}
