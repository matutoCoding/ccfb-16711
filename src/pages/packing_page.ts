import { renderLuggageToScene, createQuestionFromLuggage } from '../core/question_service'
import { BAG_PRESETS, randomPack } from '../core/packing'
import { getItemDef, ALL_ITEMS, CONTRABAND_CLASS_LABELS } from '../core/items/item_registry'
import type { LuggageDef, PlacedItem } from '../core/types'
import { idb, STORE_NAMES } from '../data/idb'
import { store } from '../ui/store'
import { XrayViewer } from '../ui/xray_viewer'
import { iconSvg } from '../ui/icons'
import { toast, escapeHtml } from '../ui/toast'

let viewer: XrayViewer | null = null
let luggage: LuggageDef | null = null
let selectedUid: string | null = null
let debounceTimer: number | undefined

const makeEmptyLuggage = (): LuggageDef => {
  const preset = BAG_PRESETS[1]
  return {
    id: crypto.randomUUID(),
    name: preset.name,
    dims: preset.dims,
    shellMaterialId: preset.shell,
    bagRotationY: 0,
    items: [],
  }
}

const rerenderScene = (immediate = false): void => {
  if (!luggage || !viewer) return
  window.clearTimeout(debounceTimer)
    const run = (): void => {
      const lug = luggage
      const v = viewer
      if (!lug || !v) return
      const res = store.state.settings.voxelResolution
      const scene = renderLuggageToScene(lug, res)
      v.loadScene(scene, store.state.settings.renderScale)
      v.drawBoxes(
        scene.projections.map((p) => {
          const placed = lug.items.find((i) => i.uid === p.uid)!
          const def = getItemDef(placed.itemId)
          return {
            ...p.bbox,
            color: def.category === 'contraband' ? '#ef4444' : '#3b82f6',
            label: def.name,
          }
        }),
      )
    }
  if (immediate) run()
  else debounceTimer = window.setTimeout(run, 180)
}

const sliderRow = (label: string, value: number, min: number, max: number, step: number, key: string, axis: number): string => `
  <label class="flex-between text-secondary" style="font-size:var(--fs-xs)">
    <span>${label}</span><span>${value.toFixed(2)}</span>
  </label>
  <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-slider="${key}-${axis}" style="width:100%">`

export const renderPackingPage = (root: HTMLElement): void => {
  if (!luggage) luggage = makeEmptyLuggage()
  const initialLug = luggage
  root.innerHTML = `
    <div class="grid" style="grid-template-columns: 340px 1fr; gap:var(--sp-5); align-items:start">
      <div style="display:flex; flex-direction:column; gap:var(--sp-4)">
        <div class="card">
          <div class="card__title">箱包与随机装包</div>
          <div class="form-row">
            <label>箱包类型</label>
            <select id="pk-bag">
              ${BAG_PRESETS.map((b, i) => `<option value="${i}" ${initialLug.name === b.name ? 'selected' : ''}>${b.name} ${b.dims.join('×')}cm</option>`).join('')}
            </select>
          </div>
          <div class="grid grid--2">
            <div class="form-row">
              <label>违禁品数量</label>
              <input type="number" id="pk-contra" value="2" min="0" max="6" />
            </div>
            <div class="form-row">
              <label>普通物品数量</label>
              <input type="number" id="pk-normal" value="6" min="0" max="16" />
            </div>
          </div>
          <button class="btn btn--primary" id="pk-random" style="width:100%">${iconSvg.refresh()} 规则随机装包</button>
          <button class="btn btn--ghost mt-4" id="pk-clear" style="width:100%">${iconSvg.trash()} 清空</button>
        </div>

        <div class="card">
          <div class="card__title">手动添加物品</div>
          <div class="form-row">
            <select id="pk-item-select"></select>
          </div>
          <button class="btn btn--ghost" id="pk-add" style="width:100%">${iconSvg.plus()} 放入包中</button>
        </div>

        <div class="card" id="pk-edit-card">
          <div class="card__title">选中物品姿态</div>
          <div id="pk-edit-body"><p class="text-muted">点击右侧物品列表选择</p></div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="flex-between mb-4">
            <div class="card__title" style="margin:0">实时 X 光成像 <span class="text-muted" style="font-weight:400;font-size:var(--fs-xs)">红框=违禁品 蓝框=普通品</span></div>
            <button class="btn btn--primary btn--sm" id="pk-save">${iconSvg.download()} 存为题目</button>
          </div>
          <div id="pk-viewer"></div>
        </div>
        <div class="card mt-4">
          <div class="card__title">包内物品 (${luggage.items.length})</div>
          <div id="pk-item-list"></div>
        </div>
      </div>
    </div>`

  const select = root.querySelector('#pk-item-select') as HTMLSelectElement
  select.innerHTML = ALL_ITEMS.map(
    (i) => `<option value="${i.id}">${i.category === 'contraband' ? '[违禁]' : '[普通]'} ${i.name}</option>`,
  ).join('')

  viewer?.dispose()
  viewer = new XrayViewer(document.getElementById('pk-viewer')!, store.state.profile, { annotatable: false })
  rerenderScene(true)
  drawItemList(root)

  root.querySelector<HTMLElement>('#pk-bag')!.addEventListener('change', (ev) => {
    const preset = BAG_PRESETS[Number((ev.target as HTMLSelectElement).value)]
    luggage = { ...luggage!, name: preset.name, dims: preset.dims, shellMaterialId: preset.shell }
    rerenderScene()
  })

  root.querySelector<HTMLElement>('#pk-random')!.addEventListener('click', () => {
    const contra = Number((root.querySelector('#pk-contra') as HTMLInputElement).value)
    const normal = Number((root.querySelector('#pk-normal') as HTMLInputElement).value)
    const preset = BAG_PRESETS[Number((root.querySelector('#pk-bag') as HTMLSelectElement).value)]
    luggage = randomPack({
      bagDims: preset.dims,
      shellMaterialId: preset.shell,
      contrabandCount: contra,
      normalCount: normal,
    })
    luggage.name = preset.name
    selectedUid = null
    rerenderScene(true)
    drawItemList(root)
    toast('随机组包完成', 'success')
  })

  root.querySelector<HTMLElement>('#pk-clear')!.addEventListener('click', () => {
    luggage = makeEmptyLuggage()
    selectedUid = null
    rerenderScene(true)
    drawItemList(root)
  })

  root.querySelector<HTMLElement>('#pk-add')!.addEventListener('click', () => {
    const itemId = (root.querySelector('#pk-item-select') as HTMLSelectElement).value
    const placed: PlacedItem = {
      uid: crypto.randomUUID(),
      itemId,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
    }
    luggage!.items.push(placed)
    selectedUid = placed.uid
    rerenderScene()
    drawItemList(root)
  })

  root.querySelector<HTMLElement>('#pk-save')!.addEventListener('click', () => {
    if (!luggage || luggage.items.length === 0) {
      toast('包内还没有物品', 'error')
      return
    }
    const { question } = createQuestionFromLuggage(
      luggage,
      store.state.settings.voxelResolution,
      store.state.settings.defaultTimeLimitSec,
    )
    void idb.put(STORE_NAMES.questions, question).then(() => {
      toast(`题目已保存（难度 ${(question.difficulty * 100).toFixed(0)}，目标 ${question.targets.length} 个）`, 'success')
    })
  })
}

