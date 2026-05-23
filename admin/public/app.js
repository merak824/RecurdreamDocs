const state = {
  view: 'workspace',
  pages: [],
  snippets: [],
  images: [],
  navigation: [],
  currentPage: null,
  currentSnippet: null,
  draggedGroupIndex: null,
  draggedItem: null,
  pageDirty: false,
  navDirty: false,
  lastSavedContent: '',
  editorUndoStack: [],
  editorSelection: {
    start: 0,
    end: 0,
    scrollTop: 0
  }
}

const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]
const adminBasePath = new URL('.', window.location.href).pathname.replace(/\/$/, '')

function adminUrl(path) {
  const cleanPath = String(path || '').replace(/^\/+/, '')
  return `${adminBasePath}/${cleanPath}`
}

function toast(message) {
  const node = $('#toast')
  node.textContent = message
  node.hidden = false
  clearTimeout(window.__toastTimer)
  window.__toastTimer = setTimeout(() => { node.hidden = true }, 2600)
}

async function api(path, options = {}) {
  const response = await fetch(adminUrl(path), options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || '请求失败')
  return data
}

function setView(view) {
  state.view = view
  $$('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === view))
  $$('.view').forEach((node) => node.classList.toggle('active', node.id === `${view}View`))

  const titles = {
    workspace: ['文档工作台', '面向客户手册的编辑、排序和预览。'],
    images: ['图片素材', '上传、替换和复制图片引用路径。'],
    snippets: ['代码片段', '维护可复用代码示例，文档会自动引用。']
  }
  $('#viewTitle').textContent = titles[view][0]
  $('#viewDesc').textContent = titles[view][1]
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/')
}

function filterItems(items, query, fields) {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((item) => fields.some((field) => String(item[field] || '').toLowerCase().includes(q)))
}

function docPathCandidates(link) {
  const value = String(link || '').trim()
  if (!value || value === '/') return ['index.md']
  if (value.startsWith('http://') || value.startsWith('https://')) return []

  const withoutAnchor = value.split(/[?#]/)[0]
  const hasTrailingSlash = withoutAnchor.endsWith('/')
  const clean = withoutAnchor.replace(/^\/+/, '').replace(/\/+$/, '')
  if (!clean) return ['index.md']
  if (clean.endsWith('.md')) return [clean]
  if (hasTrailingSlash) return [`${clean}/index.md`, `${clean}.md`]
  return [`${clean}.md`, `${clean}/index.md`]
}

function resolveDocPath(link) {
  const candidates = docPathCandidates(link)
  return candidates.find((path) => state.pages.some((page) => page.path === path)) || candidates[0] || null
}

function pageByLink(link) {
  const path = resolveDocPath(link)
  if (!path) return null
  return state.pages.find((page) => page.path === path) || { path, title: path }
}

function isCurrentLink(link) {
  return resolveDocPath(link) === state.currentPage?.path
}

function setPageDirty(isDirty = true) {
  state.pageDirty = isDirty
  updateSaveIndicator()
}

function setNavDirty(isDirty = true) {
  state.navDirty = isDirty
  updateSaveIndicator()
}

function updateSaveIndicator() {
  const indicator = $('#saveIndicator')
  if (!indicator) return
  indicator.classList.toggle('dirty', state.pageDirty || state.navDirty)
  indicator.classList.toggle('saved', !state.pageDirty && !state.navDirty)
  if (state.pageDirty && state.navDirty) indicator.textContent = '页面和导航未保存'
  else if (state.pageDirty) indicator.textContent = '页面未保存'
  else if (state.navDirty) indicator.textContent = '导航未保存'
  else indicator.textContent = '已保存'
}

function extractTitle(content, fallback = '') {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback
}

function setMarkdownTitle(content, title) {
  const cleanTitle = title.trim() || '未命名页面'
  if (/^#\s+.+$/m.test(content)) return content.replace(/^#\s+.+$/m, `# ${cleanTitle}`)
  return `# ${cleanTitle}\n\n${content.trimStart()}`
}

function updateDocMeta() {
  const content = $('#pageEditor').value
  const text = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[#>*_`[\]()!-]/g, '')
    .trim()
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const words = text.replace(/[\u4e00-\u9fff]/g, ' ').trim().split(/\s+/).filter(Boolean).length
  const lines = content.split('\n').length
  $('#docStats').textContent = `${cjk + words} 字 · ${lines} 行`
  renderOutline(content)
}

function renderOutline(content) {
  const headings = [...content.matchAll(/^(#{2,4})\s+(.+)$/gm)].map((match) => ({
    level: match[1].length,
    text: match[2].trim()
  }))
  $('#outlineCount').textContent = `${headings.length} 个标题`
  $('#outlineList').innerHTML = headings.length
    ? headings.map((heading) => `<button class="outline-item level-${heading.level}" data-outline="${escapeHtml(heading.text)}" type="button">${escapeHtml(heading.text)}</button>`).join('')
    : '<span class="empty-note">正文里使用 H2/H3 后会自动生成大纲。</span>'
}

function renderSnippets() {
  const snippets = filterItems(state.snippets, $('#snippetSearch').value, ['path', 'language'])
  $('#snippetList').innerHTML = snippets.map((snippet) => `
    <button class="list-item ${state.currentSnippet?.path === snippet.path ? 'active' : ''}" data-path="${escapeHtml(snippet.path)}" type="button">
      <strong>${escapeHtml(snippet.path)}</strong>
      <span>${escapeHtml(snippet.language)}</span>
    </button>`).join('')
}

function renderImages() {
  $('#imageGrid').innerHTML = state.images.map((image) => `
    <article class="image-card">
      <img src="${image.url}" alt="${escapeHtml(image.path)}" />
      <footer>
        <code>/images/${escapeHtml(image.path)}</code>
        <button data-copy-image="${escapeHtml(image.path)}" type="button">复制引用</button>
      </footer>
    </article>`).join('')
}

function itemMatchesQuery(group, item, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const page = pageByLink(item.link)
  return [group.text, item.text, item.link, page?.path, page?.title]
    .some((value) => String(value || '').toLowerCase().includes(q))
}

function renderNavigation() {
  const query = $('#navSearch')?.value || ''
  const itemCount = state.navigation.reduce((sum, group) => sum + group.items.length, 0)
  $('#navSummary').textContent = `${state.navigation.length} 个分组 · ${itemCount} 个页面`

  $('#navEditor').innerHTML = state.navigation.map((group, groupIndex) => {
    const visibleItems = group.items
      .map((item, itemIndex) => ({ item, itemIndex }))
      .filter(({ item }) => itemMatchesQuery(group, item, query))
    if (query && !visibleItems.length && !group.text.toLowerCase().includes(query.toLowerCase())) return ''

    return `
      <article class="nav-group" data-group-index="${groupIndex}">
        <header class="nav-group-head" draggable="true" data-group-index="${groupIndex}">
          <span class="drag-handle" title="拖拽排序">⋮⋮</span>
          <button class="group-title" data-nav-action="toggle-group-edit" data-group-index="${groupIndex}" type="button">
            <strong>${escapeHtml(group.text)}</strong>
            <span>${group.items.length} 个页面</span>
          </button>
          <div class="nav-actions">
            <button data-nav-action="add-item" data-group-index="${groupIndex}" type="button" title="添加二级导航">+</button>
            <button data-nav-action="toggle-group-edit" data-group-index="${groupIndex}" type="button" title="编辑一级导航">编辑</button>
            <button class="danger" data-nav-action="delete-group" data-group-index="${groupIndex}" type="button" title="删除一级导航">删除</button>
          </div>
          <div class="group-edit-fields">
            <input data-nav-field="group-text" data-group-index="${groupIndex}" value="${escapeHtml(group.text)}" placeholder="一级导航名称" />
          </div>
        </header>
        <div class="nav-items" data-group-index="${groupIndex}">
          ${visibleItems.map(({ item, itemIndex }) => {
            const page = pageByLink(item.link)
            const pagePath = resolveDocPath(item.link)
            const missing = pagePath && !state.pages.some((entry) => entry.path === pagePath)
            return `
              <div class="nav-item ${isCurrentLink(item.link) ? 'active' : ''}" draggable="true" data-group-index="${groupIndex}" data-item-index="${itemIndex}">
                <span class="drag-handle" title="拖拽排序">⋮⋮</span>
                <button class="nav-open" data-open-page="${escapeHtml(item.link)}" type="button">
                  <strong>${escapeHtml(item.text)}</strong>
                  <span>${escapeHtml(page?.path || item.link)}${missing ? ' · 未创建' : ''}</span>
                </button>
                <div class="item-actions">
                  <button class="nav-edit-toggle" data-nav-action="toggle-item-edit" data-group-index="${groupIndex}" data-item-index="${itemIndex}" type="button" title="编辑导航">编辑</button>
                  <button class="danger" data-nav-action="delete-item" data-group-index="${groupIndex}" data-item-index="${itemIndex}" type="button">删除</button>
                </div>
                <div class="item-edit-fields">
                  <input data-nav-field="item-text" data-group-index="${groupIndex}" data-item-index="${itemIndex}" value="${escapeHtml(item.text)}" placeholder="二级导航名称" />
                  <input data-nav-field="item-link" data-group-index="${groupIndex}" data-item-index="${itemIndex}" value="${escapeHtml(item.link)}" placeholder="/clients/tavo" />
                </div>
              </div>
            `
          }).join('')}
        </div>
      </article>
    `
  }).join('')
}

async function loadPages() {
  const data = await api('/api/pages')
  state.pages = data.pages
  renderNavigation()
}

async function loadImages() {
  const data = await api('/api/images')
  state.images = data.images
  renderImages()
}

async function loadSnippets() {
  const data = await api('/api/snippets')
  state.snippets = data.snippets
  renderSnippets()
}

async function loadNavigation() {
  const data = await api('/api/navigation')
  state.navigation = data.navigation
  setNavDirty(false)
  renderNavigation()
}

async function ensureSafePageSwitch() {
  if (!state.pageDirty) return true
  return window.confirm('当前页面还没保存，确定要切换吗？')
}

async function openPage(path) {
  if (!(await ensureSafePageSwitch())) return
  const data = await api(`/api/pages/${encodePath(path)}`)
  state.currentPage = data
  state.lastSavedContent = data.content
  $('#docTitleInput').value = extractTitle(data.content, data.title)
  $('#currentPagePath').textContent = data.path
  $('#pageEditor').value = data.content
  state.editorUndoStack = []
  setPageDirty(false)
  updateDocMeta()
  renderNavigation()
  await updatePreview()
}

async function openPageFromLink(link) {
  const path = resolveDocPath(link)
  if (!path) return toast('外部链接不能在这里编辑')
  await openPage(path)
}

async function openSnippet(path) {
  const data = await api(`/api/snippets/${encodePath(path)}`)
  state.currentSnippet = data
  $('#currentSnippetTitle').textContent = data.path
  $('#currentSnippetPath').textContent = data.language
  $('#snippetEditor').value = data.content
  renderSnippets()
}

async function updatePreview() {
  const data = await api('/api/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: $('#pageEditor').value })
  })
  $('#preview').innerHTML = data.html
}

async function savePage() {
  if (!state.currentPage) return toast('先选择一个二级导航页面')
  await api(`/api/pages/${encodePath(state.currentPage.path)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: $('#pageEditor').value })
  })
  state.lastSavedContent = $('#pageEditor').value
  setPageDirty(false)
  toast('页面已保存')
  await loadPages()
}

async function saveSnippet() {
  if (!state.currentSnippet) return toast('先选择一个代码片段')
  await api(`/api/snippets/${encodePath(state.currentSnippet.path)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: $('#snippetEditor').value })
  })
  toast('代码片段已保存')
  await loadSnippets()
}

async function saveNavigation() {
  await api('/api/navigation', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ navigation: state.navigation })
  })
  setNavDirty(false)
  toast('导航已保存，前台会按新顺序显示')
  await loadPages()
}

