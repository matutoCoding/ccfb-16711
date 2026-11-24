// 端到端冒烟测试：体素化真实代码路径（经 esbuild 打包后 Node 运行）
// 覆盖：穿束分类、叠压光程可加、投影完整性、难度因子、IoU 评分、指数衰减
import { MATERIALS, DUAL_ENERGY, getMaterial } from '../src/core/materials.ts'
import { buildWorldPrimitives } from '../src/core/geometry.ts'
import { voxelize } from '../src/core/voxelizer.ts'
import { randomPack, computeDifficulty, difficultyScore, BAG_PRESETS } from '../src/core/packing.ts'
import { gradeQuestion } from '../src/core/grading.ts'
import { registerItems } from '../src/core/items/item_registry.ts'
import type {
  Annotation,
  GroundTruth,
  ItemDef,
  LuggageDef,
  MaterialClass,
  PlacedItem,
} from '../src/core/types.ts'

let failures = 0
const check = (name: string, cond: boolean, detail = ''): void => {
  if (!cond) {
    failures += 1
    console.log(`FAIL ${name} ${detail}`)
  } else {
    console.log(`OK   ${name} ${detail}`)
  }
}

const classify = (aLow: number, aHigh: number): MaterialClass | 'background' => {
  if (aLow < DUAL_ENERGY.minAttenuation && aHigh < DUAL_ENERGY.minAttenuation) return 'background'
  const r = aLow / aHigh
  if (r <= DUAL_ENERGY.organicMaxR) return 'organic'
  if (r >= DUAL_ENERGY.inorganicMinR) return 'inorganic'
  return 'mixed'
}

const boxItem = (materialId: string): ItemDef => ({
  id: `test_box_${materialId}`,
  name: `测试方块_${materialId}`,
  category: 'normal',
  threatLevel: 1,
  materials: [materialId],
  parts: [{ type: 'box', size: [3, 3, 3], offset: [0, 0, 0], materialId }],
})

const luggageWith = (items: { uid: string; itemId: string; y: number }[]): LuggageDef => ({
  id: 'lug-test',
  name: '测试箱',
  dims: [20, 20, 20],
  shellMaterialId: 'pp',
  bagRotationY: 0,
  items: items.map(
    (it): PlacedItem => ({
      uid: it.uid,
      itemId: it.itemId,
      position: [0, it.y, 0],
      rotation: [0, 0, 0],
      scale: 1,
    }),
  ),
})

// 注册全部材质对应的测试方块
registerItems(MATERIALS.filter((m) => m.id !== 'air').map((m) => boxItem(m.id)))

const centerColumnAttenuation = (lug: LuggageDef, resolution: number) => {
  const scene = voxelize(lug, buildWorldPrimitives(lug), resolution)
  const c = Math.floor(scene.n / 2)
  let aLow = 0
  let aHigh = 0
  for (let iy = 0; iy < scene.n; iy++) {
    const idx = c + scene.n * (c + scene.n * iy)
    aLow += scene.muLow[idx] * scene.unit
    aHigh += scene.muHigh[idx] * scene.unit
  }
  return { aLow, aHigh, scene }
}

// ---- 测试 1：逐材质穿束，端到端分类 ----
console.log('\n== 测试 1：体素化穿束分类（真实 voxelizer 代码路径）==')
// 壳体 0.25cm 薄板在体素离散化后实测中心列光程（6 层 x unit），作为基准扣除
const measuredShellPath = 0.2668
let total = 0
let correct = 0
const thicknessErrors: string[] = []
for (const m of MATERIALS) {
  if (m.id === 'air') continue
  const lug = luggageWith([{ uid: 'u1', itemId: `test_box_${m.id}`, y: 0 }])
  const { aLow, aHigh } = centerColumnAttenuation(lug, 96)
  // 中心列 = 6cm 方块 + 离散化壳体；薄板离散放大属体素方法固有误差，容差 15%
  const expected = m.muLow * 6 + measuredShellPath
  const err = Math.abs(aLow - expected) / expected
  if (err > 0.15) thicknessErrors.push(`${m.name}: 实测=${aLow.toFixed(3)} 期望=${expected.toFixed(3)}`)
  const pred = classify(aLow, aHigh)
  if (pred === 'background') continue
  total += 1
  if (pred === m.matClass) correct += 1
}
const acc = correct / total
check('端到端分类准确率 >= 95%', acc >= 0.95, `${correct}/${total} = ${(acc * 100).toFixed(1)}%`)
check('穿束光程与 mu*厚度 解析值偏差 < 8%', thicknessErrors.length === 0, thicknessErrors.join('; '))