const drawItemList = (root: HTMLElement): void => {
  const listEl = root.querySelector('#pk-item-list') as HTMLElement
  if (!luggage || luggage.items.length === 0) {
    listEl.innerHTML = '<p class="text-muted">暂无物品，随机装包或手动添加</p>'
    drawEditCard(root)
    return
  }
  listEl.innerHTML = `
    <table class="table">
      <thead><tr><th>物品</th><th>类别</th><th>位置 (cm)</th><th>操作</th></tr></thead>
      <tbody>
        ${luggage.items
          .map((p) => {
            const def = getItemDef(p.itemId)
            return `<tr data-row="${p.uid}" style="cursor:pointer; ${selectedUid === p.uid ? 'background:var(--primary-soft)' : ''}">
              <td class="fw-semibold" style="color:var(--text-primary)">${escapeHtml(def.name)}</td>
              <td>${def.category === 'contraband' ? `<span class="tag tag--danger">${CONTRABAND_CLASS_LABELS[def.contrabandClass!]}</span>` : '<span class="tag tag--success">普通</span>'}</td>
              <td>${p.position.map((v) => v.toFixed(1)).join(', ')}</td>
              <td><button class="btn btn--sm btn--danger" data-del="${p.uid}">删除</button></td>
            </tr>`
          })
          .join('')}
      </tbody>
    </table>`
  listEl.querySelectorAll<HTMLElement>('[data-row]').forEach((row) => {
    row.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).hasAttribute('data-del')) return
      selectedUid = row.dataset.row!
      drawItemList(root)
    })
  })
  listEl.querySelectorAll<HTMLElement>('[data-del]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation()
      luggage!.items = luggage!.items.filter((p) => p.uid !== btn.dataset.del)
      if (selectedUid === btn.dataset.del) selectedUid = null
      rerenderScene()
      drawItemList(root)
    })
  })
  drawEditCard(root)
}

const drawEditCard = (root: HTMLElement): void => {
  const body = root.querySelector('#pk-edit-body') as HTMLElement
  const placed = luggage?.items.find((p) => p.uid === selectedUid)
  if (!placed) {
    body.innerHTML = '<p class="text-muted">点击右侧物品列表选择</p>'
    return
  }
  const def = getItemDef(placed.itemId)
  const [dx, dy, dz] = luggage!.dims
  body.innerHTML = `
    <p class="fw-semibold mb-4">${escapeHtml(def.name)}</p>
    ${sliderRow('位置 X', placed.position[0], -dx / 2, dx / 2, 0.5, 'pos', 0)}
    ${sliderRow('位置 Y', placed.position[1], -dy / 2, dy / 2, 0.5, 'pos', 1)}
    ${sliderRow('位置 Z', placed.position[2], -dz / 2, dz / 2, 0.5, 'pos', 2)}
    ${sliderRow('旋转 X', placed.rotation[0], -Math.PI, Math.PI, 0.05, 'rot', 0)}
    ${sliderRow('旋转 Y', placed.rotation[1], -Math.PI, Math.PI, 0.05, 'rot', 1)}
    ${sliderRow('旋转 Z', placed.rotation[2], -Math.PI, Math.PI, 0.05, 'rot', 2)}
    <div class="form-row mt-4">
      <label>箱包偏航角（整体姿态）</label>
      ${sliderRow('Y 轴偏航', luggage!.bagRotationY, -Math.PI / 2, Math.PI / 2, 0.05, 'bag', 1)}
    </div>`
  body.querySelectorAll<HTMLInputElement>('[data-slider]').forEach((input) => {
    input.addEventListener('input', () => {
      const [key, axisStr] = input.dataset.slider!.split('-')
      const axis = Number(axisStr)
      const v = Number(input.value)
      if (key === 'pos') placed.position[axis] = v
      if (key === 'rot') placed.rotation[axis] = v
      if (key === 'bag') luggage!.bagRotationY = v
      rerenderScene()
      const label = input.previousElementSibling
      if (label) label.querySelector('span:last-child')!.textContent = v.toFixed(2)
    })
  })
}
