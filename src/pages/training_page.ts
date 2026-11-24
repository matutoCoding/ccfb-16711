import { idb, STORE_NAMES } from '../data/idb'
import { difficultyLabel } from '../core/packing'
import type { Question } from '../core/types'
import { store } from '../ui/store'
import { iconSvg } from '../ui/icons'
import { startTrainingRun } from './training_run'

export const renderTrainingPage = async (root: HTMLElement): Promise<void> => {
  const questions = await idb.getAll<Question>(STORE_NAMES.questions)
  const hasContraband = questions.filter((q) => q.targets.length > 0)

  root.innerHTML = `
    <div class="grid grid--4 mb-4">
      <div class="stat-tile">
        <div class="stat-tile__label">题库总量</div>
        <div class="stat-tile__value">${questions.length}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">含违禁品题目</div>
        <div class="stat-tile__value text-danger">${hasContraband.length}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">默认限时</div>
        <div class="stat-tile__value">${store.state.settings.defaultTimeLimitSec}s</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">IoU 判定阈值</div>
        <div class="stat-tile__value">${store.state.settings.iouThreshold}</div>
      </div>
    </div>

    <div class="card mb-4">
      <div class="card__title">训练配置</div>
      <div class="grid grid--3">
        <div class="form-row">
          <label>出题范围</label>
          <select id="tr-scope">
            <option value="all">全部题目 (${questions.length})</option>
            <option value="contraband">仅含违禁品 (${hasContraband.length})</option>
            <option value="random20">随机抽 20 题</option>
            <option value="easy">简单题</option>
            <option value="hard">困难及以上</option>
          </select>
        </div>
        <div class="form-row">
          <label>每题限时（秒）</label>
          <input type="number" id="tr-time" value="${store.state.settings.defaultTimeLimitSec}" min="5" max="180" />
        </div>
        <div class="form-row" style="justify-content:flex-end">
          <button class="btn btn--primary" id="tr-start" ${questions.length === 0 ? 'disabled' : ''}>
            ${iconSvg.play()} 开始限时训练
          </button>
        </div>
      </div>
      ${
        questions.length === 0
          ? `<div class="empty-state">
               <div class="empty-state__title">题库还是空的</div>
               <div class="empty-state__sub">先去「行李组包」页面装包并存题，或在考核页生成随机卷</div>
             </div>`
          : ''
      }
    </div>

    <div class="card">
      <div class="card__title">题目清单</div>
      <table class="table">
        <thead><tr><th>题目</th><th>难度</th><th>目标数</th><th>物品数</th><th>限时</th><th>遮挡因子</th></tr></thead>
        <tbody>
          ${questions
            .sort((a, b) => b.createdAt - a.createdAt)
            .map(
              (q) => `<tr>
                <td class="fw-semibold" style="color:var(--text-primary)">${q.name}</td>
                <td><span class="tag ${q.difficulty >= 0.45 ? 'tag--warning' : 'tag--success'}">${difficultyLabel(q.difficulty)} ${(q.difficulty * 100).toFixed(0)}</span></td>
                <td class="${q.targets.length > 0 ? 'text-danger' : ''} fw-semibold">${q.targets.length}</td>
                <td>${q.luggage.items.length}</td>
                <td>${q.timeLimitSec}s</td>
                <td>${(q.factors.occlusion * 100).toFixed(0)}%</td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`

  if (questions.length === 0) return
  root.querySelector<HTMLElement>('#tr-start')!.addEventListener('click', () => {
    const scope = (root.querySelector('#tr-scope') as HTMLSelectElement).value
    const time = Number((root.querySelector('#tr-time') as HTMLInputElement).value)
    let pool = [...questions]
    if (scope === 'contraband') pool = hasContraband
    if (scope === 'easy') pool = questions.filter((q) => q.difficulty < 0.25)
    if (scope === 'hard') pool = questions.filter((q) => q.difficulty >= 0.45)
    if (scope === 'random20') pool = questions.sort(() => Math.random() - 0.5).slice(0, 20)
    if (pool.length === 0) {
      return
    }
    startTrainingRun(root, pool, time, 'training', '自由训练')
  })
}
