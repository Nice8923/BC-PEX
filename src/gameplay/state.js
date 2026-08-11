// ════════════════════════════════════════
//  PEX 状态机（骨架版）
//  完整状态：idle → waiting(排出前等待) → blocked(臀部被挡) → excreting(排出) → blank(失神)
//  下一阶段实现：计时器、凝胶元信息、自动回归调度
// ════════════════════════════════════════

import { ui } from '../expansion/i18n.js';

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
