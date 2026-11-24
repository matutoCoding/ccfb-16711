import { renderLibraryPage } from './pages/library_page'
import { renderPackingPage } from './pages/packing_page'
import { renderTrainingPage } from './pages/training_page'
import { renderExamPage } from './pages/exam_page'
import { renderAnalysisPage } from './pages/analysis_page'
import { renderSettingsPage } from './pages/settings_page'
import { iconSvg } from './ui/icons'
import { store } from './ui/store'

const NAV_ITEMS = [
  { route: '/library', label: '物品库', icon: 'library' },
  { route: '/packing', label: '行李组包', icon: 'luggage' },
  { route: '/training', label: '判图训练', icon: 'train' },
  { route: '/exam', label: '考核', icon: 'exam' },
  { route: '/analysis', label: '成绩分析', icon: 'chart' },
  { route: '/settings', label: '设置', icon: 'settings' },
] as const

const PAGE_TITLES: Record<string, { title: string; sub: string }> = {
  '/library': { title: '物品库', sub: '几何体拼搭 · 材质密度标定 · 违禁品分类' },
  '/packing': { title: '行李组包', sub: '手动摆放与规则随机装包 · 叠压与姿态模拟' },
  '/training': { title: '判图训练', sub: '限时出图 · 框选可疑物品 · 漏判误判记录' },
  '/exam': { title: '考核组卷', sub: '按遮挡/朝向/杂物难度自动组卷' },
  '/analysis': { title: '成绩分析', sub: '按学员与物品类别统计命中率' },
  '/settings': { title: '设置', sub: '机型伪彩 · 体素精度 · 考核参数' },
}

export const renderApp = (): void => {
  const { route, currentStudent } = store.state
  const app = document.getElementById('app')
  if (!app) return

  const header = PAGE_TITLES[route] ?? PAGE_TITLES['/library']
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar__brand">X光判图训练台</div>
        ${NAV_ITEMS.map(
          (item) => `
          <button class="nav-item ${route === item.route ? 'nav-item--active' : ''}" data-route="${item.route}">
            ${iconSvg[item.icon]()}
            <span>${item.label}</span>
          </button>`,
        ).join('')}
      </aside>
      <main class="main-area">
        <header class="page-header">
          <div>
            <h1>${header.title}</h1>
            <div class="page-header__sub">${header.sub}</div>
          </div>
          <div class="flex-center text-secondary">
            ${iconSvg.user(16)}
            <span>${currentStudent?.name ?? '未选择学员'}</span>
          </div>
        </header>
        <div class="page-body" id="page-root"></div>
      </main>
    </div>`

  app.querySelectorAll<HTMLElement>('.nav-item').forEach((el) => {
    el.addEventListener('click', () => store.setRoute(el.dataset.route!))
  })

  const root = document.getElementById('page-root')!
  const renderers: Record<string, (el: HTMLElement) => void> = {
    '/library': renderLibraryPage,
    '/packing': renderPackingPage,
    '/training': renderTrainingPage,
    '/exam': renderExamPage,
    '/analysis': renderAnalysisPage,
    '/settings': renderSettingsPage,
  }
  ;(renderers[route] ?? renderLibraryPage)(root)
}
