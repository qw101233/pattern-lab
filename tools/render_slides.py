#!/usr/bin/env python
"""
斑图工坊 · 9:16 介绍图文渲染脚本

把 docs/intro/*.html 用 Playwright 渲染成 1080x1920 PNG，
输出到 docs/intro/ 同目录下的同名 .png 文件。
"""

import asyncio
import os
import sys
from pathlib import Path

OUT = Path(__file__).parent.parent / 'docs' / 'intro'
HTML_FILES = sorted(OUT.glob('*.html'))

# 嵌入网络字体需要联网；离线则降级到系统字体
NETWORK_OK = True

async def render_one(page, html_path: Path):
    url = 'file://' + str(html_path.resolve()).replace('\\', '/')
    print(f'  → 渲染 {html_path.name}')
    await page.goto(url, waitUntil='load')
    # 等待字体加载（如果有）+ 一点稳定时间
    await page.waitForTimeout(800)
    out = html_path.with_suffix('.png')
    await page.screenshot({
        'path': str(out),
        'fullPage': False,
        'type': 'png',
    })
    size = out.stat().st_size
    print(f'    ✓ {out.name}  ({size/1024:.0f} KB)')

async def main():
    if not HTML_FILES:
        print('没找到 HTML 文件')
        return 1

    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage'],
        )
        ctx = await browser.newContext(
            viewport={'width': 1080, 'height': 1920},
            device_scale_factor=1,
        )
        page = await ctx.new_page()
        page.on('console', lambda m: print(f'    [B {m.type}]', m.text) if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: print(f'    [PE]', e))

        for html in HTML_FILES:
            await render_one(page, html)

        await browser.close()
    print('✅ 渲染完成')
    return 0

if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
