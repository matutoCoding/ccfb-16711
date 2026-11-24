import { ALL_ITEMS } from './items/item_registry'
import { idb, STORE_NAMES } from '../data/idb'
import type { ExamPaper, ExportBundle, Question } from './types'

// 导出：题目 + 物品定义 + 试卷，打成单个 JSON bundle 下载
export const exportBundle = async (): Promise<void> => {
  const [questions, papers] = await Promise.all([
    idb.getAll<Question>(STORE_NAMES.questions),
    idb.getAll<ExamPaper>(STORE_NAMES.papers),
  ])
  const bundle: ExportBundle = {
    format: 'xray-trainer-bundle',
    version: 1,
    exportedAt: Date.now(),
    questions,
    items: ALL_ITEMS,
    papers,
  }
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `xray_questions_${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

interface ImportResult {
  questions: number
  papers: number
  skipped: number
}

// 导入：校验格式后按 id 合并（同 id 覆盖，物品定义仅用于版本校验不覆盖内置库）
export const importBundle = async (file: File): Promise<ImportResult> => {
  const text = await file.text()
  const data = JSON.parse(text) as Partial<ExportBundle>
  if (data.format !== 'xray-trainer-bundle' || !Array.isArray(data.questions)) {
    throw new Error('文件格式不合法：不是本系统导出的题库 bundle')
  }
  let skipped = 0
  for (const q of data.questions) {
    if (!q.id || !q.luggage || !Array.isArray(q.targets)) {
      skipped += 1
      continue
    }
    await idb.put(STORE_NAMES.questions, q)
  }
  let papers = 0
  for (const p of data.papers ?? []) {
    if (!p.id || !Array.isArray(p.questionIds)) {
      skipped += 1
      continue
    }
    await idb.put(STORE_NAMES.papers, p)
    papers += 1
  }
  return { questions: data.questions.length - skipped, papers, skipped }
}