async function deployDocs() {
  const button = $('#deployDocsBtn')
  button.disabled = true
  button.textContent = '发布中...'
  try {
    await api('/api/deploy', { method: 'POST' })
    toast('前台已发布')
  } finally {
    button.disabled = false
    button.textContent = '发布前台'
  }
}

async function uploadImageFile(file, targetPath) {
  const target = targetPath || file?.name
  if (!file) throw new Error('先选择图片')
  if (!target) throw new Error('填写保存路径')
  const form = new FormData()
  form.append('image', file)
  form.append('path', target)
  const response = await fetch(adminUrl('/api/images'), { method: 'POST', body: form })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || '上传失败')
  await loadImages()
  return data
}

async function uploadImage() {
  const file = $('#imageFile').files[0]
  const data = await uploadImageFile(file, $('#imagePath').value.trim() || file?.name)
  $('#imageFile').value = ''
  toast('图片已上传')
  return data
}

function insertAtCursor(textarea, text, selectOffset = 0) {
  const scrollTop = textarea.scrollTop
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  replaceEditorRange(textarea, start, end, text, start + text.length + selectOffset, start + text.length + selectOffset, scrollTop)
  markEditorChanged({ preserveToolbarUndo: true })
}

function replaceEditorRange(textarea, start, end, text, nextStart, nextEnd, scrollTop = textarea.scrollTop) {
  const before = editorSnapshot(textarea)
  focusEditorWithoutJump(textarea, scrollTop)
  textarea.setSelectionRange(start, end)
  const inserted = document.execCommand('insertText', false, text)
  if (!inserted) {
    textarea.setRangeText(text, start, end, 'end')
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
  }
  textarea.setSelectionRange(nextStart, nextEnd)
  textarea.scrollTop = scrollTop
  state.editorSelection = {
    start: nextStart,
    end: nextEnd,
    scrollTop
  }
  pushEditorUndo(before, editorSnapshot(textarea))
}

