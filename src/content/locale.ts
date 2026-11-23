export interface SiteLocales {
  primary?: string;
  active?: string[];
  forcePrefix?: boolean;
}

export interface ResolvedLocale {
  locale: string;
  remappedFrom?: string;
}

export function resolveWikiLocale(requested: string, locales: SiteLocales | undefined): ResolvedLocale {
  const active = unique(locales?.active ?? []);
  const primary = locales?.primary?.trim() ?? "";
  const wanted = requested.trim();

  if (active.length === 0) {
    return { locale: wanted || primary || "zh" };
  }

  if (!wanted) {
    return { locale: matchCode(primary, active) ?? (primary || active[0]) };
  }

  const exact = matchCode(wanted, active);
  if (exact) {
    return exact === wanted ? { locale: exact } : { locale: exact, remappedFrom: wanted };
  }

  const language = wanted.split("-")[0].toLowerCase();
  const matches = active.filter((code) => code.split("-")[0].toLowerCase() === language);
  if (matches.length === 1) {
    return { locale: matches[0], remappedFrom: wanted };
  }
  if (matches.length > 1) {
    throw new Error(
      `语言 ${wanted} 对应多个已启用语言（${matches.join("、")}）。请把 wikiLocale 写成其中之一，否则页面不会出现在网站上。`,
    );
  }
  throw new Error(
    `站点启用的语言是 ${active.join("、")}，当前写的是 ${wanted}。Wiki.js 只展示已启用语言的页面，所以这次没有同步。请把插件默认语言或笔记的 wikiLocale 改成 ${primary || active[0]}。`,
  );
}

export function publicPagePath(wikiPath: string, locale: string, locales: SiteLocales | undefined): string {
  const primary = locales?.primary?.trim() ?? "";
  const prefixed = Boolean(locales?.forcePrefix) || (primary !== "" && locale !== primary);
  if (wikiPath === "home" || wikiPath === "") {
    return prefixed ? `/${locale}` : "/";
  }
  return prefixed ? `/${locale}/${wikiPath}` : `/${wikiPath}`;
}

function matchCode(wanted: string, active: string[]): string | undefined {
  if (!wanted) return undefined;
  return active.find((code) => code.toLowerCase() === wanted.toLowerCase());
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
