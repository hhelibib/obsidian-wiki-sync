# Obsidian Wiki Sync

把 Obsidian 笔记推送到自建 [Wiki.js 3](https://js.wiki/) 站点。只上传写了 `wikiPath` 的 Markdown 笔记，方向是本地到 Wiki，不会从 Wiki 拉回，也不会删除远端页面。

需要 Obsidian 1.5.0 及以上。接口是 Wiki.js 3 的 REST（`/_api`），不是 2.x 的 GraphQL。

## 安装

把下面三个文件拷到库目录 `.obsidian/plugins/obsidian-wiki-sync/`：

- `main.js`
- `manifest.json`
- `styles.css`

重启 Obsidian，在「设置 → 第三方插件」里启用 **Obsidian Wiki Sync**。

从源码构建：

```bash
npm install
npm run build
```

## 配置

左侧边栏的上传图标，或命令「打开 Wiki.js 同步面板」，可以打开同步面板。插件设置页里有同样的选项。

| 选项 | 说明 |
| --- | --- |
| Wiki.js 地址 | 站点根地址，例如 `https://book.selflove.top`，不要带 `/_api` |
| 个人访问令牌 | 在 Wiki.js 个人资料的 Access Tokens 里新建，不要用管理后台的 API Key。只保存在本机插件数据里 |
| 当前站点 | 从实例拉取站点列表后选择同步目标。点「刷新」重新拉取 |
| 默认语言 | 默认 `zh`。笔记可用 `wikiLocale` 覆盖 |
| 默认发布状态 | `published` 或 `draft` |
| 附件目录 | 图片和附件上传到这个目录，并保留 Vault 里的相对文件夹。默认 `attachments` |
| 排队服务器渲染 | 保存后请求 Wiki.js 用官方 Markdown 管道重渲染 |
| 测试连接 | 校验 Token，并在还没选站点时解析当前域名对应的站点 |

列出站点需要 Token 具备 `manage:sites`、`access:admin` 或 `manage:system` 之一。没有这些权限时，列表拉不下来，可以手动填写站点 UUID。留空时，同步会使用当前域名对应的站点。

管理后台「API Access」里创建的 API Key 只能代表用户组，Wiki.js 会拒绝用它保存页面。同步要用登录账号自己的个人访问令牌，至少勾选：

- `pages:write`（已包含读取页面）
- `assets:write`

## 笔记

只有 frontmatter 里写了 `wikiPath` 的笔记会被推送。路径会转成小写，空格和下划线会变成连字符，首尾斜杠会被去掉。长度不能超过 255。

```yaml
---
title: Vue 学习笔记
wikiPath: technology/frontend/vue
wikiTitle: Vue 3 学习笔记
wikiDescription: 可选摘要
wikiLocale: zh
wikiPublishState: published
wikiTags:
  - Vue
  - 前端
---
```

| 字段 | 作用 |
| --- | --- |
| `wikiPath` | Wiki 页面路径。必填，否则这篇笔记会被跳过 |
| `wikiTitle` | 页面标题。未写时用 `title`，再退回文件名 |
| `wikiDescription` | 摘要。未写时用 `description` |
| `wikiLocale` | 语言。未写时用插件里的默认语言 |
| `wikiPublishState` | `draft`、`published` 或 `scheduled` |
| `wikiPublished` | `true` / `false`，在没写 `wikiPublishState` 时分别表示发布和草稿 |
| `wikiTags` | 标签。未写时用 `tags`。含字母、数字、空格、`.`、`_`、`-` 以外字符的标签会被忽略，并在同步结果里提示 |

正文里的 frontmatter 不会上传。

## 同步

命令：

- **同步全部带 wikiPath 的笔记**
- **同步当前笔记到 Wiki.js**

同一篇笔记、同一个站点、内容没变时会跳过。切换站点后，记录按站点分开，不会拿上一站的页面 ID 去更新新站点。

已存在的页面按路径和语言查找后更新；找不到则新建。附件按内容哈希跳过重复上传，单文件超过 10 MB 不会上传。

`[[笔记]]` 会转成目标笔记的 Wiki 链接。目标笔记没有 `wikiPath` 时保持原样，并在结果里提示。图片和本地文件链接会先上传，再改成 Wiki 上的地址。

同步面板会显示新建、更新、未变化、失败，以及因为没写 `wikiPath` 而跳过的篇数。
