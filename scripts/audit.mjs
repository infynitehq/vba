import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.env.AUDIT_URL || 'http://localhost:4173/';
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(url);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const cdp = await page.context().newCDPSession(page);
  const installability = await cdp.send('Page.getInstallabilityErrors');
  const manifest = await cdp.send('Page.getAppManifest');
  console.log(
    'Chromium installability errors:',
    JSON.stringify(installability.installabilityErrors),
  );
  console.log('Manifest errors:', JSON.stringify(manifest.errors));
  if (installability.installabilityErrors.length || manifest.errors.length)
    process.exitCode = 1;
} finally {
  await browser.close();
}
const chrome = await launch({
  chromePath: chromium.executablePath(),
  chromeFlags: ['--headless', '--no-sandbox'],
});
try {
  // Lighthouse removed its PWA category in v12. Use CDP above for installability.
  const result = await lighthouse(url, {
    port: chrome.port,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  });
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/lighthouse.json', result.report);
  console.log(
    'Lighthouse:',
    JSON.stringify(
      Object.fromEntries(
        Object.entries(result.lhr.categories).map(([id, category]) => [
          id,
          Math.round(category.score * 100),
        ]),
      ),
    ),
  );
  console.log('Full report: test-results/lighthouse.json');
} finally {
  await chrome.kill();
}
