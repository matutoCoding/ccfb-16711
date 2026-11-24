import { XrayRenderer, type ColorMode, type EnhanceState } from '../render/xray_renderer'
import type { MachineProfile } from '../core/types'
import type { VoxelScene } from '../core/voxelizer'

export interface ViewerOptions {
  annotatable: boolean
  onAnnotationsChange?: () => void
}

// X 光图像查看器：渲染画布 + 真机风格增强工具栏 + 标注覆盖层
export class XrayViewer {
  private canvas: HTMLCanvasElement
  private overlay: HTMLCanvasElement
  private renderer: XrayRenderer
  private root: HTMLElement
  private opts: ViewerOptions
  private zoomActive = false

  constructor(host: HTMLElement, profile: MachineProfile, opts: ViewerOptions) {
    this.opts = opts
    this.root = document.createElement('div')
    this.root.innerHTML = `
      <div class="viewer-stage">
        <div class="viewer-canvas-wrap">
          <canvas class="viewer-canvas"></canvas>
          <canvas class="viewer-overlay"></canvas>
        </div>
      </div>
      <div class="viewer-toolbar">
        <div class="viewer-toolbar__group">
          <button class="btn btn--sm" data-mode="color">伪彩</button>
          <button class="btn btn--sm" data-mode="gray">灰度</button>
          <button class="btn btn--sm" data-mode="invert">反色</button>
        </div>
        <div class="viewer-toolbar__divider"></div>
        <div class="viewer-toolbar__group">
          <button class="btn btn--sm" data-enhance="super">超级增强</button>
          <button class="btn btn--sm" data-enhance="edge">边缘增强</button>
          <button class="btn btn--sm" data-enhance="zoom">局部放大</button>
          <button class="btn btn--sm" data-enhance="reset">复位</button>
        </div>
      </div>`
    host.appendChild(this.root)

    this.canvas = this.root.querySelector('.viewer-canvas') as HTMLCanvasElement
    this.overlay = this.root.querySelector('.viewer-overlay') as HTMLCanvasElement
    this.renderer = new XrayRenderer(this.canvas, profile)
    this.bindToolbar()
    if (opts.annotatable) this.bindAnnotation()
  }

