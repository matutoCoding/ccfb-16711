import { getMaterial } from '../core/materials'
import {
  ALL_ITEMS,
  CONTRABAND_CLASS_LABELS,
  ITEM_STATS,
} from '../core/items/item_registry'
import type { ItemCategory, ItemDef } from '../core/types'
import { escapeHtml } from '../ui/toast'

const PRIMITIVE_LABELS: Record<string, string> = {
  box: '长方体',
  sphere: '球体',
  cylinder: '圆柱体',
  cone: '圆锥体',
  ellipsoid: '椭球体',
}

export const renderLibraryPage = (root: HTMLElement): void => {
  let categoryFilter: ItemCategory | 'all' = 'all'
  let keyword = ''

  const draw = (): void => {
    const filtered = ALL_ITEMS.filter((item) => {
      const matchCat = categoryFilter === 'all' || item.category === categoryFilter
      const matchKw = !keyword || item.name.includes(keyword)
      return matchCat && matchKw
    })

    root.innerHTML = `
      <div class="grid grid--4 mb-4">
        <div class="stat-tile">
          <div class="stat-tile__label">物品总数</div>
          <div class="stat-tile__value">${ITEM_STATS.total}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-tile__label">违禁品</div>
          <div class="stat-tile__value text-danger">${ITEM_STATS.contraband}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-tile__label">普通物品</div>
          <div class="stat-tile__value">${ITEM_STATS.normal}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-tile__label">材质种类</div>
          <div class="stat-tile__value">23</div>
        </div>
      </div>

      <div class="flex-between mb-4">
        <div class="flex-center">
          <button class="btn btn--sm ${categoryFilter === 'all' ? 'btn--primary' : 'btn--ghost'}" data-cat="all">全部</button>
          <button class="btn btn--sm ${categoryFilter === 'contraband' ? 'btn--primary' : 'btn--ghost'}" data-cat="contraband">违禁品</button>
          <button class="btn btn--sm ${categoryFilter === 'normal' ? 'btn--primary' : 'btn--ghost'}" data-cat="normal">普通物品</button>
        </div>
        <input id="lib-search" placeholder="搜索物品名称" value="${escapeHtml(keyword)}" style="width:220px"/>
      </div>

      <div class="grid grid--cards" id="lib-grid"></div>
      <div id="lib-detail"></div>`

    const grid = root.querySelector('#lib-grid')!
    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-state__title">没有匹配的物品</div>
          <div class="empty-state__sub">换个关键词或分类试试</div>
        </div>`
    } else {
      grid.innerHTML = filtered.map(itemCard).join('')
    }

    root.querySelectorAll<HTMLElement>('[data-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        categoryFilter = btn.dataset.cat as ItemCategory | 'all'
        draw()
      })
    })
    const search = root.querySelector<HTMLInputElement>('#lib-search')!
    search.addEventListener('input', () => {
      keyword = search.value.trim()
      draw()
      const next = root.querySelector<HTMLInputElement>('#lib-search')
      next?.focus()
      next?.setSelectionRange(keyword.length, keyword.length)
    })
    root.querySelectorAll<HTMLElement>('[data-item-id]').forEach((card) => {
      card.addEventListener('click', () => showDetail(card.dataset.itemId!))
    })
  }

  const showDetail = (itemId: string): void => {
    const item = ALL_ITEMS.find((i) => i.id === itemId)!
    const detail = root.querySelector('#lib-detail')!
    detail.innerHTML = `
      <div class="card mt-5">
        <div class="flex-between mb-4">
          <div class="card__title" style="margin:0">${escapeHtml(item.name)} · 结构详情</div>
          <button class="btn btn--sm btn--ghost" id="lib-detail-close">关闭</button>
        </div>
        <div class="grid grid--2">
          <div>
            <table class="table">
              <thead><tr><th>部位</th><th>几何</th><th>尺寸(cm)</th><th>材质</th></tr></thead>
              <tbody>
                ${item.parts
                  .map(
                    (p, idx) => `
                  <tr>
                    <td>部位 ${idx + 1}</td>
                    <td>${PRIMITIVE_LABELS[p.type]}</td>
                    <td>${p.size.map((v) => (v * 2).toFixed(2)).join(' × ')}</td>
                    <td>${escapeHtml(getMaterial(p.materialId).name)}</td>
                  </tr>`,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
          <div>
            <table class="table">
              <thead><tr><th>材质</th><th>密度 g/cm³</th><th>μ低 55keV</th><th>μ高 110keV</th><th>双能比 R</th></tr></thead>
              <tbody>
                ${[...new Set(item.parts.map((p) => p.materialId))]
                  .map((id) => {
                    const m = getMaterial(id)
                    return `<tr>
                      <td>${escapeHtml(m.name)}</td>
                      <td>${m.density}</td>
                      <td>${m.muLow.toFixed(3)}</td>
                      <td>${m.muHigh.toFixed(3)}</td>
                      <td class="fw-semibold">${(m.muLow / m.muHigh).toFixed(3)}</td>
                    </tr>`
                  })
                  .join('')}
              </tbody>
            </table>
            <p class="text-muted mt-4" style="line-height:1.7">
              物品由 ${item.parts.length} 个几何体拼搭，渲染时各部位按材质独立参与双能衰减计算，
              叠压区域光程线性累加。威胁等级 ${'★'.repeat(item.threatLevel)}。
            </p>
          </div>
        </div>
      </div>`
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    root.querySelector('#lib-detail-close')!.addEventListener('click', () => {
      detail.innerHTML = ''
    })
  }

  draw()
}

const itemCard = (item: ItemDef): string => `
  <div class="card" data-item-id="${item.id}" style="cursor:pointer; transition:border-color var(--t-fast), transform var(--t-fast)">
    <div class="flex-between mb-4">
      <span class="fw-semibold fs-md">${escapeHtml(item.name)}</span>
      ${
        item.category === 'contraband'
          ? `<span class="tag tag--danger">${CONTRABAND_CLASS_LABELS[item.contrabandClass!]}</span>`
          : '<span class="tag tag--success">普通</span>'
      }
    </div>
    <div class="text-muted" style="line-height:1.8">
      <div>几何体 ${item.parts.length} 个 · 材质 ${new Set(item.parts.map((p) => p.materialId)).size} 种</div>
      <div>威胁等级 ${'★'.repeat(item.threatLevel)}${'☆'.repeat(3 - item.threatLevel)}</div>
      <div class="mt-4">${item.materials.map((id) => `<span class="tag" style="margin-right:4px">${escapeHtml(getMaterial(id).name)}</span>`).join('')}</div>
    </div>
  </div>`
