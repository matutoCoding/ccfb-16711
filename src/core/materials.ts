import type { MaterialDef } from './types'

// 线性衰减系数依据 NIST XCOM 数据库取值
// 低能有效能量 55keV，高能有效能量 110keV（双能安检机典型有效能量）
// 单位：mu cm^-1，密度 g/cm^3
export const MATERIALS: MaterialDef[] = [
  { id: 'air', name: '空气', matClass: 'organic', density: 0.0012, muLow: 0.0001, muHigh: 0.0001 },
  { id: 'water', name: '水', matClass: 'organic', density: 1.0, muLow: 0.226, muHigh: 0.17 },
  { id: 'polyethylene', name: '聚乙烯(PE)', matClass: 'organic', density: 0.94, muLow: 0.203, muHigh: 0.154 },
  { id: 'pp', name: '聚丙烯(PP)', matClass: 'organic', density: 0.9, muLow: 0.194, muHigh: 0.147 },
  { id: 'pvc', name: '聚氯乙烯(PVC)', matClass: 'organic', density: 1.4, muLow: 0.337, muHigh: 0.216 },
  { id: 'pet', name: '聚酯(PET瓶)', matClass: 'organic', density: 1.38, muLow: 0.296, muHigh: 0.212 },
  { id: 'nylon', name: '尼龙', matClass: 'organic', density: 1.14, muLow: 0.254, muHigh: 0.186 },
  { id: 'rubber', name: '橡胶/硅胶', matClass: 'organic', density: 1.15, muLow: 0.265, muHigh: 0.19 },
  { id: 'paper', name: '纸张/纸板', matClass: 'organic', density: 0.9, muLow: 0.2, muHigh: 0.149 },
  { id: 'wood', name: '木材', matClass: 'organic', density: 0.7, muLow: 0.155, muHigh: 0.116 },
  { id: 'fabric', name: '织物/衣物', matClass: 'organic', density: 0.4, muLow: 0.089, muHigh: 0.066 },
  { id: 'food', name: '食品(有机质)', matClass: 'organic', density: 1.05, muLow: 0.238, muHigh: 0.178 },
  { id: 'wax', name: '石蜡/油脂', matClass: 'organic', density: 0.92, muLow: 0.198, muHigh: 0.151 },
  { id: 'lithium', name: '锂(电芯)', matClass: 'organic', density: 0.534, muLow: 0.102, muHigh: 0.072 },
  { id: 'ceramic', name: '陶瓷', matClass: 'mixed', density: 2.6, muLow: 0.72, muHigh: 0.38 },
  { id: 'glass_soda', name: '钠钙玻璃', matClass: 'mixed', density: 2.5, muLow: 0.79, muHigh: 0.41 },
  { id: 'glass_pyrex', name: '硼硅玻璃', matClass: 'mixed', density: 2.23, muLow: 0.65, muHigh: 0.36 },
  { id: 'concrete', name: '混凝土/石', matClass: 'mixed', density: 2.3, muLow: 0.67, muHigh: 0.35 },
  { id: 'aluminum', name: '铝', matClass: 'inorganic', density: 2.7, muLow: 0.77, muHigh: 0.315 },
  { id: 'titanium', name: '钛', matClass: 'inorganic', density: 4.51, muLow: 2.05, muHigh: 0.87 },
  { id: 'steel', name: '钢/铁', matClass: 'inorganic', density: 7.86, muLow: 4.79, muHigh: 2.08 },
  { id: 'copper', name: '铜', matClass: 'inorganic', density: 8.96, muLow: 8.23, muHigh: 3.06 },
  { id: 'zinc', name: '锌', matClass: 'inorganic', density: 7.13, muLow: 6.18, muHigh: 2.52 },
  { id: 'lead', name: '铅', matClass: 'inorganic', density: 11.34, muLow: 18.1, muHigh: 7.65 },
]

const materialMap = new Map(MATERIALS.map((m) => [m.id, m]))

export const getMaterial = (id: string): MaterialDef => {
  const m = materialMap.get(id)
  if (!m) throw new Error(`未知材质: ${id}`)
  return m
}

// 双能判别阈值（由物理验证脚本标定，见 scripts/verify_physics.ts）
export const DUAL_ENERGY = {
  lowKev: 55,
  highKev: 110,
  // R = 低能衰减 / 高能衰减
  // 阈值落在相邻材质 R 值间隙中央，留足壳体叠加后的离散化裕度
  organicMaxR: 1.68, // 上邻 PVC 1.560，下邻硼硅玻璃 1.806
  inorganicMinR: 2.25, // 上邻钠钙玻璃 1.927，下邻钢 2.303（含壳叠压裕度）
  // 光程低于该值视为背景（cm 等效），不参与上色
  minAttenuation: 0.02,
}