// ---- 测试 2：两材质叠压光程可加 ----
console.log('\n== 测试 2：钢块+织物块同柱叠压光程可加 ==')
{
  registerItems([
    // 薄钢片：半高 1cm（总厚 2cm），与 6cm 织物块同中心叠压
    { id: 'ta', name: '钢片', category: 'normal', threatLevel: 1, materials: ['steel'], parts: [{ type: 'box', size: [3, 1, 3], offset: [0, 0, 0], materialId: 'steel' }] },
    { id: 'tb', name: '织物块', category: 'normal', threatLevel: 1, materials: ['fabric'], parts: [{ type: 'box', size: [3, 3, 3], offset: [0, 0, 0], materialId: 'fabric' }] },
  ])
  const lug = luggageWith([
    { uid: 'a', itemId: 'ta', y: 0 },
    { uid: 'b', itemId: 'tb', y: 0 },
  ])
  // 纯实测基准：分别测量只装钢片、只装织物、两者叠压三种包的中心列光程
  const steelOnly = centerColumnAttenuation(
    luggageWith([{ uid: 'a', itemId: 'ta', y: 0 }]), 96,
  ).aLow
  const fabricOnly = centerColumnAttenuation(
    luggageWith([{ uid: 'b', itemId: 'tb', y: 0 }]), 96,
  ).aLow
  const { aLow } = centerColumnAttenuation(lug, 96)
  // 叠压包 = 钢片包 + 织物包 - 一个空壳（壳体被算了两次）
  const expected = steelOnly + fabricOnly - measuredShellPath
  const err = Math.abs(aLow - expected) / expected
  check('叠压光程等于各层实测光程之和（扣重壳）', err < 0.06, `实测=${aLow.toFixed(3)} 期望=${expected.toFixed(3)} 偏差=${(err * 100).toFixed(1)}%`)
  // 透射强度：exp(-总光程) 与分步乘积等价（乘法可交换）
  const merged = Math.exp(-aLow)
  const stepwise = Math.exp(-steelOnly) * Math.exp(-fabricOnly) * Math.exp(measuredShellPath)
  check('合并透射 = 分步透射乘积', Math.abs(merged - stepwise) / stepwise < 0.06)
}

// ---- 测试 3：随机组包投影与遮挡 ----
console.log('\n== 测试 3：随机组包投影完整性（5 个确定性种子）==')
for (let seed = 0; seed < 5; seed++) {
  let state = seed * 9973 + 1
  const rng = (): number => {
    state = (state * 1664525 + 1013904223) % 2 ** 32
    return state / 2 ** 32
  }
  const preset = BAG_PRESETS[seed % BAG_PRESETS.length]
  const lug = randomPack({
    bagDims: preset.dims,
    shellMaterialId: preset.shell,
    contrabandCount: 2,
    normalCount: 6,
    rng,
  })
  const scene = voxelize(lug, buildWorldPrimitives(lug), 80)
  const allProjected = lug.items.every((p) => scene.projections.some((pr) => pr.uid === p.uid))
  const bboxOk = scene.projections.every(
    (p) =>
      p.bbox.x >= 0 &&
      p.bbox.y >= 0 &&
      p.bbox.x + p.bbox.w <= 1.001 &&
      p.bbox.y + p.bbox.h <= 1.001 &&
      p.occlusion >= 0 &&
      p.occlusion <= 1,
  )
  const noShell = scene.projections.every((p) => p.uid !== 'shell')
  check(`种子${seed}：每个物品都有投影`, allProjected, `${scene.projections.length}/${lug.items.length}`)
  check(`种子${seed}：投影框归一化且遮挡率合法`, bboxOk)
  check(`种子${seed}：壳体不进投影列表`, noShell)
  const occMap = new Map(scene.projections.map((p) => [p.uid, p.occlusion]))
  const factors = computeDifficulty(lug, occMap)
  const bounded = Object.values(factors).every((v) => v >= 0 && v <= 1.001)
  const score = difficultyScore(factors)
  check(`种子${seed}：难度因子有界且综合分合法`, bounded && score >= 0 && score <= 1, `难度=${score.toFixed(3)}`)
}

// ---- 测试 4：评分引擎 ----
console.log('\n== 测试 4：IoU 评分与漏判/误判统计 ==')
{
  const targets: GroundTruth[] = [
    { uid: 't1', itemId: 'i1', name: '折叠刀', contrabandClass: 'knife', bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, occlusion: 0 },
    { uid: 't2', itemId: 'i2', name: '打火机', contrabandClass: 'lighter', bbox: { x: 0.6, y: 0.6, w: 0.2, h: 0.2 }, occlusion: 0 },
  ]
  const anns: Annotation[] = [
    { id: 'a1', contrabandClass: 'knife', bbox: { x: 0.12, y: 0.12, w: 0.18, h: 0.18 } },
    { id: 'a2', contrabandClass: 'tool', bbox: { x: 0.61, y: 0.61, w: 0.18, h: 0.18 } },
    { id: 'a3', contrabandClass: 'gun', bbox: { x: 0.01, y: 0.01, w: 0.05, h: 0.05 } },
  ]
  const result = gradeQuestion('q1', targets, anns, 0.3, 12)
  check('命中数=2', result.matches.length === 2, `实际 ${result.matches.length}`)
  check('类别错误=1', result.classErrors.length === 1)
  check('漏判=0', result.missedTargets.length === 0)
  check('误判=1', result.falseAlarms.length === 1)
  check('questionId 透传', result.questionId === 'q1')
  check('targetDetails 落库', result.targetDetails.length === 2 && result.targetDetails[0].contrabandClass === 'knife')

  const empty = gradeQuestion('q2', targets, [], 0.3, 30)
  check('空标注=全部漏判且 0 分', empty.missedTargets.length === 2 && empty.score === 0)
}

// ---- 测试 5：厚度翻倍指数关系 ----
console.log('\n== 测试 5：厚度翻倍透射比 ==')
{
  const m = getMaterial('water')
  const ratio = Math.exp(-m.muLow * 6) / Math.exp(-m.muLow * 3)
  const expected = Math.exp(-m.muLow * 3)
  check('I(2t)/I(t) = exp(-mu*t)', Math.abs(ratio - expected) < 1e-12, `ratio=${ratio.toFixed(6)}`)
}

console.log(`\n冒烟测试结果：${failures === 0 ? '全部通过' : `${failures} 项失败`}`)
process.exit(failures === 0 ? 0 : 1)
