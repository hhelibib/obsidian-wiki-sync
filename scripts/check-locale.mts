import { publicPagePath, resolveWikiLocale } from "../src/content/locale.ts";

const site = { primary: "zh-CN", active: ["zh-CN"], forcePrefix: false };
const remapped = resolveWikiLocale("zh", site);
if (remapped.locale !== "zh-CN" || remapped.remappedFrom !== "zh") {
  throw new Error(`remap zh failed: ${JSON.stringify(remapped)}`);
}
const empty = resolveWikiLocale("", site);
if (empty.locale !== "zh-CN" || empty.remappedFrom) {
  throw new Error(`empty locale failed: ${JSON.stringify(empty)}`);
}
const exact = resolveWikiLocale("zh-cn", site);
if (exact.locale !== "zh-CN" || exact.remappedFrom !== "zh-cn") {
  throw new Error(`case remap failed: ${JSON.stringify(exact)}`);
}
if (publicPagePath("home", "zh-CN", site) !== "/") throw new Error("home path");
if (publicPagePath("guide/start", "zh-CN", site) !== "/guide/start") throw new Error("page path");

assertThrows(() => resolveWikiLocale("en", site), "zh-CN");
assertThrows(() => resolveWikiLocale("zh", { primary: "zh-CN", active: ["zh-CN", "zh-TW"] }), "zh-TW");

console.log("locale checks ok");

function assertThrows(run: () => void, snippet: string): void {
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(snippet)) throw new Error(message);
    return;
  }
  throw new Error(`expected failure containing ${snippet}`);
}
