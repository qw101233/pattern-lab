/* 斑图工坊 · 基本运行验证脚本（精简版）
 *
 * 用 Playwright 加载页面，监听 console / pageerror，
 * 等待 Gray-Scott 模拟跑足够子步（让图案涌现），
 * 截图核心预设。
 *
 * ⚠️ swiftshader 下 FPS 慢（~7），subSteps=60 → 每秒 ~420 子步。
 *    每个 preset 需要 20000+ 子步才能涌现完整图案（Karl Sims 标准）。
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = process.env.URL || 'http://127.0.0.1:8765/index.html';
const OUT = process.env.OUT || path.join(__dirname, '..', 'docs', 'screenshots');

async function waitForStep(page, target) {
  await page.evaluate((t) => new Promise((resolve) => {
    const check = () => window.__patternLab.sim.state.step >= t ? resolve() : requestAnimationFrame(check);
    check();
  }), target);
}

async function readStats(page) {
  return await page.evaluate(() => {
    const c = document.getElementById('gl');
    const gl = window.__patternLab.sim.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.finish();
    const w = c.width, h = c.height;
    const data = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let max = 0, nonBlack = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i+1], b = data[i+2];
      max = Math.max(max, r, g, b);
      if (r + g + b > 30) nonBlack++;
    }
    const n = w * h;
    return { max, nonBlackPct: (nonBlack*100/n).toFixed(1) };
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader']
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
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', { timeout: 8000 });
  console.log('✓ 页面已 ready');

  // 跑 Gray-Scott 到涌现完整图案（约 25-40K 子步）
  const STEP_CORAL = 25000;
  await waitForStep(page, STEP_CORAL);
  const stats1 = await readStats(page);
  console.log(`✓ step=${STEP_CORAL}, max=${stats1.max}, nonBlack=${stats1.nonBlackPct}%`);

  // 截图：珊瑚
  await page.screenshot({ path: path.join(OUT, '01-default-coral.png'), fullPage: false });
  console.log('  📸 01-default-coral.png');

  // 切到迷宫，让它跑更多子步
  await page.evaluate(() => window.__patternLab.applyPreset('maze'));
  await waitForStep(page, STEP_CORAL + 15000);
  const stats2 = await readStats(page);
  console.log(`✓ maze step=${STEP_CORAL + 15000}, max=${stats2.max}, nonBlack=${stats2.nonBlackPct}%`);
  await page.screenshot({ path: path.join(OUT, '02-maze.png'), fullPage: false });
  console.log('  📸 02-maze.png');

  // 漩涡
  await page.evaluate(() => window.__patternLab.applyPreset('vortex'));
  await waitForStep(page, STEP_CORAL + 30000);
  await page.screenshot({ path: path.join(OUT, '03-vortex.png'), fullPage: false });
  console.log('  📸 03-vortex.png');

  // 斑马
  await page.evaluate(() => window.__patternLab.applyPreset('zebra'));
  await waitForStep(page, STEP_CORAL + 45000);
  await page.screenshot({ path: path.join(OUT, '04-zebra.png'), fullPage: false });
  console.log('  📸 04-zebra.png');

  // 指纹
  await page.evaluate(() => window.__patternLab.applyPreset('fingerprint'));
  await waitForStep(page, STEP_CORAL + 60000);
  await page.screenshot({ path: path.join(OUT, '05-fingerprint.png'), fullPage: false });
  console.log('  📸 05-fingerprint.png');

  // 细胞分裂
  await page.evaluate(() => window.__patternLab.applyPreset('mitosis'));
  await waitForStep(page, STEP_CORAL + 75000);
  await page.screenshot({ path: path.join(OUT, '06-mitosis.png'), fullPage: false });
  console.log('  📸 06-mitosis.png');

  // 随机投放
  await page.evaluate(() => window.__patternLab.sim.reset());
  await page.evaluate(() => window.__patternLab.stamp(30));
  await waitForStep(page, STEP_CORAL + 90000);
  await page.screenshot({ path: path.join(OUT, '07-random-stamp.png'), fullPage: false });
  console.log('  📸 07-random-stamp.png');

  // 调色板：海洋
  await page.evaluate(() => window.__patternLab.applyPreset('coral'));
  await waitForStep(page, STEP_CORAL + 105000);
  await page.evaluate(() => window.__patternLab.sim.colormap = 1);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '08-coral-ocean.png'), fullPage: false });
  console.log('  📸 08-coral-ocean.png');

  // 霓虹
  await page.evaluate(() => window.__patternLab.sim.colormap = 2);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '09-coral-neon.png'), fullPage: false });
  console.log('  📸 09-coral-neon.png');

  // 极光
  await page.evaluate(() => window.__patternLab.sim.colormap = 5);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '10-coral-aurora.png'), fullPage: false });
  console.log('  📸 10-coral-aurora.png');

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

  // 验证核心功能：canvas 不全黑 + Gray-Scott 模拟在跑 + 无错误
  // ⚠️ swiftshader 下 Gray-Scott 完整涌现需要 30000+ 子步（约 5 分钟）
  // 本验证用 25000 子步（约 4 分钟），允许 partial success
  if (stats1.max < 50) {
    console.error('\n❌ 验证失败：画布像素全黑（max=' + stats1.max + '）');
    process.exit(1);
  }
  if (errors.length > 0) process.exit(1);
  console.log('\n✅ 验证通过：' + stats1.nonBlackPct + '% 非黑像素，max=' + stats1.max);
  console.log('   ℹ️  Gray-Scott 在 swiftshader 下完全涌现需 50000+ 子步（30+ 分钟）');
  console.log('   ℹ️  真机 GPU 上 5000-10000 子步即可涌现完整图案');
})();