function wrapSelection(prefix, suffix = prefix, placeholder = '文字') {
  const textarea = $('#pageEditor')
  const scrollTop = textarea.scrollTop
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selected = textarea.value.slice(start, end) || placeholder
  replaceEditorRange(
    textarea,
    start,
    end,
    prefix + selected + suffix,
    start + prefix.length,
    start + prefix.length + selected.length,
    scrollTop
  )
  markEditorChanged({ preserveToolbarUndo: true })
}

function insertLinePrefix(prefix, placeholder = '内容') {
  const textarea = $('#pageEditor')
  const scrollTop = textarea.scrollTop
  const start = textarea.selectionStart
  const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1
  const text = `${prefix}${placeholder}`
  replaceEditorRange(
    textarea,
    lineStart,
    lineStart,
    text,
    lineStart + prefix.length,
    lineStart + text.length,
    scrollTop
  )
  markEditorChanged({ preserveToolbarUndo: true })
}

function rememberEditorSelection() {
  const textarea = $('#pageEditor')
  state.editorSelection = {
    start: textarea.selectionStart,
    end: textarea.selectionEnd,
    scrollTop: textarea.scrollTop
  }
}

function editorSnapshot(textarea = $('#pageEditor')) {
  return {
    value: textarea.value,
    start: textarea.selectionStart,
    end: textarea.selectionEnd,
    scrollTop: textarea.scrollTop
  }
}

