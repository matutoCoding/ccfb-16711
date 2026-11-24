import './styles/tokens.css'
import './styles/app.css'
import { ensureDefaultStudent } from './data/idb'
import { renderApp } from './app_shell'
import { store } from './ui/store'

const bootstrap = async (): Promise<void> => {
  try {
    const student = await ensureDefaultStudent()
    await store.init(student)
    renderApp()
    store.subscribe(() => renderApp())
  } catch (err) {
    document.getElementById('app')!.innerHTML =
      `<div class="empty-state"><div class="empty-state__title">系统初始化失败</div>
       <div class="empty-state__sub">${err instanceof Error ? err.message : String(err)}</div></div>`
  }
}

void bootstrap()
