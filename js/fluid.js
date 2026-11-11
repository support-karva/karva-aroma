/* ==========================================================================
   Aroma — the atmosphere.
   A stable-fluids (Navier–Stokes) smoke simulation in WebGL, written for this
   site. Steps per frame: curl -> vorticity confinement -> divergence ->
   pressure (Jacobi) -> gradient subtract -> advect velocity -> advect dye.
   Then one compositing pass draws the page's photographs *through* the
   smoke: where the dye is dense the dish is hidden and soft, where the
   visitor has stirred it away the dish comes into focus with a warm bloom.

   All shaders are GLSL ES 1.00, so the same source runs on the WebGL2 path
   (RGBA16F) and on the WebGL1 path (OES_texture_half_float, with manual
   bilinear filtering when half-float linear filtering is missing).
   Add ?gl=1 to the URL to force the WebGL1 path for testing.

   No per-frame allocations: every per-frame value lives in a preallocated
   object or typed array.
   ========================================================================== */

const BASE_VS = `
precision highp float;
attribute vec2 aPosition;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform vec2 texelSize;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const NOISE = `
float hash (vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise (vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm (vec2 p) {
  float v = 0.5 * noise(p); p *= 2.03;
  v += 0.25 * noise(p); p *= 2.01;
  v += 0.125 * noise(p);
  return v / 0.875;
}`;

const CLEAR_FS = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
uniform sampler2D uTexture;
uniform float value;
void main () { gl_FragColor = value * texture2D(uTexture, vUv); }`;

const SPLAT_FS = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
uniform float uClear;
void main () {
  vec2 p = vUv - point.xy;
  p.x *= aspectRatio;
  float g = exp(-dot(p, p) / radius);
  vec3 base = texture2D(uTarget, vUv).xyz;
  base *= 1.0 - uClear * g;
  gl_FragColor = vec4(base + g * color, 1.0);
}`;

const ADVECT_FS = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform vec2 dyeTexelSize;
uniform float dt;
uniform float dissipation;
uniform vec2 uShift;
uniform float uFill;
uniform vec3 uFillColor;
uniform float uTime;
uniform float uAspect;
${NOISE}
#ifdef MANUAL_FILTERING
vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
  vec2 st = uv / tsize - 0.5;
  vec2 iuv = floor(st);
  vec2 fuv = fract(st);
  vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
  vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
  vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
  vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
}
#endif
void main () {
#ifdef MANUAL_FILTERING
  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize - uShift;
  vec4 result = bilerp(uSource, coord, dyeTexelSize);
#else
  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize - uShift;
  vec4 result = texture2D(uSource, coord);
#endif
  result /= 1.0 + dissipation * dt;
  if (uFill > 0.0) {
    vec2 q = vec2(vUv.x * uAspect, vUv.y) * 2.2 + vec2(uTime * 0.013, -uTime * 0.045);
    float n = smoothstep(0.28, 0.78, fbm(q));
    float rise = 1.15 - vUv.y * 0.55;
    result.rgb += uFillColor * n * rise * uFill * dt;
  }
  gl_FragColor = vec4(result.rgb, 1.0);
}`;

const DIVERGENCE_FS = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}`;

const CURL_FS = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).y;
  float R = texture2D(uVelocity, vR).y;
  float T = texture2D(uVelocity, vT).x;
  float B = texture2D(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}`;

const VORTICITY_FS = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main () {
  float L = texture2D(uCurl, vL).x;
  float R = texture2D(uCurl, vR).x;
  float T = texture2D(uCurl, vT).x;
  float B = texture2D(uCurl, vB).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity += force * dt;
  velocity = min(max(velocity, -1000.0), 1000.0);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}`;

const PRESSURE_FS = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  float divergence = texture2D(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}`;

const GRADIENT_FS = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}`;

/* "Aroma first." — the words are written into the dye, fragment by fragment */
const TEXT_FS = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform sampler2D uText;
uniform vec3 color;
uniform float amount;
uniform float uTime;
${NOISE}
void main () {
  vec3 base = texture2D(uTarget, vUv).rgb;
  float a = texture2D(uText, vec2(vUv.x, 1.0 - vUv.y)).a;
  float n = noise(vUv * vec2(34.0, 20.0) + vec2(0.0, -uTime * 0.7));
  float m = 1.0 - smoothstep(amount - 0.22, amount + 0.02, n);
  float tex = 0.7 + 0.6 * noise(vUv * vec2(90.0, 60.0) + uTime * 0.3);
  vec3 target = color * a * m * tex;
  gl_FragColor = vec4(max(base, mix(base, target, 0.22)), 1.0);
}`;

/* the compositor: photographs seen through smoke */
const DISPLAY_FS = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uDye;
uniform sampler2D uPhotoA;
uniform sampler2D uPhotoB;
uniform vec4 uRectA;
uniform vec4 uRectB;
uniform vec4 uCovA;
uniform vec4 uCovB;
uniform float uOnA;
uniform float uOnB;
uniform vec2 uDyeTexel;
uniform vec2 uPx;
uniform vec4 uZone[4];
uniform float uZoneK[4];
uniform float uFeather;
uniform float uExpose;
uniform float uPhotoExpose;
uniform float uVeil;
uniform float uGain;
uniform float uTime;
uniform vec3 uBloom;
uniform float uAspect;
uniform float uCentre;
uniform float uHue;
uniform float uAlpha;

float dens (vec3 c) { return max(c.r, max(c.g, c.b)); }

