// ════════════════════════════════════════
//  PEX 设置页（DOM 面板，与远程编辑面板同款样式）
//  7 分区：基本设置 / 排出设置 / 特效设置 / 权限设置 / 表情设置 / 音效设置 / 关于插件
//  改动即保存；每个选项悬浮 title 说明；强制恢复/恢复默认弹窗二次确认
//  面板固定居中（不随资料页），BC 偏好设置 → 扩展 → 人格排泄 PEX
// ════════════════════════════════════════

import { CONFIG, PREF_ID, MOD_VER, makeDefaultConfig, setConfig } from '../core/config.js';
import { saveSettings, publishSharedSettings, exportSettings, importSettings, loadSounds, saveSounds } from '../core/storage.js';
import { forceRecover } from '../gameplay/revert.js';
import { pexLog } from '../util/util.js';

const PANEL_ID = 'pex-settings-panel';

const SECTIONS = [
    { key: 'basic', label: '基本设置' },
    { key: 'excrete', label: '排出设置' },
    { key: 'fx', label: '特效设置' },
    { key: 'perm', label: '权限设置' },
    { key: 'expr', label: '表情设置' },
    { key: 'sound', label: '音效设置' },
    { key: 'about', label: '关于插件' },
];

// 表情四维选项（所有组共用）
const EXPR_OPTS = [
    ['Eyebrows', [['Soft', '柔和'], ['Lowered', '低垂'], ['Raised', '上扬'], ['Frown', '皱眉']]],
    ['Eyes', [['VeryLewd', '失神'], ['HeartPink', '心形粉'], ['LewdHeartPink', '涩心粉'], ['Closed', '闭眼'], ['Dazed', '恍惚']]],
    ['Mouth', [['Frown', '抿嘴'], ['Moan', '呻吟'], ['Ahegao', '阿黑颜'], ['Open', '张开']]],
    ['Blush', [['High', '高'], ['Medium', '中'], ['Low', '低'], ['VeryHigh', '极高']]],
];

// 样式只注入一次
let _stylesInjected = false;
function ensureStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    try {
        const st = document.createElement('style');
        st.id = 'pex-settings-styles';
        st.textContent = `
#pex-settings-panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
  width:min(100vw,1800px);height:min(100vh,1000px);
  background:#1e1930;border:2px solid #f27ba8;border-radius:12px;color:#e8e4f5;
  font-family:sans-serif;font-size:20px;z-index:2147483646;box-shadow:0 8px 40px rgba(0,0,0,.65);
  display:flex;flex-direction:column;overflow:hidden}
.pex-s-head{display:flex;align-items:center;justify-content:space-between;padding:18px 26px;
  border-bottom:1px solid #37305a;background:#241d3a}
.pex-s-title{color:#f27ba8;font-weight:600;font-size:24px}
.pex-s-body{display:flex;flex:1;min-height:0}
.pex-s-nav{width:240px;border-right:1px solid #37305a;padding:16px 14px;display:flex;flex-direction:column;gap:6px}
.pex-sec-btn{background:transparent;color:#9b93bd;border:none;border-radius:8px;padding:15px 18px;
  text-align:left;font-size:20px;cursor:pointer}
.pex-sec-btn:hover{background:#2a2450;color:#e8e4f5}
.pex-sec-btn.on{background:#f27ba8;color:#241d3a;font-weight:600}
.pex-s-content{flex:1;overflow-y:auto;padding:18px 26px}
.pex-row{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:11px 0}
.pex-lbl{color:#c9c2e0;font-size:20px;flex-shrink:0}
.pex-ctl{display:flex;align-items:center;gap:10px}
.pex-tgl{background:#3a3270;color:#fff;border:none;border-radius:8px;padding:10px 28px;cursor:pointer;font-size:20px}
.pex-tgl.on{background:#2a6b63}
.pex-sel{background:#2a6b63;color:#fff;border:1px solid #37305a;border-radius:8px;padding:10px 14px;font-size:20px}
.pex-num{background:#2b2450;color:#e8e4f5;border:1px solid #c2557f;border-radius:8px;padding:10px 14px;width:130px;font-size:20px}
.pex-txt{background:#2b2450;color:#e8e4f5;border:1px solid #37305a;border-radius:8px;padding:10px 14px;
  width:100%;box-sizing:border-box;font-family:monospace;font-size:19.5px;resize:vertical;min-height:100px}
.pex-note{color:#7d749e;font-size:17.5px;margin:6px 0 14px;line-height:1.7}
.pex-sec-title{color:#f27ba8;font-weight:600;font-size:21.5px;margin:16px 0 6px}
.pex-act{background:#3a3270;color:#fff;border:none;border-radius:8px;padding:12px 26px;cursor:pointer;font-size:20px}
.pex-act:hover{background:#4a407f}
.pex-act.danger{background:#872626}
.pex-act.ok{background:#2a6b63}
.pex-about-line{color:#c9c2e0;font-size:20px;line-height:1.8;margin:3px 0}
.pex-about-head{color:#f27ba8;font-weight:600;font-size:21.5px;margin:14px 0 4px}
.pex-expr-del{background:#872626;color:#fff;border:none;border-radius:8px;padding:8px 18px;margin-left:12px;cursor:pointer;font-size:17px;vertical-align:middle}
.pex-confirm-dialog{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:420px;
  background:linear-gradient(135deg,rgba(30,10,40,.98),rgba(50,15,60,.98));border:1px solid rgba(255,120,200,.45);
  border-radius:12px;padding:22px;z-index:2147483647;color:#ffddee;font-family:sans-serif;font-size:14px;
  box-shadow:0 8px 40px rgba(180,60,160,.4);text-align:center}
.pex-confirm-dialog .msg{font-size:14px;margin-bottom:18px;line-height:1.6;white-space:pre-line}
.pex-confirm-dialog button{border:none;border-radius:8px;padding:9px 26px;font-size:14px;font-weight:600;cursor:pointer;margin:0 7px}
.pex-confirm-dialog .no{background:#4a2030;color:#ffaabb}
.pex-confirm-dialog .yes{background:#872626;color:#aaffaa}
.pex-btn-row{display:flex;gap:10px;margin:10px 0;flex-wrap:wrap}
`;
        document.head.appendChild(st);
    } catch (e) {}
}

