// ==UserScript==
// @name         Personality Excretion (PEX)
// @name:zh      人格排泄
// @namespace    https://github.com/Nice8923/BC-PEX
// @version      0.1.0
// @description  通过关键词道具触发人格排泄玩法：眩晕→排出→失神→凝胶流转→喂回恢复。支持 /pex 指令。
// @description:en  Persona excretion gameplay: dizzy → excrete → blank → gel → feed-back recovery. Supports /pex commands.
// @author       PEX
// @supportURL   https://github.com/Nice8923/BC-PEX
// @include      /^https?:\/\/(www\.)?(bondageprojects\.com|bondageprojects\.elementfx\.com|bondage-europe\.com|bondage-asia\.com)\/.*/
// @grant        none
// @run-at       document-end
// ==/UserScript==

// 薄加载器：从发布地址拉取构建产物（assets/main.js，GitHub Pages）。
if (window.PEX) {
    console.warn('⚗️[PEX] 已加载，跳过重复导入。');
} else {
    import(`https://nice8923.github.io/BC-PEX/assets/main.js?v=${Date.now()}`)
        .catch(e => console.error('⚗️[PEX] 加载失败:', e));
}
