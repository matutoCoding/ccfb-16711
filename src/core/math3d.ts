import type { Vec3 } from './types'
export type { Vec3 } from './types'

export const v3 = (x = 0, y = 0, z = 0): Vec3 => [x, y, z]
export const vAdd = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const vSub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const vScale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const vDot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const vLen = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
export const vNorm = (a: Vec3): Vec3 => {
  const l = vLen(a)
  return l < 1e-9 ? [0, 0, 0] : vScale(a, 1 / l)
}

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x))
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

// 列主序 4x4 矩阵
export type Mat4 = Float32Array

export const m4Identity = (): Mat4 => {
  const m = new Float32Array(16)
  m[0] = m[5] = m[10] = m[15] = 1
  return m
}

export const m4Multiply = (a: Mat4, b: Mat4): Mat4 => {
  const out = new Float32Array(16)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3]
    }
  }
  return out
}

export const m4Translation = (x: number, y: number, z: number): Mat4 => {
  const m = m4Identity()
  m[12] = x
  m[13] = y
  m[14] = z
  return m
}

export const m4Scale = (x: number, y: number, z: number): Mat4 => {
  const m = m4Identity()
  m[0] = x
  m[5] = y
  m[10] = z
  return m
}

export const m4RotX = (rad: number): Mat4 => {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  const m = m4Identity()
  m[5] = c
  m[6] = s
  m[9] = -s
  m[10] = c
  return m
}

export const m4RotY = (rad: number): Mat4 => {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  const m = m4Identity()
  m[0] = c
  m[2] = -s
  m[8] = s
  m[10] = c
  return m
}

export const m4RotZ = (rad: number): Mat4 => {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  const m = m4Identity()
  m[0] = c
  m[1] = s
  m[4] = -s
  m[5] = c
  return m
}

// 欧拉角 XYZ（内旋），与 WebGL 着色器保持同一约定
export const m4FromEuler = (e: Vec3): Mat4 =>
  m4Multiply(m4RotZ(e[2]), m4Multiply(m4RotY(e[1]), m4RotX(e[0])))

export const m4TransformPoint = (m: Mat4, p: Vec3): Vec3 => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
]

// 纯方向变换（去掉平移）
export const m4TransformDir = (m: Mat4, d: Vec3): Vec3 => [
  m[0] * d[0] + m[4] * d[1] + m[8] * d[2],
  m[1] * d[0] + m[5] * d[1] + m[9] * d[2],
  m[2] * d[0] + m[6] * d[1] + m[10] * d[2],
]

// 3x3 逆矩阵（列主序存储，与 m4 约定一致）
// 输入元素按 m[col*4+row] 读取，输出逆矩阵同样按列主序写回
export const m3Inverse3 = (m: Mat4): Mat4 => {
  // 先把列主序元素还原成行主序的 a..i（a=m00, b=m01, c=m02 ...）
  const a = m[0], b = m[4], c = m[8]
  const d = m[1], e = m[5], f = m[9]
  const g = m[2], h = m[6], i = m[10]
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  const inv = 1 / det
  // 行主序逆矩阵元素
  const r00 = (e * i - f * h) * inv
  const r01 = (c * h - b * i) * inv
  const r02 = (b * f - c * e) * inv
  const r10 = (f * g - d * i) * inv
  const r11 = (a * i - c * g) * inv
  const r12 = (c * d - a * f) * inv
  const r20 = (d * h - e * g) * inv
  const r21 = (b * g - a * h) * inv
  const r22 = (a * e - b * d) * inv
  const o = new Float32Array(16)
  // 按列主序写回：o[col*4+row]
  o[0] = r00; o[4] = r01; o[8] = r02
  o[1] = r10; o[5] = r11; o[9] = r12
  o[2] = r20; o[6] = r21; o[10] = r22
  o[15] = 1
  return o
}

export const deg2rad = (d: number): number => (d * Math.PI) / 180
export const rad2deg = (r: number): number => (r * 180) / Math.PI

// 仿射矩阵求逆：[R t; 0 1]^-1 = [R^-1, -R^-1·t; 0 1]
// 列主序存储：R^-1 第 row 行元素位于索引 [row], [4+row], [8+row]，平移写 12/13/14
export const affineInverse = (m: Mat4): Mat4 => {
  const lin = m3Inverse3(m)
  const tx = m[12]
  const ty = m[13]
  const tz = m[14]
  lin[12] = -(lin[0] * tx + lin[4] * ty + lin[8] * tz)
  lin[13] = -(lin[1] * tx + lin[5] * ty + lin[9] * tz)
  lin[14] = -(lin[2] * tx + lin[6] * ty + lin[10] * tz)
  return lin
}