function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 弹窗二次确认（不用浏览器 confirm）
function confirmDialog(message, onYes) {
    try {
        const old = document.querySelector('.pex-confirm-dialog');
        if (old) old.remove();
    } catch (e) {}
    const box = document.createElement('div');
    box.className = 'pex-confirm-dialog';
    box.innerHTML = `<div class="msg">${esc(message)}</div>
        <div><button class="no" type="button">取消</button><button class="yes" type="button">确认</button></div>`;
    box.querySelector('.no').onclick = () => box.remove();
    box.querySelector('.yes').onclick = () => { box.remove(); try { onYes && onYes(); } catch (e) {} };
    document.body.appendChild(box);
}

const EXT = {
    active: 'basic',
    panel: null,
    _needsRender: true,   // 需要重建内容区时置 true（分区切换/控件变化）

    // ── 生命周期（BC 偏好系统）──
    load() { try { loadSounds(); } catch (e) {} },
    run() {
        // BC 偏好页每帧调用——这里必须零 DOM 查询/渲染（卡顿根因）：
        // 面板不存在才构建，需要刷新才渲染，其余直接返回
        try {
            ensureStyles();
            if (!this.panel || !document.getElementById(PANEL_ID)) {
                this._build();
                this._needsRender = true;
            }
            if (this._needsRender) {
                this._needsRender = false;
                this._render(this.active);
                this._syncNav();
            }
        } catch (e) { pexLog('设置面板渲染异常:', e.message); }
    },
    click() {},   // DOM 事件自动处理
    unload() { this._close(); },
    exit() { this._close(); },
    _close() {
        // 移除面板节点：再打开时 run 会重建（只设 display:none 会导致"再打开空白"）
        try { if (this.panel) { this.panel.remove(); this.panel = null; } } catch (e) {}
    },

    _build() {
        if (this.panel) { try { this.panel.remove(); } catch (e) {} }
        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = `
            <div class="pex-s-head">
                <div class="pex-s-title">人格排泄 · 设置</div>
                <button type="button" class="pex-act" data-pex-close="1">✕</button>
            </div>
            <div class="pex-s-body">
                <div class="pex-s-nav">
                    ${SECTIONS.map(s => `<button type="button" class="pex-sec-btn" data-pex-sec="${s.key}" title="${esc(s.label)}">${esc(s.label)}</button>`).join('')}
                </div>
                <div class="pex-s-content"></div>
            </div>`;
        document.body.appendChild(panel);
        this.panel = panel;
        panel.querySelector('[data-pex-close]').onclick = () => {
            try { if (typeof PreferenceExit === 'function') PreferenceExit(); } catch (e) {}
            this._close();
        };
        panel.querySelectorAll('[data-pex-sec]').forEach(btn => {
            btn.onclick = () => {
                if (this.active === btn.dataset.pexSec) return;
                this.active = btn.dataset.pexSec;
                this._needsRender = true;
                this.run();
            };
        });
    },

    _syncNav() {
        try {
            this.panel.querySelectorAll('[data-pex-sec]').forEach(btn => {
                btn.classList.toggle('on', btn.dataset.pexSec === this.active);
            });
        } catch (e) {}
    },

    // ── 内容渲染（分区切换时重建；开关/权限按钮只做局部更新）──
    _render(key) {
        // 新建 content 节点替换旧的（旧节点上的事件监听器随节点一起释放——
        // 复用同一节点会导致监听器累积：点一次新增 = 所有旧监听器各执行一次）
        const old = this.panel.querySelector('.pex-s-content');
        const content = document.createElement('div');
        content.className = 'pex-s-content';
        if (old) old.replaceWith(content);
        const fn = this['_sec_' + key];
        content.innerHTML = (typeof fn === 'function' ? fn.call(this) : '<div class="pex-note">暂无内容</div>');
        this._bind(content);
        if (key === 'expr') this._ensureExprPreview();   // 表情预览
    },

    // 事件委托（内容每次重建后绑定一次；控件变化只局部更新，不重建内容区）
    _bind(content) {
        content.addEventListener('click', (e) => {
            const side = e.target.closest('[data-pex-side]');
            if (side) {
                // 左右两钮开关：点左=关，点右=开
                const key = side.dataset.pexSide;
                const val = side.dataset.pexVal === '1';
                this._setPath(key, val);
                content.querySelectorAll(`[data-pex-side="${key}"]`).forEach(b => {
                    b.classList.toggle('on', b.dataset.pexVal === side.dataset.pexVal);
                });
                return;
            }
            const mode = e.target.closest('[data-pex-mode]');
            if (mode) {
                // 权限类别：仅自己/白名单/所有人
                const cat = mode.dataset.pexMode;
                if (CONFIG.editModes) CONFIG.editModes[cat] = mode.dataset.pexMv;
                try { saveSettings(); } catch (e) {}
                content.querySelectorAll(`[data-pex-mode="${cat}"]`).forEach(b => {
                    b.classList.toggle('on', b.dataset.pexMv === mode.dataset.pexMv);
                });
                return;
            }
            const act = e.target.closest('[data-pex-action]');
            if (act) { const a = this._actions[act.dataset.pexAction]; if (a) a(); }
            const addExpr = e.target.closest('[data-pex-add-expr]');
            if (addExpr) {
                // 等待表情池：新增一组（上限 10 组）
                const pool = CONFIG.expressions?.wait;
                if (Array.isArray(pool) && pool.length < 10) {
                    pool.push({ ...(CONFIG.expressions.excrete || {}) });
                    try { saveSettings(); } catch (e) {}
                    this._needsRender = true;
                    this.run();
                }
                return;
            }
            const delExpr = e.target.closest('[data-pex-del-expr]');
            if (delExpr) {
                // 删除等待表情组（弹窗二次确认）
                const i = parseInt(delExpr.dataset.pexDelExpr, 10);
                confirmDialog('确定删除"等待表情 ' + (i + 1) + '"吗？', () => {
                    const pool = CONFIG.expressions?.wait;
                    if (Array.isArray(pool) && pool[i]) {
                        pool.splice(i, 1);
                        try { saveSettings(); } catch (e) {}
                        this._needsRender = true;
                        this.run();
                    }
                });
                return;
            }
        });
        content.addEventListener('change', (e) => {
            const t = e.target;
            if (t.dataset.pexSelect) {
                // 数值型下拉（特效强度/失神视野）存数字而非字符串，保持类型一致；
                // 纯数字值才转（其余如计时器可见性、表情名仍为字符串）
                const raw = t.value;
                const num = Number(raw);
                this._setPath(t.dataset.pexSelect, (raw !== '' && /^\d+$/.test(raw) && !isNaN(num)) ? num : raw);
                // 表情下拉 → 刷新预览（新结构：expressions.wait.N / expressions.excrete / blank）
                const sel = t.dataset.pexSelect;
                if (sel.startsWith('expressions.wait.')) {
                    const n = parseInt(sel.split('.').pop(), 10);
                    if (!isNaN(n)) this._exprEditKey = n;
                } else if (sel.startsWith('expressions.')) this._exprEditKey = sel.split('.')[1];
                else if (sel.startsWith('normalExpression')) this._exprEditKey = 'normal';
                if (sel.startsWith('expressions.') || sel.startsWith('normalExpression')) this._ensureExprPreview();
                return;
            }
            if (t.dataset.pexNumber) {
                const n = parseInt(t.value, 10);
                if (!isNaN(n)) this._setPath(t.dataset.pexNumber, n);
                return;
            }
            if (t.dataset.pexText) { this._setPath(t.dataset.pexText, t.value); return; }
            if (t.dataset.pexSound) {
                const key = t.dataset.pexSound;
                const list = t.value.split('\n').map(s => s.trim()).filter(Boolean);
                CONFIG.sounds[key] = list;
                try { saveSounds(); } catch (e) {}
            }
        });
    },

    _getPath(key) {
        return key.split('.').reduce((o, k) => (o == null ? o : o[k]), CONFIG);
    },
    _setPath(key, value) {
        if (key === 'whitelistText') {
            // 白名单：逗号/空格分隔的成员号（支持代号）
            CONFIG.whitelist = String(value).split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
            try { saveSettings(); } catch (e) {}
            return;
        }
        if (key === 'keywords' || key === 'normalKeywords') {
            // 关键词：每行一个 → 数组
            CONFIG[key] = String(value).split('\n').map(s => s.trim()).filter(Boolean);
            try { saveSettings(); } catch (e) {}
            return;
        }
        if (key.startsWith('soundOn.')) {
            // 音效类别开关：存 localStorage（同音效 URL 一起，账号隔离）
            const parts = key.split('.');
            if (CONFIG.soundOn) CONFIG.soundOn[parts[1]] = !!value;
            try { saveSounds(); } catch (e) {}
            return;
        }
        const parts = key.split('.');
        const last = parts.pop();
        let o = CONFIG;
        for (const p of parts) o = o[p];
        if (o && last in o) {
            o[last] = value;
            try { saveSettings(); } catch (e) {}
        }
    },

    // 面板动作（弹窗二次确认）
    _actions: {
        recover: () => {
            confirmDialog('确定要强制恢复吗？\n此操作会立即清除全部 PEX 状态，包括等待、失神与凝胶。', () => forceRecover());
        },
        reset: () => {
            confirmDialog('确定要恢复默认设置吗？\n所有设置将还原为初始值。', () => {
                setConfig(makeDefaultConfig());
                saveSettings(true);
                publishSharedSettings(true);
                EXT._needsRender = true;
                EXT.run();
            });
        },
        exportCfg: () => { try { exportSettings(); } catch (e) {} },
        importCfg: () => { try { importSettings(); } catch (e) {} },
    },

    // ── 控件生成 ──
    _row(label, desc, ctrlHtml) {
        return `<div class="pex-row"><div class="pex-lbl" title="${esc(desc)}">${esc(label)}</div><div class="pex-ctl">${ctrlHtml}</div></div>`;
    },
    _tgl(key, label = '开 / 关') {
        // 左右两钮：点左边=关，点右边=开（无 toggle 逻辑）
        const on = !!this._getPath(key);
        return `<button type="button" class="pex-tgl ${!on ? 'on' : ''}" data-pex-side="${key}" data-pex-val="0" title="${esc(label)}">关</button>` +
               `<button type="button" class="pex-tgl ${on ? 'on' : ''}" data-pex-side="${key}" data-pex-val="1" title="${esc(label)}">开</button>`;
    },
    _sel(key, options, desc) {
        const val = this._getPath(key);
        // 用字符串比较判定选中：特效强度/失神视野等数值型下拉，
        // 旧存档可能存成字符串 "3"，与数字 3 严格比较会全部落空 → 下拉回退到第一项
        return `<select class="pex-sel" data-pex-select="${key}" title="${esc(desc || '')}">${options.map(([v, l]) => `<option value="${v}" ${String(val) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    },
    _num(key, min, max, desc) {
        return `<input type="number" class="pex-num" data-pex-number="${key}" min="${min}" max="${max}" value="${this._getPath(key)}" title="${esc(desc || '')}">`;
    },
    _txt(key, desc, placeholder) {
        const v = this._getPath(key);
        const text = Array.isArray(v) ? v.join('\n') : (v ?? '');
        return `<textarea class="pex-txt" data-pex-text="${key}" title="${esc(desc || '')}" placeholder="${esc(placeholder || '')}">${esc(text)}</textarea>`;
    },

    // ════════ 基本设置 ════════
    _sec_basic() {
        const c = CONFIG;
        return `
            ${this._row('启用插件', '关闭后所有触发与表现全部停用', this._tgl('enabled', '插件总开关'))}
            <div class="pex-sec-title">触发关键词</div>
            <div class="pex-note">关键词写在物品的制作名、制作描述或雕刻描述中；喝下或注射该物品即触发。</div>
            ${this._row('人格凝胶关键词', '命中后进入完整排出流程：眩晕、排出、失神', '')}
            ${this._txt('keywords', '人格凝胶关键词，每行一个', '如：人格药水')}
            ${this._row('普通凝胶关键词', '命中后排出普通凝胶：眩晕、表情、凝胶落地，但没有任何失神限制', '')}
            ${this._txt('normalKeywords', '普通凝胶关键词，每行一个', '如：普通凝胶')}
            <div class="pex-sec-title">安全</div>
            <div class="pex-btn-row">
                <button type="button" class="pex-act danger" data-pex-action="recover">强制恢复</button>
            </div>
            <div class="pex-note">强制恢复会立即清除全部 PEX 状态，包括等待、失神与凝胶，需要弹窗二次确认。</div>`;
    },

    // ════════ 排出设置 ════════
    _sec_excrete() {
        const c = CONFIG;
        return `
            <div class="pex-sec-title">时间</div>
            ${this._row('排出前等待（秒）', '喝下或注射后到开始排出之间的等待时间；等待音效按它自动分段（10 秒 1 段…50 秒及以上 5 段）', this._num('waitSeconds', 10, 600, '10 到 600 秒'))}
            ${this._row('臀部阻挡上限（分）', '臀部装备位有东西时等待多久，超时药效静默消失', this._num('blockedWaitMinutes', 1, 30, '1 到 30 分钟'))}
            ${this._row('自动回归（分）', '排出后多久没被喂回就自动恢复', this._num('autoRevertMinutes', 1, 30, '1 到 30 分钟'))}
            ${this._row('自动回归', '超时后自动恢复并处理凝胶；关闭后凝胶一直等喂回', this._tgl('autoRevertEnabled', '自动回归开关'))}
            <div class="pex-sec-title">凝胶</div>
            ${this._row('凝胶到期', '到期时凝胶消散消失，或变成持有者手上的无效凝胶永久保留', this._sel('gelExpireMode', [['vanish', '消散消失'], ['invalid', '变无效凝胶']], '到期行为'))}
            <div class="pex-sec-title">失神限制</div>
            ${this._row('失神限制', '失神时不能动、禁言、不眨眼、姿势锁定；关闭后失神只保留视觉表现', this._tgl('restrictions', '失神限制总开关'))}
            <div class="pex-note">关闭失神限制后，排出者失神期间仍可以行动、说话和离开房间。</div>`;
    },

    // ════════ 特效设置 ════════
    _sec_fx() {
        const c = CONFIG;
        return `
            <div class="pex-sec-title">特效开关</div>
            ${this._row('等待期眩晕', '喝下后等待期的眩晕脉冲效果', this._tgl('fxDizzy', '眩晕脉冲'))}
            ${this._row('失神黑白', '失神时画面黑白并压暗，暗角强弱随特效强度', this._tgl('fxBlank', '黑白特效'))}
            ${this._row('模糊特效', '眩晕、排出与失神时的画面模糊', this._tgl('fxBlur', '模糊特效'))}
            ${this._row('排出震动', '排出动画期间的画面震动', this._tgl('fxShake', '排出震动'))}
            <div class="pex-sec-title">强度与视野</div>
            ${this._row('特效强度', '数字越大，眩晕、模糊、暗角越强', this._sel('effectLevel', [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], '特效强度 1 到 5'))}
            ${this._row('失神视野', '失神时画面整体变暗的程度，关闭则视野不变', this._sel('blindLevel', [[0, '无'], [1, '轻度'], [2, '中度'], [3, '重度']], '失神视野档位'))}
            ${this._row('凝胶图层', '凝胶画在第几层，数字越大越靠上层，24 及以上为顶层（不被遮住）', this._num('gelLayer', 0, 99, '0 到 99，默认 24'))}
            <div class="pex-sec-title">他人视角</div>
            ${this._row('看别人排出动画', '是否播放他人排出时的动画', this._tgl('seeRemoteAnims', '远程排出动画'))}
            ${this._row('其他玩家音效', '是否播放其他玩家广播的音效（等待/排出/放回）；默认关闭 = 只有自己听得到', this._tgl('hearRemoteSounds', '其他玩家音效'))}
            ${this._row('计时器可见性', '头顶倒计时谁能看到', this._sel('timerVisibility', [['self', '仅自己'], ['whitelist', '仅白名单'], ['others', '仅他人'], ['all', '所有人']], '计时器可见性'))}
            <div class="pex-note">凝胶固定在角色身体层绘制，会被衣服遮住；特效与强度均为本地设置，不会通过远程修改开放给他人。</div>`;
    },

    // ════════ 权限设置 ════════
    _sec_perm() {
        const c = CONFIG;
        const cats = [
            ['time', '时间类', '排出前等待、臀部阻挡上限、自动回归分钟'],
            ['autoRevert', '凝胶自动回归', '自动回归的开关'],
            ['timerVisibility', '计时器可见性', '头顶倒计时的可见档位'],
        ];
        const modes = [['off', '仅自己'], ['whitelist', '白名单'], ['any', '所有人']];
        let html = `<div class="pex-note">每类设置可独立选择能否被别人远程修改，默认仅自己。</div>`;
        for (const [cat, lb, d] of cats) {
            const cur = (c.editModes && c.editModes[cat]) || 'off';
            html += this._row(lb, d,
                modes.map(([m, mlb]) =>
                    `<button type="button" class="pex-tgl ${cur === m ? 'on' : ''}" data-pex-mode="${cat}" data-pex-mv="${m}" title="${esc(d)}">${mlb}</button>`
                ).join(''));
        }
        html += `<div class="pex-sec-title">白名单</div>
            <div class="pex-note">成员号逗号分隔，支持 $owner、$lover 等代号；远程修改权限选白名单时生效。</div>
            <textarea class="pex-txt" data-pex-text="whitelistText" title="白名单成员号" placeholder="如：12345, 67890">${esc((c.whitelist || []).join(', '))}</textarea>`;
        return html;
    },

    // ════════ 表情设置 ════════
    _sec_expr() {
        const exprs = CONFIG.expressions || {};
        const pool = Array.isArray(exprs.wait) ? exprs.wait : [];
        let html = `<div style="display:flex;gap:18px;align-items:flex-start">
            <div style="flex:1">`;
        html += `<div class="pex-sec-title">等待表情池</div>
            <div class="pex-note">排出前等待期间随机抽取播放，与等待音效同步出现（同一时间点）；可自行添加更多组（最多 10 组）。</div>`;
        for (let i = 0; i < pool.length; i++) {
            html += `<div class="pex-sec-title">等待表情 ${i + 1}
                <button type="button" class="pex-expr-del" data-pex-del-expr="${i}" title="删除这组等待表情">✕</button></div>`;
            html += this._exprRow(`expressions.wait.${i}`);
        }
        html += `<div class="pex-btn-row"><button type="button" class="pex-act ok" data-pex-add-expr="wait" title="添加一组等待表情（最多 10 组）">＋ 新增等待表情</button></div>`;
        html += `<div class="pex-sec-title">排出表情</div>
            <div class="pex-note">与排出动画同时播放（等待期表情之外的下一组）</div>`;
        html += this._exprRow('expressions.excrete');
        html += `<div class="pex-sec-title">失神定格</div>
            <div class="pex-note">凝胶排出后定格，持续到恢复</div>`;
        html += this._exprRow('expressions.blank');
        html += `<div class="pex-sec-title">普通凝胶表情</div>
            <div class="pex-note">普通凝胶排出后的短暂表情变化</div>`;
        html += this._exprRow('normalExpression');
        html += `</div>
            <div style="width:200px;text-align:center;position:sticky;top:0">
                <img id="pex-expr-preview" alt="" style="width:170px;height:170px;border-radius:50%;border:2px solid #f27ba8;background:#241d3a;object-fit:cover">
                <div class="pex-note" style="margin-top:8px">表情预览</div>
            </div>
        </div>`;
        return html;
    },
    _exprRow(baseKey) {
        let html = '';
        for (const [k, opts] of EXPR_OPTS) {
            html += this._row(k, k + ' 表情', this._sel(baseKey + '.' + k, opts, k + ' 表情'));
        }
        return html;
    },

    // ── 表情预览（克隆角色套表情 → CharacterLoadCanvas → 截脸）──
    _exprPreviewKey: null,
    _exprEditKey: 0,   // 当前预览组：数字=等待表情池下标 / 'excrete' / 'blank' / 'normal'

    _ensureExprPreview() {
        const set = this._exprEditKey === 'normal'
            ? CONFIG.normalExpression
            : (typeof this._exprEditKey === 'number'
                ? CONFIG.expressions?.wait?.[this._exprEditKey]
                : CONFIG.expressions?.[this._exprEditKey]);
        if (!set) return;
        const key = String(this._exprEditKey) + ':' + JSON.stringify(set);
        if (key === this._exprPreviewKey) return;
        this._exprPreviewKey = key;
        const imgEl = document.getElementById('pex-expr-preview');
        if (!imgEl) return;
        try {
            if (typeof Player === 'undefined' || !Player || typeof CharacterLoadCanvas !== 'function') {
                this._fallbackPreview(set, imgEl);
                return;
            }
            const map = this._expandExpr(set);
            const clone = Object.assign(Object.create(Object.getPrototypeOf(Player)), Player);
            clone.MemberNumber = -77777;
            clone.Appearance = (Player.Appearance || []).map(a => {
                const gn = a.Asset.Group.Name;
                if (map[gn] === undefined) return a;
                const na = Object.assign({}, a);
                na.Property = Object.assign({}, a.Property);
                na.Property.Expression = map[gn];
                return na;
            });
            clone.Canvas = null; clone.CanvasBlink = null; clone.MustDraw = true;
            try { CharacterLoadCanvas(clone); } catch (e) {}
            const cap = () => {
                try {
                    const src = clone.Canvas;
                    if (src && src.width) this._captureFace(src, imgEl);
                } catch (e) {}
            };
            cap(); setTimeout(cap, 160); setTimeout(cap, 420);
            // 兜底：克隆画布迟迟不出 → 直写 Player 套表情 + 截脸 + 还原
            setTimeout(() => {
                if (!imgEl.src || !imgEl.src.startsWith('data:')) this._fallbackPreview(set, imgEl);
            }, 1000);
        } catch (e) {
            this._fallbackPreview(set, imgEl);
        }
    },
    // 兜底预览：直写真实 Player 的 Property（不广播）→ CharacterRefresh → 截脸 → 还原
    _fallbackPreview(set, imgEl) {
        try {
            if (typeof Player === 'undefined' || !Player?.Appearance || typeof CharacterRefresh !== 'function') return;
            const map = this._expandExpr(set);
            const saved = {};
            const changed = [];
            for (const [g, val] of Object.entries(map)) {
                try {
                    if (val == null) continue;
                    const it = Player.Appearance.find(a => a.Asset.Group.Name === g);
                    if (!it) continue;
                    saved[g] = it.Property?.Expression ?? null;
                    if (!it.Property) it.Property = {};
                    it.Property.Expression = val;
                    changed.push(g);
                } catch (e) {}
            }
            if (!changed.length) return;
            try { CharacterRefresh(Player, false, false); } catch (e) {}
            setTimeout(() => {
                try {
                    if (Player?.Canvas?.width) this._captureFace(Player.Canvas, imgEl);
                } catch (e) {}
                // 还原
                try {
                    for (const [g, val] of Object.entries(saved)) {
                        const it = Player.Appearance.find(a => a.Asset.Group.Name === g);
                        if (!it) continue;
                        if (!it.Property) it.Property = {};
                        it.Property.Expression = val;
                    }
                    CharacterRefresh(Player, false, false);
                } catch (e) {}
            }, 300);
        } catch (e) {}
    },
    _captureFace(src, imgEl) {
        try {
            const SZ = 320;
            const cv = document.createElement('canvas'); cv.width = cv.height = SZ;
            const c = cv.getContext('2d');
            const side = src.width * 0.20;
            const cropX = src.width * 0.50 - side / 2;
            const cropY = src.height * 0.43 - side * 0.22;
            c.drawImage(src, cropX, cropY, side, side, 0, 0, SZ, SZ);
            const img = new Image();
            img.onload = () => { try { imgEl.src = img.src; } catch (e) {} };
            img.src = cv.toDataURL();
        } catch (e) {}
    },
    _expandExpr(exprObj) {
        const eyes = exprObj.Eyes ?? null;
        const eyes2 = (exprObj.Eyes2 !== undefined) ? exprObj.Eyes2 : eyes;
        return {
            Eyebrows: exprObj.Eyebrows ?? null,
            Eyes: eyes,
            Eyes2: eyes2,
            Mouth: exprObj.Mouth ?? null,
            Blush: exprObj.Blush ?? null,
            '右眼_Luzi': eyes,
            '左眼_Luzi': eyes2,
        };
    },

    // ════════ 音效设置 ════════
    _sec_sound() {
        const sounds = CONFIG.sounds || { wait: [], excrete: [], feed: [] };
        const items = [
            ['wait', '等待音效', '排出前等待期间分段播放，与等待表情同步出现：10 秒 1 段、20 秒 2 段、30 秒 3 段、40 秒 4 段、50 秒及以上 5 段，均匀分布随机选段；内置 5 段（CDN），自定义地址加入随机池'],
            ['excrete', '排出音效', '排出动画期间播放；动画长度自动对齐音效时长（默认 7.34 秒）'],
            ['feed', '放回音效', '被喂回、黑白特效淡出结束后播放（默认 3.96 秒）'],
        ];
        let html = '<div class="pex-note">每类音效有独立开关（关 = 本地不播，也不广播给别人）；素材每行一个地址，留空用内置默认。</div>';
        for (const [key, lb, desc] of items) {
            const list = Array.isArray(sounds[key]) ? sounds[key] : [];
            html += `<div class="pex-sec-title">${lb}　${this._tgl('soundOn.' + key, lb + '开关')}</div>
                <div class="pex-note">${desc}</div>
                <textarea class="pex-txt" data-pex-sound="${key}" title="${esc(desc)}" placeholder="https://…">${esc(list.join('\n'))}</textarea>`;
        }
        return html;
    },

    // ════════ 关于插件 ════════
    _sec_about() {
        return `
            <div class="pex-about-head">玩法说明</div>
            <div class="pex-about-line">1. 制作一瓶饮料，在制作名或雕刻描述里写上触发关键词。</div>
            <div class="pex-about-line">2. 喝下或注射后进入排出等待：眩晕脉冲，前两个表情在三分之一和三分之二处播放。</div>
            <div class="pex-about-line">3. 到排出时刻检查臀部装备位：空则排出，有东西会等待，拿掉立刻排出。</div>
            <div class="pex-about-line">4. 排出时第三个表情与动画同播，画面剧烈震动并模糊。</div>
            <div class="pex-about-line">5. 人格凝胶排出后失神：黑白、不能动、禁言、不眨眼、视野变暗，凝胶落在脚边。</div>
            <div class="pex-about-line">6. 点击失神者，在对话框中捡起凝胶，交还原主人喂回即恢复；到期按设置消散或变无效凝胶。</div>
            <div class="pex-about-line">7. 普通凝胶排出后没有失神限制，凝胶同样可以捡起和喂回。</div>
            <div class="pex-about-line">8. 安全：随时使用基本设置中的强制恢复，或输入 /pex reset yes。</div>
            <div class="pex-about-head">指令</div>
            <div class="pex-about-line">/pex help 帮助　/pex howto 玩法说明　/pex status 当前状态</div>
            <div class="pex-about-line">/pex show 控制台面板　/pex settings 打开设置　/pex reset 强制恢复</div>
            <div class="pex-about-head">版本</div>
                <div class="pex-about-line">Personality Excretion v${MOD_VER}</div>
            <div class="pex-about-head">调试</div>
            <div class="pex-about-line">按 F12 打开浏览器控制台，把 ⚗️[PEX] 开头的报错信息发给作者。</div>
            <div class="pex-about-head">数据</div>
            <div class="pex-btn-row">
                <button type="button" class="pex-act" data-pex-action="exportCfg">导出设置</button>
                <button type="button" class="pex-act" data-pex-action="importCfg">导入设置</button>
                <button type="button" class="pex-act danger" data-pex-action="reset">恢复默认</button>
            </div>
            <div class="pex-about-head">音效素材</div>
            <div class="pex-about-line">默认音效素材来自 pincree.jp 的免费资源（Free Assets）。</div>`;
    },
};

// 注册设置页（等待 BC 偏好系统就绪）
export function registerPreferenceScreen() {
    const tryRegister = () => {
        try {
            if (typeof PreferenceRegisterExtensionSetting !== 'function') return false;
            PreferenceRegisterExtensionSetting({
                Identifier: PREF_ID,
                ButtonText: '人格排泄 PEX',
                // 设置按钮图标（BC 原生支持 Image 字段）：等 Images/pex-icon.png 上传后取消注释即启用
                // Image: () => 'https://cdn.jsdelivr.net/gh/Nice8923/BC-PEX@main/Images/pex-icon.png',
                load: () => EXT.load(),
                run: () => EXT.run(),
                click: () => EXT.click(),
                unload: () => EXT.unload(),
                exit: () => EXT.exit(),
            });
            return true;
        } catch (e) {
            pexLog('设置页注册失败:', e.message);
            return false;
        }
    };
    if (tryRegister()) return;
    let tries = 0;
    const timer = setInterval(() => {
        tries++;
        if (tryRegister() || tries > 30) clearInterval(timer);
    }, 1000);
}
