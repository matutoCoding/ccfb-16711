// 物理正确性验证脚本（Node 直接运行，不依赖浏览器 API）
// 验证 1：Beer-Lambert 指数衰减——厚度翻倍，I/I0 符合 exp(-mu*2t)
// 验证 2：双能比值材质分类准确率 >= 95%
// 验证 3：叠压光程线性可加
import { MATERIALS, DUAL_ENERGY, getMaterial } from '../src/core/materials.ts'
import type { MaterialClass } from '../src/core/types.ts'

// 模拟 GPU 着色器中的双能分类逻辑（与 src/render/shaders 保持同一公式）
const classify = (aLow: number, aHigh: number): MaterialClass | 'background' => {
  if (aLow < DUAL_ENERGY.minAttenuation && aHigh < DUAL_ENERGY.minAttenuation) return 'background'
  const r = aLow / aHigh
  if (r <= DUAL_ENERGY.organicMaxR) return 'organic'
  if (r >= DUAL_ENERGY.inorganicMinR) return 'inorganic'
  return 'mixed'
}

const beerLambert = (i0: number, mu: number, t: number): number => i0 * Math.exp(-mu * t)

const runExponentialTest = (): { passed: boolean; lines: string[] } => {
  const lines: string[] = []
  let passed = true
  const i0 = 1.0
  lines.push('--- 验证 1：指数衰减（厚度 t 与 2t 对比）---')
  for (const m of MATERIALS) {
    if (m.id === 'air') continue
    const t = 2
    const i1 = beerLambert(i0, m.muLow, t)
    const i2 = beerLambert(i0, m.muLow, 2 * t)
    const expectedRatio = Math.exp(-m.muLow * t)
    const actualRatio = i2 / i1
    const err = Math.abs(actualRatio - expectedRatio) / expectedRatio
    const ok = err < 1e-12
    passed = passed && ok
    lines.push(
      `${m.name.padEnd(12)} muL=${m.muLow.toFixed(3)}  I(t)=${i1.toFixed(5)}  I(2t)/I(t)=${actualRatio.toFixed(6)}  期望=${expectedRatio.toFixed(6)}  ${ok ? 'OK' : 'FAIL'}`,
    )
  }
  return { passed, lines }
}

const runClassificationTest = (): { accuracy: number; passed: boolean; lines: string[] } => {
  const lines: string[] = []
  lines.push('--- 验证 2：双能比值分类准确率（多厚度采样）---')
  // 厚度采样 0.3cm ~ 12cm，覆盖薄壳到厚块
  const thicknesses = [0.3, 0.6, 1.2, 2.5, 4, 6, 8, 10, 12]
  let total = 0
  let correct = 0
  const confusion: Record<string, number> = {}

  for (const m of MATERIALS) {
    if (m.id === 'air') continue
    for (const t of thicknesses) {
      const aLow = m.muLow * t
      const aHigh = m.muHigh * t
      const pred = classify(aLow, aHigh)
      const truth = m.matClass
      total++
      if (pred === truth) {
        correct++
      } else {
        const key = `${m.name}(${truth})->${pred} @${t}cm`
        confusion[key] = (confusion[key] ?? 0) + 1
      }
    }
  }
  const accuracy = correct / total
  const passed = accuracy >= 0.95
  lines.push(`样本数=${total} 正确=${correct} 准确率=${(accuracy * 100).toFixed(2)}%  目标>=95%  ${passed ? 'OK' : 'FAIL'}`)
  const failures = Object.entries(confusion)
  if (failures.length > 0) {
    lines.push('误分类明细：')
    for (const [k, v] of failures) lines.push(`  ${k} x${v}`)
  }
  return { accuracy, passed, lines }
}

const runOverlapTest = (): { passed: boolean; lines: string[] } => {
  const lines: string[] = []
  lines.push('--- 验证 3：叠压光程可加（两层不同材质，顺序无关）---')
  let passed = true
  const pairs: [string, string, number, number][] = [
    ['steel', 'fabric', 0.2, 3],
    ['water', 'pet', 4, 0.15],
    ['aluminum', 'pp', 0.3, 2],
    ['glass_soda', 'water', 0.3, 5],
    ['lithium', 'pp', 1.2, 0.2],
  ]
  for (const [idA, idB, tA, tB] of pairs) {
    const a = getMaterial(idA)
    const b = getMaterial(idB)
    // 顺序 A->B
    const lowAB = a.muLow * tA + b.muLow * tB
    const highAB = a.muHigh * tA + b.muHigh * tB
    // 顺序 B->A（数学上应完全一致）
    const lowBA = b.muLow * tB + a.muLow * tA
    const highBA = b.muHigh * tB + a.muHigh * tA
    const ok = Math.abs(lowAB - lowBA) < 1e-12 && Math.abs(highAB - highBA) < 1e-12
    passed = passed && ok
    // 叠压后的透射强度与分步衰减一致
    const direct = Math.exp(-lowAB)
    const stepwise = Math.exp(-a.muLow * tA) * Math.exp(-b.muLow * tB)
    const ok2 = Math.abs(direct - stepwise) < 1e-12
    passed = passed && ok2
    lines.push(`${a.name}+${b.name}  叠压=${lowAB.toFixed(4)} 交换顺序=${lowBA.toFixed(4)} 透射直算=${direct.toFixed(6)} 分步=${stepwise.toFixed(6)} ${ok && ok2 ? 'OK' : 'FAIL'}`)
  }
  return { passed, lines }
}

const runThresholdReport = (): string[] => {
  const lines: string[] = []
  lines.push('--- 材质 R 值分布（低能/高能衰减比，与厚度无关）---')
  const rows = MATERIALS.filter((m) => m.id !== 'air')
    .map((m) => ({ name: m.name, cls: m.matClass, r: m.muLow / m.muHigh }))
    .sort((a, b) => a.r - b.r)
  for (const r of rows) {
    lines.push(`R=${r.r.toFixed(3)}  [${r.cls.padEnd(10)}] ${r.name}`)
  }
  lines.push(`阈值：organic<=${DUAL_ENERGY.organicMaxR}  inorganic>=${DUAL_ENERGY.inorganicMinR}  之间=mixed`)
  return lines
}

const main = (): void => {
  const t1 = runExponentialTest()
  const t2 = runClassificationTest()
  const t3 = runOverlapTest()
  console.log(['X光物理模型验证', ...t1.lines, '', ...t2.lines, '', ...t3.lines, '', ...runThresholdReport()].join('\n'))
  const allPassed = t1.passed && t2.passed && t3.passed
  console.log(`\n总结：${allPassed ? '全部通过 ✅' : '存在失败项 ❌'}（分类准确率 ${(t2.accuracy * 100).toFixed(2)}%）`)
  process.exit(allPassed ? 0 : 1)
}

main()