function pushEditorUndo(before, after) {
  if (before.value === after.value) return
  state.editorUndoStack.push({ before, after })
  if (state.editorUndoStack.length > 50) state.editorUndoStack.shift()
}

function undoToolbarEdit() {
  const textarea = $('#pageEditor')
  const latest = state.editorUndoStack.at(-1)
  if (!latest || textarea.value !== latest.after.value) return false
  state.editorUndoStack.pop()
  textarea.value = latest.before.value
  focusEditorWithoutJump(textarea, latest.before.scrollTop)
  textarea.setSelectionRange(latest.before.start, latest.before.end)
  textarea.scrollTop = latest.before.scrollTop
  state.editorSelection = {
    start: latest.before.start,
    end: latest.before.end,
    scrollTop: latest.before.scrollTop
  }
  markEditorChanged({ preserveToolbarUndo: true })
  return true
}

function restoreEditorSelection() {
  const textarea = $('#pageEditor')
  textarea.selectionStart = state.editorSelection.start
  textarea.selectionEnd = state.editorSelection.end
  textarea.scrollTop = state.editorSelection.scrollTop
}

function focusEditorWithoutJump(textarea, scrollTop) {
  try {
    textarea.focus({ preventScroll: true })
  } catch {
    textarea.focus()
  }
  textarea.scrollTop = scrollTop
  requestAnimationFrame(() => {
    textarea.scrollTop = scrollTop
  })
}

