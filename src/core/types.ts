// 全局领域类型定义

// 材质按双能判别归属的三大类
export type MaterialClass = 'organic' | 'mixed' | 'inorganic'

// 材质物理参数：线性衰减系数单位 cm^-1，对应双能端点能量
export interface MaterialDef {
  id: string
  name: string
  matClass: MaterialClass
  density: number // g/cm^3
  muLow: number // 低能(约 50keV 有效能量)线性衰减系数 cm^-1
  muHigh: number // 高能(约 100keV 有效能量)线性衰减系数 cm^-1
}

export type PrimitiveType = 'box' | 'sphere' | 'cylinder' | 'cone' | 'ellipsoid'

// 组成物品的单个几何体（尺寸单位 cm，物品本地坐标系）
export interface Primitive {
  type: PrimitiveType
  // box: 半尺寸; sphere/ellipsoid: 三轴半径; cylinder/cone: [半径, 半径, 半高]
  size: [number, number, number]
  offset: [number, number, number]
  // 本地欧拉角(弧度)，旋转中心为几何体中心(offset 处)
  rotation?: [number, number, number]
  materialId: string
}

export type ItemCategory = 'contraband' | 'normal'

// 违禁品细分类别（判图标注用）
export type ContrabandClass =
  | 'knife'
  | 'lighter'
  | 'liquid'
  | 'powerbank'
  | 'gun'
  | 'explosive'
  | 'tool'
  | 'other'

export interface ItemDef {
  id: string
  name: string
  category: ItemCategory
  contrabandClass?: ContrabandClass
  threatLevel: 1 | 2 | 3
  materials: string[]
  parts: Primitive[]
}

export type Vec3 = [number, number, number]

export interface PlacedItem {
  uid: string
  itemId: string
  position: Vec3
  rotation: Vec3 // 欧拉角 XYZ
  scale: number
}

export interface LuggageDef {
  id: string
  name: string
  dims: Vec3 // 箱体内部尺寸 cm（长x高x宽）
  shellMaterialId: string
  bagRotationY: number // 包在传送带上的偏航角
  items: PlacedItem[]
}

export interface BBox {
  x: number // 归一化左上角 0..1
  y: number
  w: number
  h: number
}

export interface GroundTruth {
  uid: string
  itemId: string
  name: string
  contrabandClass: ContrabandClass
  bbox: BBox
  occlusion: number // 被遮挡比例 0..1
}

export interface DifficultyFactors {
  occlusion: number // 平均遮挡
  orientation: number // 朝向异常度 0..1
  clutter: number // 杂物拥挤度 0..1
}

export interface Question {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  luggage: LuggageDef
  difficulty: number // 综合难度 0..1
  factors: DifficultyFactors
  timeLimitSec: number
  targets: GroundTruth[]
  tags: string[]
}

export interface Annotation {
  id: string
  contrabandClass: ContrabandClass
  bbox: BBox
}

export interface GradedMatch {
  annotationId: string
  targetUid: string
  iou: number
  classCorrect: boolean
}

export interface QuestionResult {
  questionId: string
  annotations: Annotation[]
  matches: GradedMatch[]
  missedTargets: string[]
  falseAlarms: string[]
  classErrors: GradedMatch[]
  timeUsedSec: number
  score: number
  targetDetails: {
    uid: string
    itemId: string
    name: string
    contrabandClass: ContrabandClass
  }[]
}

export interface ExamPaper {
  id: string
  name: string
  createdAt: number
  questionIds: string[]
  perQuestionTimeSec: number
  minDifficulty: number
  maxDifficulty: number
}

export interface Student {
  id: string
  name: string
  org: string
  createdAt: number
}

export interface ExamRecord {
  id: string
  paperId: string
  paperName: string
  studentId: string
  startedAt: number
  finishedAt: number
  results: QuestionResult[]
  totalScore: number
}

export interface RgbColor {
  r: number
  g: number
  b: number
}

// 机型伪彩配置（模拟不同厂家双能机的上色风格）
export interface MachineProfile {
  id: string
  name: string
  organic: RgbColor
  inorganic: RgbColor
  mixed: RgbColor
  shellTint: RgbColor
  background: RgbColor
  gainLow: number
  gainHigh: number
  noiseLevel: number
}

export interface AppSettings {
  machineProfileId: string
  voxelResolution: number
  renderScale: number
  defaultTimeLimitSec: number
  iouThreshold: number
  currentStudentId: string | null
}

export interface ExportBundle {
  format: 'xray-trainer-bundle'
  version: 1
  exportedAt: number
  questions: Question[]
  items: ItemDef[]
  papers: ExamPaper[]
}
