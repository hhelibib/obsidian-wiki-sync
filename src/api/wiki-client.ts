import { requestUrl, type RequestUrlResponse } from "obsidian";

export interface WikiSite {
  id: string;
  title?: string;
  hostname?: string;
  isEnabled?: boolean;
}

export interface WikiPage {
  id: string;
  path: string;
  title?: string;
  locale?: string;
}

export interface WikiAsset {
  id: string;
  fileName: string;
  folderPath: string;
}

export interface PageWrite {
  path: string;
  title: string;
  editor: "markdown";
  content: string;
  render: string;
  description?: string;
  locale: string;
  tags?: string[];
  publishState: "draft" | "published" | "scheduled";
}

export class WikiHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface MutationResult {
  ok?: boolean;
  message?: string;
  page?: WikiPage;
  asset?: WikiAsset;
}

interface TreeItem {
  id?: string;
  type?: string;
  folderPath?: string;
  fileName?: string;
}

interface SearchResult {
  results?: Array<{ id?: string; path?: string; locale?: string }>;
}

export class WikiJsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiToken: string,
  ) {}

  async whoami(): Promise<string> {
    const data = await this.request<Record<string, unknown>>("GET", "/_api/users/whoami");
    const name = stringField(data, "name") || stringField(data, "email") || stringField(data, "id");
    return name || "已认证";
  }

  async getSite(siteIdOrHostname: string): Promise<WikiSite> {
    const data = await this.request<WikiSite>("GET", `/_api/sites/${encodeURIComponent(siteIdOrHostname)}`);
    if (!data?.id) throw new Error("站点响应里没有 id");
    return data;
  }

  async listSites(): Promise<WikiSite[]> {
    const data = await this.request<unknown>("GET", "/_api/sites");
    if (!Array.isArray(data)) throw new Error("站点列表格式无法识别");
    return data.filter(isWikiSite).sort((a, b) => siteLabel(a).localeCompare(siteLabel(b), "zh"));
  }

  async createPage(siteId: string, page: PageWrite): Promise<WikiPage> {
    const data = await this.request<MutationResult>("POST", `/_api/sites/${siteId}/pages`, JSON.stringify(page), {
      "Content-Type": "application/json",
    });
    if (!data.page?.id) throw new Error(data.message || "创建页面没有返回 page.id");
    return data.page;
  }

  async updatePage(siteId: string, pageId: string, page: PageWrite): Promise<WikiPage> {
    const data = await this.request<MutationResult>(
      "PATCH",
      `/_api/sites/${siteId}/pages/${pageId}`,
      JSON.stringify(page),
      { "Content-Type": "application/json" },
    );
    if (!data.page?.id) throw new Error(data.message || "更新页面没有返回 page.id");
    return data.page;
  }

  async queueRender(siteId: string, pageId: string): Promise<void> {
    await this.request("POST", `/_api/sites/${siteId}/pages/${pageId}/render`);
  }

  async findPage(siteId: string, wikiPath: string, locale: string): Promise<WikiPage | null> {
    const fromTree = await this.findPageInTree(siteId, wikiPath, locale);
    if (fromTree) return fromTree;
    return this.findPageBySearch(siteId, wikiPath, locale);
  }

  async uploadAsset(
    siteId: string,
    fileName: string,
    bytes: ArrayBuffer,
    mime: string,
    folderPath: string,
    locale: string,
  ): Promise<WikiAsset> {
    const query = new URLSearchParams({ fileName, locale });
    if (folderPath) query.set("folderPath", folderPath);
    const data = await this.request<MutationResult>(
      "POST",
      `/_api/sites/${siteId}/assets?${query.toString()}`,
      bytes,
      { "Content-Type": mime },
    );
    if (!data.asset?.id || !data.asset.fileName) {
      throw new Error(data.message || "附件上传没有返回 asset");
    }
    return data.asset;
  }

  private async findPageInTree(siteId: string, wikiPath: string, locale: string): Promise<WikiPage | null> {
    const slash = wikiPath.lastIndexOf("/");
    const parent = slash === -1 ? "" : wikiPath.slice(0, slash);
    const query = new URLSearchParams({
      locale,
      types: "page",
      depth: "1",
      limit: "1000",
    });
    if (parent) query.set("parentPath", parent);

    let items: TreeItem[];
    try {
      items = await this.request<TreeItem[]>("GET", `/_api/sites/${siteId}/tree?${query.toString()}`);
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

  private async findPageBySearch(siteId: string, wikiPath: string, locale: string): Promise<WikiPage | null> {
    const query = new URLSearchParams({
      path: wikiPath,
      locales: locale,
      limit: "20",
      orderBy: "path",
      orderByDirection: "asc",
    });
    const data = await this.request<SearchResult>("GET", `/_api/sites/${siteId}/pages/search?${query.toString()}`);
    const hit = data.results?.find((item) => item.path === wikiPath && item.locale === locale && item.id);
    return hit?.id ? { id: hit.id, path: wikiPath } : null;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: string | ArrayBuffer,
    headers?: Record<string, string>,
  ): Promise<T> {
    const base = this.baseUrl.replace(/\/+$/, "");
    let response: RequestUrlResponse;
    try {
      response = await requestUrl({
        url: `${base}${path}`,
        method,
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          Accept: "application/json",
          ...headers,
        },
        body,
        throw: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`无法连接 Wiki.js：${message}`);
    }

    if (response.status >= 400) {
      throw new WikiHttpError(response.status, explainWikiError(readError(response)));
    }

    return (response.json ?? {}) as T;
  }
}

export function isSystemApiKey(token: string): boolean {
  const claims = decodeJwtPayload(token);
  return Array.isArray(claims?.grp) && typeof claims.sub !== "string";
}

export function explainWikiError(message: string): string {
  if (/API keys act for groups/i.test(message) || /use a personal access token/i.test(message)) {
    return "当前 Token 是管理后台的 API Key，不能保存页面。请用账号自己的个人访问令牌：打开 Wiki.js，进入个人资料里的 Access Tokens，新建令牌并勾选 pages:write 和 assets:write，再粘贴到插件里。";
  }
  return message;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = atob(padded);
    const data = JSON.parse(json) as unknown;
    return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function readError(response: RequestUrlResponse): string {
  const json = response.json as { message?: unknown; error?: unknown } | null;
  if (typeof json?.message === "string" && json.message.trim()) return json.message.trim();
  if (typeof json?.error === "string" && json.error.trim()) return json.error.trim();
  const text = response.text?.trim();
  if (text) return text.slice(0, 500);
  return `HTTP ${response.status}`;
}

function stringField(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isWikiSite(value: unknown): value is WikiSite {
  return typeof value === "object" && value !== null && typeof (value as WikiSite).id === "string" && (value as WikiSite).id.trim() !== "";
}

export function siteLabel(site: WikiSite): string {
  const title = site.title?.trim();
  const hostname = site.hostname?.trim();
  const name = title && hostname && title !== hostname ? `${title}（${hostname}）` : title || hostname || site.id;
  return site.isEnabled === false ? `${name}（已停用）` : name;
}
