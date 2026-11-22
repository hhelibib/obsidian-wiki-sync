import { transformMarkdown } from "../src/content/markdown.ts";
import { normalizeWikiPath, pageHref } from "../src/content/paths.ts";

const source = [
  "See [[Vue Notes|Vue]] and ![[shot.png]]",
  "",
  "```js",
  "[[keep]]",
  "```",
  "",
  "![pic](images/a.png)",
  "[web](https://example.com)",
  "`[[inline]]`",
].join("\n");

const result = await transformMarkdown(
  source,
  async (target) => ({ href: pageHref("zh", normalizeWikiPath(target)) }),
  async (href) => (href.startsWith("http") ? undefined : { href: `/zh/attachments/${href}` }),
);

if (!result.markdown.includes("```js\n[[keep]]\n```")) {
  throw new Error(`fence was rewritten:\n${result.markdown}`);
}
if (!result.markdown.includes("`[[inline]]`")) {
  throw new Error(`inline code was rewritten:\n${result.markdown}`);
}
if (!result.markdown.includes("[Vue](/zh/vue-notes)")) {
  throw new Error(`wikilink missing:\n${result.markdown}`);
}
if (!result.markdown.includes("[web](https://example.com)")) {
  throw new Error(`external link changed:\n${result.markdown}`);
}
if (normalizeWikiPath(" Tech/Vue_Notes ") !== "tech/vue-notes") {
  throw new Error("path normalization failed");
}

console.log("ok");
