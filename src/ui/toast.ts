// 全局 Toast 通知
type ToastType = 'info' | 'success' | 'error'

interface ToastItem {
  id: string
  message: string
  type: ToastType
}

let container: HTMLDivElement | null = null
const items: ToastItem[] = []

const ensureContainer = (): HTMLDivElement => {
  if (container) return container
  container = document.createElement('div')
  container.className = 'toast-stack'
  document.body.appendChild(container)
  return container
}

const render = (): void => {
  const el = ensureContainer()
  el.innerHTML = items
    .map(
      (t) =>
        `<div class="toast ${t.type === 'info' ? '' : `toast--${t.type}`}">${escapeHtml(t.message)}</div>`,
    )
    .join('')
}

export const escapeHtml = (s: string): string =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

export const toast = (message: string, type: ToastType = 'info', durationMs = 2600): void => {
  const item: ToastItem = { id: crypto.randomUUID(), message, type }
  items.push(item)
  render()
  setTimeout(() => {
    const idx = items.findIndex((t) => t.id === item.id)
    if (idx >= 0) items.splice(idx, 1)
    render()
  }, durationMs)
}
