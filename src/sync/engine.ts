import { parseYaml, type App, type FrontMatterCache, type TFile } from "obsidian";
import { marked } from "marked";
import { WikiHttpError, WikiJsClient, type PageWrite } from "../api/wiki-client";
import { isLocalHref, stripHeading, transformMarkdown, type LinkResolution } from "../content/markdown";
import {
  asString,
  mimeType,
  normalizeWikiPath,
  pageHref,
  publicHref,
  readPublishState,
  readTags,
  sanitizeFolderPath,
  sha256Bytes,
  sha256Text,
  truncate,
} from "../content/paths";
import type { AssetRecord, PageRecord, SyncItemResult, SyncReport, WikiSyncSettings } from "../types";

const FORMAT_VERSION = 2;
const MAX_ASSET_BYTES = 10 * 1024 * 1024;

marked.use({ gfm: true, breaks: false });

export interface SyncStore {
  records: Record<string, PageRecord>;
  assets: Record<string, AssetRecord>;
  persist(): Promise<void>;
}

export async function syncFiles(
  app: App,
  settings: WikiSyncSettings,
  store: SyncStore,
  files: TFile[],
): Promise<SyncReport> {
  const startedAt = Date.now();
  const client = new WikiJsClient(settings.baseUrl, settings.apiToken);
  const siteId = await resolveSiteId(client, settings);
  const items: SyncItemResult[] = [];
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

  const report: SyncReport = {
    startedAt,
    finishedAt: Date.now(),
    created: items.filter((item) => item.action === "created").length,
    updated: items.filter((item) => item.action === "updated").length,
    skipped: items.filter((item) => item.action === "skipped").length,
    ignored,
    failed: items.filter((item) => item.action === "error").length,
    items,
  };
  return report;
}

async function resolveSiteId(client: WikiJsClient, settings: WikiSyncSettings): Promise<string> {
  if (settings.siteId.trim()) return settings.siteId.trim();
  const site = await client.getSite("current");
  settings.siteId = site.id;
  return site.id;
}

async function syncOne(
  app: App,
  client: WikiJsClient,
  settings: WikiSyncSettings,
  store: SyncStore,
  siteId: string,
  file: TFile,
  frontmatter: FrontMatterCache | undefined,
  wikiPath: string,
): Promise<SyncItemResult> {
  try {
    if (wikiPath.length > 255) {
      throw new Error("wikiPath 超过 255 个字符");
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
        assetHashes,
      }),
    );

    const existing = store.records[file.path];
    if (
      existing?.siteId === siteId &&
      existing.pageId &&
      existing.contentHash === contentHash &&
      existing.wikiPath === wikiPath &&
      existing.status === "synced"
    ) {
      return { localPath: file.path, wikiPath, action: "skipped", message: "内容没有变化" };
    }

    const warnings: string[] = [];
    if (tags?.rejected.length) {
      warnings.push(`已忽略不符合 Wiki.js 规则的标签：${tags.rejected.join("、")}`);
    }

    const transformed = await transformMarkdown(
      body,
      (target, heading, embed) => resolveWikiLink(app, client, settings, store, siteId, file, locale, target, heading, embed),
      (href, embed) => resolveMarkdownLink(app, client, settings, store, siteId, file, locale, href, embed),
    );
    warnings.push(...transformed.warnings);

    const html = await marked.parse(transformed.markdown);
    const page: PageWrite = {
      path: wikiPath,
      title,
      editor: "markdown",
      content: transformed.markdown,
      render: typeof html === "string" ? html : String(html),
      description,
      locale,
      publishState,
    };
    if (tags) page.tags = tags.tags;

    const saved = await savePage(client, siteId, existing?.pageId, page, wikiPath, locale);
    if (settings.queueServerRender) {
      try {
        await client.queueRender(siteId, saved.page.id);
      } catch (error) {
        if (!(error instanceof WikiHttpError) || error.status !== 503) {
          warnings.push(`服务器重新渲染未排队：${errorMessage(error)}`);
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
      status: "synced",
    };
    await store.persist();

    return {
      localPath: file.path,
      wikiPath: saved.page.path || wikiPath,
      action: saved.created ? "created" : "updated",
      message: warnings.length ? warnings.join("；") : undefined,
    };
  } catch (error) {
    const message = errorMessage(error);
    const previous = store.records[file.path];
    store.records[file.path] = {
      localPath: file.path,
      siteId,
      pageId: previous?.siteId === siteId ? previous.pageId : undefined,
      wikiPath,
      contentHash: previous?.contentHash ?? "",
      lastSyncTime: previous?.lastSyncTime ?? 0,
      status: "error",
      lastError: message,
    };
    await store.persist();
    return { localPath: file.path, wikiPath, action: "error", message };
  }
}

async function savePage(
  client: WikiJsClient,
  siteId: string,
  pageId: string | undefined,
  page: PageWrite,
  wikiPath: string,
  locale: string,
): Promise<{ page: { id: string; path: string }; created: boolean }> {
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
    if (!(error instanceof WikiHttpError) || (error.status !== 409 && error.status !== 400)) throw error;
    const again = await client.findPage(siteId, wikiPath, locale);
    if (!again) throw error;
    return { page: await client.updatePage(siteId, again.id, page), created: false };
  }
}

