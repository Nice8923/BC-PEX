// ════════════════════════════════════════
//  PEX 游戏内控制台面板（/pex show 开关）
//  独立视觉：凝胶粉 #f27ba8 + 深青 #3f9c92
//  内容：状态机 + 倒计时 + 凝胶信息 + 配置摘要 + 最近日志 + 快捷按钮
//  实现：普通 DOM 节点插入聊天框（随聊天滚动），每秒自动刷新
// ════════════════════════════════════════

import { CONFIG, PREF_ID, MOD_VER } from '../core/config.js';
import { PEX_STATE } from '../gameplay/state.js';
import { forceRecover } from '../gameplay/revert.js';
import { startFlow } from '../gameplay/excretion.js';
import { saveSettings } from '../core/storage.js';
import { PEX_LOG, pexLog } from '../util/util.js';

const C = {
    accent: '#f27ba8', accentDark: '#c2557f',
    teal: '#3f9c92', tealDark: '#2a6b63',
    text: '#e8e4f5', dim: '#9b93bd', danger: '#ff6b6b',
};

const MODE_LABEL = {
    idle: '空闲',
    waiting: '排出前等待',
    blocked: '臀部被挡·等待中',
    excreting: '排出动画中',
    blank: '失神中',
};
const VIEW_LABEL = { all: '全部', surround: '周围', self: '自己' };
const VIS_LABEL = { self: '仅自己', others: '仅他人', both: '都可见' };

let _panel = null;
let _timer = null;
let _recoverArmed = false;
let _recoverTimer = null;

export function panelOpen() { return !!_panel; }

function escapeHTML(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _mkBtn(label, bg, color, onClick) {
    const b = document.createElement('button');
    b.textContent = label;
    Object.assign(b.style, {
        background: bg, border: '1px solid rgba(255,255,255,0.25)',
        borderRadius: '4px', color, cursor: 'pointer', fontSize: '11px',
        padding: '2px 8px', lineHeight: '16px', fontWeight: 'bold', whiteSpace: 'nowrap',
    });
    b.addEventListener('click', onClick);
    return b;
}

// ── 状态区 HTML ──
function statusHTML() {
    const s = PEX_STATE;
    let timerText = '—';
    if (s.phaseEndsAt > 0) {
        const rem = Math.max(0, Math.round((s.phaseEndsAt - Date.now()) / 1000));
        timerText = Math.floor(rem / 60) + ':' + String(rem % 60).padStart(2, '0');
    }
    const mode = MODE_LABEL[s.mode] || s.mode;
    const modeColor = s.mode === 'idle' ? C.dim : C.accent;
    const gel = s.gelId ? '#' + String(s.gelId).slice(0, 8) : '—';
    const holder = s.gelHolder != null ? '#' + s.gelHolder : '—';
    const owner = s.ownerMemberNumber != null ? '#' + s.ownerMemberNumber : '—';
    const cfg = CONFIG;
    return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 14px;font-size:12px;line-height:18px">
      <div><span style="color:${C.dim}">状态</span> <b style="color:${modeColor}">${mode}</b>${s.gelType === 'normal' ? ` <span style="color:${C.teal}">（普通凝胶）</span>` : ''}</div>
      <div><span style="color:${C.dim}">倒计时</span> <b style="color:${C.text}">${timerText}</b></div>
      <div><span style="color:${C.dim}">凝胶ID</span> <b style="color:${C.text}">${gel}</b></div>
      <div><span style="color:${C.dim}">持有者</span> <b style="color:${C.text}">${holder}</b></div>
      <div><span style="color:${C.dim}">主人</span> <b style="color:${C.text}">${owner}</b></div>
      <div><span style="color:${C.dim}">类型</span> <b style="color:${C.text}">${escapeHTML(s.gelType)}</b></div>
    </div>
    <div style="margin-top:5px;padding-top:4px;border-top:1px solid rgba(63,156,146,0.35);display:grid;grid-template-columns:1fr 1fr;gap:2px 14px;font-size:11px;line-height:17px;color:${C.dim}">
      <span>总开关：<b style="color:${C.text}">${cfg.enabled ? '开' : '关'}</b></span>
      <span>排出等待：<b style="color:${C.text}">${cfg.waitSeconds}秒</b></span>
      <span>阻挡上限：<b style="color:${C.text}">${cfg.blockedWaitMinutes}分</b></span>
      <span>自动回归：<b style="color:${C.text}">${cfg.autoRevertEnabled ? cfg.autoRevertMinutes + '分' : '关'}</b></span>
      <span>普通表情：<b style="color:${C.text}">${cfg.normalExpressionSeconds}秒</b></span>
      <span>特效强度：<b style="color:${C.text}">${cfg.effectLevel} / 5</b></span>
      <span>失神视野：<b style="color:${C.text}">${VIEW_LABEL[cfg.viewMode] || cfg.viewMode}</b></span>
      <span>计时器：<b style="color:${C.text}">${VIS_LABEL[cfg.timerVisibility] || cfg.timerVisibility}</b></span>
    </div>`;
}

function logHTML() {
    const lines = PEX_LOG.slice(-8);
    if (!lines.length) return `<div style="color:${C.dim};font-size:11px">（暂无日志）</div>`;
    return lines.map(l =>
        `<div style="font-size:11px;color:${C.dim};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(l)}</div>`
    ).join('');
}