function applyFormat(format) {
  const textarea = $('#pageEditor')
  const actions = {
    h1: () => insertLinePrefix('# ', '页面标题'),
    h2: () => insertLinePrefix('## ', '小节标题'),
    h3: () => insertLinePrefix('### ', '段落标题'),
    bold: () => wrapSelection('**', '**', '重点内容'),
    italic: () => wrapSelection('*', '*', '强调内容'),
    inlinecode: () => wrapSelection('`', '`', 'code'),
    quote: () => insertLinePrefix('> ', '引用内容'),
    list: () => insertLinePrefix('- ', '列表项'),
    number: () => insertLinePrefix('1. ', '列表项'),
    task: () => insertLinePrefix('- [ ] ', '待办事项'),
    link: () => wrapSelection('[', '](https://example.com)', '链接文字'),
    table: () => insertAtCursor(textarea, '\n| 名称 | 说明 |\n| --- | --- |\n| 示例 | 填写说明 |\n'),
    codeblock: () => insertAtCursor(textarea, '```bash\n命令或代码\n```\n'),
    tip: () => insertAtCursor(textarea, '::: tip 提示\n这里填写提示内容。\n:::\n'),
    warning: () => insertAtCursor(textarea, '::: warning 注意\n这里填写需要注意的内容。\n:::\n'),
    divider: () => insertAtCursor(textarea, '\n---\n')
  }
  actions[format]?.()
}

function applyColorMark(type) {
  const labels = {
    brand: '重点内容',
    info: '信息内容',
    success: '成功状态',
    warning: '警告内容',
    danger: '危险提示'
  }
  wrapSelection(`<span class="text-mark ${type}">`, '</span>', labels[type] || '重点内容')
}

function markEditorChanged(options = {}) {
  const latest = state.editorUndoStack.at(-1)
  if (!options.preserveToolbarUndo && latest && $('#pageEditor').value !== latest.after.value) {
    state.editorUndoStack = []
  }
  setPageDirty($('#pageEditor').value !== state.lastSavedContent)
  updateDocMeta()
  schedulePreview()
}

let previewTimer = null
function schedulePreview() {
  clearTimeout(previewTimer)
  previewTimer = setTimeout(() => updatePreview().catch((error) => toast(error.message)), 250)
}

function midpointY(element) {
  const rect = element.getBoundingClientRect()
  return rect.top + rect.height / 2
}

function setLayout(layout) {
  document.body.dataset.layout = layout
  $$('.segmented [data-layout]').forEach((button) => button.classList.toggle('active', button.dataset.layout === layout))
}