vec3 photo (sampler2D tex, vec4 rect, vec4 cov, float blur) {
  vec2 local = (vUv - rect.xy) / rect.zw;
  vec2 p = local * cov.xy + cov.zw;
  p.y = 1.0 - p.y;
  vec2 k = (blur * 10.0) * uPx / rect.zw * cov.xy;
  vec2 vg = local - 0.5;
  float vig = 1.0 - dot(vg, vg) * 0.28;
  vec3 c = texture2D(tex, p).rgb * 0.28;
  c += texture2D(tex, p + vec2( 1.0,  0.0) * k).rgb * 0.12;
  c += texture2D(tex, p + vec2(-1.0,  0.0) * k).rgb * 0.12;
  c += texture2D(tex, p + vec2( 0.5,  0.866) * k).rgb * 0.12;
  c += texture2D(tex, p + vec2(-0.5,  0.866) * k).rgb * 0.12;
  c += texture2D(tex, p + vec2( 0.5, -0.866) * k).rgb * 0.12;
  c += texture2D(tex, p + vec2(-0.5, -0.866) * k).rgb * 0.12;
  return c * vig;
}
float inRect (vec4 rect) {
  vec2 l = (vUv - rect.xy) / rect.zw;
  vec2 e = step(vec2(0.0), l) * step(l, vec2(1.0));
  return e.x * e.y;
}

