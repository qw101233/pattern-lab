/* 斑图工坊 · 应用入口
 *
 * 职责：
 *   1. 实例化模拟器
 *   2. 绑定 UI 控件（滑块、按钮、预置、键盘）
 *   3. 跑主循环
 *   4. 处理 FPS 计算
 *   5. 鼠标输入 → 笔刷投放
 */

import { GrayScottSimulator } from './sim.js';
import { presets } from './presets.js';

// ─── DOM ───
const $ = (id) => document.getElementById(id);
const canvas = $('gl');
const overlay = $('overlay');

const ctl = {
  f: $('ctl-f'), k: $('ctl-k'), du: $('ctl-du'), dv: $('ctl-dv'), dt: $('ctl-dt'),
  cmap: $('ctl-cmap'), gamma: $('ctl-gamma'), zoom: $('ctl-zoom'),
};
const val = {
  f: $('val-f'), k: $('val-k'), du: $('val-du'), dv: $('val-dv'), dt: $('val-dt'),
  gamma: $('val-gamma'), zoom: $('val-zoom'),
};
const btn = {
  play: $('btn-play'),
  reset: $('btn-reset'),
  screenshot: $('btn-screenshot'),
  stamp: $('btn-stamp'),
  stripe: $('btn-stripe'),
  center: $('btn-center'),
};
const badge = {
  fps: $('badge-fps'), step: $('badge-step'), stamp: $('badge-stamp'),
};
const presetsHost = $('presets');
const hintPattern = $('hint-pattern');

// ─── 模拟器实例 ───
let sim;
try {
  // 先把 canvas 实际像素设成方形（基于容器 clientWidth）
  const cw = canvas.clientWidth || canvas.parentElement.clientWidth || 800;
  const ch = canvas.clientHeight || canvas.parentElement.clientHeight || 800;
  const dim = Math.min(cw, ch, 720); // 不超过 720，避免软渲染压力
  canvas.width = dim;
  canvas.height = dim;
  sim = new GrayScottSimulator(canvas, { size: 384, subSteps: 60 });
  overlay.classList.add('hidden');
} catch (err) {
  overlay.textContent = '❌ ' + err.message;
  overlay.style.color = '#ff5b3a';
  throw err;
}

// 窗口大小变化 → 重设 canvas backing buffer 比例（不做重建避免破坏状态）
window.addEventListener('resize', () => {
  const w = canvas.parentElement.clientWidth;
  const h = canvas.parentElement.clientHeight;
  const dim = Math.min(w, h, 720);
  if (dim > 100 && (canvas.width !== dim || canvas.height !== dim)) {
    canvas.width = dim;
    canvas.height = dim;
  }
});

// ─── UI 控件值显示 ───
function updateValDisplay() {
  val.f.textContent = sim.params.f.toFixed(4);
  val.k.textContent = sim.params.k.toFixed(4);
  val.du.textContent = sim.params.du.toFixed(3);
  val.dv.textContent = sim.params.dv.toFixed(3);
  val.dt.textContent = sim.params.dt.toFixed(3);
  val.gamma.textContent = sim.gamma.toFixed(2);
  val.zoom.textContent = sim.zoom.toFixed(2) + '×';
}
updateValDisplay();

// ─── 滑块绑定 ───
ctl.f.addEventListener('input', () => { sim.params.f = parseFloat(ctl.f.value); updateValDisplay(); recognizePattern(); });
ctl.k.addEventListener('input', () => { sim.params.k = parseFloat(ctl.k.value); updateValDisplay(); recognizePattern(); });
ctl.du.addEventListener('input', () => { sim.params.du = parseFloat(ctl.du.value); updateValDisplay(); });
ctl.dv.addEventListener('input', () => { sim.params.dv = parseFloat(ctl.dv.value); updateValDisplay(); });
ctl.dt.addEventListener('input', () => { sim.params.dt = parseFloat(ctl.dt.value); updateValDisplay(); });
ctl.gamma.addEventListener('input', () => { sim.gamma = parseFloat(ctl.gamma.value); updateValDisplay(); });
ctl.zoom.addEventListener('input', () => { sim.zoom = parseFloat(ctl.zoom.value); updateValDisplay(); });
ctl.cmap.addEventListener('change', () => { sim.colormap = parseInt(ctl.cmap.value, 10); });

// ─── 按钮绑定 ───
btn.play.addEventListener('click', togglePlay);
btn.reset.addEventListener('click', () => { sim.reset(); });
btn.screenshot.addEventListener('click', screenshot);
btn.stamp.addEventListener('click', () => { sim.stampRandom(16); badge.stamp.textContent = '随机 +16'; });
btn.stripe.addEventListener('click', () => { sim.stampStripes(); badge.stamp.textContent = '横纹种子'; });
btn.center.addEventListener('click', () => {
  sim.reset();
  sim.paintAt(0.5, 0.5, 0.06, 1.0);
  badge.stamp.textContent = '中心投放';
});

function togglePlay() {
  const playing = sim.togglePlay();
  btn.play.textContent = playing ? '⏸ 暂停' : '▶ 播放';
}

function screenshot() {
  const dataUrl = sim.screenshot();
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `pattern-lab-${Date.now()}.png`;
  a.click();
  badge.stamp.textContent = '已保存';
}

