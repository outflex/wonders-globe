import { mkdir, cp, rm, access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await access(new URL('index.html', root));
await rm(output, { recursive:true, force:true });
await mkdir(output, { recursive:true });
for (const path of ['index.html', 'src', 'assets', 'site.webmanifest', '.nojekyll']) {
  await cp(new URL(path,root), new URL(path,output), { recursive:true });
}
console.log('Terra: static site built in dist/ (relative URLs, ready for GitHub Pages).');