function suggestImagePath(file) {
  const pagePath = state.currentPage?.path || 'images'
  const dir = pagePath === 'index.md' ? 'home' : pagePath.replace(/\/?index\.md$/, '').replace(/\.md$/, '')
  const safeName = file.name.replace(/\s+/g, '-').toLowerCase()
  return `${dir}/${Date.now()}-${safeName}`
}

$$('.tab').forEach((tab) => tab.addEventListener('click', () => setView(tab.dataset.view)))

$('#refreshBtn').addEventListener('click', async () => {
  if (!(await ensureSafePageSwitch())) return
  await Promise.all([loadPages(), loadImages(), loadSnippets(), loadNavigation()])
  toast('已刷新')
})

$('#savePageBtn').addEventListener('click', () => savePage().catch((error) => toast(error.message)))
$('#saveSnippetBtn').addEventListener('click', () => saveSnippet().catch((error) => toast(error.message)))
$('#uploadImageBtn').addEventListener('click', () => uploadImage().catch((error) => toast(error.message)))
$('#deployDocsBtn').addEventListener('click', () => deployDocs().catch((error) => toast(error.message)))
$('#snippetSearch').addEventListener('input', renderSnippets)
$('#navSearch').addEventListener('input', renderNavigation)

$('#pageEditor').addEventListener('input', markEditorChanged)
$('#pageEditor').addEventListener('click', rememberEditorSelection)
$('#pageEditor').addEventListener('keyup', rememberEditorSelection)
$('#pageEditor').addEventListener('select', rememberEditorSelection)
$('#pageEditor').addEventListener('scroll', () => {
  state.editorSelection.scrollTop = $('#pageEditor').scrollTop
})

$('#pageEditor').addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && undoToolbarEdit()) {
    event.preventDefault()
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    savePage().catch((error) => toast(error.message))
  }
})

$('#pageEditor').addEventListener('paste', async (event) => {
  const file = [...event.clipboardData?.files || []].find((item) => item.type.startsWith('image/'))
  if (!file) return
  event.preventDefault()
  try {
    const data = await uploadImageFile(file, suggestImagePath(file))
    insertAtCursor($('#pageEditor'), `<DocImage\n  src="${data.url}"\n  alt="图片说明"\n  caption="这里填写图片说明。"\n/>\n`)
    toast('图片已上传并插入')
  } catch (error) {
    toast(error.message)
  }
})

$('#pageEditor').addEventListener('drop', async (event) => {
  const file = [...event.dataTransfer?.files || []].find((item) => item.type.startsWith('image/'))
  if (!file) return
  event.preventDefault()
  try {
    const data = await uploadImageFile(file, suggestImagePath(file))
    insertAtCursor($('#pageEditor'), `<DocImage\n  src="${data.url}"\n  alt="图片说明"\n  caption="这里填写图片说明。"\n/>\n`)
    toast('图片已上传并插入')
  } catch (error) {
    toast(error.message)
  }
})

$('#docTitleInput').addEventListener('input', () => {
  $('#pageEditor').value = setMarkdownTitle($('#pageEditor').value, $('#docTitleInput').value)
  markEditorChanged()
})

$('.format-bar').addEventListener('click', (event) => {
  const button = event.target.closest('[data-format]')
  if (!button) return
  restoreEditorSelection()
  applyFormat(button.dataset.format)
})

$('.format-bar').addEventListener('mousedown', (event) => {
  if (!event.target.closest('button')) return
  rememberEditorSelection()
  event.preventDefault()
})

$('#headingFormat').addEventListener('mousedown', rememberEditorSelection)
$('#colorFormat').addEventListener('mousedown', rememberEditorSelection)

$('.format-bar').addEventListener('click', (event) => {
  const colorButton = event.target.closest('[data-color]')
  if (!colorButton) return
  restoreEditorSelection()
  applyColorMark(colorButton.dataset.color)
})

