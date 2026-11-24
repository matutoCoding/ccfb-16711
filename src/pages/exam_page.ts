import { idb, STORE_NAMES } from '../data/idb'
import { BAG_PRESETS, difficultyLabel, randomPack } from '../core/packing'
import { createQuestionFromLuggage } from '../core/question_service'
import { store } from '../ui/store'
import { iconSvg } from '../ui/icons'
import { toast } from '../ui/toast'
import { startTrainingRun } from './training_run'
import type { ExamPaper, Question } from '../core/types'

const DIFFICULTY_PRESETS = [
  { id: 'easy', label: '初级卷', min: 0, max: 0.25, contra: 1, normal: 4 },
  { id: 'mid', label: '中级卷', min: 0.25, max: 0.45, contra: 2, normal: 7 },
  { id: 'hard', label: '高级卷', min: 0.45, max: 0.65, contra: 3, normal: 10 },
  { id: 'expert', label: '专家卷', min: 0.65, max: 1, contra: 4, normal: 13 },
]

// 随机装包生成题目，并用难度因子做拒绝采样，直到落入目标区间
const generateQuestionInRange = (min: number, max: number, timeSec: number): Question => {
  const res = store.state.settings.voxelResolution
  const preset = BAG_PRESETS[Math.floor(Math.random() * BAG_PRESETS.length)]
  for (let attempt = 0; attempt < 30; attempt++) {
    const luggage = randomPack({
      bagDims: preset.dims,
      shellMaterialId: preset.shell,
      contrabandCount: 1 + Math.floor(Math.random() * 4),
      normalCount: 4 + Math.floor(Math.random() * 10),
    })
    const { question } = createQuestionFromLuggage(luggage, res, timeSec)
    if (question.difficulty >= min && question.difficulty <= max) return question
  }
  // 兜底：放宽区间，保证一定有题
  const luggage = randomPack({
    bagDims: preset.dims,
    shellMaterialId: preset.shell,
    contrabandCount: 2,
    normalCount: 8,
  })
  return createQuestionFromLuggage(luggage, res, timeSec).question
}

export const renderExamPage = async (root: HTMLElement): Promise<void> => {
  const bank = await idb.getAll<Question>(STORE_NAMES.questions)
  const papers = await idb.getAll<ExamPaper>(STORE_NAMES.papers)

  root.innerHTML = `
    <div class="card mb-4">
      <div class="card__title">按难度自动组卷</div>
      <div class="grid grid--4 mb-4">
        ${DIFFICULTY_PRESETS.map(
          (p) => `
          <div class="card" style="padding:var(--sp-4)">
            <div class="fw-semibold fs-md mb-4">${p.label}</div>
            <div class="text-muted mb-4" style="line-height:1.8">
              难度 ${(p.min * 100).toFixed(0)}~${(p.max * 100).toFixed(0)}<br/>
              违禁品 ${p.contra} 件 · 杂物 ${p.normal} 件
            </div>
            <button class="btn btn--primary btn--sm" data-paper="${p.id}" style="width:100%">${iconSvg.exam()} 组卷考核</button>
          </div>`,
        ).join('')}
      </div>
      <div class="grid grid--3">
        <div class="form-row">
          <label>题目数量</label>
          <input type="number" id="ex-count" value="10" min="3" max="30" />
        </div>
        <div class="form-row">
          <label>每题限时（秒）</label>
          <input type="number" id="ex-time" value="${store.state.settings.defaultTimeLimitSec}" min="5" max="180" />
        </div>
        <div class="form-row">
          <label>题不够时</label>
          <select id="ex-gen">
            <option value="generate">随机装包即时生成</option>
            <option value="bank">只用题库现有题</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card__title">已保存试卷 (${papers.length})</div>
      ${
        papers.length === 0
          ? `<div class="empty-state">
               <div class="empty-state__title">还没有保存过试卷</div>
               <div class="empty-state__sub">组卷后会自动保存到 IndexedDB</div>
             </div>`
          : `<table class="table">
              <thead><tr><th>试卷名</th><th>题数</th><th>难度区间</th><th>组卷时间</th><th>操作</th></tr></thead>
              <tbody>
                ${papers
                  .sort((a, b) => b.createdAt - a.createdAt)
                  .map(
                    (p) => `<tr>
                      <td class="fw-semibold" style="color:var(--text-primary)">${p.name}</td>
                      <td>${p.questionIds.length}</td>
                      <td>${(p.minDifficulty * 100).toFixed(0)}~${(p.maxDifficulty * 100).toFixed(0)}</td>
                      <td>${new Date(p.createdAt).toLocaleString('zh-CN')}</td>
                      <td>
                        <button class="btn btn--sm btn--primary" data-start-paper="${p.id}">开始考核</button>
                        <button class="btn btn--sm btn--danger" data-del-paper="${p.id}">删除</button>
                      </td>
                    </tr>`,
                  )
                  .join('')}
              </tbody>
            </table>`
      }
    </div>`

  root.querySelectorAll<HTMLElement>('[data-paper]').forEach((btn) => {
    btn.addEventListener('click', () => buildPaper(btn.dataset.paper!, root, bank))
  })
  root.querySelectorAll<HTMLElement>('[data-start-paper]').forEach((btn) => {
    btn.addEventListener('click', () => startSavedPaper(btn.dataset.startPaper!, root))
  })
  root.querySelectorAll<HTMLElement>('[data-del-paper]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await idb.delete(STORE_NAMES.papers, btn.dataset.delPaper!)
      toast('试卷已删除')
      renderExamPage(root)
    })
  })
}

