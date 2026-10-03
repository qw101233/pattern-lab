/* 斑图工坊 · Gray-Scott 模拟器（WebGL 实现）
 *
 * 架构：
 *   - 两张 RGBA8 纹理做 PingPong（前/后帧）
 *   - 三个 fragment shader：sim（步进）、disp（显示）、paint（笔刷）
 *   - rAF 主循环，每帧跑 N 次步进 + 1 次显示
 *
 * 编码约定：
 *   纹理 RGBA 通道 → R: u 浓度 [0,1], G: v 浓度 [0, ~0.4], B/A: 保留
 *
 * 用 GLSL ES 1.00（attribute/varying/gl_FragColor）保证 WebGL1/WebGL2 兼容。
 */

export class GrayScottSimulator {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.size = options.size || 384;
    this.subSteps = options.subSteps || 60;
    this.state = { step: 0 };
    this.playing = true;
    this.colormap = 0;
    this.gamma = 1.2;
    this.zoom = 1.0;
    this.params = { f: 0.055, k: 0.062, du: 1.0, dv: 0.5, dt: 1.0 };
    this.contextLost = false;

    this._initGL();
    this._initPrograms();
    this._initTextures();
    this._initBuffers();

    this._stampCenter(0.5, 0.5, 0.06);
    this._renderToCanvas();
  }

  // ─── GL 初始化 ───
  _initGL() {
    // 优先 WebGL2（功能更强），降级到 WebGL1
    let gl = this.canvas.getContext('webgl2', {
      preserveDrawingBuffer: true,
      antialias: false,
      premultipliedAlpha: false
    });
    let isWebGL2 = !!gl;
    if (!gl) {
      gl = this.canvas.getContext('webgl', {
        preserveDrawingBuffer: true,
        antialias: false,
        premultipliedAlpha: false
      });
    }
    if (!gl) throw new Error('需要 WebGL 支持。请用 Chrome / Edge / Firefox 最新版。');
    this.gl = gl;
    this.isWebGL2 = isWebGL2;
    this.contextLost = false;

    this.internalFormat = gl.RGBA;
    this.format = gl.RGBA;
    this.type = gl.UNSIGNED_BYTE;

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.error('[GrayScottSim] WebGL context lost');
      this.contextLost = true;
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      console.warn('[GrayScottSim] WebGL context restored');
      this.contextLost = false;
    });
  }

  // ─── 编译 program ───
  _initPrograms() {
    const gl = this.gl;

    // 共用的顶点 shader
    const vsSrc = `
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main() {
        v_uv = a_pos * 0.5 + 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }`;

    // 模拟步进
    const simFrag = `
      precision highp float;
      uniform sampler2D u_state;
      uniform vec2 u_texel;
      uniform float u_f, u_k, u_dt, u_du, u_dv;
      varying vec2 v_uv;

      void main() {
        vec2 uv = v_uv;
        // 9 点拉普拉斯（中心 -1，边缘 0.2，对角 0.05）
        vec4 c  = texture2D(u_state, uv);
        vec4 n  = texture2D(u_state, uv + vec2(0.0,  u_texel.y));
        vec4 s  = texture2D(u_state, uv + vec2(0.0, -u_texel.y));
        vec4 e  = texture2D(u_state, uv + vec2( u_texel.x, 0.0));
        vec4 w  = texture2D(u_state, uv + vec2(-u_texel.x, 0.0));
        vec4 ne = texture2D(u_state, uv + u_texel);
        vec4 nw = texture2D(u_state, uv + vec2(-u_texel.x,  u_texel.y));
        vec4 se = texture2D(u_state, uv + vec2( u_texel.x, -u_texel.y));
        vec4 sw = texture2D(u_state, uv - u_texel);

        vec2 lap = (n.xy + s.xy + e.xy + w.xy) * 0.2
                 + (ne.xy + nw.xy + se.xy + sw.xy) * 0.05
                 - c.xy;

        float u = c.x, v = c.y;
        float uvv = u * v * v;
        float du = u_du * lap.x - uvv + u_f * (1.0 - u);
        float dv = u_dv * lap.y + uvv - (u_f + u_k) * v;
        float nu = clamp(u + du * u_dt, 0.0, 1.0);
        float nv = clamp(v + dv * u_dt, 0.0, 1.0);

        gl_FragColor = vec4(nu, nv, 0.0, 1.0);
      }`;

    // 渲染（浓度 → 颜色）
    // 注意：用 mix() 替代 if-else 链；用 constant 默认值避免 uniform 丢失陷阱。
    const dispFrag = `
      precision highp float;
      uniform sampler2D u_state;
      uniform int u_cmap;
      uniform float u_gamma;
      uniform float u_zoom;
      varying vec2 v_uv;

      // 6 种 colormap 各自提供 4 个停靠点（c0/c1/c2/c3）
      // 用 step() 选择停靠点区间，mix() 区间内插值。
      vec3 ember(float t) {
        vec3 c0 = vec3(0.01, 0.01, 0.04);
        vec3 c1 = vec3(0.55, 0.05, 0.02);
        vec3 c2 = vec3(1.00, 0.50, 0.05);
        vec3 c3 = vec3(1.00, 0.95, 0.75);
        t = clamp(t, 0.0, 1.0);
        vec3 a = mix(c0, c1, smoothstep(0.00, 0.33, t));
        vec3 b = mix(a, c2, smoothstep(0.33, 0.66, t));
        return mix(b, c3, smoothstep(0.66, 1.00, t));
      }
      vec3 ocean(float t) {
        vec3 c0 = vec3(0.00, 0.02, 0.10);
        vec3 c1 = vec3(0.00, 0.30, 0.60);
        vec3 c2 = vec3(0.20, 0.85, 0.95);
        vec3 c3 = vec3(1.00, 1.00, 0.95);
        t = clamp(t, 0.0, 1.0);
        vec3 a = mix(c0, c1, smoothstep(0.00, 0.33, t));
        vec3 b = mix(a, c2, smoothstep(0.33, 0.66, t));
        return mix(b, c3, smoothstep(0.66, 1.00, t));
      }
      vec3 neon(float t) {
        vec3 c0 = vec3(0.05, 0.00, 0.12);
        vec3 c1 = vec3(1.00, 0.10, 0.75);
        vec3 c2 = vec3(0.20, 1.00, 0.85);
        vec3 c3 = vec3(1.00, 1.00, 1.00);
        t = clamp(t, 0.0, 1.0);
        vec3 a = mix(c0, c1, smoothstep(0.00, 0.50, t));
        vec3 b = mix(a, c2, smoothstep(0.50, 0.75, t));
        return mix(b, c3, smoothstep(0.75, 1.00, t));
      }
      vec3 coral(float t) {
        vec3 c0 = vec3(0.05, 0.02, 0.10);
        vec3 c1 = vec3(0.85, 0.25, 0.35);
        vec3 c2 = vec3(1.00, 0.78, 0.45);
        vec3 c3 = vec3(1.00, 1.00, 0.95);
        t = clamp(t, 0.0, 1.0);
        vec3 a = mix(c0, c1, smoothstep(0.00, 0.33, t));
        vec3 b = mix(a, c2, smoothstep(0.33, 0.66, t));
        return mix(b, c3, smoothstep(0.66, 1.00, t));
      }
      vec3 mono(float t) { return vec3(clamp(t, 0.0, 1.0)); }
      vec3 aurora(float t) {
        vec3 c0 = vec3(0.05, 0.00, 0.20);
        vec3 c1 = vec3(0.00, 0.80, 0.60);
        vec3 c2 = vec3(0.20, 0.50, 1.00);
        vec3 c3 = vec3(0.95, 1.00, 0.75);
        t = clamp(t, 0.0, 1.0);
        vec3 a = mix(c0, c1, smoothstep(0.00, 0.33, t));
        vec3 b = mix(a, c2, smoothstep(0.33, 0.66, t));
        return mix(b, c3, smoothstep(0.66, 1.00, t));
      }

      void main() {
        // zoom 默认 1.0，避免除零
        float zoom = max(u_zoom, 0.5);
        vec2 c = vec2(0.5);
        vec2 z = (v_uv - c) / zoom + c;
        vec4 st = texture2D(u_state, z);
        float v = clamp(st.y, 0.0, 1.0);
        float u = clamp(st.x, 0.0, 1.0);
        float t = pow(v * 1.7, 1.0 / max(u_gamma, 0.5));

        // 用 step() 选 colormap —— 严格 6 选 1
        vec3 col;
        if (u_cmap == 0) col = ember(t);
        else if (u_cmap == 1) col = ocean(t);
        else if (u_cmap == 2) col = neon(t);
        else if (u_cmap == 3) col = coral(t);
        else if (u_cmap == 4) col = mono(t);
        else col = aurora(t);

        // u 高的区域（基质）压暗
        col *= mix(1.0, 0.55, u * 0.7);
        gl_FragColor = vec4(col, 1.0);
      }`;

    // 投放（用户输入笔刷）
    const paintFrag = `
      precision highp float;
      uniform sampler2D u_state;
      uniform vec2 u_center;
      uniform float u_radius;
      uniform float u_strength;
      varying vec2 v_uv;
      void main() {
        vec4 s = texture2D(u_state, v_uv);
        float d = distance(v_uv, u_center);
        float falloff = 1.0 - smoothstep(0.0, u_radius, d);
        if (falloff <= 0.0) { gl_FragColor = s; return; }
        float u = s.x;
        float v = s.y;
        v = min(1.0, v + falloff * u_strength);
        u = max(0.0, u - falloff * u_strength * 0.5);
        gl_FragColor = vec4(u, v, 0.0, 1.0);
      }`;

    this.simProg = this._buildProgram(vsSrc, simFrag, 'sim');
    this.dispProg = this._buildProgram(vsSrc, dispFrag, 'disp');
    this.paintProg = this._buildProgram(vsSrc, paintFrag, 'paint');

    // 缓存 uniform 位置（创建后立刻拿，避免后续 useProgram 切换串台）
    this._u = {
      sim: this._getUniforms(this.simProg, ['u_state', 'u_texel', 'u_f', 'u_k', 'u_dt', 'u_du', 'u_dv']),
      disp: this._getUniforms(this.dispProg, ['u_state', 'u_cmap', 'u_gamma', 'u_zoom']),
      paint: this._getUniforms(this.paintProg, ['u_state', 'u_center', 'u_radius', 'u_strength']),
    };
    console.log('[GrayScottSim] Programs linked:', {
      simLoc: this._u.sim,
      dispLoc: this._u.disp,
      paintLoc: this._u.paint,
      isWebGL2: this.isWebGL2,
      renderer: gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL || gl.RENDERER)
    });
  }

  _getUniforms(prog, names) {
    const gl = this.gl;
    const out = {};
    for (const n of names) out[n] = gl.getUniformLocation(prog, n);
    return out;
  }

  _buildProgram(vsSrc, fsSrc, label) {
    const gl = this.gl;
    const vs = this._compile(vsSrc, gl.VERTEX_SHADER, label + '.vs');
    const fs = this._compile(fsSrc, gl.FRAGMENT_SHADER, label + '.fs');
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      console.error('Program link failed (' + label + '):\n' + log);
      throw new Error('Program 链接失败: ' + log);
    }
    // 链接后 shader 可以删除（program 持有引用）
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
  }

  _compile(src, type, label = '') {
    const gl = this.gl;
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      console.error('Shader 编译失败 (' + label + '):\n' + log + '\n--- src ---\n' + src);
      gl.deleteShader(sh);
      throw new Error('Shader 编译失败: ' + log);
    }
    return sh;
  }

  // ─── 纹理 + 帧缓冲 ───
  _initTextures() {
    const gl = this.gl;
    const N = this.size;

    this.front = this._createTex(N);
    this.back = this._createTex(N);
    this._fbo = [this._createFbo(this.front), this._createFbo(this.back)];
    this._initState();
  }

  _createTex(N) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.internalFormat, N, N, 0, this.format, this.type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return tex;
  }

  _createFbo(tex) {
    const gl = this.gl;
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('FBO 不完整: 0x' + status.toString(16));
    }
    return fbo;
  }

  _initState() {
    // Karl Sims 的经典做法：均匀 u=1, v=0，中心一个明显方块
    const N = this.size;
    const data = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
      data[i * 4 + 0] = 255; // u = 1
      data[i * 4 + 1] = 0;   // v = 0
      data[i * 4 + 2] = 0;
      data[i * 4 + 3] = 255;
    }
    // 中心方块（15x15 像素）的 v 浓度（明显的起始点）
    const cx = N / 2, cy = N / 2, h = N * 0.04;
    for (let y = -h; y <= h; y++) {
      for (let x = -h; x <= h; x++) {
        const px = ((cx + x) | 0 + N) % N;
        const py = ((cy + y) | 0 + N) % N;
        const idx = (py * N + px) * 4;
        data[idx + 0] = 128; // u = 0.5
        data[idx + 1] = 255; // v = 1.0
      }
    }
    // 中心方块周围加一圈低 v 扰动（避免边缘硬切产生锯齿）
    const r2 = N * 0.06;
    for (let y = -r2; y <= r2; y++) {
      for (let x = -r2; x <= r2; x++) {
        const dist = Math.sqrt(x * x + y * y);
        if (dist <= h * 1.4) continue;
        if (dist > r2) continue;
        const px = ((cx + x) | 0 + N) % N;
        const py = ((cy + y) | 0 + N) % N;
        const idx = (py * N + px) * 4;
        const t = (dist - h * 1.4) / (r2 - h * 1.4);
        data[idx + 0] = 200 + (255 - 200) * t; // u 渐增
        data[idx + 1] = (1 - t) * 200;          // v 渐减
      }
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.front);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, this.format, this.type, data);
    gl.bindTexture(gl.TEXTURE_2D, this.back);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, this.format, this.type, data);
  }

  // ─── 全屏 quad ───
  _initBuffers() {
    const gl = this.gl;
    this.vao = gl.createVertexArray ? gl.createVertexArray() : null;
    if (this.vao) gl.bindVertexArray(this.vao);
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1,  -1, 1,
      -1,  1,  1, -1,   1, 1,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    if (this.vao) gl.bindVertexArray(null);
  }

  _bindQuad() {
    const gl = this.gl;
    if (this.vao) {
      gl.bindVertexArray(this.vao);
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    }
  }

  // ─── 状态步进 ───
  step() {
    if (this.contextLost || !this.playing) return;
    const gl = this.gl;
    const N = this.size;
    gl.useProgram(this.simProg);
    this._bindQuad();

    const u = this._u.sim;
    for (let i = 0; i < this.subSteps; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo[1]);
      gl.viewport(0, 0, N, N);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.front);
      gl.uniform1i(u.state, 0);
      gl.uniform2f(u.texel, 1.0 / N, 1.0 / N);
      gl.uniform1f(u.f, this.params.f);
      gl.uniform1f(u.k, this.params.k);
      gl.uniform1f(u.dt, this.params.dt);
      gl.uniform1f(u.du, this.params.du);
      gl.uniform1f(u.dv, this.params.dv);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      const tmpTex = this.front; this.front = this.back; this.back = tmpTex;
      const tmpFbo = this._fbo[0]; this._fbo[0] = this._fbo[1]; this._fbo[1] = tmpFbo;
    }
    this.state.step += this.subSteps;
  }

  // ─── 显示到 canvas ───
  _renderToCanvas() {
    if (this.contextLost) return;
    const gl = this.gl;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    gl.useProgram(this.dispProg);
    this._bindQuad();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.front);
    const u = this._u.disp;
    gl.uniform1i(u.state, 0);
    gl.uniform1i(u.cmap, this.colormap);
    gl.uniform1f(u.gamma, this.gamma);
    gl.uniform1f(u.zoom, this.zoom);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  // ─── 投放 ───
  paintAt(u, v, radius = 0.025, strength = 0.5) {
    if (this.contextLost) return;
    const gl = this.gl;
    const N = this.size;
    gl.useProgram(this.paintProg);
    this._bindQuad();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo[1]);
    gl.viewport(0, 0, N, N);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.front);
    const pu = this._u.paint;
    gl.uniform1i(pu.state, 0);
    gl.uniform2f(pu.center, u, v);
    gl.uniform1f(pu.radius, radius);
    gl.uniform1f(pu.strength, strength);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    const tmpTex = this.front; this.front = this.back; this.back = tmpTex;
    const tmpFbo = this._fbo[0]; this._fbo[0] = this._fbo[1]; this._fbo[1] = tmpFbo;
  }

  stampRandom(count = 12) {
    for (let i = 0; i < count; i++) {
      this.paintAt(Math.random(), Math.random(), 0.02 + Math.random() * 0.02, 0.3 + Math.random() * 0.3);
    }
  }

  _stampCenter(u, v, r) {
    this.paintAt(u, v, r, 1.0);
  }

  stampStripes() {
    const N = this.size;
    const data = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
      const x = i % N;
      const y = (i / N) | 0;
      const stripe = ((y % 16) < 4) ? 1 : 0;
      data[i * 4 + 0] = stripe ? 60 : 255;
      data[i * 4 + 1] = stripe ? 200 : 0;
      data[i * 4 + 2] = 0;
      data[i * 4 + 3] = 255;
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.front);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, this.format, this.type, data);
    gl.bindTexture(gl.TEXTURE_2D, this.back);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, this.format, this.type, data);
  }

  reset() {
    if (this.contextLost) return;
    this.state.step = 0;
    this._initState();
  }

  frame() {
    this.step();
    this._renderToCanvas();
  }

  setParam(name, value) { this.params[name] = value; }
  setColormap(id) { this.colormap = id; }
  setGamma(v) { this.gamma = v; }
  setZoom(v) { this.zoom = Math.max(0.5, Math.min(3.0, v)); }
  togglePlay() { this.playing = !this.playing; return this.playing; }

  screenshot() {
    this._renderToCanvas(); // 确保最新一帧在 backing buffer
    return this.canvas.toDataURL('image/png');
  }
}