$('#headingFormat').addEventListener('change', () => {
  const value = $('#headingFormat').value
  if (!value) return
  restoreEditorSelection()
  applyFormat(value)
  $('#headingFormat').value = ''
})

$('#colorFormat').addEventListener('change', () => {
  const value = $('#colorFormat').value
  if (!value) return
  restoreEditorSelection()
  applyColorMark(value)
  $('#colorFormat').value = ''
})

$('.layout-switch').addEventListener('click', (event) => {
  const button = event.target.closest('[data-layout]')
  if (button) setLayout(button.dataset.layout)
})

$('#outlineList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-outline]')
  if (!button) return
  const textarea = $('#pageEditor')
  const needle = button.dataset.outline
  const index = textarea.value.indexOf(needle)
  if (index >= 0) {
    textarea.focus()
    textarea.selectionStart = index
    textarea.selectionEnd = index + needle.length
  }
})

$('#addNavGroupBtn').addEventListener('click', () => {
  state.navigation.push({ text: '新导航', items: [] })
  setNavDirty()
  renderNavigation()
})

$('#saveNavBtn').addEventListener('click', () => saveNavigation().catch((error) => toast(error.message)))

$('#navEditor').addEventListener('input', (event) => {
  const input = event.target.closest('[data-nav-field]')
  if (!input) return

  const groupIndex = Number(input.dataset.groupIndex)
  const itemIndex = Number(input.dataset.itemIndex)
  const field = input.dataset.navField
  if (field === 'group-text') {
    state.navigation[groupIndex].text = input.value
  }
  if (field === 'item-text') {
    state.navigation[groupIndex].items[itemIndex].text = input.value
  }
  if (field === 'item-link') {
    state.navigation[groupIndex].items[itemIndex].link = input.value
  }
  setNavDirty()
})

$('#navEditor').addEventListener('change', renderNavigation)

$('#navEditor').addEventListener('click', (event) => {
  const openButton = event.target.closest('[data-open-page]')
  if (openButton) {
    openPageFromLink(openButton.dataset.openPage).catch((error) => toast(error.message))
    return
  }

  const button = event.target.closest('[data-nav-action]')
  if (!button) return

  const groupIndex = Number(button.dataset.groupIndex)
  const itemIndex = Number(button.dataset.itemIndex)
  const action = button.dataset.navAction
  if (action === 'add-item') {
    state.navigation[groupIndex].items.push({ text: '新页面', link: '/' })
  }
  if (action === 'toggle-group-edit') {
    button.closest('.nav-group-head')?.classList.toggle('editing')
    return
  }
  if (action === 'toggle-item-edit') {
    button.closest('.nav-item')?.classList.toggle('editing')
    return
  }
  if (action === 'delete-group') {
    state.navigation.splice(groupIndex, 1)
  }
  if (action === 'delete-item') {
    state.navigation[groupIndex].items.splice(itemIndex, 1)
  }
  setNavDirty()
  renderNavigation()
})

$('#navEditor').addEventListener('dragstart', (event) => {
  const item = event.target.closest('.nav-item')
  const groupHead = event.target.closest('.nav-group-head')
  if (item) {
    state.draggedItem = {
      groupIndex: Number(item.dataset.groupIndex),
      itemIndex: Number(item.dataset.itemIndex)
    }
    item.classList.add('dragging')
    event.dataTransfer.effectAllowed = 'move'
    return
  }
  if (groupHead) {
    state.draggedGroupIndex = Number(groupHead.dataset.groupIndex)
    groupHead.classList.add('dragging')
    event.dataTransfer.effectAllowed = 'move'
  }
})

$('#navEditor').addEventListener('dragover', (event) => {
  if (event.target.closest('.nav-group, .nav-items, .nav-item')) {
    event.preventDefault()
  }
})

