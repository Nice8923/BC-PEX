// ════════════════════════════════════════
//  PEX 存储层（三层方案）
//  - Player.ExtensionSettings.PEX   ← 设置本体（LZString 压缩，跟账号同步）
//  - localStorage 备份               ← 账号数据丢失时自动还原补回
//  - Player.OnlineSharedSettings.PEX ← 对外公告（版本/状态/权限）
//  抗断连：时间戳取新 + 载入前禁存 + 存前校验 + unload flush
// ════════════════════════════════════════

import { CONFIG, ES_KEY, ES_BUDGET, MOD_VER, makeDefaultConfig, setConfig } from './config.js';
import { ui } from '../expansion/i18n.js';
import { pexSendHidden } from './net.js';
import { MODE } from '../gameplay/state.js';

// 深合并：以 defaults 为底，用 saved 覆盖（数组直接替换）
export function mergeDefaults(defaults, saved) {
    if (Array.isArray(defaults)) return Array.isArray(saved) ? saved : defaults;
    if (defaults && typeof defaults === 'object') {
        const out = {};
        for (const k of Object.keys(defaults)) {
            out[k] = (saved && k in saved) ? mergeDefaults(defaults[k], saved[k]) : defaults[k];
        }
        return out;
    }
    return saved === undefined ? defaults : saved;
}

// 只序列化需要持久化的字段（音效本地 bytes 不进 ES）
export function serializeConfig() {
    const c = CONFIG;
    return {
        v: 1,
        enabled: c.enabled,
        keywords: c.keywords,
        normalKeywords: c.normalKeywords,
        waitSeconds: c.waitSeconds,
        blockedWaitMinutes: c.blockedWaitMinutes,
        autoRevertEnabled: c.autoRevertEnabled,
        autoRevertMinutes: c.autoRevertMinutes,
        gelExpireMode: c.gelExpireMode,
        normalExpressionSeconds: c.normalExpressionSeconds,
        effectLevel: c.effectLevel,
        viewMode: c.viewMode,          // 暗角模式（固定 surround，保留兼容旧存档）
        blindLevel: c.blindLevel,
        timerVisibility: c.timerVisibility,
        fxDizzy: c.fxDizzy,
        fxBlank: c.fxBlank,
        fxBlur: c.fxBlur,
        fxShake: c.fxShake,
        restrictions: c.restrictions,
        seeRemoteAnims: c.seeRemoteAnims,
        expressions: c.expressions,
        normalExpression: c.normalExpression,
        gelLayer: c.gelLayer,
        editModes: c.editModes,
        whitelist: c.whitelist,
        // sounds 不存进 ExtensionSettings（账号隔离），改存 localStorage
    };
}

// 音效设置存 localStorage（同浏览器跨账号共用）
// 新结构 { sounds: {...}, soundOn: {...} }；旧结构直接是 sounds 对象（兼容读）
const SND_LS_KEY = 'PEX_sounds';
export function loadSounds() {
    try {
        const raw = localStorage.getItem(SND_LS_KEY);
        const def = makeDefaultConfig().sounds;
        if (raw) {
            const s = JSON.parse(raw);
            const savedSounds = (s && typeof s === 'object' && !Array.isArray(s) && 'sounds' in s) ? s.sounds : s;
            // 旧存档迁移：饮下音效 drink 的 URL 并入等待音效 wait
            const oldDrink = Array.isArray(savedSounds?.drink) ? savedSounds.drink : [];
            // 每类音效：只有显式填了非空列表才用自定义，空/缺失回默认（CDN）——
            // 想关某类音效请用旁边的开关，旧存档的空数组不再吞掉默认音效
            const merged = { wait: [], excrete: [], feed: [] };
            for (const k of ['wait', 'excrete', 'feed']) {
                const saved = savedSounds?.[k];
                merged[k] = (Array.isArray(saved) && saved.length > 0) ? saved.slice() : def[k].slice();
            }
            if (oldDrink.length) merged.wait = oldDrink.concat(merged.wait);
            CONFIG.sounds = merged;
            if (s && typeof s.soundOn === 'object' && s.soundOn) {
                CONFIG.soundOn = Object.assign({}, makeDefaultConfig().soundOn, s.soundOn);
            }
        } else {
            // 无本地音效存档 → 用默认（5 段等待 CDN + 排出 + 放回）
            CONFIG.sounds = {
                wait: def.wait.slice(),
                excrete: def.excrete.slice(),
                feed: def.feed.slice(),
            };
            CONFIG.soundOn = makeDefaultConfig().soundOn;
        }
    } catch (e) {}
}
export function saveSounds() {
    try { localStorage.setItem(SND_LS_KEY, JSON.stringify({ sounds: CONFIG.sounds, soundOn: CONFIG.soundOn })); } catch (e) {}
}

