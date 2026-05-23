# Recurdream 文档编辑指南

这个文件给文档维护者看，不会出现在客户文档站里。

## 修改图片或截图

图片统一放在 `public/images/` 目录。

示例：

```text
public/images/clients/tavo-settings.png
public/images/billing/recharge-page.png
```

在文档里使用图片组件：

```md
<DocImage
  src="/images/clients/tavo-settings.png"
  alt="Tavo 设置页面"
  caption="Tavo 中填写 Base URL 和 API Key 的位置。"
/>
```

常见修改方式：

| 想做什么 | 怎么做 |
| --- | --- |
| 替换截图 | 上传同名图片覆盖原文件 |
| 换成新截图 | 上传新图片，然后改 `src` |
| 修改图片说明 | 改 `caption` |
| 修改无障碍描述 | 改 `alt` |

建议图片命名使用英文小写和短横线，例如 `api-key-create.png`，不要使用空格。

## 修改代码段

短代码可以直接写在 Markdown 里：

````md
```bash
curl https://api.recurdream.com/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```
````

如果代码段经常需要改，建议放到 `snippets/` 目录，再从文档里引用。

示例代码文件：

```text
snippets/clients/tavo-config.json
snippets/clients/tavo-models.sh
```

文档里这样引用：

```md
<<< @/snippets/clients/tavo-config.json

<<< @/snippets/clients/tavo-models.sh
```

以后要修改代码示例，只需要编辑 `snippets/clients/tavo-config.json` 或 `snippets/clients/tavo-models.sh`，对应文档页面会在重新构建后自动更新。

## GitHub 网页编辑路径

常用位置：

| 内容 | GitHub 里改哪里 |
| --- | --- |
| 文档正文 | 对应的 `.md` 文件 |
| 图片/截图 | `public/images/` |
| 可复用代码段 | `snippets/` |
| 左侧菜单 | `.vitepress/config.mts` |

## 修改前台导航

前台顶部导航和左侧导航由 `navigation.json` 控制。更推荐使用文档后台的“导航管理”维护：

- 添加一级导航：创建新的分组，例如“开始使用”
- 添加二级导航：给分组添加页面项，例如“快速开始”
- 拖拽一级导航：调整分组顺序
- 拖拽二级导航：调整页面顺序，也可以拖到其他一级导航下面

保存后，前台会按 `navigation.json` 的顺序生成导航。

修改完成后，本地可以运行：

```powershell
npm run build
```

构建通过，说明 Markdown、图片路径和代码引用没有明显错误。