async function resolveWikiLink(
  app: App,
  client: WikiJsClient,
  settings: WikiSyncSettings,
  store: SyncStore,
  siteId: string,
  source: TFile,
  locale: string,
  target: string,
  heading: string | undefined,
  embed: boolean,
): Promise<LinkResolution> {
  const dest = app.metadataCache.getFirstLinkpathDest(target, source.path);
  if (!dest) {
    return { warning: `${source.path}：找不到 [[${target}]]` };
  }
  if (dest.extension === "md") {
    const link = await pageLink(app, locale, dest, heading);
    if (embed && link.href) {
      link.warning = link.warning
        ? `${link.warning}；未展开嵌入 ![[${target}]]`
        : `${source.path}：未展开嵌入 ![[${target}]]，已改成页面链接`;
    }
    return link;
  }
  return uploadLinkedFile(app, client, settings, store, siteId, source, locale, dest, embed);
}

async function resolveMarkdownLink(
  app: App,
  client: WikiJsClient,
  settings: WikiSyncSettings,
  store: SyncStore,
  siteId: string,
  source: TFile,
  locale: string,
  href: string,
  embed: boolean,
): Promise<LinkResolution | undefined> {
  if (!isLocalHref(href)) return undefined;
  const decoded = stripHeading(safeDecode(href));
  const dest = app.metadataCache.getFirstLinkpathDest(decoded.path, source.path);
  if (!dest) {
    return { warning: `${source.path}：找不到本地链接 ${href}` };
  }
  if (dest.extension === "md") return pageLink(app, locale, dest, decoded.heading);
  return uploadLinkedFile(app, client, settings, store, siteId, source, locale, dest, embed);
}

async function pageLink(app: App, locale: string, dest: TFile, heading?: string): Promise<LinkResolution> {
  const frontmatter = app.metadataCache.getFileCache(dest)?.frontmatter;
  const wikiPath = normalizeWikiPath(asString(frontmatter?.wikiPath) ?? "");
  if (!wikiPath) {
    return { warning: `${dest.path} 没有 wikiPath，内部链接保持原样` };
  }
  const targetLocale = asString(frontmatter?.wikiLocale) || locale;
  return { href: pageHref(targetLocale, wikiPath, heading), label: asString(frontmatter?.wikiTitle) || dest.basename };
}

async function uploadLinkedFile(
  app: App,
  client: WikiJsClient,
  settings: WikiSyncSettings,
  store: SyncStore,
  siteId: string,
  source: TFile,
  locale: string,
  dest: TFile,
  embed: boolean,
): Promise<LinkResolution> {
  if (dest.stat.size > MAX_ASSET_BYTES) {
    return { warning: `${source.path}：${dest.name} 超过 10 MB，未上传` };
  }

  const bytes = await app.vault.readBinary(dest);
  const hash = await sha256Bytes(bytes);
  const cached = store.assets[dest.path];
  if (cached?.siteId === siteId && cached.hash === hash) {
    return { href: publicHref(locale, cached.folderPath, cached.fileName), label: dest.basename };
  }

  const folderPath = sanitizeFolderPath(
    [settings.assetFolder.trim() || "attachments", dest.parent?.path === "/" ? "" : dest.parent?.path ?? ""]
      .filter(Boolean)
      .join("/"),
  );
  const asset = await client.uploadAsset(siteId, dest.name, bytes, mimeType(dest.name), folderPath, locale);
  store.assets[dest.path] = {
    localPath: dest.path,
    siteId,
    assetId: asset.id,
    folderPath: asset.folderPath ?? folderPath,
    fileName: asset.fileName,
    hash,
    lastUploadTime: Date.now(),
  };
  await store.persist();
  return {
    href: publicHref(locale, asset.folderPath ?? folderPath, asset.fileName),
    label: embed ? "" : dest.basename,
  };
}

async function hashReferencedAssets(app: App, source: TFile): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  const cache = app.metadataCache.getFileCache(source);
  const links = [...(cache?.embeds ?? []), ...(cache?.links ?? [])];
  for (const link of links) {
    const dest = app.metadataCache.getFirstLinkpathDest(link.link.split("#")[0], source.path);
    if (!dest || dest.extension === "md" || dest.stat.size > MAX_ASSET_BYTES) continue;
    if (hashes[dest.path]) continue;
    hashes[dest.path] = await sha256Bytes(await app.vault.readBinary(dest));
  }
  return hashes;
}

function stripFrontmatter(source: string, app: App, file: TFile): string {
  const position = app.metadataCache.getFileCache(file)?.frontmatterPosition;
  if (position) return source.slice(position.end.offset).replace(/^\r?\n/, "");
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

async function readFrontmatter(app: App, file: TFile): Promise<FrontMatterCache | undefined> {
  const cached = app.metadataCache.getFileCache(file)?.frontmatter;
  if (cached) return cached;
  const source = await app.vault.read(file);
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return undefined;
  try {
    const parsed = parseYaml(match[1]);
    if (parsed && typeof parsed === "object") return parsed as FrontMatterCache;
  } catch {
    return undefined;
  }
  return undefined;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