  private bindToolbar(): void {
    const modeButtons = this.root.querySelectorAll<HTMLElement>('[data-mode]')
    const syncMode = (mode: ColorMode): void => {
      modeButtons.forEach((b) => b.classList.toggle('btn--primary', b.dataset.mode === mode))
      modeButtons.forEach((b) => b.classList.toggle('btn--ghost', b.dataset.mode !== mode))
    }
    modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode as ColorMode
        this.renderer.setMode(mode)
        syncMode(mode)
      })
    })
    syncMode('color')

    const enhanceButtons = this.root.querySelectorAll<HTMLElement>('[data-enhance]')
    const syncEnhance = (): void => {
      const e = this.renderer.enhance
      this.root.querySelector('[data-enhance="super"]')?.classList.toggle('btn--primary', e.superEnhance)
      this.root.querySelector('[data-enhance="edge"]')?.classList.toggle('btn--primary', e.edgeEnhance)
      this.root.querySelector('[data-enhance="zoom"]')?.classList.toggle('btn--primary', this.zoomActive)
    }
    enhanceButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.enhance!
        const e = this.renderer.enhance
        if (key === 'super') this.renderer.setEnhance({ superEnhance: !e.superEnhance })
        if (key === 'edge') this.renderer.setEnhance({ edgeEnhance: !e.edgeEnhance })
        if (key === 'zoom') {
          this.zoomActive = !this.zoomActive
          if (!this.zoomActive) this.renderer.setEnhance({ zoom: 1 })
          this.overlay.style.cursor = this.zoomActive ? 'zoom-in' : this.opts.annotatable ? 'crosshair' : 'default'
        }
        if (key === 'reset') {
          this.zoomActive = false
          this.renderer.setMode('color')
          this.renderer.setEnhance({ superEnhance: false, edgeEnhance: false, zoom: 1 })
          syncMode('color')
        }
        syncEnhance()
      })
    })
    syncEnhance()

    // 滚轮缩放（真机旋钮的平替），以指针为中心
    this.canvas.parentElement!.addEventListener('wheel', (ev) => {
      if (!this.zoomActive) return
      ev.preventDefault()
      const rect = this.canvas.getBoundingClientRect()
      const cx = (ev.clientX - rect.left) / rect.width
      const cy = (ev.clientY - rect.top) / rect.height
      const cur = this.renderer.enhance.zoom
      const next = Math.min(4, Math.max(1, cur * (ev.deltaY < 0 ? 1.18 : 0.85)))
      this.renderer.setEnhance({ zoom: next, zoomCenterX: cx, zoomCenterY: cy })
    }, { passive: false })
  }

  // 标注交互：按下拖框，抬起完成。处理器提为实例属性，dispose 时统一移除
  private drawing = false
  private startX = 0
  private startY = 0

  private pointerPos = (ev: MouseEvent): { x: number; y: number } => {
    const rect = this.overlay.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)),
    }
  }

  private onMouseDown = (ev: MouseEvent): void => {
    if (this.zoomActive) {
      const p = this.pointerPos(ev)
      this.renderer.setEnhance({ zoomCenterX: p.x, zoomCenterY: p.y })
      return
    }
    this.drawing = true
    const p = this.pointerPos(ev)
    this.startX = p.x
    this.startY = p.y
  }

  private onMouseMove = (ev: MouseEvent): void => {
    if (!this.drawing) return
    const p = this.pointerPos(ev)
    const w = Math.abs(p.x - this.startX)
    const h = Math.abs(p.y - this.startY)
    const ctx = this.overlay.getContext('2d')!
    this.redraftRect(this.startX, this.startY, w, h, ctx)
  }

  private onMouseUp = (ev: MouseEvent): void => {
    if (!this.drawing) return
    this.drawing = false
    const p = this.pointerPos(ev)
    const bbox = {
      x: Math.min(this.startX, p.x),
      y: Math.min(this.startY, p.y),
      w: Math.abs(p.x - this.startX),
      h: Math.abs(p.y - this.startY),
    }
    if (bbox.w > 0.02 && bbox.h > 0.02) {
      this.overlay.dispatchEvent(new CustomEvent('annotation-done', { detail: bbox }))
    }
    this.opts.onAnnotationsChange?.()
  }

  private bindAnnotation(): void {
    this.overlay.style.cursor = 'crosshair'
    this.overlay.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('mouseup', this.onMouseUp)
  }

  private redraftRect(x: number, y: number, w: number, h: number, ctx: CanvasRenderingContext2D): void {
    const dpr = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height)
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 2 * dpr
    ctx.strokeRect(x * this.overlay.width, y * this.overlay.height, w * this.overlay.width, h * this.overlay.height)
  }

  // 绘制持久标注（学员框）或 GroundTruth（复盘框）
  drawBoxes(boxes: { x: number; y: number; w: number; h: number; color: string; label?: string }[]): void {
    const dpr = window.devicePixelRatio || 1
    const size = this.canvas.width
    this.overlay.width = size
    this.overlay.height = size
    this.overlay.style.width = `${this.canvas.clientWidth}px`
    this.overlay.style.height = `${this.canvas.clientHeight}px`
    const ctx = this.overlay.getContext('2d')!
    ctx.clearRect(0, 0, size, size)
    ctx.font = `${13 * dpr}px sans-serif`
    for (const b of boxes) {
      ctx.strokeStyle = b.color
      ctx.lineWidth = 2 * dpr
      ctx.strokeRect(b.x * size, b.y * size, b.w * size, b.h * size)
      if (b.label) {
        const tw = ctx.measureText(b.label).width + 12 * dpr
        ctx.fillStyle = b.color
        ctx.fillRect(b.x * size, Math.max(0, b.y * size - 20 * dpr), tw, 20 * dpr)
        ctx.fillStyle = '#0f1623'
        ctx.fillText(b.label, b.x * size + 6 * dpr, Math.max(14 * dpr, b.y * size - 6 * dpr))
      }
    }
  }

  clearOverlay(): void {
    const ctx = this.overlay.getContext('2d')!
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height)
  }

  loadScene(scene: VoxelScene, renderScale: number): void {
    this.renderer.uploadScene(scene, renderScale)
    requestAnimationFrame(() => {
      const size = this.canvas.width
      this.overlay.width = size
      this.overlay.height = size
    })
  }

  // 供训练页监听拖框完成事件，避免外部访问私有元素
  onAnnotationDone(handler: (bbox: { x: number; y: number; w: number; h: number }) => void): void {
    this.overlay.addEventListener('annotation-done', (ev) => {
      handler((ev as CustomEvent).detail)
    })
  }

  get overlayCanvas(): HTMLCanvasElement {
    return this.overlay
  }

  setProfile(profile: MachineProfile): void {
    this.renderer.setProfile(profile)
  }

  get enhanceState(): EnhanceState {
    return this.renderer.enhance
  }

  dispose(): void {
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mouseup', this.onMouseUp)
    this.renderer.dispose()
    this.root.remove()
  }
}
