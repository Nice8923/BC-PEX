// ════════════════════════════════════════
//  PEX 远程编辑
//  资料页按钮：(1715,175)，90×90，图标暂空
//  权限：看资料页时发一次 PEX_PermQuery（60s 缓存 + 8s 重试），实时回复优先、
//       对方公告快照兜底——不再受 OSS 同步延迟影响
//  打开：点击按钮 → 有缓存直接开；无缓存先索取副本（PermReply 到了才开），
//       6 秒超时提示"对方未安装 PEX 或未响应"（杜绝空白编辑器）
//  访问通知：打开编辑面板时通知对方 PEX_Access（15 秒节流）→ 对方播报"XXX 查看了你的 PEX 设置"
// ════════════════════════════════════════

import { CONFIG, ES_KEY, MOD_VER } from '../core/config.js';
import { getModApi } from '../core/config.js';
import { pexSendHidden, pexOnMessage } from '../core/net.js';
import { saveSettings, publishSharedSettings } from '../core/storage.js';
import { printChat } from '../core/commands.js';
import { ui } from '../expansion/i18n.js';
import { pexLog, characterNicknameSafe } from '../util/util.js';

const BTN = { x: 1715, y: 175, w: 90, h: 90 };   // 资料页远程修改按钮
const PANEL_ID = 'pex-remote-panel';

// 可远程编辑的类别（特效/限制全部不给别人改——只留时间、自动回归、计时器可见性）
const CATS = [
    { key: 'time', label: '时间类' },
    { key: 'autoRevert', label: '凝胶自动回归' },
    { key: 'timerVisibility', label: '计时器可见性' },
];

// 我方对目标是否有某类权限（对方公告快照兜底——实时回复到达前先用它）
function _viewerCanEdit(info, mode) {
    if (mode === 'any') return true;
    if (mode === 'whitelist') {
        const wl = Array.isArray(info?.wl) ? info.wl.map(Number) : [];
        return wl.includes(Number(Player?.MemberNumber));
    }
    return false;
}
function _viewerPerms(info) {
    const em = info?.editModes || {};
    return {
        time: _viewerCanEdit(info, em.time),
        autoRevert: _viewerCanEdit(info, em.autoRevert),
        timerVisibility: _viewerCanEdit(info, em.timerVisibility),
    };
}
function _canEditAny(perms) {
    return !!(perms && (perms.time || perms.autoRevert || perms.timerVisibility));
}

// ── 权限实时协议──
// 看资料页时确保一次权限：有效缓存（60s）不查；查询在途（8s）不重发
const _permCache = {};      // memberNum → { perms, values, ts }
const _permQueryTs = {};    // memberNum → 上次查询时间
const PERM_TTL = 60000;
const PERM_RETRY = 8000;

function _ensurePerm(num) {
    const n = Number(num);
    const now = Date.now();
    const pc = _permCache[n];
    if (pc && now - pc.ts < PERM_TTL) return;
    if (_permQueryTs[n] && now - _permQueryTs[n] < PERM_RETRY) return;
    _permQueryTs[n] = now;
    pexSendHidden('PEX_PermQuery', [{ Tag: 'PEX_PermQuery', Target: n }]);
}

// 我对 C 的权限：实时回复缓存优先（60s），否则公告快照兜底
function _permFor(C, info) {
    const pc = _permCache[C?.MemberNumber];
    if (pc && Date.now() - pc.ts < PERM_TTL) return pc;
    return { perms: _viewerPerms(info), values: null, ts: Date.now() };
}

function targetInfo(C) {
    try {
        return C?.OnlineSharedSettings?.[ES_KEY] || null;
    } catch (e) { return null; }
}

// 资料页当前查看的角色（InformationSheetSelection 才是资料页目标，
// CurrentCharacter 在资料页可能读不到 → 按钮会整个不显示）
function _sheetChar() {
    try { return (typeof InformationSheetSelection !== 'undefined') ? InformationSheetSelection : null; }
    catch (e) { return null; }
}

// ── 远程面板状态 ──
const R = {
    open: false,
    target: null,       // 目标角色
    perms: {},          // catKey -> bool
    values: {},         // catKey -> 值
    dirty: false,
};

