import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const svg = await readFile(new URL('../assets/logo.svg',import.meta.url),'utf8');
const browser = await chromium.launch({ headless:true });
try {
  for (const [size, name] of [[180,'apple-touch-icon'], [192,'icon-192'], [512,'icon-512']]) {
    const page = await browser.newPage({ viewport:{ width:size, height:size }, deviceScaleFactor:1 });
    await page.setContent(`<style>html,body{margin:0;background:#10281f}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
    await page.screenshot({ path:new URL(`../assets/${name}.png`,import.meta.url).pathname });
    await page.close();
  }
} finally { await browser.close(); }