// 本地备份键：按账号分开
function backupKey() {
    try {
        const id = (Player?.MemberNumber || Player?.AccountName) || 'anon';
        return 'PEX_settings_backup_' + id;
    } catch (e) { return 'PEX_settings_backup_anon'; }
}

// 载入完成前禁止存档（防止默认值覆盖账号真数据）
let _settingsLoaded = false;

// 解析压缩串为对象（失败回 null）
function decodeSaved(raw) {
    try {
        if (!raw) return null;
        const json = LZString.decompressFromBase64(raw);
        return json ? JSON.parse(json) : null;
    } catch (e) { return null; }
}

function applySaved(saved) {
    setConfig(mergeDefaults(makeDefaultConfig(), saved));
}

// 等待 ExtensionSettings 由服务器载入（最多 ~15 秒）
export function waitForExtensionSettings(timeout = 15000) {
    const start = Date.now();
    return new Promise(resolve => {
        const check = () => {
            try {
                if (Player && Player.ExtensionSettings !== undefined) resolve(true);
                else if (Date.now() - start > timeout) resolve(false);
                else setTimeout(check, 200);
            } catch (e) { resolve(false); }
        };
        check();
    });
}

// 载入设置：账号 vs 本地备份按时间戳取新，账号丢失则用备份并补回
export function loadSettings() {
    let esRaw = null, bkRaw = null;
    try { esRaw = Player?.ExtensionSettings?.[ES_KEY] ?? null; } catch (e) {}
    try { bkRaw = localStorage.getItem(backupKey()); } catch (e) {}
    const esSaved = decodeSaved(esRaw);
    const bkSaved = decodeSaved(bkRaw);
    const esTs = (esSaved && +esSaved.ts) || 0;
    const bkTs = (bkSaved && +bkSaved.ts) || 0;

    let saved = null, rawUsed = null, restoreToAccount = false;
    if (esSaved && esTs >= bkTs) { saved = esSaved; rawUsed = esRaw; }
    else if (bkSaved) { saved = bkSaved; rawUsed = bkRaw; restoreToAccount = esTs < bkTs; }
    else if (esSaved) { saved = esSaved; rawUsed = esRaw; }

    let loaded = false;
    if (saved) { try { applySaved(saved); loaded = true; } catch (e) { pexWarnSafe(e); } }
    if (!loaded) setConfig(makeDefaultConfig());
    // 旧存档迁移：计时器可见性旧值 'both'（都可见）→ 新四档 'all'
    if (CONFIG.timerVisibility === 'both') CONFIG.timerVisibility = 'all';
    // 旧存档迁移：expressions 旧数组 [等待1,等待2,排出,失神] → 新结构 { wait:[...], excrete, blank }
    if (Array.isArray(CONFIG.expressions)) {
        const oldArr = CONFIG.expressions;
        const def = makeDefaultConfig().expressions;
        CONFIG.expressions = {
            wait: [oldArr[0], oldArr[1]].filter(Boolean).map(e => ({ ...e })),
            excrete: oldArr[2] ? { ...oldArr[2] } : def.excrete,
            blank: (oldArr[3] || oldArr[0]) ? { ...(oldArr[3] || oldArr[0]) } : def.blank,
        };
    }
    _settingsLoaded = true;
    loadSounds();

    // 账号与备份同步为较新的那份
    if (loaded && rawUsed) {
        try { localStorage.setItem(backupKey(), rawUsed); } catch (e) {}
        if (restoreToAccount) {
            try {
                if (!Player.ExtensionSettings) Player.ExtensionSettings = {};
                Player.ExtensionSettings[ES_KEY] = rawUsed;
                if (typeof ServerPlayerExtensionSettingsSync === 'function') ServerPlayerExtensionSettingsSync(ES_KEY);
                console.log('⚗️[PEX] 账号数据落后/丢失，已从本地备份还原并补回账号');
            } catch (e) {}
        }
    }
}