// ── 面板 ──
export function buildPanel(chatContainer) {
    if (_panel) return;
    if (!chatContainer) return;

    _panel = document.createElement('div');
    _panel.id = 'pex-panel';
    Object.assign(_panel.style, {
        background: 'linear-gradient(135deg, rgba(22,17,40,0.97) 0%, rgba(24,40,38,0.97) 100%)',
        borderLeft: '3px solid ' + C.accent,
        borderTop: '1px solid rgba(63,156,146,0.4)',
        padding: '8px 10px 6px',
        boxShadow: '0 -4px 20px rgba(242,123,168,0.20)',
        fontFamily: '"Noto Sans SC","Microsoft YaHei",sans-serif',
        fontSize: '12px',
        userSelect: 'none',
        marginTop: '4px',
        display: 'block',
    });

    // 标题行
    const header = document.createElement('div');
    Object.assign(header.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' });
    const title = document.createElement('span');
    title.innerHTML = `⚗️ <b style="color:${C.accent}">PEX</b> <span style="color:${C.dim};font-size:10px">控制台 v${MOD_VER}</span>`;

    const gearBtn = _mkBtn('⚙ 设置', C.tealDark, '#c9f0ea', () => {
        try {
            if (typeof PreferenceSubscreenExtensionsOpen === 'function') PreferenceSubscreenExtensionsOpen(PREF_ID);
        } catch (e) {}
    });
    // 测试按钮：临时把等待压到 10 秒跑完整人格流程（不保存设置），看眩晕→排出→失神
    const testBtn = _mkBtn('🧪 测试流程', C.tealDark, '#c9f0ea', () => {
        try {
            if (PEX_STATE.mode !== 'idle') { pexLog('已有进行中的流程，先 /pex reset 再测'); return; }
            const savedWait = CONFIG.waitSeconds;
            CONFIG.waitSeconds = 10;
            startFlow('persona');
            CONFIG.waitSeconds = savedWait;
            pexLog('测试流程已启动：10 秒后排出（臀部有东西会等待）');
        } catch (e) { pexLog('测试流程启动失败:', e.message); }
    });
    const saveBtn = _mkBtn('💾 保存', C.tealDark, '#c9f0ea', () => {
        saveSettings(true);
        pexLog('设置已保存');
        refresh();
    });
    const recoverBtn = _mkBtn('⚠ 强制恢复', 'rgba(120,30,30,0.85)', '#ff8899', () => {
        if (!_recoverArmed) {
            _recoverArmed = true;
            recoverBtn.textContent = '⚠ 再次点击确认';
            recoverBtn.style.background = C.danger;
            clearTimeout(_recoverTimer);
            _recoverTimer = setTimeout(() => { _recoverArmed = false; recoverBtn.textContent = '⚠ 强制恢复'; recoverBtn.style.background = 'rgba(120,30,30,0.85)'; }, 4000);
            return;
        }
        _recoverArmed = false;
        clearTimeout(_recoverTimer);
        recoverBtn.textContent = '⚠ 强制恢复';
        recoverBtn.style.background = 'rgba(120,30,30,0.85)';
        forceRecover();
        refresh();
    });
    const closeBtn = _mkBtn('✕', 'rgba(100,20,40,0.8)', '#ff8899', () => removePanel());

    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex;gap:4px;align-items:center';
    btnGroup.append(gearBtn, testBtn, saveBtn, recoverBtn, closeBtn);
    header.append(title, btnGroup);
    _panel.appendChild(header);

    // 状态区（每秒刷新）
    const statusEl = document.createElement('div');
    statusEl.id = 'pex-panel-status';
    _panel.appendChild(statusEl);

    // 最近日志
    const logWrap = document.createElement('div');
    logWrap.id = 'pex-panel-log';
    Object.assign(logWrap.style, {
        marginTop: '5px', paddingTop: '4px',
        borderTop: '1px solid rgba(242,123,168,0.25)',
        maxHeight: '110px', overflowY: 'auto',
    });
    _panel.appendChild(logWrap);

    chatContainer.appendChild(_panel);

    _timer = setInterval(refresh, 1000);
    refresh();
}

function refresh() {
    if (!_panel) return;
    const statusEl = _panel.querySelector('#pex-panel-status');
    const logEl = _panel.querySelector('#pex-panel-log');
    if (statusEl) statusEl.innerHTML = statusHTML();
    if (logEl) logEl.innerHTML = logHTML();
}

export function removePanel() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    if (_recoverTimer) { clearTimeout(_recoverTimer); _recoverTimer = null; }
    _recoverArmed = false;
    if (_panel) { try { _panel.remove(); } catch (e) {} _panel = null; }
}
