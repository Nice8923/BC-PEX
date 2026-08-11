// ════════════════════════════════════════
//  PEX 入口（vite 打包 → assets/main.js）
//  loader.user.js 动态 import 本文件
// ════════════════════════════════════════

import { MOD_VER, CONFIG } from './core/config.js';
import { loadSettings, saveSettings, exportSettings, importSettings } from './core/storage.js';
import { handlePexCommand } from './core/commands.js';
import { initialize } from './core/core-init.js';
import { forceRecover } from './gameplay/revert.js';
import { getStateSummary } from './gameplay/state.js';
import { setAnimDurationOverride } from './gameplay/excretion.js';
import { imageUrl, imageFallbackUrl, loadPexImage, spriteFrame } from './util/images.js';

// 对外唯一入口：window.PEX
window.PEX = window.PEX ?? {};

// 防重复初始化：本体版与 loader 版同时装到时只初始化一次
const _pexAlreadyInitialized = window.PEX && typeof window.PEX === 'object' && !!window.PEX.version;

if (_pexAlreadyInitialized) {
    console.warn(`⚗️[PEX] 检测到已有实例在运行（version: ${window.PEX.version}），跳过重复初始化。`);
} else {
    window.PEX = {
        version: MOD_VER,
        // 执行 /pex 子指令（如 help/reset/status/settings）
        command: (sub = '') => handlePexCommand(`/pex ${sub}`.trim()),
        // 强制恢复（安全阀）
        reset: () => forceRecover(),
        // 当前状态摘要
        status: () => getStateSummary(),
        // 设置存取
        getConfig: () => CONFIG,
        save: () => saveSettings(true),
        reload: () => loadSettings(),
        // 测试钩子：覆盖排出动画时长（传 0 恢复默认 7340ms）
        setAnimDurationOverride,
        // 图片资源工具（CDN + raw 回退 + crossOrigin 防画布污染）
        images: { imageUrl, imageFallbackUrl, loadPexImage, spriteFrame },
        exportSettings,
        importSettings,
    };

    initialize();
}
