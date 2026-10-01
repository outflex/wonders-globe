import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:'./tests/browser',
  timeout:90000,
  expect:{ timeout:30000 },
  workers:1,
  use:{
    baseURL:'http://127.0.0.1:4173/wonders-globe/',
    launchOptions:{ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] },
  },
  webServer:{
    command:'npm run build && npm run dev',
    env:{ SERVE_ROOT:'dist' },
    url:'http://127.0.0.1:4173',
    reuseExistingServer:false,
  },
});
