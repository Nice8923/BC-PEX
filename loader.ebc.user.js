// ==UserScript==
// @name         本地测试 - PEX (EBC/8000)
// @name:en       Local Test - PEX (EBC/8000)
// @namespace    https://github.com/Nice8923/BC-PEX
// @version      0.1.0
// @description  PEX 本地开发加载器（EBC 用：从 localhost:8000 读取构建产物）
// @description:en  PEX local-dev loader for EBC (loads the build from localhost:8000)
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
    import(`http://localhost:8000/bc-pex/dist/assets/main.js?v=${Date.now()}`)
        .catch(e => console.error('⚗️[PEX] 本地加载失败（python 服务开了吗？）:', e));
}

// EBC 本地加载器：从 localhost:8000（python http.server，serve 工作区根目录）读取 bundle。
// 需先启动：cd 工作区 && python -m http.server 8000
