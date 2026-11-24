import { DUAL_ENERGY } from '../core/materials'
import type { MachineProfile } from '../core/types'
import type { VoxelScene } from '../core/voxelizer'
import {
  createGLContext,
  createProgram,
  createQuadVao,
  createRenderTarget,
  createVoxelTexture,
  ensureFloat16Support,
  u,
  type GLProgram,
  type RenderTarget,
} from './gl_utils'
import { COLORIZE_FS, COLORIZE_VS, RAYCAST_FS, RAYCAST_VS } from './shaders'

export type ColorMode = 'color' | 'gray' | 'invert'

export interface EnhanceState {
  superEnhance: boolean
  edgeEnhance: boolean
  zoom: number
  zoomCenterX: number
  zoomCenterY: number
}

export const DEFAULT_ENHANCE: EnhanceState = {
  superEnhance: false,
  edgeEnhance: false,
  zoom: 1,
  zoomCenterX: 0.5,
  zoomCenterY: 0.5,
}

export class XrayRenderer {
  private gl: WebGL2RenderingContext
  private raycast: GLProgram
  private colorize: GLProgram
  private vao: WebGLVertexArrayObject
  private target: RenderTarget | null = null
  private texLow: WebGLTexture | null = null
  private texHigh: WebGLTexture | null = null
  private scene: VoxelScene | null = null
  private canvas: HTMLCanvasElement
  mode: ColorMode = 'color'
  enhance: EnhanceState = { ...DEFAULT_ENHANCE }
  private profile: MachineProfile

  constructor(canvas: HTMLCanvasElement, profile: MachineProfile) {
    this.canvas = canvas
    this.profile = profile
    this.gl = createGLContext(canvas)
    ensureFloat16Support(this.gl)
    this.raycast = createProgram(
      this.gl,
      RAYCAST_VS,
      RAYCAST_FS,
      ['uMuLow', 'uMuHigh', 'uUnit', 'uN', 'uGainLow', 'uGainHigh', 'uNoise'],
      ['aPos'],
    )
    this.colorize = createProgram(
      this.gl,
      COLORIZE_VS,
      COLORIZE_FS,
      [
        'uAttenuation', 'uOrganicColor', 'uInorganicColor', 'uMixedColor', 'uBackgroundColor',
        'uOrganicMaxR', 'uInorganicMinR', 'uMinAtt', 'uMode', 'uEnhance', 'uZoom', 'uZoomCenter',
      ],
      ['aPos'],
    )
    this.vao = createQuadVao(this.gl, this.raycast.attribs.get('aPos') ?? 0)
  }

  setProfile(profile: MachineProfile): void {
    this.profile = profile
    this.render()
  }

  setMode(mode: ColorMode): void {
    this.mode = mode
    this.render()
  }

  setEnhance(patch: Partial<EnhanceState>): void {
    this.enhance = { ...this.enhance, ...patch }
    this.render()
  }

  // 上传新体素场景（训练切题时调用）
  uploadScene(scene: VoxelScene, renderScale: number): void {
    const gl = this.gl
    if (this.texLow) gl.deleteTexture(this.texLow)
    if (this.texHigh) gl.deleteTexture(this.texHigh)
    this.texLow = createVoxelTexture(gl, scene.muLow, scene.n)
    this.texHigh = createVoxelTexture(gl, scene.muHigh, scene.n)
    this.scene = scene

    const size = Math.max(128, Math.round(scene.n * renderScale))
    if (this.target) {
      gl.deleteFramebuffer(this.target.fbo)
      gl.deleteTexture(this.target.texture)
    }
    this.target = createRenderTarget(gl, size, size)
    this.canvas.width = size
    this.canvas.height = size
    this.render()
  }

  render(): void {
    if (!this.scene || !this.target || !this.texLow || !this.texHigh) return
    const gl = this.gl
    const { target } = this

    // Pass 1：光线步进 -> 双能光程纹理
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    gl.viewport(0, 0, target.width, target.height)
    gl.useProgram(this.raycast.program)
    gl.bindVertexArray(this.vao)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_3D, this.texLow)
    gl.uniform1i(u(this.raycast, 'uMuLow'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_3D, this.texHigh)
    gl.uniform1i(u(this.raycast, 'uMuHigh'), 1)
    gl.uniform1f(u(this.raycast, 'uUnit'), this.scene.unit)
    gl.uniform1f(u(this.raycast, 'uN'), this.scene.n)
    gl.uniform1f(u(this.raycast, 'uGainLow'), this.profile.gainLow)
    gl.uniform1f(u(this.raycast, 'uGainHigh'), this.profile.gainHigh)
    gl.uniform1f(u(this.raycast, 'uNoise'), this.profile.noiseLevel)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // Pass 2：分类伪彩 + 增强 -> 默认帧缓冲
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.colorize.program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, target.texture)
    gl.uniform1i(u(this.colorize, 'uAttenuation'), 0)
    const p = this.profile
    gl.uniform3f(u(this.colorize, 'uOrganicColor'), p.organic.r / 255, p.organic.g / 255, p.organic.b / 255)
    gl.uniform3f(u(this.colorize, 'uInorganicColor'), p.inorganic.r / 255, p.inorganic.g / 255, p.inorganic.b / 255)
    gl.uniform3f(u(this.colorize, 'uMixedColor'), p.mixed.r / 255, p.mixed.g / 255, p.mixed.b / 255)
    gl.uniform3f(u(this.colorize, 'uBackgroundColor'), p.background.r / 255, p.background.g / 255, p.background.b / 255)
    gl.uniform1f(u(this.colorize, 'uOrganicMaxR'), DUAL_ENERGY.organicMaxR)
    gl.uniform1f(u(this.colorize, 'uInorganicMinR'), DUAL_ENERGY.inorganicMinR)
    gl.uniform1f(u(this.colorize, 'uMinAtt'), DUAL_ENERGY.minAttenuation)
    gl.uniform1i(u(this.colorize, 'uMode'), this.mode === 'color' ? 0 : this.mode === 'gray' ? 1 : 2)
    let bits = 0
    if (this.enhance.superEnhance) bits |= 1
    if (this.enhance.edgeEnhance) bits |= 2
    gl.uniform1i(u(this.colorize, 'uEnhance'), bits)
    gl.uniform1f(u(this.colorize, 'uZoom'), this.enhance.zoom)
    gl.uniform2f(u(this.colorize, 'uZoomCenter'), this.enhance.zoomCenterX, this.enhance.zoomCenterY)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  }

  dispose(): void {
    const gl = this.gl
    if (this.texLow) gl.deleteTexture(this.texLow)
    if (this.texHigh) gl.deleteTexture(this.texHigh)
    if (this.target) {
      gl.deleteFramebuffer(this.target.fbo)
      gl.deleteTexture(this.target.texture)
    }
    gl.deleteProgram(this.raycast.program)
    gl.deleteProgram(this.colorize.program)
  }
}