// ─── 预置按钮 ───
presets.forEach((p) => {
  const card = document.createElement('button');
  card.className = 'preset';
  card.dataset.id = p.id;
  card.title = p.desc;
  card.innerHTML = `
    <span class="name">${p.emoji} ${p.name}</span>
    <span class="params">F=${p.f.toFixed(3)} K=${p.k.toFixed(3)}</span>`;
  card.addEventListener('click', () => applyPreset(p.id));
  presetsHost.appendChild(card);
});

function applyPreset(id) {
  const p = presets.find(x => x.id === id);
  if (!p) return;
  sim.params.f = p.f;
  sim.params.k = p.k;
  sim.params.du = p.du;
  sim.params.dv = p.dv;
  sim.params.dt = p.dt;
  ctl.f.value = p.f;
  ctl.k.value = p.k;
  ctl.du.value = p.du;
  ctl.dv.value = p.dv;
  ctl.dt.value = p.dt;
  updateValDisplay();
  sim.reset();
  // 高亮当前预置
  document.querySelectorAll('.preset').forEach(el => el.classList.toggle('active', el.dataset.id === id));
  hintPattern.textContent = `识别图样：${p.name} · ${p.desc}`;
  badge.stamp.textContent = `预置：${p.name}`;
}

function recognizePattern() {
  const f = sim.params.f, k = sim.params.k;
  // 简易模式识别：找最接近的预置
  let best = null, bestDist = Infinity;
  for (const p of presets) {
    const d = Math.hypot(p.f - f, p.k - k);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  if (best && bestDist < 0.008) {
    hintPattern.textContent = `识别图样：${best.name}（${best.emoji}）`;
    document.querySelectorAll('.preset').forEach(el => el.classList.toggle('active', el.dataset.id === best.id));
  } else {
    hintPattern.textContent = `识别图样：自定义参数`;
    document.querySelectorAll('.preset').forEach(el => el.classList.remove('active'));
  }
}

// ─── 鼠标交互：画笔刷 ───
let painting = false;
let lastPaint = 0;
function canvasToUv(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = 1.0 - (e.clientY - rect.top) / rect.height; // 翻转 y，gl uv 原点在左下
  return [x, y];
}
canvas.addEventListener('pointerdown', (e) => {
  painting = true;
  canvas.setPointerCapture(e.pointerId);
  const [u, v] = canvasToUv(e);
  sim.paintAt(u, v, 0.025, 0.5);
  badge.stamp.textContent = `投放 @ (${(u*100).toFixed(0)}%, ${(v*100).toFixed(0)}%)`;
});
canvas.addEventListener('pointermove', (e) => {
  if (!painting) return;
  const now = performance.now();
  if (now - lastPaint < 16) return; // 节流到 ~60fps
  lastPaint = now;
  const [u, v] = canvasToUv(e);
  sim.paintAt(u, v, 0.018, 0.3);
});
canvas.addEventListener('pointerup', (e) => {
  painting = false;
  try { canvas.releasePointerCapture(e.pointerId); } catch {}
});
canvas.addEventListener('pointercancel', () => { painting = false; });

// 滚轮缩放
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = -e.deltaY * 0.001;
  sim.setZoom(sim.zoom + delta);
  ctl.zoom.value = sim.zoom;
  updateValDisplay();
}, { passive: false });

// ─── 键盘快捷键 ───
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'r' || e.key === 'R') { sim.reset(); }
  else if (e.key === 's' || e.key === 'S') { screenshot(); }
  else if (e.key >= '1' && e.key <= '8') {
    const id = presets[parseInt(e.key, 10) - 1]?.id;
    if (id) applyPreset(id);
  }
});

// ─── 主循环 + FPS ───
let frames = 0, lastFpsT = performance.now(), lastStepShown = 0;
function loop() {
  sim.frame();
  frames++;
  const now = performance.now();
  if (now - lastFpsT >= 500) {
    const fps = (frames * 1000 / (now - lastFpsT)).toFixed(0);
    badge.fps.textContent = `FPS ${fps}`;
    frames = 0; lastFpsT = now;
  }
  // 每 200ms 更新一次 step
  if (now - lastStepShown >= 200) {
    badge.step.textContent = `step ${sim.state.step}`;
    lastStepShown = now;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ─── 暴露到 window（便于自动化测试 & 演示录制）───
window.__patternLab = {
  sim,
  presets,
  applyPreset,
  reset: () => sim.reset(),
  screenshot,
  stamp: () => sim.stampRandom(16),
  stampStripes: () => sim.stampStripes(),
  setParams: (params) => {
    Object.assign(sim.params, params);
    ['f','k','du','dv','dt'].forEach(k => {
      if (k in params) ctl[k].value = params[k];
    });
    updateValDisplay();
  },
  // 用于 demo 录制的连续操作 API
  sequence: async (steps) => {
    for (const step of steps) {
      if (step.preset) applyPreset(step.preset);
      if (step.stamp) sim.stampRandom(step.stamp);
      if (step.stripe) sim.stampStripes();
      if (step.center) sim.paintAt(0.5, 0.5, 0.06, 1.0);
      if (step.wait) await new Promise(r => setTimeout(r, step.wait));
      if (step.screenshot) screenshot();
    }
  }
};

// 标记 ready
document.documentElement.setAttribute('data-ready', 'true');
console.log('[斑图工坊] 初始化完成，模拟器已就绪');
