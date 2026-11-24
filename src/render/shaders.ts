// GLSL ES 3.00 着色器源码
// 第一遍：沿 -Y 方向对体素做光线步进，输出双能衰减光程
export const RAYCAST_VS = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

export const RAYCAST_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler3D uMuLow;
uniform sampler3D uMuHigh;
uniform float uUnit;   // 体素边长 cm
uniform float uN;      // 每轴体素数
uniform float uGainLow;
uniform float uGainHigh;
uniform float uNoise;

// 哈希噪声，模拟探测器电子噪声
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  // 顶视图：屏幕 x -> 世界/体素 x；屏幕 y(自上而下) -> 世界 z 递减方向
  // 投影 bbox 的屏幕 y 已在 CPU 侧翻转，这里 vUv.y=1(顶部) 对应 iz=n-1
  float ix = vUv.x * uN;
  float iz = vUv.y * uN;
  float aLow = 0.0;
  float aHigh = 0.0;
  // 从顶层向底层步进，光程线性累加（Beer-Lambert 离散形式）
  for (float iy = uN - 1.0; iy >= 0.0; iy -= 1.0) {
    vec3 coord = vec3((ix + 0.5) / uN, (iy + 0.5) / uN, (iz + 0.5) / uN);
    float ml = texture(uMuLow, coord).r;
    float mh = texture(uMuHigh, coord).r;
    aLow += ml * uUnit;
    aHigh += mh * uUnit;
  }
  float n1 = (hash12(vUv * uN + vec2(1.7, 9.2)) - 0.5) * uNoise;
  float n2 = (hash12(vUv * uN + vec2(5.1, 3.4)) - 0.5) * uNoise;
  fragColor = vec4(max(aLow * uGainLow + n1, 0.0), max(aHigh * uGainHigh + n2, 0.0), 0.0, 1.0);
}
`

// 第二遍：双能比值分类 + 伪彩 + 增强
export const COLORIZE_VS = RAYCAST_VS

export const COLORIZE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uAttenuation; // rg = 低/高能光程
uniform vec3 uOrganicColor;
uniform vec3 uInorganicColor;
uniform vec3 uMixedColor;
uniform vec3 uBackgroundColor;
uniform float uOrganicMaxR;
uniform float uInorganicMinR;
uniform float uMinAtt;
uniform int uMode;       // 0 伪彩 1 灰度 2 反色
uniform int uEnhance;    // 位域: 1 超级增强 2 边缘增强
uniform float uZoom;     // 局部放大倍数 1=关闭
uniform vec2 uZoomCenter;

vec3 sampleAtt(vec2 uv) {
  return texture(uAttenuation, uv).rgb;
}

// 双能分类：返回类别颜色与置信混合系数
vec3 classifyColor(float aLow, float aHigh) {
  if (aLow < uMinAtt && aHigh < uMinAtt) return uBackgroundColor;
  float r = aLow / max(aHigh, 1e-5);
  if (r <= uOrganicMaxR) return uOrganicColor;
  if (r >= uInorganicMinR) return uInorganicColor;
  return uMixedColor;
}

// 超级增强：对弱光程区域做对数压缩+伽马提亮，模拟真机 HI 增强
float superEnhance(float att) {
  float compressed = log(1.0 + att * 3.0) / log(4.0);
  return pow(clamp(compressed, 0.0, 1.0), 0.62);
}

void main() {
  vec2 uv = vUv;
  // 局部放大：以指针为中心放大，边界钳制
  if (uZoom > 1.001) {
    uv = uZoomCenter + (uv - uZoomCenter) / uZoom;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      fragColor = vec4(uBackgroundColor, 1.0);
      return;
    }
  }

  vec3 att = sampleAtt(uv);
  float aLow = att.r;
  float aHigh = att.g;
  float density = clamp((aLow + aHigh) * 0.5, 0.0, 6.0) / 6.0;

  // 边缘增强：Sobel 算子作用于低能光程，叠加轮廓响应
  float edge = 0.0;
  if ((uEnhance & 2) == 2) {
    vec2 texel = 1.0 / vec2(textureSize(uAttenuation, 0));
    float tl = sampleAtt(uv + texel * vec2(-1, 1)).r;
    float tc = sampleAtt(uv + texel * vec2(0, 1)).r;
    float tr = sampleAtt(uv + texel * vec2(1, 1)).r;
    float ml = sampleAtt(uv + texel * vec2(-1, 0)).r;
    float mr = sampleAtt(uv + texel * vec2(1, 0)).r;
    float bl = sampleAtt(uv + texel * vec2(-1, -1)).r;
    float bc = sampleAtt(uv + texel * vec2(0, -1)).r;
    float br = sampleAtt(uv + texel * vec2(1, -1)).r;
    float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
    float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
    edge = clamp(length(vec2(gx, gy)) * 2.2, 0.0, 1.0);
  }

  bool super = (uEnhance & 1) == 1;
  float shade = super ? superEnhance(aLow) : clamp(density * 1.6, 0.0, 1.0);

  vec3 color;
  if (uMode == 1) {
    // 灰度模式（真机黑白判图）
    color = mix(uBackgroundColor, vec3(0.92), shade);
  } else if (uMode == 2) {
    // 反色模式
    color = vec3(1.0) - mix(uBackgroundColor, vec3(0.92), shade);
  } else {
    vec3 classColor = classifyColor(aLow, aHigh);
    color = mix(uBackgroundColor, classColor, shade);
  }

  if (edge > 0.0) color = mix(color, vec3(1.0) - color, edge * 0.85);
  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`
