import { computeSceneAabb, containsPoint, getMaterial, primitiveWorldAabb, type WorldPrimitive } from './geometry'
import { m4TransformPoint, type Vec3 } from './math3d'
import type { BBox, LuggageDef, PlacedItem } from './types'

export interface ItemProjection {
  uid: string
  bbox: BBox // 归一化坐标：屏幕 x = 世界 x，屏幕 y = 世界 z（显示时上下翻转）
  occlusion: number // 被其他物体遮挡的投影像素比例 0..1
  footprint: number
}

export interface VoxelScene {
  n: number // 每轴体素数
  unit: number // 体素边长 cm
  origin: Vec3 // 体素 (0,0,0) 中心的世界坐标
  // 索引约定与 3D 纹理一致：idx = ix + n*(iy + n*iz)，纹理坐标 (x,y,z)=世界(x,y,z)
  muLow: Float32Array
  muHigh: Float32Array
  projections: ItemProjection[]
  stats: { voxelCount: number; primitiveCount: number }
}

const idx3 = (ix: number, iy: number, iz: number, n: number): number => ix + n * (iy + n * iz)

// 顶视图每列信息：topY/owner 为最上层体素归属，columnOwners 为该列出现过的全部 owner
interface ColumnInfo {
  owner: Uint32Array
  topY: Int32Array
  columnOwners: Uint32Array[]
}

export const voxelize = (lug: LuggageDef, prims: WorldPrimitive[], resolution = 128): VoxelScene => {
  const aabb = computeSceneAabb(lug)
  const span: Vec3 = [
    aabb.max[0] - aabb.min[0],
    aabb.max[1] - aabb.min[1],
    aabb.max[2] - aabb.min[2],
  ]
  // unit 按实际 AABB 跨度计算，保证 n*unit 完整覆盖整个场景
  const unit = Math.max(...span) / resolution
  const n = Math.ceil(Math.max(...span) / unit)
  const origin: Vec3 = [aabb.min[0], aabb.min[1], aabb.min[2]]

  const total = n * n * n
  const muLow = new Float32Array(total)
  const muHigh = new Float32Array(total)
  const columnSets: Set<number>[] = Array.from({ length: n * n }, () => new Set<number>())
  const info: ColumnInfo = {
    owner: new Uint32Array(n * n),
    topY: new Int32Array(n * n).fill(-1),
    columnOwners: [],
  }
  const ownerId = new Map<string, number>()
  prims.forEach((p, i) => ownerId.set(p.ownerUid, i + 1))

  const voxelCenter = (ix: number, iy: number, iz: number): Vec3 => [
    origin[0] + (ix + 0.5) * unit,
    origin[1] + (iy + 0.5) * unit,
    origin[2] + (iz + 0.5) * unit,
  ]

  const worldToVoxelRange = (min: Vec3, max: Vec3) => {
    const lo = [
      Math.max(0, Math.floor((min[0] - origin[0]) / unit)),
      Math.max(0, Math.floor((min[1] - origin[1]) / unit)),
      Math.max(0, Math.floor((min[2] - origin[2]) / unit)),
    ]
    const hi = [
      Math.min(n - 1, Math.ceil((max[0] - origin[0]) / unit)),
      Math.min(n - 1, Math.ceil((max[1] - origin[1]) / unit)),
      Math.min(n - 1, Math.ceil((max[2] - origin[2]) / unit)),
    ]
    return { lo, hi }
  }

  // 第一遍：全部基元体素化，累加双能衰减，记录列归属
  for (const prim of prims) {
    const mat = getMaterial(prim.materialId)
    const id = ownerId.get(prim.ownerUid) ?? 0
    const ab = primitiveWorldAabb(prim)
    const { lo, hi } = worldToVoxelRange(ab.min, ab.max)
    for (let ix = lo[0]; ix <= hi[0]; ix++) {
      for (let iy = lo[1]; iy <= hi[1]; iy++) {
        for (let iz = lo[2]; iz <= hi[2]; iz++) {
          const world = voxelCenter(ix, iy, iz)
          if (!containsPoint(prim, m4TransformPoint(prim.localMatrix, world))) continue
          const idx = idx3(ix, iy, iz, n)
          // Beer-Lambert 线性叠加：同体素内多材质 μ 直接相加（dz 相同）
          muLow[idx] += mat.muLow
          muHigh[idx] += mat.muHigh
          const col = ix + n * iz
          if (iy > info.topY[col]) {
            info.topY[col] = iy
            info.owner[col] = id
          }
          columnSets[col].add(id)
        }
      }
    }
  }
  info.columnOwners = columnSets.map((s) => Uint32Array.from(s))

  const projections = projectItems(prims, n, info, ownerId)

  return {
    n,
    unit,
    origin,
    muLow,
    muHigh,
    projections,
    stats: { voxelCount: total, primitiveCount: prims.length },
  }
}

// 第二遍：O(n²) 列扫描统计每个物品的投影框与遮挡率，不再逐列扫描 Y 轴
const projectItems = (
  prims: WorldPrimitive[],
  n: number,
  info: ColumnInfo,
  ownerId: Map<string, number>,
): ItemProjection[] => {
  const uids = new Set(prims.filter((p) => p.ownerUid !== 'shell').map((p) => p.ownerUid))
  const out: ItemProjection[] = []

  for (const uid of uids) {
    const id = ownerId.get(uid) ?? 0
    let minX = n
    let minZ = n
    let maxX = -1
    let maxZ = -1
    let footprint = 0
    let occluded = 0

    for (let col = 0; col < n * n; col++) {
      if (!info.columnOwners[col].includes(id)) continue
      const ix = col % n
      const iz = Math.floor(col / n)
      footprint++
      minX = Math.min(minX, ix)
      maxX = Math.max(maxX, ix)
      minZ = Math.min(minZ, iz)
      maxZ = Math.max(maxZ, iz)
      // 该列最上层归属不是自己 -> 被其他物品遮挡
      if (info.owner[col] !== id) occluded++
    }
    if (footprint === 0) continue
    out.push({
      uid,
      // 屏幕坐标：x 与世界 x 同向；屏幕自上而下对应世界 z 递减，故 y 翻转
      bbox: {
        x: minX / n,
        y: 1 - (maxZ + 1) / n,
        w: (maxX - minX + 1) / n,
        h: (maxZ - minZ + 1) / n,
      },
      occlusion: occluded / footprint,
      footprint,
    })
  }
  return out
}

// 物品朝向异常度：各轴相对零位的最大归一化偏角
export const orientationDeviation = (p: PlacedItem): number => {
  const norm = (r: number) => Math.abs(((r + Math.PI) % (2 * Math.PI)) - Math.PI) / Math.PI
  return Math.max(norm(p.rotation[0]), norm(p.rotation[1]), norm(p.rotation[2]))
}