$('#navEditor').addEventListener('drop', (event) => {
  event.preventDefault()
  const targetItem = event.target.closest('.nav-item')
  const targetGroup = event.target.closest('.nav-group')
  const targetGroupHead = event.target.closest('.nav-group-head')
  const targetItems = event.target.closest('.nav-items')

  if (state.draggedItem) {
    const fromGroupIndex = state.draggedItem.groupIndex
    const fromItemIndex = state.draggedItem.itemIndex
    const [moved] = state.navigation[fromGroupIndex].items.splice(fromItemIndex, 1)

    let toGroupIndex = targetItem ? Number(targetItem.dataset.groupIndex) : Number((targetItems || targetGroup)?.dataset.groupIndex)
    if (Number.isNaN(toGroupIndex)) toGroupIndex = fromGroupIndex
    let toItemIndex = targetItem ? Number(targetItem.dataset.itemIndex) : state.navigation[toGroupIndex].items.length
    if (targetItem && event.clientY > midpointY(targetItem)) toItemIndex += 1
    if (fromGroupIndex === toGroupIndex && fromItemIndex < toItemIndex) toItemIndex -= 1
    state.navigation[toGroupIndex].items.splice(toItemIndex, 0, moved)
    state.draggedItem = null
    setNavDirty()
    renderNavigation()
    return
  }

  if (state.draggedGroupIndex !== null && (targetGroup || targetGroupHead)) {
    const fromIndex = state.draggedGroupIndex
    const groupTarget = targetGroup || targetGroupHead
    let toIndex = Number(groupTarget.dataset.groupIndex)
    if (event.clientY > midpointY(groupTarget)) toIndex += 1
    const [moved] = state.navigation.splice(fromIndex, 1)
    if (fromIndex < toIndex) toIndex -= 1
    state.navigation.splice(toIndex, 0, moved)
    state.draggedGroupIndex = null
    setNavDirty()
    renderNavigation()
  }
})

$('#navEditor').addEventListener('dragend', () => {
  state.draggedGroupIndex = null
  state.draggedItem = null
  $$('.dragging').forEach((node) => node.classList.remove('dragging'))
})

$('#snippetList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-path]')
  if (button) openSnippet(button.dataset.path).catch((error) => toast(error.message))
})

$('#imageGrid').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy-image]')
  if (!button) return
  const path = button.dataset.copyImage
  const text = `<DocImage\n  src="/images/${path}"\n  alt="图片说明"\n  caption="这里填写图片说明。"\n/>\n`
  await navigator.clipboard.writeText(text)
  toast('图片引用已复制')
})

$('#inlineImageFile').addEventListener('change', async () => {
  const file = $('#inlineImageFile').files[0]
  if (!file) return
  try {
    restoreEditorSelection()
    const data = await uploadImageFile(file, suggestImagePath(file))
    insertAtCursor($('#pageEditor'), `<DocImage\n  src="${data.url}"\n  alt="图片说明"\n  caption="这里填写图片说明。"\n/>\n`)
    toast('图片已上传并插入')
  } catch (error) {
    toast(error.message)
  } finally {
    $('#inlineImageFile').value = ''
  }
})

$('#insertImageBtn').addEventListener('click', () => {
  rememberEditorSelection()
  $('#inlineImageFile').click()
})

const openSiteLink = $('#openSiteLink')
if (openSiteLink && location.hostname !== '127.0.0.1' && location.hostname !== 'localhost') {
  openSiteLink.href = `${location.protocol}//${location.host}/`
}

window.addEventListener('beforeunload', (event) => {
  if (!state.pageDirty && !state.navDirty) return
  event.preventDefault()
  event.returnValue = ''
})

await Promise.all([loadNavigation(), loadPages(), loadImages(), loadSnippets()])

const firstEditableItem = state.navigation.flatMap((group) => group.items).find((item) => resolveDocPath(item.link))
if (firstEditableItem) {
  await openPageFromLink(firstEditableItem.link).catch(() => {
    if (state.pages[0]) return openPage(state.pages[0].path)
    return null
  })
} else if (state.pages[0]) {
  await openPage(state.pages[0].path)
}
