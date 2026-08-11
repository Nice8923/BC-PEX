// ════════════════════════════════════════
//  PEX 捡起凝胶（原生对话框活动 v2）
//  不再自绘 DrawButton（位置/文字不可控、别人看不到）——改为往 BC 原生的
//  对话活动列表注入自定义活动 PEX_PickupGel：
//    - 按钮/文字/点击全部由 BC 原生渲染（点开失神者 → 部位 → 活动菜单）
//    - 文案：hook ActivityDictionaryText 把 PEX_PickupGel 翻译成"捡起凝胶"
//    - 点击：DialogActivityClick 拦截，不跑原版 ActivityRun（避免广播未知活动）
// ════════════════════════════════════════

import { getModApi, ES_KEY } from '../core/config.js';
import { pexSendAction, pexSendHidden } from '../core/net.js';
import { spawnGelItem, isGelItem, removeGelFromSelf } from './gel-item.js';
import { pexLog, characterNicknameSafe } from '../util/util.js';

const PICKUP_ACTIVITY = 'PEX_PickupGel';
const PUTBACK_ACTIVITY = 'PEX_PutGel';

// 读取目标的 PEX 公告状态（失神/凝胶）
function targetGelState(C) {
    try {
        const st = C?.OnlineSharedSettings?.PEX?.state;
        if (st && st.mode === 'blank' && st.gelId) return st;
    } catch (e) {}
    return null;
}

// "捡起"条件：目标是别人 + 对方失神 + 凝胶在脚边（无人持有）
function canPickup(C) {
    try {
        if (!C || C.MemberNumber == null || C.MemberNumber === Player?.MemberNumber) return false;
        const st = targetGelState(C);
        if (!st || st.gelHolder) return false;
        return true;
    } catch (e) { return false; }
}

// "放回"条件：我手上拿着的是这颗凝胶（给原主人放回脚下）；无效凝胶不能喂回
function canPutBack(C) {
    try {
        if (!C || C.MemberNumber == null || C.MemberNumber === Player?.MemberNumber) return false;
        const st = targetGelState(C);
        if (!st) return false;
        const held = InventoryGet(Player, 'ItemHandheld');
        if (!held || !isGelItem(held)) return false;
        const meta = parseGelMetaSafe(held);
        return !!meta && !meta.invalid && meta.gelId === st.gelId;
    } catch (e) { return false; }
}

function parseGelMetaSafe(item) {
    try {
        const desc = item?.Craft?.Description ?? '';
        if (!desc.startsWith('PEX|')) return null;
        const parts = desc.slice(4).split('|');
        const [gelId, ownerId] = parts;
        return { gelId, ownerMemberNumber: +ownerId, invalid: parts[3] === 'INVALID' };
    } catch (e) { return null; }
}

// 捡起：生成凝胶到我的手
function doPickup(C, st) {
    try {
        if (!st) { pexSendAction('%NAME%试着捡起凝胶，但它已经不见了…'); return; }
        if (InventoryGet(Player, 'ItemHandheld')) {
            pexSendAction('%NAME%想捡起凝胶，但手里已经拿着东西了。');
            return;
        }
        const gelId = st.gelId;
        const owner = st.owner ?? C?.MemberNumber;
        const expiresAt = st.expiresAt ?? (Date.now() + 30 * 60 * 1000);
        const item = spawnGelItem(owner, gelId, expiresAt, st.type === 'normal' ? 'normal' : 'persona');
        if (!item) {
            pexSendAction('%NAME%试着捡起凝胶，但失败了…');
            return;
        }
        // 公告持有者 = 我（对方的脚边凝胶收起；选项变"放回"）
        pexSendHidden('PEX_GelHeld', [
            { Tag: 'GelId', Value: String(gelId) },
            { Tag: 'Holder', Value: String(Player?.MemberNumber) },
            { Tag: 'Owner', Value: String(owner) },
        ]);
        // 本地立即更新（自己收不到自己的广播——否则"捡起凝胶"动作在本地不消失）
        try {
            if (C?.OnlineSharedSettings?.[ES_KEY]?.state) {
                C.OnlineSharedSettings[ES_KEY].state.gelHolder = Player?.MemberNumber;
            }
        } catch (e) {}
        pexSendAction(`%NAME%捡起了地上的${item.Craft?.Name ?? '凝胶'}，小心地端了起来。`);
    } catch (e) {
        pexLog('捡起失败:', e.message);
    }
}

