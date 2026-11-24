import type { ContrabandClass, ItemCategory, ItemDef } from '../types'
import { CONTRABAND_ITEMS } from './contraband'
import { NORMAL_ITEMS_A } from './normal_a'
import { NORMAL_ITEMS_B } from './normal_b'
import { NORMAL_ITEMS_C } from './normal_c'

export const ALL_ITEMS: ItemDef[] = [
  ...CONTRABAND_ITEMS,
  ...NORMAL_ITEMS_A,
  ...NORMAL_ITEMS_B,
  ...NORMAL_ITEMS_C,
]

const itemMap = new Map(ALL_ITEMS.map((i) => [i.id, i]))

// 注册额外物品（测试桩或外部导入的自定义物品），同 id 覆盖
export const registerItems = (items: ItemDef[]): void => {
  for (const item of items) {
    const idx = ALL_ITEMS.findIndex((x) => x.id === item.id)
    if (idx >= 0) ALL_ITEMS[idx] = item
    else ALL_ITEMS.push(item)
    itemMap.set(item.id, item)
  }
}

export const getItemDef = (id: string): ItemDef => {
  const def = itemMap.get(id)
  if (!def) throw new Error(`未知物品: ${id}`)
  return def
}

export const listItemsByCategory = (category: ItemCategory): ItemDef[] =>
  ALL_ITEMS.filter((i) => i.category === category)

export const listContrabandByClass = (cls: ContrabandClass): ItemDef[] =>
  ALL_ITEMS.filter((i) => i.contrabandClass === cls)

export const CONTRABAND_CLASS_LABELS: Record<ContrabandClass, string> = {
  knife: '刀具',
  lighter: '打火机',
  liquid: '液体',
  powerbank: '充电宝/电池',
  gun: '枪支',
  explosive: '爆炸物',
  tool: '工具',
  other: '其他违禁品',
}

export const ITEM_STATS = {
  contraband: CONTRABAND_ITEMS.length,
  normal: NORMAL_ITEMS_A.length + NORMAL_ITEMS_B.length + NORMAL_ITEMS_C.length,
  total: ALL_ITEMS.length,
}
