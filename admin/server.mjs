import express from 'express'
import multer from 'multer'
import matter from 'gray-matter'
import { marked } from 'marked'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promises as fs } from 'node:fs'
import { timingSafeEqual } from 'node:crypto'
import { spawn } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
await loadEnvFile(path.join(rootDir, '.env'))

const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } })

const ignoredMarkdown = new Set(['README_CN.md', 'EDITOR_GUIDE_CN.md'])
const ignoredPageDirs = new Set(['admin', 'deploy', 'node_modules', 'public', 'snippets'])
const textExtensions = new Set(['.json', '.sh', '.bash', '.js', '.ts', '.txt', '.md', '.yaml', '.yml'])
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'])
const navigationPath = path.join(rootDir, 'navigation.json')

app.use(express.json({ limit: '2mb' }))

if (!process.env.DOCS_ADMIN_PASSWORD) {
  console.error('DOCS_ADMIN_PASSWORD is required. Create .env from .env.example before starting the admin server.')
  process.exit(1)
}

app.use((req, res, next) => {
  const password = process.env.DOCS_ADMIN_PASSWORD
  const expectedUser = process.env.DOCS_ADMIN_USER || 'admin'
  const header = req.headers.authorization || ''
  const [scheme, encoded] = header.split(' ')
  if (scheme !== 'Basic' || !encoded) return requireAuth(res)
  const decoded = Buffer.from(encoded, 'base64').toString('utf8')
  const separator = decoded.indexOf(':')
  const user = separator >= 0 ? decoded.slice(0, separator) : ''
  const pass = separator >= 0 ? decoded.slice(separator + 1) : ''
  if (safeEqual(user, expectedUser) && safeEqual(pass, password)) return next()
  return requireAuth(res)
})

app.use('/images', express.static(path.join(rootDir, 'public', 'images')))
app.use(express.static(path.join(__dirname, 'public')))

async function loadEnvFile(filePath) {
  let content = ''
  try {
    content = await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.replace(/^export\s+/, '').match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key] !== undefined) continue
    process.env[key] = stripEnvQuotes(rawValue.trim())
  }
}

function stripEnvQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left))
  const rightBuffer = Buffer.from(String(right))
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

function requireAuth(res) {
  res.setHeader('WWW-Authenticate', 'Basic realm="Recurdream Docs Admin"')
  return res.status(401).send('Authentication required')
}

function normalizeRel(input) {
  return String(input || '').replace(/\\/g, '/').replace(/^\/+/, '')
}

function safeResolve(base, rel) {
  const resolved = path.resolve(base, normalizeRel(rel))
  const normalizedBase = path.resolve(base)
  if (resolved !== normalizedBase && !resolved.startsWith(normalizedBase + path.sep)) {
    throw Object.assign(new Error('Invalid path'), { status: 400 })
  }
  return resolved
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function walkFiles(dir, predicate, base = dir) {
  if (!(await pathExists(dir))) return []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.vitepress') continue
      files.push(...await walkFiles(fullPath, predicate, base))
      continue
    }
    if (!entry.isFile()) continue
    const rel = path.relative(base, fullPath).replace(/\\/g, '/')
    if (!predicate || predicate(fullPath, rel)) files.push(rel)
  }
  return files.sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

function titleFromMarkdown(content, relPath) {
  const parsed = matter(content)
  const heading = parsed.content.match(/^#\s+(.+)$/m)?.[1]?.trim()
  return parsed.data.title || heading || relPath
}

function inferLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return {
    '.json': 'json',
    '.sh': 'bash',
    '.bash': 'bash',
    '.js': 'javascript',
    '.ts': 'typescript',
    '.md': 'markdown',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.txt': 'text'
  }[ext] || 'text'
}

function normalizeLink(link) {
  const value = String(link || '').trim()
  if (!value) return '/'
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  return value.startsWith('/') ? value : `/${value}`
}

function isEditablePagePath(relPath) {
  if (path.extname(relPath) !== '.md' || ignoredMarkdown.has(relPath)) return false
  if (relPath === 'index.md') return true
  const [firstSegment] = relPath.split('/')
  if (!firstSegment || firstSegment.startsWith('.') || ignoredPageDirs.has(firstSegment)) return false
  return true
}

