/* 斑图工坊 · 9:16 介绍图文渲染脚本（Node 版）
 *
 * 用 Playwright 把 docs/intro/*.html 渲染成 1080x1920 PNG。
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const INTRO_DIR = path.join(__dirname, '..', 'docs', 'intro');
const htmlFiles = fs.readdirSync(INTRO_DIR)
  .filter(f => f.endsWith('.html'))
  .sort()
  .map(f => path.join(INTRO_DIR, f));

if (htmlFiles.length === 0) {
  console.error('没找到 HTML 文件');
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const ctx = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[PE]', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      console.log(`[B ${m.type()}]`, m.text());
    }
  });

  for (const html of htmlFiles) {
    const url = 'file:///' + html.replace(/\\/g, '/');
    console.log(`→ 渲染 ${path.basename(html)}`);
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(1200);  // 等字体 + 图片加载
    const out = html.replace(/\.html$/, '.png');
    await page.screenshot({ path: out, fullPage: false, type: 'png' });
    const size = fs.statSync(out).size;
    console.log(`  ✓ ${path.basename(out)} (${(size/1024).toFixed(0)} KB)`);
  }

  await browser.close();
  console.log('\n✅ 全部渲染完成');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