function showPanel() {
    let el = document.getElementById(PANEL_ID);
    if (!el) {
        el = document.createElement('div');
        el.id = PANEL_ID;
        Object.assign(el.style, {
            position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
            width: '380px',
            background: '#1e1930', border: '2px solid #f27ba8', borderRadius: '12px',
            color: '#e8e4f5', fontFamily: 'sans-serif', fontSize: '13px',
            padding: '16px', zIndex: '2147483646', boxShadow: '0 8px 40px rgba(0,0,0,.6)',
            maxHeight: '80vh', overflowY: 'auto',
        });
        document.body.appendChild(el);
    }
    el.style.display = 'block';
    R.open = true;   // 必须置位：退出资料页检测（InformationSheetExit 的 if (R.open)）依赖它
    renderPanel(el);
}

function hidePanel() {
    const el = document.getElementById(PANEL_ID);
    if (el) el.style.display = 'none';
    R.open = false;
}

function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderPanel(el) {
    const targetName = R.target ? (characterNicknameSafe(R.target) || '对方') : '对方';
    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <b style="color:#f27ba8">编辑 ${esc(targetName)} 的 PEX 设置</b>
        <button id="pex-remote-close" style="background:#3a2a4a;color:#e8e4f5;border:none;border-radius:6px;padding:4px 10px;cursor:pointer">✕</button>
    </div>`;

    const field = (catKey, label, control) => {
        const editable = !!R.perms[catKey];
        html += `<div style="margin:8px 0;opacity:${editable ? 1 : 0.45}">
            <div style="color:#9b93bd;margin-bottom:4px">${label}${editable ? '' : ' 🔒'}</div>${control}</div>`;
    };

    // 时间类
    field('time', '排出前等待（秒，0~600）',
        `<input id="pex-r-wait" type="number" min="0" max="600" value="${esc(R.values.waitSeconds)}" ${R.perms.time ? '' : 'disabled'}
         style="width:100%;background:#241d3a;color:#e8e4f5;border:1px solid #37305a;border-radius:6px;padding:6px">`);
    field('time', '阻挡等待上限（分钟，1~30）',
        `<input id="pex-r-blocked" type="number" min="1" max="30" value="${esc(R.values.blockedWaitMinutes)}" ${R.perms.time ? '' : 'disabled'}
         style="width:100%;background:#241d3a;color:#e8e4f5;border:1px solid #37305a;border-radius:6px;padding:6px">`);
    field('time', '凝胶自动回归（分钟，1~30）',
        `<input id="pex-r-autorev" type="number" min="1" max="30" value="${esc(R.values.autoRevertMinutes)}" ${R.perms.time ? '' : 'disabled'}
         style="width:100%;background:#241d3a;color:#e8e4f5;border:1px solid #37305a;border-radius:6px;padding:6px">`);
    // 视野 → 计时器可见性（特效不给别人改）
    field('timerVisibility', '计时器可见性',
        `<select id="pex-r-vis" ${R.perms.timerVisibility ? '' : 'disabled'}
         style="width:100%;background:#2a6b63;color:#fff;border:1px solid #37305a;border-radius:6px;padding:6px">
         <option value="self" ${R.values.timerVisibility === 'self' ? 'selected' : ''}>仅自己</option>
         <option value="whitelist" ${R.values.timerVisibility === 'whitelist' ? 'selected' : ''}>仅白名单</option>
         <option value="others" ${R.values.timerVisibility === 'others' ? 'selected' : ''}>仅他人</option>
         <option value="all" ${(R.values.timerVisibility || 'all') === 'all' ? 'selected' : ''}>所有人</option></select>`);
    // 自动回归开关
    field('autoRevert', '自动回归开关',
        `<select id="pex-r-ar" ${R.perms.autoRevert ? '' : 'disabled'}
         style="width:100%;background:#2a6b63;color:#fff;border:1px solid #37305a;border-radius:6px;padding:6px">
         <option value="1" ${R.values.autoRevertEnabled ? 'selected' : ''}>开启</option>
         <option value="0" ${R.values.autoRevertEnabled ? '' : 'selected'}>关闭</option></select>`);

    const editable = Object.values(R.perms).some(Boolean);
    html += `<div style="display:flex;gap:8px;margin-top:14px">
        <button id="pex-remote-save" style="flex:1;background:${editable ? '#2a6b63' : '#3a2a4a'};color:#fff;border:none;border-radius:8px;padding:8px;cursor:${editable ? 'pointer' : 'not-allowed'}" ${editable ? '' : 'disabled'}>保存</button>
        <button id="pex-remote-refresh" style="flex:1;background:#3a2a4a;color:#e8e4f5;border:none;border-radius:8px;padding:8px;cursor:pointer">刷新</button>
    </div>`;
    html += `<div style="color:#9b93bd;font-size:11px;margin-top:8px">仅可编辑有权限的类别（🔒=无权限）</div>`;

    el.innerHTML = html;
    el.querySelector('#pex-remote-close').onclick = () => hidePanel();
    el.querySelector('#pex-remote-refresh').onclick = () => {
        if (!R.target) return;
        // 刷新：清缓存强制重查，回复到了自动更新面板
        const n = Number(R.target.MemberNumber);
        delete _permCache[n];
        delete _permQueryTs[n];
        _ensurePerm(n);
        printChat('正在刷新权限与设置…', 3000);
    };
    const saveBtn = el.querySelector('#pex-remote-save');
    if (saveBtn) saveBtn.onclick = () => sendRemoteSet();
}

// ── 打开流程：点击按钮 → 先确保拿到对方副本（PermReply）再开面板 ──
const _accessNotifyTs = {};   // memberNum → 上次访问通知时间（15 秒节流）
let _pendingOpen = null;      // { num, C }：等待回复后要打开的编辑器
let _pendingTimer = null;

function openRemoteSettings(C) {
    const num = Number(C?.MemberNumber);
    if (num == null) return;
    const pc = _permCache[num];
    if (pc && Date.now() - pc.ts < PERM_TTL) { _doOpenRemoteSettings(C); return; }   // 有副本 → 直接开
    // 没副本 → 主动索取，等回复（或超时提示）后再开——杜绝空白编辑器
    _pendingOpen = { num, C };
    _permQueryTs[num] = Date.now();
    pexSendHidden('PEX_PermQuery', [{ Tag: 'PEX_PermQuery', Target: num }], { priority: true });
    const name = characterNicknameSafe(C) || String(num);
    printChat(ui('remoteEditLoading', { name }), 4000);
    if (_pendingTimer) clearTimeout(_pendingTimer);
    _pendingTimer = setTimeout(() => {
        _pendingTimer = null;
        if (_pendingOpen && _pendingOpen.num === num) {
            _pendingOpen = null;
            printChat(ui('remoteEditLoadFail', { name }), 8000);   // 对方没回（没装 PEX/离线）→ 提示重试
        }
    }, 6000);
}

// 副本到手后真正打开：访问通知（15 秒节流）+ 渲染面板
function _doOpenRemoteSettings(C) {
    const num = C.MemberNumber, now = Date.now();
    if (num != null && (!_accessNotifyTs[num] || now - _accessNotifyTs[num] > 15000)) {
        _accessNotifyTs[num] = now;
        pexSendHidden('PEX_Access', [{
            Tag: 'PEX_Access', Target: num,
            Name: String(characterNicknameSafe(Player) || Player?.MemberNumber || ''),
        }], { dedupeKey: 'access:' + num, dedupeMs: 15000 });
    }
    R.target = C;
    const pc = _permCache[num];
    R.perms = pc ? pc.perms : _viewerPerms(targetInfo(C));
    R.values = (pc && pc.values) ? pc.values : {};
    showPanel();
}

// 发送保存
function sendRemoteSet() {
    const el = document.getElementById(PANEL_ID);
    if (!el || !R.target) return;
    const gv = (id) => { try { return el.querySelector(id)?.value; } catch (e) { return undefined; } };
    const values = {
        waitSeconds: gv('#pex-r-wait') !== undefined ? parseInt(gv('#pex-r-wait'), 10) : undefined,
        blockedWaitMinutes: gv('#pex-r-blocked') !== undefined ? parseInt(gv('#pex-r-blocked'), 10) : undefined,
        autoRevertMinutes: gv('#pex-r-autorev') !== undefined ? parseInt(gv('#pex-r-autorev'), 10) : undefined,
        timerVisibility: gv('#pex-r-vis'),
        autoRevertEnabled: gv('#pex-r-ar') === '1',
    };
    // 只发有权限的类别
    const payload = {};
    for (const cat of CATS) {
        if (R.perms[cat.key]) {
            if (cat.key === 'time') {
                if (values.waitSeconds != null) payload.waitSeconds = clamp(values.waitSeconds, 0, 600);
                if (values.blockedWaitMinutes != null) payload.blockedWaitMinutes = clamp(values.blockedWaitMinutes, 1, 30);
                if (values.autoRevertMinutes != null) payload.autoRevertMinutes = clamp(values.autoRevertMinutes, 1, 30);
            } else if (cat.key === 'timerVisibility') {
                if (['self', 'whitelist', 'others', 'all'].includes(values.timerVisibility)) payload.timerVisibility = values.timerVisibility;
            } else if (cat.key === 'autoRevert') payload.autoRevertEnabled = !!values.autoRevertEnabled;
        }
    }
    if (Object.keys(payload).length === 0) return;
    pexSendHidden('PEX_RemoteSet', [
        { Tag: 'PEX_RemoteSet', Target: String(R.target?.MemberNumber), Values: payload },
    ]);
    printChat('已发送设置修改请求，等待对方确认…', 6000);
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

// ── 我方接收端（服务器）：应答权限查询 / 应用远程修改 ──
function registerRemoteServer() {
    pexOnMessage((data) => {
        try {
            if (data?.Type !== 'Hidden') return;
            const dict = Array.isArray(data.Dictionary) ? data.Dictionary : [];
            // 兼容两种字典格式：{Tag:'字段名',Value:值} 与消息条目属性直存
            //（{Tag:'PEX_PermQuery', Target:n, ...}——Tag 是消息名、其余键是属性）
            const get = (tag) => {
                const e = dict.find(x => x?.Tag === tag);
                if (e) return e.Value ?? e.Name;
                for (const x of dict) {
                    if (x && typeof x === 'object' && x.Tag && tag in x) return x[tag];
                }
                return undefined;
            };
            const sender = Number(data.Sender);
            const myPerm = (catKey) => {
                const m = (CONFIG.editModes || {})[catKey] || 'off';
                if (m === 'any') return true;
                if (m === 'whitelist') {
                    const wl = (CONFIG.whitelist || []).map(String);
                    return wl.includes(String(sender));
                }
                return false;
            };

            if (data.Content === 'PEX_PermQuery' && Number(get('Target')) === Player?.MemberNumber) {
                const perms = {};
                CATS.forEach(c => { perms[c.key] = myPerm(c.key); });
                pexSendHidden('PEX_PermReply', [{
                    Tag: 'PEX_PermReply', Target: String(sender),
                    Perms: perms,
                    Values: {
                        waitSeconds: CONFIG.waitSeconds, blockedWaitMinutes: CONFIG.blockedWaitMinutes,
                        autoRevertMinutes: CONFIG.autoRevertMinutes, autoRevertEnabled: CONFIG.autoRevertEnabled,
                        timerVisibility: CONFIG.timerVisibility,
                    },
                }], { priority: true, dedupeKey: 'permr:' + sender, dedupeMs: 500 });
            } else if (data.Content === 'PEX_RemoteSet' && Number(get('Target')) === Player?.MemberNumber) {
                const values = get('Values') || {};
                // 逐项校验权限
                if (myPerm('time')) {
                    if (values.waitSeconds != null) CONFIG.waitSeconds = clamp(+values.waitSeconds, 0, 600);
                    if (values.blockedWaitMinutes != null) CONFIG.blockedWaitMinutes = clamp(+values.blockedWaitMinutes, 1, 30);
                    if (values.autoRevertMinutes != null) CONFIG.autoRevertMinutes = clamp(+values.autoRevertMinutes, 1, 30);
                }
                if (myPerm('timerVisibility') && ['self', 'whitelist', 'others', 'all'].includes(values.timerVisibility)) {
                    CONFIG.timerVisibility = values.timerVisibility;
                }
                if (myPerm('autoRevert') && values.autoRevertEnabled !== undefined) {
                    CONFIG.autoRevertEnabled = !!values.autoRevertEnabled;
                }
                saveSettings(true);
                publishSharedSettings(true);
                pexSendHidden('PEX_RemoteAck', [{ Tag: 'PEX_RemoteAck', Target: String(sender) }]);
                // 应用播报
                const who = characterNicknameSafe(sender) || String(sender);
                printChat(ui('editedYourPEX', { who }), 8000);
            }
        } catch (e) {
            pexLog('远程协议异常:', e.message);
        }
    });
}

// 接收应答（我方作为查看者）
function registerRemoteClient() {
    pexOnMessage((data) => {
        try {
            if (data?.Type !== 'Hidden') return;
            const dict = Array.isArray(data.Dictionary) ? data.Dictionary : [];
            // 兼容两种字典格式（与 registerRemoteServer 相同）
            const get = (tag) => {
                const e = dict.find(x => x?.Tag === tag);
                if (e) return e.Value ?? e.Name;
                for (const x of dict) {
                    if (x && typeof x === 'object' && x.Tag && tag in x) return x[tag];
                }
                return undefined;
            };
            if (data.Content === 'PEX_PermReply' && Number(get('Target')) === Player?.MemberNumber) {
                const sender = Number(data.Sender);
                // 缓存实时权限与当前值（60s 有效）——按钮/面板都用它，不再受 OSS 同步延迟影响
                _permCache[sender] = {
                    perms: get('Perms') || {},
                    values: get('Values') || {},
                    ts: Date.now(),
                };
                // 有待打开的编辑器且正是此人 → 副本到手，打开（用户可能已离开该资料页 → 只缓存备用）
                if (_pendingOpen && _pendingOpen.num === sender) {
                    const C = _pendingOpen.C;
                    _pendingOpen = null;
                    if (_pendingTimer) { clearTimeout(_pendingTimer); _pendingTimer = null; }
                    let stillThere = false;
                    try {
                        stillThere = (typeof CurrentScreen !== 'undefined' && CurrentScreen === 'InformationSheet')
                            && (typeof InformationSheetSelection !== 'undefined' && InformationSheetSelection
                                && Number(InformationSheetSelection.MemberNumber) === sender);
                    } catch (e) {}
                    if (stillThere) _doOpenRemoteSettings(C);
                } else if (R.open && R.target?.MemberNumber === sender) {
                    // 面板已开（刷新）→ 直接更新
                    const pc = _permCache[sender];
                    R.perms = pc.perms;
                    R.values = pc.values;
                    const el = document.getElementById(PANEL_ID);
                    if (el) renderPanel(el);
                }
            } else if (data.Content === 'PEX_Access' && Number(get('Target')) === Player?.MemberNumber) {
                // 有人打开我的 PEX 编辑面板 → 播报（8 秒后消失）
                const who = get('Name')
                    || (() => { try { return ChatRoomCharacter?.find(c => c.MemberNumber === Number(data.Sender))?.Nickname; } catch (e) { return null; } })()
                    || data.Sender;
                printChat(ui('accessedYourPEX', { who }), 8000);
            } else if (data.Content === 'PEX_RemoteAck' && Number(get('Target')) === Player?.MemberNumber) {
                printChat('对方已应用你的设置修改。', 6000);
            }
        } catch (e) {}
    });
}

// ── 资料页按钮 ──
export function registerRemoteEdit() {
    const modApi = getModApi();
    if (!modApi) return;

    registerRemoteServer();
    registerRemoteClient();

    // 资料页按钮：对方装了 PEX 就显示按钮——
    //   看资料页时确保权限实时（_ensurePerm：60s 缓存/8s 重试），实时回复优先、公告兜底
    modApi.hookFunction('InformationSheetRun', 5, (args, next) => {
        const result = next(args);
        try {
            const C = _sheetChar();
            // 面板开着但查看对象变了（切人）→ 自动关闭
            if (R.open && R.target && C && C.MemberNumber !== R.target.MemberNumber) hidePanel();
            const info = C && C.MemberNumber !== Player?.MemberNumber ? targetInfo(C) : null;
            if (!info) return result;   // 对方没装 PEX（无公告）→ 不显示
            _ensurePerm(C.MemberNumber);   // 换人/过期时自动重查（有缓存不重发）
            const pc = _permFor(C, info);
            const canEdit = _canEditAny(pc.perms);
            const tip = canEdit ? ui('profileEditBtn')
                : (info.edit ? ui('profileEditNoPerm') : ui('profileEditOff'));
            // 图标暂时用 REX 字母占位（按钮框照常显示）
            DrawButton(BTN.x, BTN.y, BTN.w, BTN.h, 'REX', 'White', '', tip, !canEdit);
        } catch (e) {}
        return result;
    });

    modApi.hookFunction('InformationSheetClick', 5, (args, next) => {
        try {
            const C = _sheetChar();
            const info = C && C.MemberNumber !== Player?.MemberNumber ? targetInfo(C) : null;
            if (info && MouseIn(BTN.x, BTN.y, BTN.w, BTN.h)) {
                openRemoteSettings(C);   // 有副本直接开；无副本索取后开（6 秒超时提示）
                return;   // 吃掉点击（无论权限）
            }
        } catch (e) {}
        return next(args);
    });

    modApi.hookFunction('InformationSheetExit', 5, (args, next) => {
        if (R.open) hidePanel();
        return next(args);
    });
}
