import { idb, STORE_NAMES } from '../data/idb'
import { TrainingSession, type SessionSnapshot } from '../core/training_session'
import { CONTRABAND_CLASS_LABELS } from '../core/items/item_registry'
import type { Annotation, ContrabandClass, Question, QuestionResult } from '../core/types'
import { store } from '../ui/store'
import { XrayViewer } from '../ui/xray_viewer'
import { toast } from '../ui/toast'

const CLASS_OPTIONS: ContrabandClass[] = [
  'knife', 'lighter', 'liquid', 'powerbank', 'gun', 'explosive', 'tool', 'other',
]

export const startTrainingRun = (
  root: HTMLElement,
  questions: Question[],
  timeSec: number,
  source: 'training' | 'exam',
  paperName: string,
): void => {
  const student = store.state.currentStudent
  if (!student) {
    toast('请先在设置中选择学员', 'error')
    return
  }
  const timedQuestions = questions.map((q) => ({ ...q, timeLimitSec: timeSec }))
  let viewer: XrayViewer | null = null
  let selectedClass: ContrabandClass = 'knife'

  const session = new TrainingSession(
    {
      questionIds: timedQuestions.map((q) => q.id),
      perQuestionTimeSec: timeSec,
      iouThreshold: store.state.settings.iouThreshold,
      studentId: student.id,
      paperName,
      source,
    },
    timedQuestions,
    (snap) => render(snap),
    store.state.settings.voxelResolution,
  )

  const render = (snap: SessionSnapshot): void => {
    const { question, remainSec, phase, lastResult } = snap
    const danger = remainSec <= 5 && phase === 'answering'
    root.innerHTML = `
      <div class="flex-between mb-4">
        <div class="flex-center">
          <span class="tag tag--primary">第 ${snap.index + 1} / ${snap.total} 题</span>
          <span class="text-secondary">${question.name}</span>
        </div>
        <div class="flex-center">
          <div class="timer-badge ${danger ? 'timer-badge--danger' : ''}">${remainSec}s</div>
          ${phase === 'answering' ? '<button class="btn btn--primary btn--sm" id="run-submit">交卷判分</button>' : ''}
          ${phase === 'review' ? '<button class="btn btn--primary btn--sm" id="run-next">' + (snap.index + 1 >= snap.total ? '查看总成绩' : '下一题') + '</button>' : ''}
        </div>
      </div>

      <div class="grid" style="grid-template-columns: 1fr 300px; align-items:start; gap:var(--sp-5)">
        <div class="card">
          <div id="run-viewer"></div>
        </div>
        <div style="display:flex; flex-direction:column; gap:var(--sp-4)">
          <div class="card">
            <div class="card__title">标注类别</div>
            <div class="class-picker">
              ${CLASS_OPTIONS.map(
                (c) => `<button class="btn btn--sm ${c === selectedClass ? 'btn--primary' : 'btn--ghost'}" data-class="${c}">${CONTRABAND_CLASS_LABELS[c]}</button>`,
              ).join('')}
            </div>
            <p class="text-muted mt-4" style="line-height:1.7">在图像上按住鼠标拖出可疑物品框，松开即按当前类别完成标注。</p>
          </div>
          <div class="card">
            <div class="card__title">我的标注 (${snap.annotations.length})</div>
            <div id="run-ann-list"></div>
          </div>
          <div class="card" id="run-result-card" style="display:${phase === 'review' ? 'block' : 'none'}"></div>
        </div>
      </div>`

    viewer?.dispose()
    viewer = new XrayViewer(document.getElementById('run-viewer')!, store.state.profile, {
      annotatable: phase === 'answering',
    })
    viewer.loadScene(snap.scene, store.state.settings.renderScale)

    viewer.onAnnotationDone((bbox) => {
      const ann: Annotation = {
        id: crypto.randomUUID(),
        contrabandClass: selectedClass,
        bbox,
      }
      session.addAnnotation(ann)
    })

    drawAnnotations(snap)
    if (phase === 'review' && lastResult) drawReview(lastResult, snap, viewer)

    root.querySelectorAll<HTMLElement>('[data-class]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedClass = btn.dataset.class as ContrabandClass
        render(snap)
      })
    })
    root.querySelector('#run-submit')?.addEventListener('click', () => session.submit(false))
    root.querySelector('#run-next')?.addEventListener('click', () => {
      if (phase === 'review' && snap.index + 1 >= snap.total) finish()
      else session.next()
    })
  }

  const drawAnnotations = (snap: SessionSnapshot): void => {
    const el = root.querySelector('#run-ann-list')
    if (!el) return
    if (snap.annotations.length === 0) {
      el.innerHTML = '<p class="text-muted">暂无标注</p>'
      return
    }
    el.innerHTML = snap.annotations
      .map(
        (a) => `<div class="flex-between ann-row">
          <span class="tag tag--warning">${CONTRABAND_CLASS_LABELS[a.contrabandClass]}</span>
          <button class="btn btn--sm btn--danger" data-del-ann="${a.id}">删除</button>
        </div>`,
      )
      .join('')
    el.querySelectorAll<HTMLElement>('[data-del-ann]').forEach((btn) => {
      btn.addEventListener('click', () => session.removeAnnotation(btn.dataset.delAnn!))
    })
  }

  const drawReview = (result: QuestionResult, snap: SessionSnapshot, v: XrayViewer): void => {
    const matchedUids = new Set(result.matches.map((m) => m.targetUid))
    const boxes = snap.question.targets.map((t) => ({
      ...t.bbox,
      color: matchedUids.has(t.uid) ? '#22c55e' : '#ef4444',
      label: matchedUids.has(t.uid) ? t.name : `漏判:${t.name}`,
    }))
    const falseBoxes = result.falseAlarms
      .map((id) => result.annotations.find((a) => a.id === id))
      .filter((a): a is Annotation => Boolean(a))
      .map((a) => ({ ...a.bbox, color: '#f59e0b', label: '误判' }))
    v.drawBoxes([...boxes, ...falseBoxes])

    const card = root.querySelector('#run-result-card')!
    card.innerHTML = `
      <div class="card__title">本题判分</div>
      <div class="stat-tile__value ${result.score >= 60 ? 'text-success' : 'text-danger'}">${result.score} 分</div>
      <div class="mt-4" style="line-height:2">
        <div>命中：<span class="text-success fw-semibold">${result.matches.filter((m) => m.classCorrect).length}</span></div>
        <div>类别判错：<span class="text-warning fw-semibold">${result.classErrors.length}</span></div>
        <div>漏判：<span class="text-danger fw-semibold">${result.missedTargets.length}</span></div>
        <div>误判（多框）：<span class="text-warning fw-semibold">${result.falseAlarms.length}</span></div>
        <div class="text-muted mt-4">用时 ${result.timeUsedSec}s · 绿框=命中 红框=漏判 黄框=误判</div>
      </div>`
  }

  const finish = (): void => {
    const record = session.buildRecord()
    void idb.put(STORE_NAMES.records, record).then(() => {
      session.stop()
      const avg = record.totalScore
      const totalTargets = record.results.reduce((s, r) => s + r.targetDetails.length, 0)
      const totalMiss = record.results.reduce((s, r) => s + r.missedTargets.length, 0)
      const totalFalse = record.results.reduce((s, r) => s + r.falseAlarms.length, 0)
      root.innerHTML = `
        <div class="card" style="max-width:640px; margin:var(--sp-7) auto">
          <div class="card__title">训练完成 · 总成绩单</div>
          <div class="grid grid--3 mb-4">
            <div class="stat-tile"><div class="stat-tile__label">平均分</div><div class="stat-tile__value ${avg >= 60 ? 'text-success' : 'text-danger'}">${avg}</div></div>
            <div class="stat-tile"><div class="stat-tile__label">目标总数</div><div class="stat-tile__value">${totalTargets}</div></div>
            <div class="stat-tile"><div class="stat-tile__label">漏判/误判</div><div class="stat-tile__value text-warning">${totalMiss}/${totalFalse}</div></div>
          </div>
          <p class="text-muted mb-4">详细的类别命中率去「成绩分析」页查看，记录已存入 IndexedDB。</p>
          <button class="btn btn--primary" id="run-back">返回训练配置</button>
        </div>`
      root.querySelector('#run-back')!.addEventListener('click', () => {
        viewer?.dispose()
        location.hash = '/training'
      })
      toast(`成绩单已保存，平均分 ${avg}`, 'success')
    })
  }

  session.start()
}
