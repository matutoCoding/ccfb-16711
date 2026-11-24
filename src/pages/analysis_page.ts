import { idb, STORE_NAMES } from '../data/idb'
import { CONTRABAND_CLASS_LABELS } from '../core/items/item_registry'
import type { ContrabandClass, ExamRecord, Student } from '../core/types'
import { iconSvg } from '../ui/icons'
import { escapeHtml } from '../ui/toast'

interface ClassStat {
  cls: ContrabandClass
  total: number
  hit: number
  miss: number
  classError: number
}

const ALL_CLASSES: ContrabandClass[] = [
  'knife', 'lighter', 'liquid', 'powerbank', 'gun', 'explosive', 'tool', 'other',
]

// 汇总单名学员所有考核记录，按违禁品类别聚合命中/漏判/类别错误
const aggregate = (records: ExamRecord[]): { stats: ClassStat[]; falseAlarms: number; avgScore: number; exams: number } => {
  const map = new Map<ContrabandClass, ClassStat>()
  for (const cls of ALL_CLASSES) map.set(cls, { cls, total: 0, hit: 0, miss: 0, classError: 0 })
  let falseAlarms = 0
  let scoreSum = 0
  let examCount = 0

  for (const rec of records) {
    examCount += 1
    scoreSum += rec.totalScore
    for (const r of rec.results) {
      falseAlarms += r.falseAlarms.length
      const matchedTarget = new Map(r.matches.map((m) => [m.targetUid, m.classCorrect]))
      for (const detail of r.targetDetails) {
        const stat = map.get(detail.contrabandClass)!
        stat.total += 1
        const correct = matchedTarget.get(detail.uid)
        if (correct === true) stat.hit += 1
        else if (correct === false) stat.classError += 1
        else stat.miss += 1
      }
    }
  }
  return {
    stats: [...map.values()].filter((s) => s.total > 0),
    falseAlarms,
    avgScore: examCount > 0 ? Math.round(scoreSum / examCount) : 0,
    exams: examCount,
  }
}

export const renderAnalysisPage = async (root: HTMLElement): Promise<void> => {
  const students = await idb.getAll<Student>(STORE_NAMES.students)
  const records = await idb.getAll<ExamRecord>(STORE_NAMES.records)

  root.innerHTML = `
    <div class="flex-between mb-4">
      <div class="flex-center">
        <select id="an-student" style="width:220px">
          ${students.map((s) => `<option value="${s.id}">${escapeHtml(s.name)} · ${escapeHtml(s.org)}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn--ghost btn--sm" id="an-clear">${iconSvg.trash()} 清空该学员成绩</button>
    </div>
    <div id="an-body"></div>`

  const body = root.querySelector('#an-body') as HTMLElement
  const draw = (): void => {
    const sid = (root.querySelector('#an-student') as HTMLSelectElement).value
    const mine = records.filter((r) => r.studentId === sid)
    const agg = aggregate(mine)

    if (mine.length === 0) {
      body.innerHTML = `
        <div class="card empty-state">
          <div class="empty-state__title">暂无考核记录</div>
          <div class="empty-state__sub">完成判图训练或考核后，这里会按物品类别给出命中率分析</div>
        </div>`
      return
    }

    const weakFirst = [...agg.stats].sort((a, b) => a.hit / a.total - b.hit / b.total)
    body.innerHTML = `
      <div class="grid grid--4 mb-4">
        <div class="stat-tile"><div class="stat-tile__label">考核次数</div><div class="stat-tile__value">${agg.exams}</div></div>
        <div class="stat-tile"><div class="stat-tile__label">平均分</div><div class="stat-tile__value ${agg.avgScore >= 60 ? 'text-success' : 'text-danger'}">${agg.avgScore}</div></div>
        <div class="stat-tile"><div class="stat-tile__label">误判总次数</div><div class="stat-tile__value text-warning">${agg.falseAlarms}</div></div>
        <div class="stat-tile"><div class="stat-tile__label">最弱类别</div><div class="stat-tile__value fs-md" style="font-size:var(--fs-lg)">${weakFirst[0] ? CONTRABAND_CLASS_LABELS[weakFirst[0].cls] : '-'}</div></div>
      </div>

      <div class="card mb-4">
        <div class="card__title">分类别命中率（按命中率从低到高，红色为重点弱项）</div>
        ${weakFirst
          .map((s) => {
            const rate = s.hit / s.total
            const tone = rate >= 0.85 ? 'var(--success)' : rate >= 0.6 ? 'var(--warning)' : 'var(--danger)'
            return `
              <div class="mb-4">
                <div class="flex-between mb-4">
                  <span class="fw-semibold">${CONTRABAND_CLASS_LABELS[s.cls]}</span>
                  <span class="text-secondary">命中 ${s.hit}/${s.total} · 漏判 ${s.miss} · 类别错 ${s.classError} · 命中率 <span style="color:${tone}" class="fw-semibold">${(rate * 100).toFixed(1)}%</span></span>
                </div>
                <div class="progress-bar">
                  <div class="progress-bar__fill" style="width:${(rate * 100).toFixed(1)}%; background:${tone}"></div>
                </div>
              </div>`
          })
          .join('')}
      </div>

      <div class="card">
        <div class="card__title">历史考核记录</div>
        <table class="table">
          <thead><tr><th>试卷</th><th>完成时间</th><th>题数</th><th>总分</th><th>漏判</th><th>误判</th></tr></thead>
          <tbody>
            ${mine
              .sort((a, b) => b.finishedAt - a.finishedAt)
              .map((rec) => {
                const miss = rec.results.reduce((s, r) => s + r.missedTargets.length, 0)
                const fa = rec.results.reduce((s, r) => s + r.falseAlarms.length, 0)
                return `<tr>
                  <td class="fw-semibold" style="color:var(--text-primary)">${escapeHtml(rec.paperName)}</td>
                  <td>${new Date(rec.finishedAt).toLocaleString('zh-CN')}</td>
                  <td>${rec.results.length}</td>
                  <td class="${rec.totalScore >= 60 ? 'text-success' : 'text-danger'} fw-semibold">${rec.totalScore}</td>
                  <td class="text-danger">${miss}</td>
                  <td class="text-warning">${fa}</td>
                </tr>`
              })
              .join('')}
          </tbody>
        </table>
      </div>`
  }

  root.querySelector('#an-student')!.addEventListener('change', draw)
  root.querySelector('#an-clear')!.addEventListener('click', async () => {
    const sid = (root.querySelector('#an-student') as HTMLSelectElement).value
    for (const rec of records.filter((r) => r.studentId === sid)) {
      await idb.delete(STORE_NAMES.records, rec.id)
    }
    location.hash = '/analysis'
  })
  draw()
}
