// ════════════════════════════════════════
//  PEX 等待期音效 + 表情同步（v0.1.33）
//  - 段数 N = clamp(floor(waitSeconds/10), 1, 5)：
//      10 秒 1 段 / 20 秒 2 段 / 30 秒 3 段 / 40 秒 4 段 / 50 秒及以上 5 段
//  - 段位置 waitMs×k/(N+1)（k=1..N）——与旧表情 1/3、2/3 同一分布逻辑
//  - 每段同一时间点：音效随机抽一段 + 表情池随机抽一组（"一起出现"）
//  - PEX_Sound 广播（等待/排出/放回三类）+ 接收（其他玩家音效开关，默认关）
// ════════════════════════════════════════

import { CONFIG } from '../core/config.js';
import { pexSendHidden, pexOnMessage } from '../core/net.js';
import { pexLog, playUrl, soundVolumeFromEffectLevel } from '../util/util.js';
import { applyExpression } from './state-fx.js';

let _timers = [];   // 等待段定时器（取消/恢复时清理）

export function clearWaitFxTimers() {
    for (const t of _timers) clearTimeout(t);
    _timers = [];
}

// 段数：10 秒 1 段，每 10 秒 +1，封顶 5 段（0 秒不排程，由调用方判断）
export function waitSegmentCount(waitSec) {
    return Math.max(1, Math.min(5, Math.floor((waitSec || 0) / 10)));
}

// 段位置：waitMs×k/(N+1)，k=1..N（首段不在 0，末段不在结束点——避免盖过排出音效）
export function waitSegmentTimes(waitMs, n) {
    const out = [];
    for (let k = 1; k <= n; k++) out.push(waitMs * k / (n + 1));
    return out;
}

// 洗牌抽 n 个不重复（池不足时循环补充）
export function pickRandom(list, n) {
    if (!Array.isArray(list) || list.length === 0) return [];
    const pool = list.slice();
    const out = [];
    while (out.length < n) {
        if (!pool.length) pool.push(...list);   // 循环补充
        const i = Math.floor(Math.random() * pool.length);
        out.push(pool.splice(i, 1)[0]);
    }
    return out;
}

// 排程等待期音效+表情（startFlow 调用；isCurrent 在定时器触发时校验流程是否还活着）
export function scheduleWaitFx(isCurrent, waitMs) {
    clearWaitFxTimers();
    if (!(waitMs > 0)) return;
    const n = waitSegmentCount(waitMs / 1000);
    const times = waitSegmentTimes(waitMs, n);
    const sounds = pickRandom(CONFIG.sounds?.wait || [], n);      // 池 = 默认 CDN 5 段 + 自定义
    const exprs = pickRandom(CONFIG.expressions?.wait || [], n);  // 等待表情池随机
    if (!sounds.length && !exprs.length) return;
    times.forEach((at, i) => {
        _timers.push(setTimeout(() => {
            if (!isCurrent()) return;
            const snd = sounds[i];
            // 类别开关：关 = 本地不播也不广播（playUrl 本身不做开关检查）
            if (snd && CONFIG?.soundOn?.wait !== false) {
                playUrl(String(snd));
                broadcastSound('wait', snd);
            }
            const ex = exprs[i];
            if (ex) applyExpression(ex);
        }, at));
    });
}

// ── 广播音效（只含 URL；限速队列发送）──
export function broadcastSound(kind, url) {
    if (!url || !CONFIG?.soundOn || CONFIG.soundOn[kind] === false) return;
    try {
        pexSendHidden('PEX_Sound', [
            { Tag: 'Kind', Value: String(kind) },
            { Tag: 'Id', Value: String(url) },
        ]);
    } catch (e) {}
}

// 接收：其他玩家的音效（由 registerWaitFx 注册）
export function registerWaitFx() {
    pexOnMessage((data) => {
        try {
            if (data?.Type !== 'Hidden' || data.Content !== 'PEX_Sound') return;
            const sender = Number(data.Sender);
            if (!sender || sender === Player?.MemberNumber) return;   // 自己的消息不回播
            if (!CONFIG.hearRemoteSounds) return;                     // 开关默认关
            const dict = Array.isArray(data.Dictionary) ? data.Dictionary : [];
            const id = dict.find(x => x?.Tag === 'Id');
            if (id && (id.Value ?? id.Name)) playUrl(String(id.Value ?? id.Name), soundVolumeFromEffectLevel());
        } catch (e) {}
    });
    pexLog('等待音效/表情系统已启用（段数随等待秒数，音效与表情同步）');
}
