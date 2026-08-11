// ════════════════════════════════════════
//  PEX 图片资源加载（v0.1.33+）
//  - 主路径：jsDelivr CDN（全球节点 + Access-Control-Allow-Origin: *，不污染 MainCanvas）
//  - 回退：raw.githubusercontent（仓库原始文件，同样带 CORS *；无需开 GitHub Pages）
//  - 全程 crossOrigin='anonymous'：canvas 截图（toDataURL）依赖干净画布
//  - 精灵图（sprite sheet）逐帧切片绘制辅助：与 BC 原版资产帧同思路
// ════════════════════════════════════════

import { pexWarn } from './util.js';

// 图片根：仓库 Images/ 目录（与音效 Sound/ 并列）
const IMG_ROOT = 'https://cdn.jsdelivr.net/gh/Nice8923/BC-PEX@main/Images/';
// 回退根：GitHub 原始文件（jsDelivr 偶尔抖动时兜底；比 Pages 省事——不用开 Pages）
const RAW_ROOT = 'https://raw.githubusercontent.com/Nice8923/BC-PEX/main/Images/';

// 图片 CDN 地址（name 如 'gel.png' / 'anim-sheet.png'）
export function imageUrl(name) {
    return IMG_ROOT + String(name).replace(/^\//, '');
}

// 回退地址（CDN 加载失败时用）
export function imageFallbackUrl(name) {
    return RAW_ROOT + String(name).replace(/^\//, '');
}

// 加载图片：CDN 失败自动回退 raw；成功回调 onReady(img)
// crossOrigin 全程保留（失败也不退化——退化成无 CORS 的图会污染画布）
export function loadPexImage(name, onReady) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let stage = 0;
    img.addEventListener('load', () => { try { onReady && onReady(img); } catch (e) {} });
    img.addEventListener('error', () => {
        if (stage === 0) {
            stage = 1;
            pexWarn('图片 CDN 加载失败，回退 raw:', name);
            img.src = imageFallbackUrl(name);
        } else {
            pexWarn('图片加载失败:', name);
        }
    });
    img.src = imageUrl(name);
    return img;
}

// 精灵图切片信息：把 cols×rows 的精灵图按索引切成帧（左上原点）
// 返回 { sx, sy, sw, sh } 供 ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
export function spriteFrame(cols, rows, index, frameW, frameH) {
    const c = Math.max(1, cols || 1);
    const r = Math.max(1, rows || 1);
    const i = Math.max(0, index || 0);
    return {
        sx: (i % c) * frameW,
        sy: Math.floor(i / c) % r * frameH,
        sw: frameW,
        sh: frameH,
    };
}