void main () {
  vec3 dye = texture2D(uDye, vUv).rgb;
  float d = dens(dye);
  float dl = dens(texture2D(uDye, vUv - vec2(uDyeTexel.x, 0.0)).rgb);
  float dr = dens(texture2D(uDye, vUv + vec2(uDyeTexel.x, 0.0)).rgb);
  float dt = dens(texture2D(uDye, vUv + vec2(0.0, uDyeTexel.y)).rgb);
  float db = dens(texture2D(uDye, vUv - vec2(0.0, uDyeTexel.y)).rgb);
  vec3 n = normalize(vec3(dr - dl, dt - db, 0.22));
  float light = clamp(dot(n, vec3(-0.32, 0.62, 0.72)), 0.0, 1.0);
  float shade = 0.62 + 0.55 * light;

  vec3 col = vec3(0.0196, 0.0157, 0.0118);
  /* the photograph keeps its own colours; only a dense curl softens it a little */
  float soft = smoothstep(0.3, 1.0, d) * uVeil;
  float onPhoto = 0.0;
  if (uOnA > 0.0) {
    if (inRect(uRectA) > 0.0) {
      col = mix(col, photo(uPhotoA, uRectA, uCovA, soft * 0.6), uOnA * uPhotoExpose);
      onPhoto = uOnA * uPhotoExpose;
    }
  }
  if (uOnB > 0.0) {
    if (inRect(uRectB) > 0.0) {
      col = mix(col, photo(uPhotoB, uRectB, uCovB, soft * 0.6), uOnB * uPhotoExpose);
      onPhoto = max(onPhoto, uOnB * uPhotoExpose);
    }
  }

  /* smoke is light, not paint: a luminous near-white / soft-gold wisp, screened on */
  vec2 cq = (vUv - 0.5) * vec2(uAspect, 1.0);
  float centre = mix(1.0, 0.18 + 0.82 * smoothstep(0.1, 0.48, length(cq)), uCentre * onPhoto);
  float w = (1.0 - exp(-d * uGain)) * shade * centre;
  vec3 hue = mix(vec3(1.0, 0.93, 0.8), dye / max(d, 0.0001), uHue);
  vec3 wisp = clamp(hue * w * uAlpha, 0.0, 1.0);
  col = 1.0 - (1.0 - col) * (1.0 - wisp);
  /* a faint warm rim where a curl crosses the food */
  float edge = smoothstep(0.02, 0.14, d) * (1.0 - smoothstep(0.14, 0.45, d));
  col += edge * uBloom * 0.06 * onPhoto;

  /* clear zones keep real text at AA contrast */
  vec2 fc = gl_FragCoord.xy;
  for (int i = 0; i < 4; i++) {
    vec4 z = uZone[i];
    if (z.z > 0.0) {
      vec2 h = z.zw * 0.5 + uFeather;
      vec2 q = (fc - (z.xy + z.zw * 0.5)) / h;
      float m = 1.0 - smoothstep(0.55, 1.05, length(q));
      col *= 1.0 - m * uZoneK[i];
    }
  }
  col *= uExpose;
  col += (fract(sin(dot(fc + fract(uTime) * 61.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

/* mustard seeds popping in hot oil */
const SEED_VS = `
precision highp float;
attribute vec3 aSeed;
uniform float uSize;
varying float vLife;
void main () {
  vLife = aSeed.z;
  gl_Position = vec4(aSeed.xy, 0.0, 1.0);
  gl_PointSize = aSeed.z > 0.0 ? (2.0 + 5.0 * aSeed.z) * uSize : 0.0;
}`;
const SEED_FS = `
precision mediump float;
varying float vLife;
void main () {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.05, length(c));
  vec3 hot = mix(vec3(0.89, 0.38, 0.17), vec3(1.0, 0.9, 0.55), vLife);
  float core = smoothstep(0.22, 0.0, length(c));
  gl_FragColor = vec4(hot * a * (0.6 + 1.2 * vLife) + vec3(1.0, 0.95, 0.8) * core * vLife, a);
}`;

/* quality ladder: dropped one rung at a time when frames run long */
const LEVELS = [
  { sim: 128, dye: 512, dpr: 2, iter: 20 },
  { sim: 96, dye: 384, dpr: 1.5, iter: 16 },
  { sim: 64, dye: 256, dpr: 1, iter: 12 }
];

export function createFluid(canvas, options = {}) {
  const forceGL1 = /[?&]gl=1\b/.test(location.search);
  const attrs = { alpha: false, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
  let gl = null, isGL2 = false;
  try {
    if (!forceGL1) { gl = canvas.getContext('webgl2', attrs); isGL2 = !!gl; }
    if (!gl) gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
  } catch (_) { gl = null; }
  if (!gl) return null;

  /* ---------- formats ---------- */
  let halfType, internal, format, linear = true;
  if (isGL2) {
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('EXT_color_buffer_half_float');
    halfType = gl.HALF_FLOAT; internal = gl.RGBA16F; format = gl.RGBA;
  } else {
    const hf = gl.getExtension('OES_texture_half_float');
    if (!hf) return null;
    halfType = hf.HALF_FLOAT_OES; internal = gl.RGBA; format = gl.RGBA;
    linear = !!gl.getExtension('OES_texture_half_float_linear');
  }
  if (/[?&]filter=manual/.test(location.search)) linear = false;   // test the manual-bilinear shader path
  if (!canRender()) return null;

  function canRender() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, 4, 4, 0, format, halfType, null);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(f); gl.deleteTexture(t);
    return ok;
  }

  /* ---------- programs ---------- */
  function shader(type, src, defs) {
    const s = gl.createShader(type);
    gl.shaderSource(s, (defs || []).map((d) => `#define ${d}\n`).join('') + src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed');
    return s;
  }
  function program(vsSrc, fsSrc, defs, attr = 'aPosition') {
    const p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fsSrc, defs));
    gl.bindAttribLocation(p, 0, attr);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link failed');
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }
  let P;
  try {
    const adv = linear ? null : ['MANUAL_FILTERING'];
    P = {
      clear: program(BASE_VS, CLEAR_FS),
      splat: program(BASE_VS, SPLAT_FS),
      advect: program(BASE_VS, ADVECT_FS, adv),
      div: program(BASE_VS, DIVERGENCE_FS),
      curl: program(BASE_VS, CURL_FS),
      vort: program(BASE_VS, VORTICITY_FS),
      pressure: program(BASE_VS, PRESSURE_FS),
      grad: program(BASE_VS, GRADIENT_FS),
      text: program(BASE_VS, TEXT_FS),
      display: program(BASE_VS, DISPLAY_FS),
      seed: program(SEED_VS, SEED_FS, null, 'aSeed')
    };
  } catch (e) {
    console.warn('[aroma] smoke disabled:', e.message);
    return null;
  }

  /* ---------- geometry ---------- */
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  const quadIdx = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIdx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  function bindQuad() {
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
  }
  bindQuad();
  function blit(target) {
    if (target) { gl.viewport(0, 0, target.w, target.h); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); }
    else { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  /* ---------- framebuffers ---------- */
  function fbo(w, h, filter) {
    gl.activeTexture(gl.TEXTURE0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, halfType, null);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      tex, fbo: f, w, h, tx: 1 / w, ty: 1 / h,
      attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, tex); return id; },
      free() { gl.deleteTexture(tex); gl.deleteFramebuffer(f); }
    };
  }
  function dfbo(w, h, filter) {
    let a = fbo(w, h, filter), b = fbo(w, h, filter);
    return {
      w, h, tx: 1 / w, ty: 1 / h,
      get read() { return a; },
      get write() { return b; },
      swap() { const t = a; a = b; b = t; },
      free() { a.free(); b.free(); }
    };
  }

  const isPhone = Math.min(screen.width, screen.height) < 600 || /Mobi|Android/i.test(navigator.userAgent);
  let level = isPhone ? 1 : 0;
  let dye, vel, divergence, curlT, pressure;
  let cw = 1, ch = 1;          // canvas CSS size
  let aspect = 1;

  function resolution(r) {
    let ar = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (ar < 1) ar = 1 / ar;
    const mn = Math.round(r), mx = Math.round(r * ar);
    return gl.drawingBufferWidth > gl.drawingBufferHeight ? [mx, mn] : [mn, mx];
  }
  function initFramebuffers() {
    [dye, vel, divergence, curlT, pressure].forEach((t) => t && t.free());
    const L = LEVELS[level];
    const s = resolution(L.sim), d = resolution(L.dye);
    const filt = linear ? gl.LINEAR : gl.NEAREST;
    dye = dfbo(d[0], d[1], filt);
    vel = dfbo(s[0], s[1], filt);
    divergence = fbo(s[0], s[1], gl.NEAREST);
    curlT = fbo(s[0], s[1], gl.NEAREST);
    pressure = dfbo(s[0], s[1], gl.NEAREST);
  }
  let lastW = 0, lastH = 0;
  function resize(force) {
    const r = canvas.getBoundingClientRect();
    cw = Math.max(1, r.width); ch = Math.max(1, r.height);
    aspect = cw / ch;
    const dpr = Math.min(window.devicePixelRatio || 1, LEVELS[level].dpr);
    const w = Math.round(cw * dpr), h = Math.round(ch * dpr);
    if (w === canvas.width && h === canvas.height && !force) return;
    canvas.width = w; canvas.height = h;
    // a phone's toolbar sliding in should not wipe the smoke
    const big = force || !dye || Math.abs(w - lastW) > 2 || Math.abs(h - lastH) / Math.max(1, lastH) > 0.3;
    if (big) { initFramebuffers(); lastW = w; lastH = h; }
  }

  /* ---------- state ---------- */
  let paceNow = 1;
  const cfg = {
    velDiss: 0.4, dyeDiss: 1.6, curl: 24, pressure: 0.8, fill: 0, veil: 0.5,
    gain: 1.6, splatForce: 3000, radius: 0.0036, breath: 0.35, zoneK: 0.38, hue: 0.12, alpha: 0.28,
    pace: 0.36   // sim time runs at this fraction of real time: steam drifts, it does not whip
  };
  Object.assign(cfg, options.config || {});
  const tone = new Float32Array([0.91, 0.69, 0.29]);
  const toneTo = new Float32Array([0.91, 0.69, 0.29]);
  const bloom = new Float32Array([0.95, 0.62, 0.28]);

  const pointer = { x: 0.5, y: 0.5, dx: 0, dy: 0, moved: false, has: false };
  let lastInput = -10, time = 0, last = 0, raf = 0, running = false, alive = true;
  let expose = 1, exposeTo = 1, photoExpose = 1, photoExposeTo = 1;
  let curlBoost = 1, dissBoost = 0, scrollLast = window.scrollY, shiftY = 0;
  let nextBreath = 0.2, dark = false, zoneMix = 1, alphaNow = 0.62;

  /* ---------- tracked elements (veils hold photos, zones keep text clear) ---------- */
  const veils = [];
  const zones = [];
  let textures = 0;
  const MAX_TEX = 4;
  const rectA = new Float32Array(4), rectB = new Float32Array(4), covA = new Float32Array(4), covB = new Float32Array(4);
  const zoneU = new Float32Array(16), zoneK = new Float32Array(4);

  function measureOne(t) {
    const r = t.el.getBoundingClientRect();
    t.w = r.width; t.h = r.height;
    t.x = r.left; t.y = t.fixed ? r.top : r.top + window.scrollY;
  }
  function measure() { for (const t of veils) measureOne(t); for (const t of zones) measureOne(t); }

  function upload(t) {
    const img = t.img;
    if (!img || !img.complete || !img.naturalWidth) {
      if (img && !t.waiting) { t.waiting = true; img.addEventListener('load', () => { t.waiting = false; }, { once: true }); }
      return false;
    }
    if (textures >= MAX_TEX) evict(t);
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); }
    catch (_) { gl.deleteTexture(tex); t.failed = true; return false; }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (isGL2) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
    else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    t.tex = tex; t.tw = img.naturalWidth; t.th = img.naturalHeight; textures++;
    t.el.classList.add('is-gl');
    return true;
  }
  function evict(keep) {
    let worst = null, wd = -1;
    const mid = window.scrollY + ch / 2;
    for (const t of veils) {
      if (!t.tex || t === keep || t.slot) continue;
      const dd = Math.abs((t.fixed ? t.y + window.scrollY : t.y) + t.h / 2 - mid);
      if (dd > wd) { wd = dd; worst = t; }
    }
    if (worst) { gl.deleteTexture(worst.tex); worst.tex = null; textures--; }
  }
  function cover(t, top, out) {
    const ia = t.tw / t.th, ra = t.w / t.h;
    let sx = 1, sy = 1;
    if (ra > ia) sy = ia / ra; else sx = ra / ia;
    const z = t.zoom + 0.025 * Math.sin(time * 0.12 + t.phase);
    sx /= z; sy /= z;
    // a few percent of parallax: the dish drifts slower than the page
    const par = t.fixed ? 0 : ((top + t.h / 2) - ch / 2) / ch * 0.04;
    out[0] = sx; out[1] = sy;
    out[2] = (1 - sx) * t.px;
    out[3] = Math.min(1 - sy, Math.max(0, (1 - sy) * (1 - t.py) + par * sy));
  }

  /* ---------- splats ---------- */
  function radius(r) { return aspect > 1 ? r * aspect : r; }
  function splatTo(target, x, y, r, g, b, rad, clear) {
    gl.useProgram(P.splat.p);
    const u = P.splat.u;
    gl.uniform1i(u.uTarget, target.read.attach(0));
    gl.uniform1f(u.aspectRatio, aspect);
    gl.uniform2f(u.point, x, y);
    gl.uniform3f(u.color, r, g, b);
    gl.uniform1f(u.radius, radius(rad));
    gl.uniform1f(u.uClear, clear || 0);
    blit(target.write);
    target.swap();
  }
  /** velocity + dye at uv (x,y). */
  function splat(x, y, vx, vy, r, g, b, rad = cfg.radius, clear = 0) {
    splatTo(vel, x, y, vx, vy, 0, rad, 0);
    splatTo(dye, x, y, r, g, b, rad, clear);
  }

  /* ---------- seeds (tadka) ---------- */
  const NS = 180;
  const seeds = new Float32Array(NS * 6); // x, y, vx, vy, life, decay (CSS px)
  const seedGPU = new Float32Array(NS * 3);
  const seedBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
  gl.bufferData(gl.ARRAY_BUFFER, seedGPU.byteLength, gl.DYNAMIC_DRAW);
  bindQuad();
  let seedHead = 0, seedsAlive = 0;
  const crackle = new Float32Array(10 * 5);
  let crackleN = 0;

  function tadka(cx, cy) {
    const n = isPhone ? 30 : 46;
    for (let i = 0; i < n; i++) {
      const k = seedHead * 6;
      seedHead = (seedHead + 1) % NS;
      const a = Math.random() * Math.PI * 2;
      const s = 140 + Math.random() * 460;
      seeds[k] = cx; seeds[k + 1] = cy;
      seeds[k + 2] = Math.cos(a) * s;
      seeds[k + 3] = Math.sin(a) * s - 240;
      seeds[k + 4] = 1;
      seeds[k + 5] = 0.9 + Math.random() * 1.4;
    }
    seedsAlive = 1;
    crackleN = 0;
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2, o = crackleN * 5;
      crackle[o] = cx / cw + Math.cos(a) * 0.006;
      crackle[o + 1] = 1 - cy / ch + Math.sin(a) * 0.006 * aspect;
      crackle[o + 2] = Math.cos(a) * 1400;
      crackle[o + 3] = Math.sin(a) * 1400;
      crackle[o + 4] = 0.35 + Math.random() * 0.4;
      crackleN++;
    }
  }
  function stepSeeds(dt) {
    if (!seedsAlive) return;
    let any = 0;
    for (let i = 0; i < NS; i++) {
      const k = i * 6;
      let life = seeds[k + 4];
      if (life <= 0) { seedGPU[i * 3 + 2] = 0; continue; }
      seeds[k + 2] *= 1 - 1.6 * dt;
      seeds[k + 3] = seeds[k + 3] * (1 - 1.6 * dt) + 820 * dt;
      seeds[k] += seeds[k + 2] * dt;
      seeds[k + 1] += seeds[k + 3] * dt;
      life -= seeds[k + 5] * dt;
      seeds[k + 4] = life;
      seedGPU[i * 3] = seeds[k] / cw * 2 - 1;
      seedGPU[i * 3 + 1] = 1 - seeds[k + 1] / ch * 2;
      seedGPU[i * 3 + 2] = life > 0 ? life : 0;
      if (life > 0) any = 1;
    }
    seedsAlive = any;
  }
  function drawSeeds() {
    if (!seedsAlive) return;
    gl.useProgram(P.seed.p);
    gl.uniform1f(P.seed.u.uSize, Math.min(window.devicePixelRatio || 1, LEVELS[level].dpr));
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, seedGPU);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, NS);
    gl.disable(gl.BLEND);
    bindQuad();
  }

  /* ---------- the opening: words written in smoke ---------- */
  let textTex = null, textAmt = 0, intro = null;
  function makeTextTexture(draw) {
    const c = document.createElement('canvas');
    c.width = dye.w; c.height = dye.h;
    const ctx = c.getContext('2d');
    draw(ctx, dye.w / cw, dye.h / ch);
    if (textTex) gl.deleteTexture(textTex);
    textTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  function injectText() {
    gl.useProgram(P.text.p);
    const u = P.text.u;
    gl.uniform2f(u.texelSize, dye.tx, dye.ty);
    gl.uniform1i(u.uTarget, dye.read.attach(0));
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, textTex);
    gl.uniform1i(u.uText, 1);
    gl.uniform3f(u.color, 0.98, 0.8, 0.5);
    gl.uniform1f(u.amount, textAmt);
    gl.uniform1f(u.uTime, time);
    blit(dye.write);
    dye.swap();
  }
  function runIntro(dt) {
    const it = intro;
    it.t += dt;
    const t = it.t;
    // 0–0.5 black · 0.5–2.3 the words gather · 2.3–3.5 they hold · then they let go
    if (t < 0.5) { textAmt = 0; curlBoost = 0.12; }
    else if (t < 2.3) { textAmt = Math.min(1.25, (t - 0.5) / 1.6 * 1.25); curlBoost = 0.12; injectText(); }
    else if (t < 3.5) { textAmt = 1.25; curlBoost = 0.18; injectText(); if (!it.held) { it.held = true; it.onHold && it.onHold(); } }
    else if (!it.released) {
      it.released = true;
      curlBoost = 1.4;
      photoExposeTo = 1;
      dissBoost = 1.2;
      // breath off the plate: lift the letters into curls
      for (let i = 0; i < it.points.length; i += 2) {
        const x = it.points[i], y = it.points[i + 1];
        splatTo(vel, x, y, (Math.random() - 0.5) * 700, 380 + Math.random() * 520, 0, 0.0025, 0);
      }
      it.onRelease && it.onRelease();
    } else if (t > 6.5) { curlBoost = 1; intro = null; it.onDone && it.onDone(); }
    else curlBoost = 1.6 - (t - 3.5) / 3 * 0.6;
  }

  /* ---------- sim step ---------- */
  function step(dt) {
    gl.disable(gl.BLEND);
    const sx = vel.tx, sy = vel.ty;

    gl.useProgram(P.curl.p);
    gl.uniform2f(P.curl.u.texelSize, sx, sy);
    gl.uniform1i(P.curl.u.uVelocity, vel.read.attach(0));
    blit(curlT);

    gl.useProgram(P.vort.p);
    gl.uniform2f(P.vort.u.texelSize, sx, sy);
    gl.uniform1i(P.vort.u.uVelocity, vel.read.attach(0));
    gl.uniform1i(P.vort.u.uCurl, curlT.attach(1));
    gl.uniform1f(P.vort.u.curl, cfg.curl * curlBoost);
    gl.uniform1f(P.vort.u.dt, dt);
    blit(vel.write); vel.swap();

    gl.useProgram(P.div.p);
    gl.uniform2f(P.div.u.texelSize, sx, sy);
    gl.uniform1i(P.div.u.uVelocity, vel.read.attach(0));
    blit(divergence);

    gl.useProgram(P.clear.p);
    gl.uniform1i(P.clear.u.uTexture, pressure.read.attach(0));
    gl.uniform1f(P.clear.u.value, cfg.pressure);
    blit(pressure.write); pressure.swap();

    gl.useProgram(P.pressure.p);
    gl.uniform2f(P.pressure.u.texelSize, sx, sy);
    gl.uniform1i(P.pressure.u.uDivergence, divergence.attach(0));
    const it = LEVELS[level].iter;
    for (let i = 0; i < it; i++) {
      gl.uniform1i(P.pressure.u.uPressure, pressure.read.attach(1));
      blit(pressure.write); pressure.swap();
    }

    gl.useProgram(P.grad.p);
    gl.uniform2f(P.grad.u.texelSize, sx, sy);
    gl.uniform1i(P.grad.u.uPressure, pressure.read.attach(0));
    gl.uniform1i(P.grad.u.uVelocity, vel.read.attach(1));
    blit(vel.write); vel.swap();

    const A = P.advect.u;
    gl.useProgram(P.advect.p);
    gl.uniform2f(A.texelSize, sx, sy);
    gl.uniform2f(A.dyeTexelSize, sx, sy);
    gl.uniform1i(A.uVelocity, vel.read.attach(0));
    gl.uniform1i(A.uSource, vel.read.attach(0));
    gl.uniform1f(A.dt, dt);
    gl.uniform1f(A.dissipation, cfg.velDiss + (intro && !intro.released ? 3 : 0));
    gl.uniform2f(A.uShift, 0, shiftY * 0.35);
    gl.uniform1f(A.uFill, 0);
    gl.uniform1f(A.uTime, time);
    gl.uniform1f(A.uAspect, aspect);
    blit(vel.write); vel.swap();

    gl.uniform2f(A.dyeTexelSize, dye.tx, dye.ty);
    gl.uniform1i(A.uVelocity, vel.read.attach(0));
    gl.uniform1i(A.uSource, dye.read.attach(1));
    gl.uniform1f(A.dissipation, cfg.dyeDiss + dissBoost);
    gl.uniform2f(A.uShift, 0, shiftY);
    gl.uniform1f(A.uFill, dark || (intro && !intro.released) ? 0 : cfg.fill);
    gl.uniform3f(A.uFillColor, tone[0] * 0.36 + 0.12, tone[1] * 0.36 + 0.11, tone[2] * 0.36 + 0.1);
    blit(dye.write); dye.swap();
  }

  /* ---------- compose ---------- */
  function render() {
    const vh = ch, sy = window.scrollY;
    let a = null, b = null, ao = 0, bo = 0;
    for (const t of veils) {
      t.slot = 0;
      if (!t.w || !t.h || t.failed) continue;
      const top = t.fixed ? t.y : t.y - sy;
      const ov = Math.min(top + t.h, vh) - Math.max(top, 0);
      if (ov <= -vh * 0.75) continue;
      if (!t.tex && !upload(t)) continue;  // pre-load a little before it arrives
      if (ov <= 0) continue;
      if (ov > ao) { b = a; bo = ao; a = t; ao = ov; } else if (ov > bo) { b = t; bo = ov; }
    }
    const D = P.display.u;
    gl.useProgram(P.display.p);
    gl.uniform1i(D.uDye, dye.read.attach(0));
    gl.uniform2f(D.uDyeTexel, dye.tx, dye.ty);
    gl.uniform2f(D.uPx, 1 / canvas.width, 1 / canvas.height);
    setSlot(a, sy, rectA, covA, D.uRectA, D.uCovA, D.uOnA, D.uPhotoA, 1);
    setSlot(b, sy, rectB, covB, D.uRectB, D.uCovB, D.uOnB, D.uPhotoB, 2);

    const k = canvas.width / cw;
    let zn = 0;
    zoneU.fill(0);
    for (const z of zones) {
      if (zn >= 4 || !z.w) continue;
      const top = z.fixed ? z.y : z.y - sy;
      if (top > vh || top + z.h < 0) continue;
      const o = zn * 4;
      zoneU[o] = z.x * k; zoneU[o + 1] = (vh - top - z.h) * k; zoneU[o + 2] = z.w * k; zoneU[o + 3] = z.h * k;
      zoneK[zn] = z.k * zoneMix; zn++;
    }
    for (let i = zn; i < 4; i++) zoneK[i] = 0;
    gl.uniform4fv(D.uZone, zoneU);
    gl.uniform1fv(D.uZoneK, zoneK);
    gl.uniform1f(D.uFeather, 90 * k);
    gl.uniform1f(D.uExpose, expose);
    gl.uniform1f(D.uPhotoExpose, photoExpose);
    gl.uniform1f(D.uVeil, cfg.veil);
    gl.uniform1f(D.uGain, cfg.gain);
    gl.uniform1f(D.uTime, time);
    gl.uniform3f(D.uBloom, bloom[0], bloom[1], bloom[2]);
    gl.uniform1f(D.uAspect, aspect);
    gl.uniform1f(D.uCentre, zoneMix);
    gl.uniform1f(D.uHue, cfg.hue);
    gl.uniform1f(D.uAlpha, alphaNow);
    blit(null);
    drawSeeds();
  }
  function setSlot(t, sy, rect, cov, uRect, uCov, uOn, uTex, unit) {
    if (!t) { gl.uniform1f(uOn, 0); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, null); gl.uniform1i(uTex, unit); return; }
    t.slot = 1;
    const top = t.fixed ? t.y : t.y - sy;
    rect[0] = t.x / cw; rect[1] = 1 - (top + t.h) / ch; rect[2] = t.w / cw; rect[3] = t.h / ch;
    cover(t, top, cov);
    t.fade = Math.min(1, t.fade + 0.025);
    gl.uniform4fv(uRect, rect);
    gl.uniform4fv(uCov, cov);
    gl.uniform1f(uOn, t.fade * t.gain);
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.uniform1i(uTex, unit);
  }

  /* ---------- the loop ---------- */
  /* drop a rung when most frames in a 60-frame window take longer than 20 ms.
     One-off stalls (image decode, a screenshot, a tab switch) are ignored. */
  let slow = 0, fn = 0, settle = 30;
  function adapt(raw) {
    if (settle > 0) { settle--; return; }
    if (raw > 0.1) return;
    fn++;
    if (raw > 0.020) slow++;
    if (fn >= 60) {
      if (slow > 36 && level < LEVELS.length - 1) { level++; settle = 40; resize(true); }
      slow = 0; fn = 0;
    }
  }
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const raw = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    adapt(raw);
    tick(Math.min(raw, 1 / 60));
  }
  function tick(dt) {
    time += dt;

    for (let i = 0; i < 3; i++) tone[i] += (toneTo[i] - tone[i]) * 0.025;
    expose += (exposeTo - expose) * 0.06;
    zoneMix += ((intro && !intro.released ? 0 : 1) - zoneMix) * 0.03;
    alphaNow += ((intro && !intro.released ? 0.95 : cfg.alpha) - alphaNow) * 0.03;
    photoExpose += (photoExposeTo - photoExpose) * 0.03;
    if (dissBoost > 0) dissBoost = Math.max(0, dissBoost - dt * 1.4);
    paceNow += ((intro && !intro.released ? 1 : cfg.pace) - paceNow) * 0.02;
    const sdt = dt * paceNow;

    const sy = window.scrollY;
    shiftY = (sy - scrollLast) / ch;
    scrollLast = sy;

    if (intro) runIntro(dt);

    // the visitor's hand: push velocity, thin the smoke, leave a faint wisp
    if (pointer.moved) {
      pointer.moved = false;
      const f = cfg.splatForce;
      const m = Math.min(1, Math.hypot(pointer.dx, pointer.dy) * 40);
      splatTo(vel, pointer.x, pointer.y, pointer.dx * f, pointer.dy * f, 0, cfg.radius, 0);
      const k = Math.min(0.8, 0.9 * m);
      splatTo(dye, pointer.x, pointer.y, tone[0] * k, tone[1] * k, tone[2] * k, cfg.radius * 0.7, 0);
      pointer.dx = 0; pointer.dy = 0;
    }
    if (crackleN) {
      for (let i = 0; i < crackleN; i++) {
        const o = i * 5, br = crackle[o + 4];
        splatTo(vel, crackle[o], crackle[o + 1], crackle[o + 2], crackle[o + 3], 0, 0.0007, 0);
        splatTo(dye, crackle[o], crackle[o + 1], 1.1 * br, 0.55 * br, 0.16 * br, 0.00035, 0);
      }
      crackleN = 0;
    }
    // breath: steam rising off a plate, so the scene is never still
    if (cfg.breath && !dark && !(intro && !intro.released) && time > nextBreath) {
      const idle = time - lastInput > 2.5;
      nextBreath = time + ((idle ? 0.7 : 1.1) + Math.random() * 0.9) / Math.max(0.2, paceNow);
      const s = 5 * cfg.breath;
      const side = Math.random();
      if (side < 0.7) {           // rising off the plate, from the lower corners more than the middle
        const x = Math.random() < 0.5 ? 0.04 + Math.random() * 0.3 : 0.66 + Math.random() * 0.3;
        splat(x, 0.02 + Math.random() * 0.04, (Math.random() - 0.5) * 120, 380 + Math.random() * 320, tone[0] * s, tone[1] * s, tone[2] * s, 0.0032);
      } else {                    // or curling in from an edge
        const left = side < 0.85;
        splat(left ? -0.01 : 1.01, 0.08 + Math.random() * 0.45, (left ? 1 : -1) * (260 + Math.random() * 260), 240 + Math.random() * 200, tone[0] * s, tone[1] * s, tone[2] * s, 0.0022);
      }
    }

    // ambient churn: the air in a kitchen is never quite still
    if (!dark && !(intro && !intro.released)) {
      const a = Math.random() * 6.283, m = 120 + Math.random() * 220;
      splatTo(vel, Math.random(), Math.random(), Math.cos(a) * m, Math.sin(a) * m + 60, 0, 0.012, 0);
    }
    step(sdt);
    stepSeeds(dt);
    render();
  }

  /* ---------- input ---------- */
  function move(cx, cy) {
    const x = cx / cw, y = 1 - cy / ch;
    if (pointer.has) {
      pointer.dx += (x - pointer.x) * (aspect < 1 ? aspect : 1);
      pointer.dy += (y - pointer.y) / (aspect > 1 ? aspect : 1);
      pointer.moved = true;
    }
    pointer.x = x; pointer.y = y; pointer.has = true;
    lastInput = time;
  }
  const onPointer = (e) => { if (e.pointerType !== 'touch') move(e.clientX, e.clientY); };
  const onTouch = (e) => { const t = e.touches[0]; if (t) move(t.clientX, t.clientY); };
  const onTouchStart = (e) => { const t = e.touches[0]; if (t) { pointer.has = false; move(t.clientX, t.clientY); } };
  const onLeave = () => { pointer.has = false; };
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouch, { passive: true });
  document.addEventListener('pointerleave', onLeave);

  const onVis = () => { if (document.hidden) stop(); else if (alive && wanted) start(); };
  document.addEventListener('visibilitychange', onVis);
  const onResize = () => { resize(false); measure(); };
  window.addEventListener('resize', onResize);
  const ro = window.ResizeObserver ? new ResizeObserver(() => measure()) : null;
  if (ro) ro.observe(document.body);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); alive = false; stop(); options.onLost && options.onLost(); });

  let wanted = false;
  function start() {
    wanted = true;
    if (running || !alive || document.hidden) return;
    running = true; last = 0; settle = 20;
    raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  resize(true);
  measure();

  return {
    gl2: isGL2,
    get level() { return level; },
    info() {
      return { gl2: isGL2, level, linear, sim: [vel.w, vel.h], dye: [dye.w, dye.h], canvas: [canvas.width, canvas.height], veils: veils.length, textures, running };
    },
    start, stop: () => { wanted = false; stop(); },
    measure,
    configure(c) { Object.assign(cfg, c); },
    setTone(rgb, bl) { toneTo[0] = rgb[0]; toneTo[1] = rgb[1]; toneTo[2] = rgb[2]; if (bl) { bloom[0] = bl[0]; bloom[1] = bl[1]; bloom[2] = bl[2]; } },
    toneNow(rgb) { for (let i = 0; i < 3; i++) tone[i] = toneTo[i] = rgb[i]; },
    addVeil(el, opt = {}) {
      const img = el.querySelector('img');
      const pos = (img && getComputedStyle(img).objectPosition || '50% 50%').split(' ');
      const t = { el, img, fixed: !!opt.fixed, x: 0, y: 0, w: 0, h: 0, tex: null, tw: 1, th: 1, fade: 0, slot: 0,
        gain: opt.gain || 1, zoom: opt.zoom || 1.04, phase: Math.random() * 6,
        px: (parseFloat(pos[0]) || 50) / 100, py: (parseFloat(pos[1]) || 50) / 100 };
      veils.push(t); measureOne(t);
      return t;
    },
    addZone(el, k, opt = {}) { const t = { el, k: k == null ? cfg.zoneK : k, fixed: !!opt.fixed }; zones.push(t); measureOne(t); return t; },
    /** a pinch of spice puffs up in its own colour (client px) */
    puff(cx, cy, rgb, amt = 1) {
      const x = cx / cw, y = 1 - cy / ch;
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2, r = 0.012 * Math.random();
        splat(x + Math.cos(a) * r, y + Math.sin(a) * r * aspect, Math.cos(a) * 260, 380 + Math.random() * 420,
          rgb[0] * 0.5 * amt, rgb[1] * 0.5 * amt, rgb[2] * 0.5 * amt, 0.0035 + Math.random() * 0.004);
      }
      lastInput = time;
    },
    /** stir as if a hand passed by (used by synthetic tests and the gentle auto-fan) */
    stir(cx, cy, dx, dy) {
      pointer.has = false; move(cx - dx, cy - dy); move(cx, cy);
    },
    /** fan a region clear, as if someone waved over the plate */
    fan(cx, cy, w) {
      const x = cx / cw, y = 1 - cy / ch;
      for (let i = 0; i < 4; i++) {
        const ox = (Math.random() - 0.5) * w / cw, oy = (Math.random() - 0.5) * w / ch * 0.6;
        splatTo(vel, x + ox, y + oy, (Math.random() - 0.5) * 900, 300 + Math.random() * 600, 0, 0.006, 0);
        splatTo(dye, x + ox, y + oy, 0, 0, 0, 0.012, 0.45);
      }
    },
    /** cover a rectangle (client px) in fresh smoke */
    veilBurst(x0, y0, w, h, s = 0.5) {
      for (let i = 0; i < 7; i++) {
        const x = (x0 + Math.random() * w) / cw, y = 1 - (y0 + h * (0.3 + Math.random() * 0.7)) / ch;
        splat(x, y, (Math.random() - 0.5) * 300, 200 + Math.random() * 300, tone[0] * s, tone[1] * s, tone[2] * s, 0.02 + Math.random() * 0.02);
      }
    },
    tadka,
    /** page leaving: smoke rushes in from every edge */
    cover() {
      const s = 0.9;
      for (let i = 0; i < 10; i++) {
        const side = i % 4, r = Math.random();
        const x = side === 0 ? 0 : side === 1 ? 1 : r, y = side === 2 ? 0 : side === 3 ? 1 : r;
        splat(x, y, (0.5 - x) * 5000, (0.5 - y) * 5000, tone[0] * s, tone[1] * s, tone[2] * s, 0.05);
      }
      exposeTo = 0.0;
    },
    /** page arriving: the screen starts thick with smoke, then clears */
    enter(s = 0.22) {
      splatTo(dye, 0.5, 0.5, tone[0] * s, tone[1] * s, tone[2] * s, 4, 0);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        splatTo(vel, 0.5 + Math.cos(a) * 0.15, 0.5 + Math.sin(a) * 0.15, Math.cos(a) * 1400, Math.sin(a) * 1400 + 300, 0, 0.03, 0);
      }
      dissBoost = 2.2;
    },
    /** the opening words, drawn by `draw(ctx, sx, sy)` into dye space */
    intro(draw, points, hooks = {}) {
      makeTextTexture(draw);
      photoExpose = 0; photoExposeTo = 0;
      dark = false; zoneMix = 0;
      intro = { t: 0, points, held: false, released: false, ...hooks };
    },
    /** test hook: advance n frames at 60 fps, synchronously (no rAF needed) */
    debugStep(n = 1) { for (let i = 0; i < n; i++) tick(1 / 60); },
    renderer() { const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); },
    skipIntro() { if (intro && !intro.released) intro.t = 3.5; },
    /** hold the screen dark (no photo, no fog) until the opening begins */
    darken() { photoExpose = 0; photoExposeTo = 0; dark = true; },
    destroy() {
      stop(); alive = false;
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      if (ro) ro.disconnect();
    }
  };
}
