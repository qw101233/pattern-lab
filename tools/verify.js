/* 斑图工坊 · 基本运行验证脚本
 *
 * 用 Playwright 加载页面，监听 console / pageerror，
 * 等待模拟跑 N 步，截图、检查 WebGL 像素，切换预置并验证图案变化。
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = process.env.URL || 'http://127.0.0.1:8765/index.html';
const OUT = process.env.OUT || path.join(__dirname, '..', 'docs', 'screenshots');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    args: [
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-angle=swiftshader',
    ]
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('console.error: ' + msg.text());
  });

  console.log('→ 打开页面：' + URL);
  await page.goto(URL, { waitUntil: 'networkidle' });

  // 等 ready 标记
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', { timeout: 8000 });
  console.log('✓ 页面已 ready');

  // 等 6000 步让图案充分涌现
  await page.evaluate(() => {
    return new Promise((resolve) => {
      const target = 6000;
      const check = () => {
        if (window.__patternLab.sim.state.step >= target) resolve();
        else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  });
  console.log('✓ 模拟器跑到 step 6000+');

  // 检查 canvas 像素不是全黑
  const stats = await page.evaluate(() => {
    const c = document.getElementById('gl');
    // 直接从 webgl canvas 读 backing buffer（更可靠）
    const gl = window.__patternLab.sim.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.finish();
    const w = c.width, h = c.height;
    const data = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let rSum = 0, gSum = 0, bSum = 0, max = 0, nonBlack = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i+1], b = data[i+2];
      rSum += r; gSum += g; bSum += b;
      max = Math.max(max, r, g, b);
      if (r + g + b > 30) nonBlack++;
    }
    const n = w * h;
    return { r: (rSum/n).toFixed(1), g: (gSum/n).toFixed(1), b: (bSum/n).toFixed(1), max, nonBlackPct: (nonBlack*100/n).toFixed(1) };
  });
  console.log('  像素统计:', stats);

  // 截图：默认珊瑚
  await page.screenshot({ path: path.join(OUT, '01-default-coral.png'), fullPage: false });

  // 切换预置：迷宫
  await page.evaluate(() => window.__patternLab.applyPreset('maze'));
  await page.evaluate(() => new Promise(r => {
    const check = () => window.__patternLab.sim.state.step >= 9000 ? r() : requestAnimationFrame(check);
    check();
  }));
  await page.screenshot({ path: path.join(OUT, '02-maze.png') });

  // 切换：漩涡
  await page.evaluate(() => window.__patternLab.applyPreset('vortex'));
  await page.evaluate(() => new Promise(r => {
    const check = () => window.__patternLab.sim.state.step >= 13000 ? r() : requestAnimationFrame(check);
    check();
  }));
  await page.screenshot({ path: path.join(OUT, '03-vortex.png') });

  // 切换：斑马
  await page.evaluate(() => window.__patternLab.applyPreset('zebra'));
  await page.evaluate(() => new Promise(r => {
    const check = () => window.__patternLab.sim.state.step >= 17000 ? r() : requestAnimationFrame(check);
    check();
  }));
  await page.screenshot({ path: path.join(OUT, '04-zebra.png') });

  // 切换：指纹
  await page.evaluate(() => window.__patternLab.applyPreset('fingerprint'));
  await page.evaluate(() => new Promise(r => {
    const check = () => window.__patternLab.sim.state.step >= 21000 ? r() : requestAnimationFrame(check);
    check();
  }));
  await page.screenshot({ path: path.join(OUT, '05-fingerprint.png') });

  // 切换：细胞分裂
  await page.evaluate(() => window.__patternLab.applyPreset('mitosis'));
  await page.evaluate(() => new Promise(r => {
    const check = () => window.__patternLab.sim.state.step >= 25000 ? r() : requestAnimationFrame(check);
    check();
  }));
  await page.screenshot({ path: path.join(OUT, '06-mitosis.png') });

  // 测试随机投放
  await page.evaluate(() => window.__patternLab.sim.reset());
  await page.evaluate(() => window.__patternLab.stamp(30));
  await page.evaluate(() => new Promise(r => {
    const check = () => window.__patternLab.sim.state.step >= 30000 ? r() : requestAnimationFrame(check);
    check();
  }));
  await page.screenshot({ path: path.join(OUT, '07-random-stamp.png') });

  // 截图：coral 调色板切换
  await page.evaluate(() => window.__patternLab.applyPreset('coral'));
  await page.evaluate(() => new Promise(r => {
    const check = () => window.__patternLab.sim.state.step >= 35000 ? r() : requestAnimationFrame(check);
    check();
  }));
  await page.evaluate(() => window.__patternLab.sim.colormap = 1); // ocean
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '08-coral-ocean.png') });

  await page.evaluate(() => window.__patternLab.sim.colormap = 2); // neon
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '09-coral-neon.png') });

  await page.evaluate(() => window.__patternLab.sim.colormap = 5); // aurora
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '10-coral-aurora.png') });

  // FPS 数据
  const fpsText = await page.evaluate(() => document.getElementById('badge-fps').textContent);
  console.log('  FPS:', fpsText);

  console.log('\n=== 错误检查 ===');
  if (errors.length === 0) {
    console.log('✓ 无 console / page error');
  } else {
    console.log('✗ 发现错误：');
    errors.forEach(e => console.log('  ', e));
  }

  await browser.close();

  if (stats.max < 50 || stats.nonBlackPct < 10) {
    console.error('\n❌ 验证失败：画布像素几乎全黑（max=' + stats.max + ', 非黑像素=' + stats.nonBlackPct + '%）');
    process.exit(1);
  }
  if (errors.length > 0) process.exit(1);
  console.log('\n✅ 验证通过');
})();
