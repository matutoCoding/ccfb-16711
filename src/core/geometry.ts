import { getMaterial } from './materials'
import {
  affineInverse,
  m4Multiply,
  m4RotX,
  m4RotY,
  m4RotZ,
  m4Scale,
  m4Translation,
  m4TransformPoint,
  vAdd,
  type Mat4,
  type Vec3,
} from './math3d'
import type { LuggageDef, PlacedItem, Primitive } from './types'
import { getItemDef } from './items/item_registry'

// 世界空间基元：localMatrix 把世界坐标变换到几何体本地坐标
export interface WorldPrimitive {
  type: Primitive['type']
  size: Vec3
  materialId: string
  ownerUid: string // 所属摆放物品 uid；壳体为 'shell'
  localMatrix: Mat4
}

const partWorldMatrix = (p: Primitive): Mat4 => {
  const r = p.rotation ?? [0, 0, 0]
  const rot = m4Multiply(m4RotZ(r[2]), m4Multiply(m4RotY(r[1]), m4RotX(r[0])))
  return m4Multiply(m4Translation(p.offset[0], p.offset[1], p.offset[2]), rot)
}

const itemWorldMatrix = (pi: PlacedItem): Mat4 => {
  const t = m4Translation(pi.position[0], pi.position[1], pi.position[2])
  const r = m4Multiply(
    m4RotZ(pi.rotation[2]),
    m4Multiply(m4RotY(pi.rotation[1]), m4RotX(pi.rotation[0])),
  )
  const s = m4Scale(pi.scale, pi.scale, pi.scale)
  return m4Multiply(t, m4Multiply(r, s))
}

// 行李箱薄壁壳体（6 块薄板），壁厚 0.25cm
const buildShell = (lug: LuggageDef): WorldPrimitive[] => {
  const [dx, dy, dz] = lug.dims
  const t = 0.25
  const hx = dx / 2
  const hy = dy / 2
  const hz = dz / 2
  const bagRot = m4RotY(lug.bagRotationY)
  const specs: { size: Vec3; off: Vec3 }[] = [
    { size: [hx, t, hz], off: [0, hy - t, 0] }, // 顶
    { size: [hx, t, hz], off: [0, -hy + t, 0] }, // 底
    { size: [t, hy, hz], off: [hx - t, 0, 0] }, // 左右壁
    { size: [t, hy, hz], off: [-hx + t, 0, 0] },
    { size: [hx, hy, t], off: [0, 0, hz - t] }, // 前后壁
    { size: [hx, hy, t], off: [0, 0, -hz + t] },
  ]
  return specs.map((sp) => ({
    type: 'box',
    size: sp.size,
    materialId: lug.shellMaterialId,
    ownerUid: 'shell',
    localMatrix: affineInverse(m4Multiply(bagRot, m4Translation(...sp.off))),
  }))
}

export const buildWorldPrimitives = (lug: LuggageDef): WorldPrimitive[] => {
  const out: WorldPrimitive[] = buildShell(lug)
  for (const placed of lug.items) {
    const def = getItemDef(placed.itemId)
    const itemInv = affineInverse(itemWorldMatrix(placed))
    for (const part of def.parts) {
      const partInv = affineInverse(partWorldMatrix(part))
      out.push({
        type: part.type,
        size: part.size,
        materialId: part.materialId,
        ownerUid: placed.uid,
        localMatrix: m4Multiply(partInv, itemInv),
      })
    }
  }
  return out
}

// 计算场景轴对齐包围盒（含旋转后的包），单位 cm
export const computeSceneAabb = (
  lug: LuggageDef,
): { min: Vec3; max: Vec3 } => {
  const [dx, dy, dz] = lug.dims
  const corners: Vec3[] = []
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        corners.push([(sx * dx) / 2, (sy * dy) / 2, (sz * dz) / 2])
      }
    }
  }
  const rot = m4RotY(lug.bagRotationY)
  const rotated = corners.map((c) => m4TransformPoint(rot, c))
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const c of rotated) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], c[i])
      max[i] = Math.max(max[i], c[i])
    }
  }
  const margin = 1
  return { min: vAdd(min, [-margin, -margin, -margin]), max: vAdd(max, [margin, margin, margin]) }
}

// 基元包含测试：点是否落在几何体内（点已在几何体本地坐标系）
export const containsPoint = (prim: WorldPrimitive, p: Vec3): boolean => {
  const [sx, sy, sz] = prim.size
  switch (prim.type) {
    case 'box':
      return Math.abs(p[0]) <= sx && Math.abs(p[1]) <= sy && Math.abs(p[2]) <= sz
    case 'sphere': {
      const r = sx
      return p[0] ** 2 + p[1] ** 2 + p[2] ** 2 <= r * r
    }
    case 'ellipsoid':
      return (p[0] / sx) ** 2 + (p[1] / sy) ** 2 + (p[2] / sz) ** 2 <= 1
    case 'cylinder':
      return Math.abs(p[1]) <= sz && p[0] ** 2 + p[2] ** 2 <= sx * sx
    case 'cone': {
      // 底面 y=-sy，顶点 y=+sy，底面半径 sx
      if (p[1] < -sy || p[1] > sy) return false
      const radiusAtY = sx * (1 - (p[1] + sy) / (2 * sy))
      return p[0] ** 2 + p[2] ** 2 <= radiusAtY * radiusAtY
    }
  }
}

export { getMaterial }

// 基元在世界空间的保守 AABB：本地包围盒 8 角点经逆变换回世界
export const primitiveWorldAabb = (prim: WorldPrimitive): { min: Vec3; max: Vec3 } => {
  const [sx, sy, sz] = prim.size
  const localToWorld = affineInverse(prim.localMatrix)
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const cx of [-sx, sx]) {
    for (const cy of [-sy, sy]) {
      for (const cz of [-sz, sz]) {
        const w = m4TransformPoint(localToWorld, [cx, cy, cz])
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i], w[i])
          max[i] = Math.max(max[i], w[i])
        }
      }
    }
  }
  return { min, max }
}
