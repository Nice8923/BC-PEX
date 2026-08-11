// 生成 loader.embedded.user.js：
// 读 loader.template.user.js（UTF-8 模板）+ dist/assets/main.js（vite 产物）
// → 替换 __VERSION__（package.json）与 __CODE__（base64）→ 写出
// 用法：npm run build && node scripts/build-loader.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const bundle = readFileSync(path.join(root, 'dist', 'assets', 'main.js'));
const b64 = bundle.toString('base64');
const tmpl = readFileSync(path.join(root, 'loader.template.user.js'), 'utf8');

const out = tmpl.replace('__VERSION__', pkg.version).replace('__CODE__', b64);
writeFileSync(path.join(root, 'loader.embedded.user.js'), out);
console.log(`loader.embedded.user.js 生成完毕 v${pkg.version}（${out.length} 字节，bundle ${bundle.length} 字节）`);
