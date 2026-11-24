// WebGL2 轻量封装：着色器编译、程序链接、FBO、3D 纹理
export interface GLProgram {
  program: WebGLProgram
  uniforms: Map<string, WebGLUniformLocation | null>
  attribs: Map<string, number>
}

export const createGLContext = (canvas: HTMLCanvasElement): WebGL2RenderingContext => {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    preserveDrawingBuffer: true,
    alpha: false,
  })
  if (!gl) throw new Error('当前浏览器不支持 WebGL2，请使用 Chrome/Edge 90+ 或 Firefox 90+')
  return gl
}

const compileShader = (gl: WebGL2RenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('着色器对象创建失败')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`着色器编译失败: ${log}\n${source}`)
  }
  return shader
}

export const createProgram = (
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string,
  uniformNames: string[],
  attribNames: string[],
): GLProgram => {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource)
  const program = gl.createProgram()
  if (!program) throw new Error('程序对象创建失败')
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`程序链接失败: ${log}`)
  }
  const uniforms = new Map<string, WebGLUniformLocation | null>()
  for (const name of uniformNames) uniforms.set(name, gl.getUniformLocation(program, name))
  const attribs = new Map<string, number>()
  for (const name of attribNames) attribs.set(name, gl.getAttribLocation(program, name))
  return { program, uniforms, attribs }
}

export const u = (p: GLProgram, name: string): WebGLUniformLocation | null => {
  const loc = p.uniforms.get(name)
  if (loc === undefined) throw new Error(`未声明的 uniform: ${name}`)
  return loc
}

export const createQuadVao = (gl: WebGL2RenderingContext, attribLoc: number): WebGLVertexArrayObject => {
  const vao = gl.createVertexArray()
  if (!vao) throw new Error('VAO 创建失败')
  const vbo = gl.createBuffer()
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
  // 全屏三角形（单三角形覆盖屏幕，比 quad 少一次插值开销）
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(attribLoc)
  gl.vertexAttribPointer(attribLoc, 2, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)
  return vao
}

export interface RenderTarget {
  fbo: WebGLFramebuffer
  texture: WebGLTexture
  width: number
  height: number
}

export const createRenderTarget = (
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): RenderTarget => {
  const texture = gl.createTexture()
  if (!texture) throw new Error('渲染目标纹理创建失败')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, width, height)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const fbo = gl.createFramebuffer()
  if (!fbo) throw new Error('FBO 创建失败')
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`FBO 不完整: 0x${status.toString(16)}`)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { fbo, texture, width, height }
}

// 体素 3D 纹理：R32F 单通道，NEAREST 采样保证体素边界不被插值污染
export const createVoxelTexture = (
  gl: WebGL2RenderingContext,
  data: Float32Array,
  n: number,
): WebGLTexture => {
  const tex = gl.createTexture()
  if (!tex) throw new Error('3D 纹理创建失败')
  gl.bindTexture(gl.TEXTURE_3D, tex)
  gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R32F, n, n, n)
  gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, n, n, n, gl.RED, gl.FLOAT, data)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE)
  return tex
}

export const ensureFloat16Support = (gl: WebGL2RenderingContext): void => {
  const ext = gl.getExtension('EXT_color_buffer_float')
  if (!ext) throw new Error('缺少 EXT_color_buffer_float 扩展，无法使用浮点渲染目标')
}