const buildPaper = async (presetId: string, root: HTMLElement, bank: Question[]): Promise<void> => {
  const preset = DIFFICULTY_PRESETS.find((p) => p.id === presetId)!
  const count = Number((root.querySelector('#ex-count') as HTMLInputElement).value)
  const timeSec = Number((root.querySelector('#ex-time') as HTMLInputElement).value)
  const genMode = (root.querySelector('#ex-gen') as HTMLSelectElement).value

  const inRange = bank.filter((q) => q.difficulty >= preset.min && q.difficulty <= preset.max)
  const picked = [...inRange].sort(() => Math.random() - 0.5).slice(0, count)
  const questions: Question[] = [...picked]

  if (questions.length < count) {
    if (genMode === 'bank') {
      toast(`题库中该难度只有 ${questions.length} 题，无法组满 ${count} 题`, 'error')
      return
    }
    let guard = 0
    while (questions.length < count && guard < count * 35) {
      guard += 1
      const q = generateQuestionInRange(preset.min, preset.max, timeSec)
      questions.push(q)
      await idb.put(STORE_NAMES.questions, q)
    }
  }

  const paper: ExamPaper = {
    id: crypto.randomUUID(),
    name: `${preset.label} ${new Date().toLocaleDateString('zh-CN')}`,
    createdAt: Date.now(),
    questionIds: questions.map((q) => q.id),
    perQuestionTimeSec: timeSec,
    minDifficulty: preset.min,
    maxDifficulty: preset.max,
  }
  await idb.put(STORE_NAMES.papers, paper)
  toast(`试卷已组好，${questions.length} 题，平均难度 ${difficultyLabel(questions.reduce((s, q) => s + q.difficulty, 0) / questions.length)}`, 'success')
  startTrainingRun(root, questions, timeSec, 'exam', paper.name)
}

const startSavedPaper = async (paperId: string, root: HTMLElement): Promise<void> => {
  const paper = await idb.get<ExamPaper>(STORE_NAMES.papers, paperId)
  if (!paper) {
    toast('试卷不存在', 'error')
    return
  }
  const all = await idb.getAll<Question>(STORE_NAMES.questions)
  const questions = paper.questionIds
    .map((id) => all.find((q) => q.id === id))
    .filter((q): q is Question => Boolean(q))
  if (questions.length === 0) {
    toast('试卷引用的题目已丢失', 'error')
    return
  }
  startTrainingRun(root, questions, paper.perQuestionTimeSec, 'exam', paper.name)
}
