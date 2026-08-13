// ════════════════════════════════════════
//  PEX 状态机（骨架版）
//  完整状态：idle → waiting(排出前等待) → blocked(臀部被挡) → excreting(排出) → blank(失神)
//  下一阶段实现：计时器、凝胶元信息、自动回归调度
// ════════════════════════════════════════

import { ui } from '../expansion/i18n.js';
import { ES_KEY } from '../core/config.js';
import { getCharacterByNumber } from '../util/geometry.js';

export const MODE = {
    IDLE: 'idle',
    WAITING: 'waiting',     // 排出前等待（眩晕增强期）
    BLOCKED: 'blocked',     // 臀部被挡，等待上限
    EXCRETING: 'excreting', // 排出动画中
    BLANK: 'blank',         // 失神（凝胶已排出）
};

// 运行时状态（本地；他人状态读 OnlineSharedSettings）
export const PEX_STATE = {
    mode: MODE.IDLE,
    gelType: 'persona',         // persona=人格凝胶 / normal=普通凝胶
    phaseStartedAt: 0,          // 当前阶段开始时间（毫秒时间戳）
    phaseEndsAt: 0,             // 当前阶段结束时间（0=无期限）
    ownerMemberNumber: null,    // 人格主人（被排出者）
    gelId: null,                // 当前凝胶实例 ID
    gelHolder: null,            // 凝胶当前持有者成员号
};

export function setMode(mode, opts = {}) {
    PEX_STATE.mode = mode;
    PEX_STATE.phaseStartedAt = Date.now();
    PEX_STATE.phaseEndsAt = opts.endsAt ?? 0;
    if (opts.ownerMemberNumber !== undefined) PEX_STATE.ownerMemberNumber = opts.ownerMemberNumber;
    if (opts.gelId !== undefined) PEX_STATE.gelId = opts.gelId;
    if (opts.gelHolder !== undefined) PEX_STATE.gelHolder = opts.gelHolder;
    if (opts.gelType !== undefined) PEX_STATE.gelType = opts.gelType;
}

// ════════════════════════════════════════
//  他人状态（远程）——所有"别人现在是什么状态"的读取统一走这里
// ════════════════════════════════════════
// 状态走两条通道，同一份 payload：
//   OnlineSharedSettings —— 持久。晚进房的人在 ChatRoomSync 拿全房角色资料时免费带到
//   Hidden PEX_StateSync  —— 即时。服务器扇出 OSS 有延迟，房内的人靠这条立刻看到
// 但 BC 的 CharacterOnlineRefresh（Character.js:1223）会把 OnlineSharedSettings
// 【整包无条件覆盖】成服务器那份，而服务器扇出比 Hidden 慢 —— 刚套用的新状态会被旧值回滚
// （症状：凝胶捡走了又冒出来、倒数跳回去）。所以本地留一份带 seq 的缓存当权威，
// OSS 只作兜底（缓存里没有的人 / 晚进房）。seq = 发布方的 Date.now()，单调递增。
const _remote = new Map();   // memberNumber → payload（含 seq）

const _seqOf = (s) => (s && +s.seq) || 0;

// 读一个角色的 PEX 状态（idle / 无状态 → null）
export function readRemoteState(C) {
    try {
        const oss = C?.OnlineSharedSettings?.[ES_KEY]?.state || null;
        const mn = C?.MemberNumber;
        const cached = (mn != null) ? _remote.get(mn) : null;
        const st = (cached && _seqOf(cached) >= _seqOf(oss)) ? cached : oss;
        if (!st || !st.mode || st.mode === MODE.IDLE) return null;
        return st;
    } catch (e) { return null; }
}

// 收到广播 / 本地乐观更新：seq 旧的不覆盖新的
export function applyRemoteState(memberNumber, payload) {
    try {
        if (memberNumber == null || !payload || typeof payload !== 'object') return false;
        const cur = _remote.get(memberNumber);
        if (cur && _seqOf(payload) < _seqOf(cur)) return false;
        _remote.set(memberNumber, payload);
        return true;
    } catch (e) { return false; }
}

// 本地乐观更新用的 seq：比"当前已知的最大 seq"大 1。
// ponytail: 不用 Date.now() —— 观察者的时钟可能比公告方快，那样本地这一笔会把公告方
//   接下来真正的新状态挡住（挡多久 = 时钟偏差）。+1 只压过手上这一份，公告方下一次
//   广播（seq = 它的 Date.now()，数量级远大于此）立刻夺回权威。
function _bumpSeq(C) {
    const oss = C?.OnlineSharedSettings?.[ES_KEY]?.state;
    const cached = (C?.MemberNumber != null) ? _remote.get(C.MemberNumber) : null;
    return Math.max(_seqOf(oss), _seqOf(cached)) + 1;
}

// 接受角色对象或成员号
const _asChar = (x) => ((x && typeof x === 'object') ? x : getCharacterByNumber(x));

// 局部改写（凝胶易主等）：在当前状态上打补丁并推进 seq，免得被随后到达的旧 OSS 盖回去
export function patchRemoteState(target, patch) {
    try {
        const C = _asChar(target);
        const st = readRemoteState(C);
        if (!st || C?.MemberNumber == null) return;
        _remote.set(C.MemberNumber, Object.assign({}, st, patch, { seq: _bumpSeq(C) }));
    } catch (e) {}
}

// 清掉某人的状态（凝胶被喝掉/放回 → 立即从所有人画面消失）
export function clearRemoteState(target) {
    try {
        const C = _asChar(target);
        const mn = (C?.MemberNumber != null) ? C.MemberNumber : target;
        if (mn == null || typeof mn !== 'number') return;
        _remote.set(mn, { mode: MODE.IDLE, seq: _bumpSeq(C) });
    } catch (e) {}
}

export function clearAllRemoteStates() { _remote.clear(); }

// 本地状态摘要（/pex status 用）
export function getStateSummary() {
    const s = PEX_STATE;
    switch (s.mode) {
        case MODE.IDLE: return ui('stateIdle');
        case MODE.WAITING: {
            const sec = Math.max(0, Math.round((s.phaseEndsAt - Date.now()) / 1000));
            return ui('stateWaiting', { sec });
        }
        case MODE.BLOCKED: {
            const rem = Math.max(0, Math.round((s.phaseEndsAt - Date.now()) / 1000));
            return ui('stateBlocked', { min: Math.floor(rem / 60), sec: rem % 60 });
        }
        case MODE.EXCRETING: return ui('stateExcreting');
        case MODE.BLANK: {
            const rem = Math.max(0, Math.round((s.phaseEndsAt - Date.now()) / 1000));
            // 普通凝胶没有失神限制，状态文案区分（不再误导显示"失神中"）
            if (s.gelType === 'normal') return ui('stateBlankNormal', { min: Math.floor(rem / 60), sec: rem % 60 });
            return ui('stateBlank', { min: Math.floor(rem / 60), sec: rem % 60 });
        }
        default: return ui('stateIdle');
    }
}
