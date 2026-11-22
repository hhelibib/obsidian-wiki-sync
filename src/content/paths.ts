const PUBLISH_STATES = ["draft", "published", "scheduled"] as const;
export type PublishState = (typeof PUBLISH_STATES)[number];

export function normalizeWikiPath(input: string): string {
  return input
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\s+/g, "-")
    .replace(/_+/g, "-")
    .replace(/\/{2,}/g, "/")
    .toLowerCase();
}

export function sanitizeFolderPath(input: string): string {
  return input
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\s+/g, "-")
    .replace(/\/{2,}/g, "/");
}

export function publicHref(locale: string, folderPath: string, fileName: string, heading?: string): string {
  const segments = [locale, ...folderPath.split("/"), fileName]
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment));
  let href = `/${segments.join("/")}`;
  if (heading?.trim()) {
    const slug = heading.trim().toLowerCase().replace(/\s+/g, "-");
    href += `#${encodeURIComponent(slug)}`;
  }
  return href;
}

export function pageHref(locale: string, wikiPath: string, heading?: string): string {
  const segments = [locale, ...wikiPath.split("/")].filter((segment) => segment.length > 0).map((segment) => encodeURIComponent(segment));
  let href = `/${segments.join("/")}`;
  if (heading?.trim()) {
    const slug = heading.trim().toLowerCase().replace(/\s+/g, "-");
    href += `#${encodeURIComponent(slug)}`;
  }
  return href;
}

export function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

export function readPublishState(value: unknown, publishedFlag: unknown, fallback: PublishState): PublishState {
  const explicit = asString(value);
  if (explicit && (PUBLISH_STATES as readonly string[]).includes(explicit)) {
    return explicit as PublishState;
  }
  if (typeof publishedFlag === "boolean") {
    return publishedFlag ? "published" : "draft";
  }
  return fallback;
}

const TAG_PATTERN = /^[\p{L}\p{M}\p{N} ._-]+$/u;

export function readTags(value: unknown): { tags: string[]; rejected: string[] } | undefined {
  if (value == null) return undefined;
  const raw = Array.isArray(value) ? value : [value];
  const tags: string[] = [];
  const rejected: string[] = [];
  for (const item of raw) {
    const tag = asString(item);
    if (!tag) continue;
    if (!TAG_PATTERN.test(tag)) {
      rejected.push(tag);
      continue;
    }
    tags.push(tag);
  }
  return { tags, rejected };
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

export function mimeType(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const table: Record<string, string> = {
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
    zip: "application/zip",
  };
  return table[extension] ?? "application/octet-stream";
}

export async function sha256Text(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return hex(digest);
}

export async function sha256Bytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return hex(digest);
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
