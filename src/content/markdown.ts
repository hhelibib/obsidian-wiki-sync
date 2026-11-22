export interface LinkResolution {
  href?: string;
  label?: string;
  warning?: string;
}

export interface MarkdownTransform {
  markdown: string;
  warnings: string[];
}

type Piece =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "wiki"; embed: boolean; raw: string; target: string; heading?: string; label?: string }
  | { kind: "mdlink"; embed: boolean; label: string; href: string; title?: string };

const FENCE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;

export async function transformMarkdown(
  source: string,
  resolveWiki: (target: string, heading: string | undefined, embed: boolean) => Promise<LinkResolution>,
  resolveLocal: (href: string, embed: boolean) => Promise<LinkResolution | undefined>,
): Promise<MarkdownTransform> {
  const warnings: string[] = [];
  const output: string[] = [];
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

async function transformProse(
  source: string,
  resolveWiki: (target: string, heading: string | undefined, embed: boolean) => Promise<LinkResolution>,
  resolveLocal: (href: string, embed: boolean) => Promise<LinkResolution | undefined>,
  warnings: string[],
): Promise<string> {
  const pieces = tokenizeProse(source);
  let output = "";
  for (const piece of pieces) {
    if (piece.kind === "text" || piece.kind === "code") {
      output += piece.text;
      continue;
    }
    if (piece.kind === "wiki") {
      const resolved = await resolveWiki(piece.target, piece.heading, piece.embed);
      output += renderResolved(piece.embed, piece.label || piece.target, resolved, piece.raw, warnings);
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
      warnings,
    );
  }
  return output;
}

function renderResolved(
  embed: boolean,
  label: string,
  resolved: LinkResolution,
  fallback: string,
  warnings: string[],
): string {
  if (resolved.warning) warnings.push(resolved.warning);
  if (!resolved.href) return fallback;
  const text = escapeLinkLabel(resolved.label || label);
  const href = resolved.href;
  return embed ? `![${text}](${href})` : `[${text}](${href})`;
}

function escapeLinkLabel(label: string): string {
  return label.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function tokenizeProse(source: string): Piece[] {
  const pieces: Piece[] = [];
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

function readWikiLink(source: string, index: number): { piece: Piece; next: number } | undefined {
  const embed = source.startsWith("![[", index);
  const start = embed ? index : source.startsWith("[[", index) ? index : -1;
  if (start === -1) return undefined;
  const contentStart = start + (embed ? 3 : 2);
  const end = source.indexOf("]]", contentStart);
  if (end === -1) return undefined;

  const raw = source.slice(start, end + 2);
  const inner = source.slice(contentStart, end);
  const aliasAt = inner.indexOf("|");
  const targetPart = aliasAt === -1 ? inner : inner.slice(0, aliasAt);
  const label = aliasAt === -1 ? undefined : inner.slice(aliasAt + 1);
  const headingAt = targetPart.indexOf("#");
  const target = (headingAt === -1 ? targetPart : targetPart.slice(0, headingAt)).trim();
  const heading = headingAt === -1 ? undefined : targetPart.slice(headingAt + 1).trim();
  if (!target) return undefined;

  return {
    piece: { kind: "wiki", embed, raw, target, heading, label },
    next: end + 2,
  };
}

function readMarkdownLink(source: string, index: number): { piece: Piece; next: number } | undefined {
  const embed = source.startsWith("![", index);
  if (!embed && source[index] !== "[") return undefined;
  const labelStart = index + (embed ? 2 : 1);
  const labelEnd = source.indexOf("]", labelStart);
  if (labelEnd === -1 || source[labelEnd + 1] !== "(") return undefined;
  const hrefStart = labelEnd + 2;
  const hrefEnd = source.indexOf(")", hrefStart);
  if (hrefEnd === -1) return undefined;

  const label = source.slice(labelStart, labelEnd);
  let href = source.slice(hrefStart, hrefEnd).trim();
  let title: string | undefined;
  const titleMatch = href.match(/^(\S+)\s+(["'].*["'])$/);
  if (titleMatch) {
    href = titleMatch[1];
    title = titleMatch[2];
  }
  if (!isLocalHref(href)) return undefined;

  return {
    piece: { kind: "mdlink", embed, label, href, title },
    next: hrefEnd + 1,
  };
}

export function isLocalHref(href: string): boolean {
  const lower = href.toLowerCase();
  if (!href || href.startsWith("#") || href.startsWith("/")) return false;
  return !/^[a-z][a-z0-9+.-]*:/.test(lower);
}

export function stripHeading(href: string): { path: string; heading?: string } {
  const hash = href.indexOf("#");
  if (hash === -1) return { path: href };
  return { path: href.slice(0, hash), heading: decodeURIComponent(href.slice(hash + 1)) };
}
