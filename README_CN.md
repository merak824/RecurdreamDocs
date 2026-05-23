# Recurdream 文档维护说明

这个目录是 `docs.recurdream.com` 的文档源码。文档内容使用 Markdown 编写，线上页面由 VitePress 构建生成。

图片、截图和代码段的维护方式见 `EDITOR_GUIDE_CN.md`。

## 修改文档

常用文件位置：

| 页面 | 文件 |
| --- | --- |
| 使用手册首页 | `index.md` |
| 快速开始 | `guide/getting-started.md` |
| 创建 API Key | `guide/api-key.md` |
| API 端点与模型 | `guide/endpoints.md` |
| 客户端接入总览 | `clients/index.md` |
| Tavo | `clients/tavo.md` |
| 充值说明 | `billing/index.md` |
| 余额与用量 | `billing/usage.md` |
| 常见问题 | `faq/index.md` |

本地预览：

```powershell
cd C:\Users\石在骞\Documents\RecurdreamDocs
npm run dev
```

打开：

```text
http://127.0.0.1:5174/
```

## 新增页面

例如新增 `billing/plans.md`：

```md
# 套餐说明

这里写套餐内容。
```

如果要显示在左侧菜单，修改 `.vitepress/config.mts` 的 `sidebar`：

```ts
{ text: '套餐说明', link: '/billing/plans' }
```

## 添加截图和图片

把图片放到 `public/images/` 目录，例如：

```text
public/images/clients/tavo-settings.png
public/images/billing/recharge-page.png
```

在 Markdown 里这样引用：

```md
![Tavo 设置页面](/images/clients/tavo-settings.png)
```

也可以给图片加说明文字：

```md
<figure>
  <img src="/images/clients/tavo-settings.png" alt="Tavo 设置页面" />
  <figcaption>Tavo 中填写 Base URL 和 API Key 的位置</figcaption>
</figure>
```

图片命名建议使用英文、小写和短横线，例如 `api-key-create.png`，不要使用空格。

## 添加代码段

使用三个反引号包住代码，并在第一行写语言名：

````md
```bash
curl https://api.recurdream.com/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```
````

常用语言名：

| 场景 | 写法 |
| --- | --- |
| 命令行 | `bash` |
| Windows PowerShell | `powershell` |
| JSON | `json` |
| JavaScript/TypeScript | `js` / `ts` |
| 普通文本 | `text` |

如果要强调某一行，可以这样写：

````md
```json{2}
{
  "base_url": "https://api.recurdream.com/v1",
  "api_key": "YOUR_API_KEY"
}
```
````

## 发布到服务器

当前项目还没准备正式上线，所以部署流程先设置为“手动触发”，不会因为提交代码自动发布。

1. 把文档内容提交到 GitHub 仓库。
2. 在 GitHub 仓库的 `Settings -> Secrets and variables -> Actions` 添加下面 Secrets。
3. 需要发布时，到 GitHub Actions 里手动运行 `Deploy Docs`。

需要配置的 Secrets：

| Secret | 示例 | 说明 |
| --- | --- | --- |
| `DOCS_HOST` | `47.85.29.80` | 服务器 IP |
| `DOCS_PORT` | `22` | SSH 端口，可不填，默认 22 |
| `DOCS_USER` | `root` 或 `deploy` | SSH 用户 |
| `DOCS_SSH_KEY` | 私钥内容 | 用于连接服务器的 SSH 私钥 |
| `DOCS_TARGET` | `/var/www/recurdream-docs` | 服务器上的文档目录 |
| `DOCS_KNOWN_HOSTS` | 可选 | 服务器 known_hosts 记录，不填会自动 ssh-keyscan |

服务器首次准备目录：

```bash
sudo mkdir -p /var/www/recurdream-docs
sudo chown -R "$USER:$USER" /var/www/recurdream-docs
```

Nginx 可使用 `deploy/nginx-recurdream-docs.conf`，Caddy 可使用 `deploy/Caddyfile.recurdream-docs.example`。

## 手动构建检查

每次发布前也可以本地检查：

```powershell
cd C:\Users\石在骞\Documents\RecurdreamDocs
npm run build
```

构建产物在：

```text
.vitepress/dist
```