function normalizeNavigation(input) {
  if (!Array.isArray(input)) {
    throw Object.assign(new Error('导航数据必须是数组'), { status: 400 })
  }

  return input.map((group) => {
    const text = String(group?.text || '').trim()
    if (!text) {
      throw Object.assign(new Error('一级导航名称不能为空'), { status: 400 })
    }

    const items = Array.isArray(group?.items) ? group.items : []
    return {
      text,
      items: items.map((item) => {
        const itemText = String(item?.text || '').trim()
        if (!itemText) {
          throw Object.assign(new Error('二级导航名称不能为空'), { status: 400 })
        }
        return {
          text: itemText,
          link: normalizeLink(item?.link)
        }
      })
    }
  })
}

app.get('/api/navigation', async (_req, res, next) => {
  try {
    const content = await fs.readFile(navigationPath, 'utf8')
    res.json({ navigation: normalizeNavigation(JSON.parse(content)) })
  } catch (error) {
    next(error)
  }
})

app.put('/api/navigation', async (req, res, next) => {
  try {
    const navigation = normalizeNavigation(req.body.navigation)
    await fs.writeFile(navigationPath, `${JSON.stringify(navigation, null, 2)}\n`, 'utf8')
    res.json({ ok: true, navigation })
  } catch (error) {
    next(error)
  }
})

app.post('/api/deploy', async (_req, res, next) => {
  try {
    if (process.env.DOCS_ALLOW_DEPLOY === 'false') {
      return res.status(403).json({ error: 'Deploy is disabled' })
    }
    const result = await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
      cwd: rootDir,
      timeout: 180000
    })
    res.json({ ok: true, output: result.output.slice(-6000) })
  } catch (error) {
    next(error)
  }
})

app.get('/api/pages', async (_req, res, next) => {
  try {
    const pages = []
    const indexPath = path.join(rootDir, 'index.md')
    if (await pathExists(indexPath)) {
      const content = await fs.readFile(indexPath, 'utf8')
      pages.push({ path: 'index.md', title: titleFromMarkdown(content, 'index.md') })
    }
    const files = await walkFiles(rootDir, (filePath, rel) => {
      if (rel === 'index.md') return false
      const firstSegment = rel.split('/')[0]
      return path.extname(filePath) === '.md' && !ignoredMarkdown.has(rel) && !ignoredPageDirs.has(firstSegment)
    }, rootDir)
    for (const file of files) {
      const relPath = normalizeRel(file)
      const content = await fs.readFile(path.join(rootDir, relPath), 'utf8')
      pages.push({ path: relPath, title: titleFromMarkdown(content, relPath) })
    }
    res.json({ pages })
  } catch (error) {
    next(error)
  }
})

app.get(/^\/api\/pages\/(.+)$/, async (req, res, next) => {
  try {
    const relPath = normalizeRel(req.params[0])
    const filePath = safeResolve(rootDir, relPath)
    if (!isEditablePagePath(relPath)) {
      return res.status(400).json({ error: 'Only public markdown pages can be edited here' })
    }
    if (!(await pathExists(filePath))) {
      const fallbackTitle = path.basename(relPath, '.md')
      return res.json({
        path: relPath,
        content: `# ${fallbackTitle}\n\n在这里编写页面内容。\n`,
        title: fallbackTitle
      })
    }
    const content = await fs.readFile(filePath, 'utf8')
    res.json({ path: relPath, content, title: titleFromMarkdown(content, relPath) })
  } catch (error) {
    next(error)
  }
})

