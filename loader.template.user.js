// ==UserScript==
// @name         Personality Excretion (PEX)
// @name:zh      人格排泄
// @namespace    https://github.com/Nice8923/BC-PEX
// @version      __VERSION__
// @description  通过关键词道具触发人格排泄玩法：眩晕→排出→失神→凝胶流转→喂回恢复。内置音效与表情，支持/pex 指令。
// @description:en  Persona excretion gameplay: dizzy → excrete → blank → gel → feed-back recovery. Built-in sounds & expressions, /pex commands.
// @author       PEX
// @supportURL   https://github.com/Nice8923/BC-PEX
// @include      /^https:\/\/(www\.)?bondage(projects\.elementfx|-(europe|asia))\.com\/.*/
// @grant        none
// @run-at       document-end
// ==/UserScript==

window.PEX = window.PEX ?? {};
if (window.PEX) {
    console.warn('⚗️[PEX] 已加载，跳过重复加载。');
} else {
    const CODE = '__CODE__';
    const run = () => {
        // 优先 data: URL 模块导入；若被 CSP 拦截时退回全局 eval
        try {
            import('data:text/javascript;base64,' + CODE)
                .catch(() => { (0, eval)(atob(CODE)); });
        } catch (e) {
            try { (0, eval)(atob(CODE)); } catch (e2) { console.error('⚗️[PEX] 内嵌加载失败:', e2); }
        }
    };
    run();
}