let _saveTimer = null;
// 页面关闭/刷新：防抖还没触发也要强制保存（否则"改动即保存"的 600ms 防抖
// 会在用户改完立刻刷新时丢失）——立即 doSave + 立即 flush 发送队列
function flushSaveOnPageHide() {
    try {
        if (_saveTimer) {
            clearTimeout(_saveTimer);
            _saveTimer = null;
        }
        if (_settingsLoaded && Player) {
            // 立即执行保存（同步写 ExtensionSettings + 本地备份 + 触发同步）
            if (!Player.ExtensionSettings) Player.ExtensionSettings = {};
            const cfg = serializeConfig();
            cfg.ts = Date.now();
            const raw = JSON.stringify(cfg);
            const compressed = LZString.compressToBase64(raw);
            Player.ExtensionSettings[ES_KEY] = compressed;
            try { localStorage.setItem(backupKey(), compressed); } catch (e) {}
            saveSounds();
            try {
                if (typeof ServerPlayerExtensionSettingsSync === 'function') ServerPlayerExtensionSettingsSync(ES_KEY);
            } catch (e) {}
            // 立即处理发送队列（限速队列里能发的马上发出去，防止页面关闭丢消息）
            try { if (typeof ServerSendQueueProcess === 'function') ServerSendQueueProcess(); } catch (e) {}
        }
    } catch (e) {}
}
if (typeof window !== 'undefined' && !window._pexSaveFlush) {
    window._pexSaveFlush = flushSaveOnPageHide;
    window.addEventListener('pagehide', flushSaveOnPageHide);
    window.addEventListener('beforeunload', flushSaveOnPageHide);
}

// 保存设置（immediate=true 立即存；否则 600ms 防抖）
export function saveSettings(immediate = false) {
    if (!_settingsLoaded) return;
    const doSave = () => {
        try {
            if (!_settingsLoaded || !Player) return;
            if (!Player.ExtensionSettings) Player.ExtensionSettings = {};
            const cfg = serializeConfig();
            cfg.ts = Date.now();
            const raw = JSON.stringify(cfg);
            const compressed = LZString.compressToBase64(raw);
            // 存前校验：压缩→解压→比对，坏了不写
            const check = decodeSaved(compressed);
            if (!check || typeof check !== 'object') { console.warn('⚗️[PEX] 存档校验失败，跳过本次写入'); return; }
            // 服务器 ExtensionSettings 有大小上限（约 5KB base64）：超限明确提示，避免"保存了但没保存"
            if (compressed.length > ES_BUDGET) {
                console.warn('⚗️[PEX] 设置过大（' + compressed.length + ' 字节 > ' + ES_BUDGET + '），服务器可能拒收：请减少表情/关键词/音效');
            }
            Player.ExtensionSettings[ES_KEY] = compressed;
            if (typeof ServerPlayerExtensionSettingsSync === 'function') {
                ServerPlayerExtensionSettingsSync(ES_KEY);
            }
            try { localStorage.setItem(backupKey(), compressed); } catch (e) {}
            saveSounds();
        } catch (e) {
            console.warn('⚗️[PEX] 保存失败:', e.message);
        }
    };
    if (immediate) { if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; } doSave(); return; }
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => { _saveTimer = null; doSave(); }, 600);
}

// ── 对外公告（OnlineSharedSettings）：版本 + 状态 + 权限 ──

// 公告运行时状态（等待/阻挡/排出/失神/凝胶易主）。
// ⚠️ 只在【状态转换】时调用 —— 没有倒数心跳。
//   剩余秒数由收端用 expiresAt 本地推算（ui/timer.js），重播倒数是纯浪费：
//   旧版每 5 秒送一次，一轮 15 分钟的失神光心跳就是 360 个封包，而收端根本没读 remainingSec。
// 双通道，同一份 payload（payload 才 100 多字节，比"发个空 ping 叫大家重读 OSS"划算：
//   ping 一定比 OSS 早到，早到的时候重读只会读到旧值）：
//   1. OnlineSharedSettings —— 持久。晚进房的人在 ChatRoomSync 拿全房角色资料时免费带到。
//      不加 Force：让 BC 自己的 2 秒窗口合并连续变化（Server.js:126），Force=true 等于
//      主动关掉 BC 已经做好的合并
//   2. Hidden PEX_StateSync —— 即时。服务器扇出 OSS 有延迟，房内的人靠这条立刻看到
// seq：单调时间戳，收端用它挡"旧的盖新的"（见 gameplay/state.js）
export function publishState(payload) {
    try {
        if (!Player || !Player.OnlineSharedSettings) return;
        if (!Player.OnlineSharedSettings[ES_KEY]) Player.OnlineSharedSettings[ES_KEY] = {};
        const pub = Object.assign({ mode: MODE.IDLE }, payload || null);
        pub.seq = Date.now();
        // 附上计时器可见性：别人画我的倒计时时读这个（对方设"仅自己"→ 别人不画）
        if (pub.timerVisibility === undefined) pub.timerVisibility = CONFIG.timerVisibility || 'all';
        Player.OnlineSharedSettings[ES_KEY].state = pub;
        if (typeof ServerAccountUpdate?.QueueData === 'function') {
            ServerAccountUpdate.QueueData({ OnlineSharedSettings: Player.OnlineSharedSettings });
        }
        try {
            pexSendHidden('PEX_StateSync', [{ Tag: 'Payload', Value: JSON.stringify(pub) }]);
        } catch (e) {}
    } catch (e) {}
}

