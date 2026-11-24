import { getItemDef, listItemsByCategory } from './items/item_registry'
import { orientationDeviation } from './voxelizer'
import type {
  ContrabandClass,
  DifficultyFactors,
  LuggageDef,
  PlacedItem,
  Question,
  Vec3,
} from './types'

export interface RandomPackOptions {
  bagDims: Vec3
  shellMaterialId: string
  contrabandCount: number // 违禁品数量（可为 0，用于纯干扰包）
  normalCount: number // 普通物品数量
  bagRotationY?: number // 不传则随机
  allowedClasses?: ContrabandClass[] // 限定违禁品类别
  rng?: () => number
}

const defaultRng = Math.random

// 在包内随机选一个不严重越界的位置
const randomPosition = (dims: Vec3, rng: () => number): Vec3 => [
  (rng() - 0.5) * dims[0] * 0.62,
  (rng() - 0.5) * dims[1] * 0.55,
  (rng() - 0.5) * dims[2] * 0.62,
]

// 物品粗略外接半径（cm），用于最小间距约束
const roughRadius = (uid_itemId: string): number => {
  const def = getItemDef(uid_itemId)
  let maxR = 0
  for (const p of def.parts) {
    const r = Math.hypot(p.size[0], p.size[1], p.size[2])
    maxR = Math.max(maxR, r)
  }
  return maxR
}

const dist2d = (a: PlacedItem, b: PlacedItem): number =>
  Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2])

export const randomPack = (opts: RandomPackOptions): LuggageDef => {
  const rng = opts.rng ?? defaultRng
  const contrabandPool = listItemsByCategory('contraband').filter(
    (i) => !opts.allowedClasses || opts.allowedClasses.includes(i.contrabandClass!),
  )
  const normalPool = listItemsByCategory('normal')
  const placed: PlacedItem[] = []

  const tryPlace = (itemId: string): PlacedItem | null => {
    const radius = roughRadius(itemId) * 0.7
    for (let attempt = 0; attempt < 24; attempt++) {
      const candidate: PlacedItem = {
        uid: crypto.randomUUID(),
        itemId,
        position: randomPosition(opts.bagDims, rng),
        // 朝向随机：多数接近平放，少数大角度
        rotation: [
          (rng() - 0.5) * Math.PI * (rng() < 0.3 ? 1.6 : 0.6),
          rng() * Math.PI * 2,
          (rng() - 0.5) * Math.PI * (rng() < 0.3 ? 1.6 : 0.6),
        ],
        scale: 1,
      }
      const collide = placed.some((p) => dist2d(candidate, p) < radius + roughRadius(p.itemId) * 0.55)
      if (!collide) return candidate
    }
    return null
  }

  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]

  for (let i = 0; i < opts.contrabandCount && contrabandPool.length > 0; i++) {
    const item = pick(contrabandPool)
    const p = tryPlace(item.id)
    if (p) placed.push(p)
  }
  for (let i = 0; i < opts.normalCount && normalPool.length > 0; i++) {
    const item = pick(normalPool)
    const p = tryPlace(item.id)
    if (p) placed.push(p)
  }

  return {
    id: crypto.randomUUID(),
    name: '随机组包',
    dims: opts.bagDims,
    shellMaterialId: opts.shellMaterialId,
    bagRotationY: opts.bagRotationY ?? (rng() - 0.5) * Math.PI * 0.6,
    items: placed,
  }
}

// 难度三因子：遮挡程度、朝向异常、杂物拥挤
export const computeDifficulty = (luggage: LuggageDef, occlusions: Map<string, number>): DifficultyFactors => {
  const contraband = luggage.items.filter((p) => getItemDef(p.itemId).category === 'contraband')
  const targets = contraband.length > 0 ? contraband : luggage.items
  const occlusion =
    targets.reduce((sum, p) => sum + (occlusions.get(p.uid) ?? 0), 0) / Math.max(targets.length, 1)
  const orientation =
    targets.reduce((sum, p) => sum + orientationDeviation(p), 0) / Math.max(targets.length, 1)
  // 拥挤度：物品总体积估计 / 包容积
  const bagVolume = luggage.dims[0] * luggage.dims[1] * luggage.dims[2]
  const itemVolume = luggage.items.reduce((sum, p) => {
    const r = roughRadius(p.itemId)
    return sum + (4 / 3) * Math.PI * r ** 3 * 0.12
  }, 0)
  const clutter = Math.min(itemVolume / bagVolume, 1)
  return { occlusion, orientation, clutter }
}

// 综合难度 0..1，权重：遮挡 0.45 朝向 0.25 拥挤 0.3
export const difficultyScore = (f: DifficultyFactors): number =>
  f.occlusion * 0.45 + f.orientation * 0.25 + f.clutter * 0.3

export const difficultyLabel = (score: number): string => {
  if (score < 0.25) return '简单'
  if (score < 0.45) return '中等'
  if (score < 0.65) return '困难'
  return '极难'
}

let questionSeq = 0
export const buildQuestion = (
  luggage: LuggageDef,
  targets: Question['targets'],
  timeLimitSec: number,
): Question => {
  const occlusions = new Map(targets.map((t) => [t.uid, t.occlusion]))
  const factors = computeDifficulty(luggage, occlusions)
  const now = Date.now()
  questionSeq += 1
  return {
    id: crypto.randomUUID(),
    name: `题目 ${new Date(now).toLocaleDateString('zh-CN')}-${String(questionSeq).padStart(3, '0')}`,
    createdAt: now,
    updatedAt: now,
    luggage,
    difficulty: difficultyScore(factors),
    factors,
    timeLimitSec,
    targets,
    tags: [difficultyLabel(difficultyScore(factors))],
  }
}

export const BAG_PRESETS = [
  { name: '小型登机箱', dims: [35, 22, 50] as Vec3, shell: 'pp' },
  { name: '标准行李箱', dims: [42, 26, 62] as Vec3, shell: 'pp' },
  { name: '大型托运箱', dims: [50, 30, 72] as Vec3, shell: 'pvc' },
  { name: '双肩背包', dims: [30, 18, 42] as Vec3, shell: 'nylon' },
]
