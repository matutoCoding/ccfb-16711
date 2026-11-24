import type { MachineProfile } from './types'

// 三类主流双能安检机的伪彩风格：
// 通用惯例 有机物=橙、无机物=蓝、混合物=绿，各厂家色调与增益不同
export const MACHINE_PROFILES: MachineProfile[] = [
  {
    id: 'standard_dual',
    name: '标准双能机(橙绿蓝)',
    organic: { r: 232, g: 138, b: 58 },
    inorganic: { r: 74, g: 132, b: 224 },
    mixed: { r: 72, g: 186, b: 112 },
    shellTint: { r: 120, g: 120, b: 130 },
    background: { r: 12, g: 14, b: 18 },
    gainLow: 1,
    gainHigh: 1,
    noiseLevel: 0,
  },
  {
    id: 'warm_vendor',
    name: '暖色高对比机型',
    organic: { r: 244, g: 168, b: 84 },
    inorganic: { r: 96, g: 156, b: 240 },
    mixed: { r: 96, g: 204, b: 132 },
    shellTint: { r: 130, g: 126, b: 128 },
    background: { r: 8, g: 8, b: 10 },
    gainLow: 1.15,
    gainHigh: 1.1,
    noiseLevel: 0.004,
  },
  {
    id: 'cool_vendor',
    name: '冷色高灵敏机型',
    organic: { r: 214, g: 118, b: 72 },
    inorganic: { r: 110, g: 178, b: 250 },
    mixed: { r: 88, g: 214, b: 188 },
    shellTint: { r: 110, g: 118, b: 128 },
    background: { r: 10, g: 16, b: 22 },
    gainLow: 0.92,
    gainHigh: 0.95,
    noiseLevel: 0.008,
  },
]

export const DEFAULT_PROFILE_ID = 'standard_dual'

export const getProfile = (id: string): MachineProfile =>
  MACHINE_PROFILES.find((p) => p.id === id) ?? MACHINE_PROFILES[0]
