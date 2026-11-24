import type {
  Annotation,
  BBox,
  GradedMatch,
  GroundTruth,
  QuestionResult,
} from './types'

export const iou = (a: BBox, b: BBox): number => {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.w, b.x + b.w)
  const y2 = Math.min(a.y + a.h, b.y + b.h)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const union = a.w * a.h + b.w * b.h - inter
  return union <= 0 ? 0 : inter / union
}

// 贪心最大 IoU 匹配：每轮取全局最高分配对，直到低于阈值
export const gradeQuestion = (
  questionId: string,
  targets: GroundTruth[],
  annotations: Annotation[],
  iouThreshold: number,
  timeUsedSec: number,
): QuestionResult => {
  const candidates: { ann: Annotation; target: GroundTruth; iou: number }[] = []
  for (const ann of annotations) {
    for (const target of targets) {
      const v = iou(ann.bbox, target.bbox)
      if (v >= iouThreshold) candidates.push({ ann, target, iou: v })
    }
  }
  candidates.sort((a, b) => b.iou - a.iou)

  const usedAnn = new Set<string>()
  const usedTarget = new Set<string>()
  const matches: GradedMatch[] = []
  for (const c of candidates) {
    if (usedAnn.has(c.ann.id) || usedTarget.has(c.target.uid)) continue
    usedAnn.add(c.ann.id)
    usedTarget.add(c.target.uid)
    matches.push({
      annotationId: c.ann.id,
      targetUid: c.target.uid,
      iou: c.iou,
      classCorrect: c.ann.contrabandClass === c.target.contrabandClass,
    })
  }

  const missedTargets = targets.filter((t) => !usedTarget.has(t.uid)).map((t) => t.uid)
  const falseAlarms = annotations.filter((a) => !usedAnn.has(a.id)).map((a) => a.id)
  const classErrors = matches.filter((m) => !m.classCorrect)

  // 计分：命中 60 分（类别正确才满分，类别错半分），漏判/误判各扣 25，下限 0
  const hitScore = matches.reduce((s, m) => s + (m.classCorrect ? 60 : 30), 0)
  const penalty = missedTargets.length * 25 + falseAlarms.length * 25
  const score = Math.max(0, Math.min(100, hitScore - penalty))

  return {
    questionId,
    annotations,
    matches,
    missedTargets,
    falseAlarms,
    classErrors,
    timeUsedSec,
    score,
    targetDetails: targets.map((t) => ({
      uid: t.uid,
      itemId: t.itemId,
      name: t.name,
      contrabandClass: t.contrabandClass,
    })),
  }
}
