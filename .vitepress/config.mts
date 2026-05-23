import { defineConfig } from 'vitepress'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type DocsNavItem = {
  text: string
  link: string
}

type DocsNavGroup = {
  text: string
  items: DocsNavItem[]
}

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const docsNavigation = JSON.parse(
  readFileSync(resolve(rootDir, 'navigation.json'), 'utf8')
) as DocsNavGroup[]

const topNavigation = docsNavigation
  .map((group) => ({
    text: group.text,
    link: group.items[0]?.link || '/'
  }))
  .filter((item) => item.link)

export default defineConfig({
  lang: 'zh-CN',
  title: 'Recurdream 文档',
  description: 'Recurdream AI API 接入与使用指南',
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ['README_CN.md', 'EDITOR_GUIDE_CN.md', 'admin/**', 'snippets/**'],
  markdown: {
    lineNumbers: true
  },
  head: [
    ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
    ['meta', { name: 'theme-color', content: '#8b5cf6' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Recurdream 文档' }],
    ['meta', { property: 'og:description', content: '从注册、充值、创建 API Key 到接入 Tavo、Cherry Studio、ChatBox 等客户端。' }]
  ],
  themeConfig: {
    logo: '/favicon.svg',
    siteTitle: 'Recurdream Docs',
    nav: topNavigation,
    sidebar: docsNavigation,
    outline: {
      level: [2, 3],
      label: '本页目录'
    },
    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: '搜索文档',
            buttonAriaLabel: '搜索文档'
          },
          modal: {
            noResultsText: '没有找到相关内容',
            resetButtonTitle: '清除搜索',
            displayDetails: '显示详情',
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭'
            }
          }
        }
      }
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/merak824/RecurdreamDocs' }
    ],
    footer: {
      message: 'Recurdream 官方使用文档',
      copyright: 'Copyright © 2026 Recurdream'
    },
    editLink: {
      pattern: 'https://github.com/merak824/RecurdreamDocs/edit/main/:path',
      text: '在 GitHub 上编辑此页'
    },
    lastUpdated: {
      text: '最后更新',
      formatOptions: {
        dateStyle: 'medium',
        timeStyle: 'short'
      }
    },
    docFooter: {
      prev: '上一页',
      next: '下一页'
    },
    darkModeSwitchLabel: '切换深浅色',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '回到顶部',
    langMenuLabel: '切换语言'
  }
})
