import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const chromiumDir = '/opt/pw-browsers';
let executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

if (!fs.existsSync(executablePath)) {
  const dirs = fs.readdirSync(chromiumDir);
  const chromiumDirs = dirs.filter(d => d.startsWith('chromium'));
  if (chromiumDirs.length > 0) {
    executablePath = path.join(chromiumDir, chromiumDirs[0], 'chrome-linux', 'chrome');
  }
}

const screenshotDir = '/tmp/ui-verification';
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'mobile', width: 720, height: 1024 }
];

async function captureAllPages() {
  const browser = await chromium.launch({
    executablePath: executablePath,
  });

  try {
    for (const viewport of viewports) {
      console.log(`\n📱 ${viewport.name.toUpperCase()} (${viewport.width}×${viewport.height})`);
      console.log('='.repeat(50));

      const ctx = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height }
      });
      const page = await ctx.newPage();

      try {
        // 1. 加载登录页面
        console.log('📄 Loading login page...');
        await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);

        let screenshotPath = path.join(screenshotDir, `01-login-${viewport.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`   ✅ Saved: 01-login-${viewport.name}.png`);

        // 2. 尝试登录
        console.log('📄 Attempting login...');

        // 等待登录表单加载
        await page.waitForTimeout(500);

        // 检查登录按钮是否存在
        const loginButton = await page.$('button');
        if (loginButton) {
          // 填充表单
          const inputs = await page.$$('input');
          if (inputs.length >= 2) {
            await inputs[0].fill('demo@example.com');
            await inputs[1].fill('demo123456');
            await loginButton.click();

            // 等待登录完成和页面加载
            await page.waitForTimeout(3000);

            // 检查是否成功登录（检查 URL 或特定元素）
            const currentUrl = page.url();
            console.log(`   URL after login: ${currentUrl}`);
          }
        }

        // 3. 截取登录后的主页面/仪表板
        screenshotPath = path.join(screenshotDir, `02-dashboard-${viewport.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`   ✅ Saved: 02-dashboard-${viewport.name}.png`);

        // 4. 尝试找到并点击不同的导航项
        const navItems = [
          { selector: 'button:has-text("图书馆")', name: 'library' },
          { selector: 'button:has-text("学习")', name: 'learning' },
          { selector: 'button:has-text("测试")', name: 'test' },
          { selector: 'button:has-text("词汇")', name: 'vocabulary' },
          { selector: 'button:has-text("统计")', name: 'stats' },
          { selector: 'button:has-text("设置")', name: 'settings' },
        ];

        for (let i = 0; i < navItems.length; i++) {
          try {
            const element = await page.$(navItems[i].selector);
            if (element) {
              await element.click();
              await page.waitForTimeout(1500);
              screenshotPath = path.join(screenshotDir, `0${3 + i}-${navItems[i].name}-${viewport.name}.png`);
              await page.screenshot({ path: screenshotPath, fullPage: true });
              console.log(`   ✅ Saved: 0${3 + i}-${navItems[i].name}-${viewport.name}.png`);
            }
          } catch (error) {
            // 该导航项可能不存在或不可点击
          }
        }

      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
      }

      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`\n✨ Screenshots saved to ${screenshotDir}`);
  const files = fs.readdirSync(screenshotDir).sort();
  console.log(`📊 Total: ${files.length} files`);
  files.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
}

captureAllPages().catch(console.error);
