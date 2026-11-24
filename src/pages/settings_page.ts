import { idb, STORE_NAMES } from '../data/idb'
import { MACHINE_PROFILES } from '../core/profiles'
import { exportBundle, importBundle } from '../core/exchange'
import { store } from '../ui/store'
import { iconSvg } from '../ui/icons'
import { toast, escapeHtml } from '../ui/toast'
import type { Student } from '../core/types'

const swatch = (color: { r: number; g: number; b: number }): string =>
  `style="background:rgb(${color.r},${color.g},${color.b})"`

export const renderSettingsPage = async (root: HTMLElement): Promise<void> => {
  const settings = store.state.settings
  const students = await idb.getAll<Student>(STORE_NAMES.students)
  const questionCount = await idb.count(STORE_NAMES.questions)
  const recordCount = await idb.count(STORE_NAMES.records)

  root.innerHTML = `
    <div class="grid grid--2" style="align-items:start">
      <div style="display:flex; flex-direction:column; gap:var(--sp-4)">
        <div class="card">
          <div class="card__title">机型伪彩配置</div>
          <div class="form-row">
            <label>模拟机型</label>
            <select id="st-profile">
              ${MACHINE_PROFILES.map((p) => `<option value="${p.id}" ${p.id === settings.machineProfileId ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
          </div>
          <div id="st-profile-preview"></div>
        </div>

        <div class="card">
          <div class="card__title">成像与考核参数</div>
          <div class="form-row">
            <label>体素分辨率（越高越精细，体素化越慢）</label>
            <select id="st-resolution">
              ${[80, 96, 128, 160].map((n) => `<option value="${n}" ${n === settings.voxelResolution ? 'selected' : ''}>${n}³ 体素</option>`).join('')}
            </select>
          </div>
          <div class="form-row">
            <label>渲染缩放</label>
            <select id="st-scale">
              ${[0.75, 1, 1.25].map((n) => `<option value="${n}" ${n === settings.renderScale ? 'selected' : ''}>${n}x</option>`).join('')}
            </select>
          </div>
          <div class="form-row">
            <label>默认每题限时（秒）</label>
            <input type="number" id="st-time" value="${settings.defaultTimeLimitSec}" min="5" max="180" />
          </div>
          <div class="form-row">
            <label>IoU 判定阈值（框重合度达到该值算命中）</label>
            <input type="number" id="st-iou" value="${settings.iouThreshold}" min="0.1" max="0.8" step="0.05" />
          </div>
          <button class="btn btn--primary" id="st-save">${iconSvg.download()} 保存参数</button>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:var(--sp-4)">
        <div class="card">
          <div class="card__title">学员管理</div>
          <div class="flex-center mb-4">
            <input id="st-stu-name" placeholder="学员姓名" style="flex:1" />
            <input id="st-stu-org" placeholder="所属培训点" style="width:140px" />
            <button class="btn btn--primary btn--sm" id="st-stu-add">${iconSvg.plus()} 添加</button>
          </div>
          <div id="st-stu-list"></div>
        </div>

        <div class="card">
          <div class="card__title">题库共享（跨培训点）</div>
          <p class="text-muted mb-4" style="line-height:1.7">导出包含题目、试卷和物品定义的 JSON 文件，其他培训点导入即可使用，无需联网。</p>
          <div class="flex-center">
            <button class="btn btn--ghost" id="st-export">${iconSvg.download()} 导出题库 (${questionCount} 题)</button>
            <button class="btn btn--ghost" id="st-import">${iconSvg.upload()} 导入题库</button>
            <input type="file" id="st-import-file" accept="application/json" hidden />
          </div>
        </div>

        <div class="card">
          <div class="card__title">数据管理</div>
          <p class="text-muted mb-4">当前本地存储：题目 ${questionCount} 条 · 成绩 ${recordCount} 条 · 学员 ${students.length} 人</p>
          <div class="flex-center">
            <button class="btn btn--danger btn--sm" id="st-clear-records">清空成绩</button>
            <button class="btn btn--danger btn--sm" id="st-clear-all">清空全部数据</button>
          </div>
        </div>
      </div>
    </div>`

  const drawProfilePreview = (): void => {
    const p = MACHINE_PROFILES.find((x) => x.id === (root.querySelector('#st-profile') as HTMLSelectElement).value)!
    root.querySelector('#st-profile-preview')!.innerHTML = `
      <div class="flex-center" style="gap:var(--sp-3)">
        <div class="swatch-card"><span class="swatch" ${swatch(p.organic)}></span><span class="text-secondary">有机物</span></div>
        <div class="swatch-card"><span class="swatch" ${swatch(p.mixed)}></span><span class="text-secondary">混合物</span></div>
        <div class="swatch-card"><span class="swatch" ${swatch(p.inorganic)}></span><span class="text-secondary">无机物</span></div>
        <div class="swatch-card"><span class="swatch" ${swatch(p.background)}></span><span class="text-secondary">背景</span></div>
      </div>
      <p class="text-muted mt-4">低能增益 ${p.gainLow} · 高能增益 ${p.gainHigh} · 噪声 ${p.noiseLevel}</p>`
  }
  drawProfilePreview()
  root.querySelector('#st-profile')!.addEventListener('change', drawProfilePreview)

  root.querySelector('#st-save')!.addEventListener('click', async () => {
    await store.updateSettings({
      machineProfileId: (root.querySelector('#st-profile') as HTMLSelectElement).value,
      voxelResolution: Number((root.querySelector('#st-resolution') as HTMLSelectElement).value),
      renderScale: Number((root.querySelector('#st-scale') as HTMLSelectElement).value),
      defaultTimeLimitSec: Number((root.querySelector('#st-time') as HTMLInputElement).value),
      iouThreshold: Number((root.querySelector('#st-iou') as HTMLInputElement).value),
    })
    toast('参数已保存，新题目按新精度体素化', 'success')
  })

  const drawStudents = (): void => {
    const list = root.querySelector('#st-stu-list') as HTMLElement
    list.innerHTML = students
      .map(
        (s) => `<div class="flex-between ann-row">
          <div>
            <span class="fw-semibold">${escapeHtml(s.name)}</span>
            <span class="text-muted" style="margin-left:var(--sp-3)">${escapeHtml(s.org)}</span>
            ${settings.currentStudentId === s.id ? '<span class="tag tag--primary" style="margin-left:var(--sp-2)">当前</span>' : ''}
          </div>
          <div class="flex-center">
            <button class="btn btn--sm btn--ghost" data-use="${s.id}">切换</button>
            <button class="btn btn--sm btn--danger" data-del-stu="${s.id}">删除</button>
          </div>
        </div>`,
      )
      .join('')
    list.querySelectorAll<HTMLElement>('[data-use]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const stu = students.find((s) => s.id === btn.dataset.use)!
        store.setStudent(stu)
        void store.updateSettings({ currentStudentId: stu.id })
        toast(`已切换到学员：${stu.name}`, 'success')
      })
    })
    list.querySelectorAll<HTMLElement>('[data-del-stu]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await idb.delete(STORE_NAMES.students, btn.dataset.delStu!)
        renderSettingsPage(root)
      })
    })
  }
  drawStudents()

  root.querySelector('#st-stu-add')!.addEventListener('click', async () => {
    const name = (root.querySelector('#st-stu-name') as HTMLInputElement).value.trim()
    const org = (root.querySelector('#st-stu-org') as HTMLInputElement).value.trim() || '未分组'
    if (!name) {
      toast('请填写学员姓名', 'error')
      return
    }
    const stu: Student = { id: crypto.randomUUID(), name, org, createdAt: Date.now() }
    await idb.put(STORE_NAMES.students, stu)
    renderSettingsPage(root)
  })

  root.querySelector('#st-export')!.addEventListener('click', () => {
    void exportBundle().then(() => toast('题库已导出', 'success'))
  })
  const fileInput = root.querySelector<HTMLInputElement>('#st-import-file')!
  root.querySelector('#st-import')!.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    if (!file) return
    try {
      const result = await importBundle(file)
      toast(`导入完成：题目 ${result.questions}，试卷 ${result.papers}，跳过 ${result.skipped}`, 'success')
      renderSettingsPage(root)
    } catch (err) {
      toast(err instanceof Error ? err.message : '导入失败', 'error')
    }
  })

  root.querySelector('#st-clear-records')!.addEventListener('click', async () => {
    await idb.clear(STORE_NAMES.records)
    toast('成绩已清空', 'success')
    renderSettingsPage(root)
  })
  root.querySelector('#st-clear-all')!.addEventListener('click', async () => {
    for (const storeName of Object.values(STORE_NAMES)) {
      await idb.clear(storeName)
    }
    toast('全部数据已清空，刷新页面后重新初始化', 'success')
  })
}
