// ════════════════════════════════════════
//  PEX 通用工具
// ════════════════════════════════════════

import { CONFIG } from '../core/config.js';

// 专属日志前缀（样式独立）
// 同时写入环形缓冲 PEX_LOG（游戏内控制台面板 /pex show 显示最近日志）
export const PEX_LOG = [];
const LOG_MAX = 40;

function pushLog(args) {
    try {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const line = '[' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '] ' +
            args.map(a => typeof a === 'string' ? a : safeStringify(a)).join(' ');
        PEX_LOG.push(line);
        if (PEX_LOG.length > LOG_MAX) PEX_LOG.splice(0, PEX_LOG.length - LOG_MAX);
    } catch (e) {}
}
function safeStringify(a) {
    try { return JSON.stringify(a); } catch (e) { return String(a); }
}

export function pexLog(...args) {
    pushLog(args);
    console.log('⚗️[PEX]', ...args);
}
export function pexWarn(...args) {
    pushLog(args);
    console.warn('⚗️[PEX]', ...args);
}

// 大小写不敏感的子串搜索（关键词匹配用）
export function isPhraseInString(str, phrase) {
    if (!str || !phrase) return false;
    return String(str).toLowerCase().includes(String(phrase).toLowerCase());
}

// 安全取角色昵称（BC 的 CharacterNickname 未定义/报错时回退）
export function characterNicknameSafe(C, fallback = '') {
    try { return CharacterNickname(C); } catch (e) { return fallback; }
}

// CraftingDescription 解码（与 R130 客户端 Screens_Room_Crafting_Crafting.js 同款算法：
// 非 ASCII 描述会被 UTF16 双字节打包并加 \x00 标记；解码后才是可读文本）
function decodeCraftDescription(desc) {
    if (!desc || typeof desc !== 'string') return '';
    if (!desc.startsWith('\x00')) return desc;
    try {
        return Array.from(desc.slice(1, 200)).flatMap(ch => {
            const id = ch.charCodeAt(0);
            const bit1 = Math.floor(id / 256);
            const bit2 = id - bit1 * 256;
            return [bit1, bit2].filter(Boolean).map(i => String.fromCharCode(i));
        }).join('');
    } catch (e) { return ''; }
}

// 拼接物品的全部文本字段（关键词扫描的目标文本）
// 覆盖：制作名 / 制作描述(解码) / 雕刻描述 / 物品名 / 资产名与默认描述
export function itemNameAndDescription(item) {
    if (!item) return '';
    const parts = [];
    try {
        if (typeof item.Craft?.Name === 'string') parts.push(item.Craft.Name);
        if (typeof item.Craft?.Description === 'string') parts.push(decodeCraftDescription(item.Craft.Description));
        if (typeof item.Description === 'string') parts.push(item.Description);
        if (typeof item.Name === 'string') parts.push(item.Name);
        if (typeof item.Asset?.Name === 'string') parts.push(item.Asset.Name);
        if (typeof item.Asset?.Description === 'string') parts.push(item.Asset.Description);
    } catch (e) {}
    return parts.filter(Boolean).join(' ');
}

// ── 音效播放（Web Audio）──
// BC 原生 AudioPlaySoundEffect 只认内置音效表（AudioList 按名字查 → 拼 "Audio/xxx.mp3"），
// 传自定义 URL 永远查不到 → 直接不播——这就是 CDN 音效"没声音"的根因。
// 这里改走 Web Audio：fetch → decodeAudioData → BufferSource，带解码缓存与 raw 回退。
let _audioCtx = null;
const _audioCache = new Map();

function audioCtx() {
    try {
        if (!_audioCtx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            _audioCtx = new AC();
        }
        if (_audioCtx.state === 'suspended') { try { _audioCtx.resume(); } catch (e) {} }
        return _audioCtx;
    } catch (e) { return null; }
}

// CDN 地址 → raw.githubusercontent 回退地址（jsDelivr 抖动时兜底）
function toRawUrl(url) {
    try {
        const m = String(url).match(/^https:\/\/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^@]+)@([^/]+)\/(.+)$/);
        if (!m) return null;
        return 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] + '/' + m[3] + '/' + m[4];
    } catch (e) { return null; }
}

function playBuffer(decoded, volume) {
    try {
        const ctx = audioCtx();
        if (!ctx || !decoded) return false;
        const src = ctx.createBufferSource();
        src.buffer = decoded;
        const gain = ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1, volume || 1));
        src.connect(gain);
        gain.connect(ctx.destination);
        src.start();
        return true;
    } catch (e) { return false; }
}

// 直接播放指定 URL（远程音效/等待段用；不做类别开关检查——调用方已把关）
// volume：0~1；CDN 失败自动回退 raw
export function playUrl(url, volume = 1) {
    try {
        if (!url) return;
        const ctx = audioCtx();
        if (!ctx) {
            // Web Audio 不可用 → BC 原生兜底（虽然只认内置表，聊胜于无）
            if (typeof AudioPlaySoundEffect === 'function') AudioPlaySoundEffect(String(url));
            return;
        }
        const key = String(url);
        const cached = _audioCache.get(key);
        if (cached) { playBuffer(cached, volume); return; }
        const attempts = [key, toRawUrl(key)].filter(Boolean);
        let idx = 0;
        const tryFetch = () => {
            if (idx >= attempts.length) return;
            const u = attempts[idx++];
            fetch(u).then(r => {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.arrayBuffer();
            }).then(buf => ctx.decodeAudioData(buf)).then(decoded => {
                _audioCache.set(key, decoded);
                playBuffer(decoded, volume);
            }).catch(() => tryFetch());
        };
        tryFetch();
    } catch (e) {}
}

// 音量随特效强度（1→0.64 … 5→1.0）——强度不是摆设，音效也受影响（本地与远程播放共用）
export function soundVolumeFromEffectLevel() {
    const lv = Math.max(1, Math.min(5, CONFIG?.effectLevel || 3));
    return 0.55 + lv * 0.09;
}

// 播放音效（3 类：wait 等待 / excrete 排出 / feed 放回；素材在音效设置里填，多个随机）
// 音量随特效强度；返回实际播放的 URL（供广播用）；类别开关关闭或池空 → 返回 null
export function playSound(type) {
    try {
        if (CONFIG?.soundOn && CONFIG.soundOn[type] === false) return null;
        const list = CONFIG?.sounds?.[type];
        if (!Array.isArray(list) || list.length === 0) return null;
        const url = list[Math.floor(Math.random() * list.length)];
        if (url) playUrl(String(url), soundVolumeFromEffectLevel());
        return url || null;
    } catch (e) { return null; }
}