app.put(/^\/api\/pages\/(.+)$/, async (req, res, next) => {
  try {
    const relPath = normalizeRel(req.params[0])
    const filePath = safeResolve(rootDir, relPath)
    if (!isEditablePagePath(relPath)) {
      return res.status(400).json({ error: 'Only public markdown pages can be edited here' })
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, String(req.body.content || ''), 'utf8')
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.post('/api/preview', async (req, res, next) => {
  try {
    const parsed = matter(String(req.body.content || ''))
    const content = await expandPreviewSyntax(parsed.content)
    res.json({ html: marked.parse(content) })
  } catch (error) {
    next(error)
  }
})

async function expandPreviewSyntax(content) {
  let output = content.replace(/^:::\s*(tip|warning|danger|info|details)\s*(.*)\n([\s\S]*?)^:::\s*$/gm, (_match, type, title, body) => {
    const label = title.trim() || {
      tip: 'TIP',
      warning: 'WARNING',
      danger: 'DANGER',
      info: 'INFO',
      details: 'DETAILS'
    }[type]
    return `<div class="custom-block ${type}"><p class="custom-block-title">${label}</p>\n${body.trim()}\n</div>`
  })

  output = output.replace(/<DocImage\s+([\s\S]*?)\/>/g, (_match, attrs) => {
    const src = attrs.match(/\bsrc=["']([^"']+)["']/)?.[1] || ''
    const alt = attrs.match(/\balt=["']([^"']+)["']/)?.[1] || ''
    const caption = attrs.match(/\bcaption=["']([^"']+)["']/)?.[1] || ''
    if (!src) return ''
    return `<figure><img src="${src}" alt="${alt || caption}" /><figcaption>${caption}</figcaption></figure>`
  })

  const includePattern = /^<<<\s+@\/(.+)$/gm
  const replacements = []
  for (const match of output.matchAll(includePattern)) {
    const relPath = normalizeRel(match[1])
    const filePath = safeResolve(rootDir, relPath)
    if (!(await pathExists(filePath))) continue
    const code = await fs.readFile(filePath, 'utf8')
    replacements.push({
      raw: match[0],
      value: `\`\`\`${inferLanguage(filePath)}\n${code.trimEnd()}\n\`\`\``
    })
  }
  for (const item of replacements) {
    output = output.replace(item.raw, item.value)
  }
  return output
}

app.get('/api/images', async (_req, res, next) => {
  try {
    const imageRoot = path.join(rootDir, 'public', 'images')
    const images = await walkFiles(imageRoot, (filePath) => imageExtensions.has(path.extname(filePath).toLowerCase()))
    res.json({ images: images.map((rel) => ({ path: rel, url: `/images/${rel}` })) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/images', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Missing image file' })
    const target = normalizeRel(req.body.path || req.file.originalname)
    const ext = path.extname(target).toLowerCase()
    if (!imageExtensions.has(ext)) return res.status(400).json({ error: 'Unsupported image type' })
    const imageRoot = path.join(rootDir, 'public', 'images')
    const filePath = safeResolve(imageRoot, target)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, req.file.buffer)
    res.json({ ok: true, path: target, url: `/images/${target}` })
  } catch (error) {
    next(error)
  }
})

app.get('/api/snippets', async (_req, res, next) => {
  try {
    const snippetRoot = path.join(rootDir, 'snippets')
    const snippets = await walkFiles(snippetRoot, (filePath) => textExtensions.has(path.extname(filePath).toLowerCase()))
    res.json({ snippets: snippets.map((rel) => ({ path: rel, language: inferLanguage(rel) })) })
  } catch (error) {
    next(error)
  }
})

app.get(/^\/api\/snippets\/(.+)$/, async (req, res, next) => {
  try {
    const snippetRoot = path.join(rootDir, 'snippets')
    const relPath = normalizeRel(req.params[0])
    const filePath = safeResolve(snippetRoot, relPath)
    if (!textExtensions.has(path.extname(filePath).toLowerCase())) {
      return res.status(400).json({ error: 'Unsupported snippet type' })
    }
    const content = await fs.readFile(filePath, 'utf8')
    res.json({ path: relPath, language: inferLanguage(filePath), content })
  } catch (error) {
    next(error)
  }
})

app.put(/^\/api\/snippets\/(.+)$/, async (req, res, next) => {
  try {
    const snippetRoot = path.join(rootDir, 'snippets')
    const relPath = normalizeRel(req.params[0])
    const filePath = safeResolve(snippetRoot, relPath)
    if (!textExtensions.has(path.extname(filePath).toLowerCase())) {
      return res.status(400).json({ error: 'Unsupported snippet type' })
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, String(req.body.content || ''), 'utf8')
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      windowsHide: true
    })
    let output = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      const error = new Error('Deploy timed out')
      error.status = 500
      reject(error)
    }, options.timeout || 120000)

    child.stdout.on('data', (chunk) => { output += chunk.toString() })
    child.stderr.on('data', (chunk) => { output += chunk.toString() })
    child.on('error', (error) => {
      clearTimeout(timer)
      error.status = 500
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve({ output })
        return
      }
      const error = new Error(`Deploy failed with exit code ${code}`)
      error.status = 500
      error.output = output
      reject(error)
    })
  })
}

app.use((error, _req, res, _next) => {
  const status = error.status || 500
  const message = status === 500 ? (error.output || error.message || 'Internal server error') : error.message
  res.status(status).json({ error: message })
})

const host = process.env.DOCS_ADMIN_HOST || '127.0.0.1'
const port = Number(process.env.DOCS_ADMIN_PORT || 5178)
app.listen(port, host, () => {
  console.log(`Recurdream Docs Admin: http://${host}:${port}`)
})