// 公告权限与版本（进房/改权限时调用）
// 防抖：连续调用合并为一次（曾经被每帧调用 → 每秒几十条 AccountUpdate 刷爆发送队列）
// 实时通道：Hidden 广播 PEX_SharedSync —— 别人立刻读到新的权限（资料页按钮的可见性
//   依赖它；OnlineSharedSettings 房间同步有延迟，不广播的话别人永远看到旧权限）
let _pubSharedTimer = null;
export function publishSharedSettings(immediate = false) {
    const doPub = () => {
        try {
            if (!Player || !Player.OnlineSharedSettings) return;
            const em = CONFIG.editModes || {};
            const on = m => m === 'any' || m === 'whitelist';
            const categories = ['time', 'autoRevert', 'timerVisibility'];
            const anyEditable = categories.some(k => on(em[k]));
            const prevState = Player.OnlineSharedSettings[ES_KEY]?.state;
            Player.OnlineSharedSettings[ES_KEY] = {
                v: MOD_VER,
                state: prevState || null,
                edit: anyEditable,
                editModes: { time: em.time || 'off', autoRevert: em.autoRevert || 'off', timerVisibility: em.timerVisibility || 'off' },
                // 无条件广播白名单：计时器"仅白名单可见"档需要读它（只在有 whitelist 权限模式才广播的话拿不到）
                wl: Array.from(CONFIG.whitelist || []),
            };
            // 不加 Force：连续改设置由 BC 的 2 秒窗口合并成一发
            if (typeof ServerAccountUpdate?.QueueData === 'function') {
                ServerAccountUpdate.QueueData({ OnlineSharedSettings: Player.OnlineSharedSettings });
            }
            try {
                pexSendHidden('PEX_SharedSync', [{
                    Tag: 'Payload',
                    Value: JSON.stringify({
                        edit: anyEditable,
                        editModes: { time: em.time || 'off', autoRevert: em.autoRevert || 'off', timerVisibility: em.timerVisibility || 'off' },
                        wl: Array.from(CONFIG.whitelist || []),
                    }),
                }], { dedupeKey: 'shared', dedupeMs: 3000 });
            } catch (e) {}
        } catch (e) {}
    };
    if (immediate) {
        if (_pubSharedTimer) { clearTimeout(_pubSharedTimer); _pubSharedTimer = null; }
        doPub();
        return;
    }
    if (_pubSharedTimer) clearTimeout(_pubSharedTimer);
    _pubSharedTimer = setTimeout(() => { _pubSharedTimer = null; doPub(); }, 2000);
}

// ── 导入/导出 ──
export function exportSettings() {
    try {
        const data = { plugin: 'PEX', v: MOD_VER, pex: serializeConfig() };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'PEX-settings.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { console.warn('⚗️[PEX] 导出失败:', e.message); }
}

export function importSettings() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
            try {
                const data = JSON.parse(String(r.result));
                const saved = data.pex || data;
                setConfig(mergeDefaults(makeDefaultConfig(), saved));
                saveSettings(true);
                publishSharedSettings(true);
                console.log('⚗️[PEX] 设置导入完成');
            } catch (e) { console.warn('⚗️[PEX] 导入失败:', e.message); }
        };
        r.readAsText(f);
    };
    inp.click();
}

function pexWarnSafe(e) { try { console.warn('⚗️[PEX] 设置应用失败:', e.message); } catch (e2) {} }
