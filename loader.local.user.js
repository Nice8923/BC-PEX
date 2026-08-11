// ==UserScript==
// @name         本地测试 - PEX
// @name:en       Local Test - PEX
// @namespace    https://github.com/Nice8923/BC-PEX
// @version      0.1.0
// @description  PEX 本地开发加载器（从 vite preview 读取构建产物）
// @description:en  PEX local-dev loader (loads the build from vite preview)
// @author       PEX
// @supportURL   https://github.com/Nice8923/BC-PEX
// @include      /^https:\/\/(www\.)?bondage(projects\.elementfx|-(europe|asia))\.com\/.*/
// @grant        none
// @run-at       document-end
// ==/UserScript==

window.PEX = window.PEX ?? {};
if (window.PEX) {
    console.warn('⚗️[PEX] 已加载，跳过重复导入。');
} else {
    import(`http://localhost:5174/assets/main.js?v=${Date.now()}`)
        .catch(e => console.error('⚗️[PEX] 本地加载失败（vite preview 开了吗？）:', e));
}

// 本地开发加载器：从本地 vite preview 服务器读取 bundle。
// ?v= 时间戳破除缓存，每次刷新都拿到最新构建。
// 运行 ` npm run dev ` 后再进 BC。