// "放回"= 喂回主人身体：把手上的凝胶归还主人 → 主人喝回自己的凝胶 → 恢复意识
function doPutBack(C, st) {
    try {
        if (!st) return;
        const gelId = st.gelId;
        const owner = st.owner ?? C?.MemberNumber;
        const held = InventoryGet(Player, 'ItemHandheld');
        if (!held || !isGelItem(held)) {
            pexSendAction('%NAME%想放回凝胶，但手上已经空了。');
            return;
        }
        if (!removeGelFromSelf(gelId)) return;
        // 喂回：凝胶归还主人身体（PEX_GelConsumed → 主人端恢复意识）
        pexSendHidden('PEX_GelConsumed', [
            { Tag: 'GelId', Value: String(gelId) },
            { Tag: 'Drinker', Value: String(owner) },
            { Tag: 'Owner', Value: String(owner) },
        ]);
        // 本地立即清理对方状态（自己收不到自己的广播 → 放回后"捡起/放回"动作立即消失）
        try {
            if (C?.OnlineSharedSettings?.[ES_KEY]?.state) {
                C.OnlineSharedSettings[ES_KEY].state = null;
            }
        } catch (e) {}
        pexSendAction(`%NAME%把凝胶放回了${characterNicknameSafe(C, '对方')}的身体里，${characterNicknameSafe(C, '对方')}慢慢回过神来。`);
    } catch (e) {
        pexLog('放回失败:', e.message);
    }
}

export function registerPickup() {
    const modApi = getModApi();
    if (!modApi) return;

    // 活动按钮文案：原版查 ActivityDictionary.csv 语言包，自定义活动名查不到
    // → hook ActivityDictionaryText 返回中文（按钮上显示"捡起凝胶"/"放回凝胶"；
    //   不拦截的话 TextGetInScope 会报 MISSING TEXT IN "ActivityDictionary.csv"）
    const picky = (args, next) => {
        const key = args && args[0];
        if (typeof key === 'string' && key.includes(PICKUP_ACTIVITY)) return '捡起凝胶';
        if (typeof key === 'string' && key.includes(PUTBACK_ACTIVITY)) return '放回凝胶';
        return next(args);
    };
    try {
        modApi.hookFunction('ActivityDictionaryText', 0, picky);
    } catch (e) {}
    // 兜底：其它语言包查询路径（TextGet/TextGetInScope 对未知 key 报 MISSING TEXT IN "Interface.csv"）
    try {
        modApi.hookFunction('TextGet', 0, picky);
        modApi.hookFunction('TextGetInScope', 0, picky);
    } catch (e) {}

    // 注入活动：目标可捡 → "捡起凝胶"；我拿着该凝胶 → "放回凝胶"（原生按钮）
    // DialogBuildActivities 会重设 DialogActivity 数组，故在 next 后 push，
    // 并手动 Reload 一次让按钮网格重建（显示新活动）
    try {
        modApi.hookFunction('DialogBuildActivities', 10, (args, next) => {
            const result = next(args);
            try {
                const C = args && args[0];
                if (typeof DialogActivity === 'undefined' || !Array.isArray(DialogActivity)) return result;
                if (!C || C.MemberNumber === Player?.MemberNumber) return result;
                const pushAct = (name) => {
                    if (DialogActivity.some(a => a && a.Activity && a.Activity.Name === name)) return false;
                    DialogActivity.push({
                        Activity: { Name: name, MaxProgress: 0 },
                        Item: null,
                        Group: (C.FocusGroup && C.FocusGroup.Name) || 'ItemHands',
                    });
                    return true;
                };
                let changed = false;
                if (canPickup(C)) changed = pushAct(PICKUP_ACTIVITY) || changed;
                if (canPutBack(C)) changed = pushAct(PUTBACK_ACTIVITY) || changed;
                if (!changed) return result;
                try {
                    if (typeof DialogMenuMapping !== 'undefined'
                        && DialogMenuMapping.activities
                        && typeof DialogMenuMapping.activities.Reload === 'function') {
                        DialogMenuMapping.activities.Reload(null, { reset: true, resetDialogItems: false });
                    }
                } catch (e) {}
            } catch (e) {}
            return result;
        });
    } catch (e) {}

    // 点击拦截：PEX_PickupGel → 捡起；PEX_PutGel → 放回；都不跑原版
    // （原版 DialogActivityClick 会 ActivityRun 并广播未知活动消息，必须拦下）
    // 动作执行后无论成败都要退出对话界面（原版在 ActivityRun 后调 DialogLeave()）
    try {
        modApi.hookFunction('DialogActivityClick', 1, (args, next) => {
            const [C, clickedActivity] = args;
            let handled = false;
            try {
                const name = clickedActivity && clickedActivity.Activity && clickedActivity.Activity.Name;
                if (C && name === PICKUP_ACTIVITY) {
                    doPickup(C, targetGelState(C));
                    handled = true;
                } else if (C && name === PUTBACK_ACTIVITY) {
                    doPutBack(C, targetGelState(C));
                    handled = true;
                }
            } catch (e) {}
            if (handled) {
                // 像原版一样：动作结束后退出对话界面（成功失败都退出）
                try { if (typeof DialogLeave === 'function') DialogLeave(); } catch (e) {}
                return;
            }
            return next(args);
        });
    } catch (e) {}
}
