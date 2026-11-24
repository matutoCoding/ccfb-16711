import { gradeQuestion } from './grading'
import { renderLuggageToScene } from './question_service'
import type { Annotation, ExamRecord, Question, QuestionResult } from './types'
import type { VoxelScene } from './voxelizer'

export interface TrainingConfig {
  questionIds: string[]
  perQuestionTimeSec: number
  iouThreshold: number
  studentId: string
  paperName: string
  source: 'training' | 'exam'
}

export interface SessionSnapshot {
  index: number
  total: number
  question: Question
  scene: VoxelScene
  remainSec: number
  annotations: Annotation[]
  lastResult: QuestionResult | null
  phase: 'answering' | 'review' | 'finished'
}

export class TrainingSession {
  private questions: Question[]
  private scenes = new Map<string, VoxelScene>()
  private annotations: Annotation[] = []
  private results: QuestionResult[] = []
  private index = 0
  private remainSec: number
  private timerId: number | undefined
  private phase: SessionSnapshot['phase'] = 'answering'
  private cfg: TrainingConfig
  private onTick: (snap: SessionSnapshot) => void

  constructor(cfg: TrainingConfig, questions: Question[], onTick: (snap: SessionSnapshot) => void, resolution: number) {
    this.cfg = cfg
    this.questions = questions
    this.onTick = onTick
    this.remainSec = questions[0]?.timeLimitSec ?? cfg.perQuestionTimeSec
    for (const q of questions) {
      this.scenes.set(q.id, renderLuggageToScene(q.luggage, resolution))
    }
  }

  get current(): Question {
    return this.questions[this.index]
  }

  get currentScene(): VoxelScene {
    return this.scenes.get(this.current.id)!
  }

  start(): void {
    this.phase = 'answering'
    this.annotations = []
    this.remainSec = this.current.timeLimitSec || this.cfg.perQuestionTimeSec
    this.emit()
    this.timerId = window.setInterval(() => this.tick(), 1000)
  }

  private tick(): void {
    this.remainSec -= 1
    if (this.remainSec <= 0) {
      this.remainSec = 0
      this.submit(true)
      return
    }
    this.emit()
  }

  addAnnotation(ann: Annotation): void {
    if (this.phase !== 'answering') return
    this.annotations.push(ann)
    this.emit()
  }

  removeAnnotation(id: string): void {
    this.annotations = this.annotations.filter((a) => a.id !== id)
    this.emit()
  }

  getAnnotationList(): Annotation[] {
    return [...this.annotations]
  }

  // 提交判图，timeout=true 表示超时自动交卷
  submit(timeout = false): QuestionResult {
    window.clearInterval(this.timerId)
    const used = (this.current.timeLimitSec || this.cfg.perQuestionTimeSec) - this.remainSec
    const result = gradeQuestion(
      this.current.id,
      this.current.targets,
      this.annotations,
      this.cfg.iouThreshold,
      timeout ? this.current.timeLimitSec || this.cfg.perQuestionTimeSec : used,
    )
    this.results.push(result)
    this.phase = 'review'
    this.emit()
    return result
  }

  next(): void {
    if (this.index + 1 >= this.questions.length) {
      this.phase = 'finished'
      this.emit()
      return
    }
    this.index += 1
    this.annotations = []
    this.phase = 'answering'
    this.remainSec = this.current.timeLimitSec || this.cfg.perQuestionTimeSec
    this.start()
  }

  buildRecord(): ExamRecord {
    const now = Date.now()
    const totalScore = Math.round(
      this.results.reduce((sum, r) => sum + r.score, 0) / Math.max(this.results.length, 1),
    )
    return {
      id: crypto.randomUUID(),
      paperId: this.cfg.source === 'exam' ? this.cfg.paperName : 'training',
      paperName: this.cfg.paperName,
      studentId: this.cfg.studentId,
      startedAt: now - this.results.reduce((s, r) => s + r.timeUsedSec, 0) * 1000,
      finishedAt: now,
      results: this.results,
      totalScore,
    }
  }

  get resultsList(): QuestionResult[] {
    return this.results
  }

  stop(): void {
    window.clearInterval(this.timerId)
  }

  private emit(): void {
    this.onTick({
      index: this.index,
      total: this.questions.length,
      question: this.current,
      scene: this.currentScene,
      remainSec: this.remainSec,
      annotations: [...this.annotations],
      lastResult: this.results[this.results.length - 1] ?? null,
      phase: this.phase,
    })
  }
}
