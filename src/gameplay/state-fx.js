// ════════════════════════════════════════
//  PEX 角色状态表现
//  - 表情切换（BC 自带表情四维：Eyebrows/Eyes/Mouth/Blush + Emoticon）
//  - 睡眠式失能（闭眼 + Sleep 表情符号 + 尝试跪下姿势）
//  - 禁言拦截（失神时发言 → 变成 "..."）
// ════════════════════════════════════════

import { pexSendAction } from '../core/net.js';
import { MODE, readRemoteState } from './state.js';

let _prevExpression = null;
let _savedEyes = null;
let _savedEyes2 = null;
let _savedEmoticon = null;
let _speechBlockActive = false;

// 读取当前表情（BC API，存在则用）
function getCurrentExpression() {
    try {
        if (typeof WardrobeGetExpression === 'function') return WardrobeGetExpression(Player) || null;
    } catch (e) {}
    return null;
}

// 把一组表情展开成各群组要套用的值（BC 有左右两个眼睛组；未指定左眼 → 跟右眼一致，含 Luzi 组）
function expandExpr(exprSet) {
    const eyes = exprSet.Eyes ?? null;
    const eyes2 = (exprSet.Eyes2 !== undefined) ? exprSet.Eyes2 : eyes;
    return {
        Eyebrows: exprSet.Eyebrows ?? null,
        Eyes: eyes,
        Eyes2: eyes2,
        Mouth: exprSet.Mouth ?? null,
        Blush: exprSet.Blush ?? null,
        '右眼_Luzi': eyes,
        '左眼_Luzi': eyes2,
    };
}

// ── 批量设置表情（性能关键）──
// 本地：一次写完所有组 → 只重建一次画布。
// 广播：一发 ChatRoomCharacterUpdate 取代 N 发 ChatRoomCharacterExpressionUpdate。
//   BC 的 ChatRoomCharacterExpressionUpdate（ChatRoom.js:3615）每一发都夹带
//   ServerAppearanceBundle —— 完整外观包，逐件带上 Property（Effect/锁/成员号）与 Craft，
//   一个被绑住又有订制物品的角色好几 KB，而它只带一个 Group：
//   改 Eyes + Eyes2 就是同一份外观包送两遍。
//   LCE 踩过同一颗雷（BC-LCE/src/features/expressions.js:88 原话）：
//   "若每次都送就是 4 发/秒 → 灌爆 socket、断线重连" —— 炸的不是条数（BC 限速 14 条/1.2 秒），
//   是每条的体积。ChatRoomCharacterUpdate 同样一份外观包但一发覆盖全部组，
//   顺带把 Eyebrows/Mouth/Blush 也同步出去（原本只有本地看得到）。
const EXPR_KEEPALIVE_MS = 1000;   // 广播最短间隔
let _lastBcastAt = 0;
let _bcastTimer = null;
let _selfApplying = false;        // PEX 自己发起的表情写入（放行自己的封锁钩子）

// 前沿立即送 + 节流窗口末尾补送一次（保证最终表情一定送达）。
// 节流是为了挡住外部高频触发：LCE/WCE 动画引擎每 250ms 重算整张脸、挣扎
// StruggleMinigameHandleExpression、物品表情 InventoryExpressionTriggerApply、
// 限时表情到期 TimerInventoryRemove —— 这些都会打到下面那个
// CharacterSetFacialExpression 钩子上，把失神脸一遍遍重新按回去。
function broadcastAppearance() {
    if (_bcastTimer) return;   // 已排队，末尾会送最终状态
    const wait = EXPR_KEEPALIVE_MS - (Date.now() - _lastBcastAt);
    if (wait > 0) {
        _bcastTimer = setTimeout(() => { _bcastTimer = null; broadcastAppearance(); }, wait);
        return;
    }
    _lastBcastAt = Date.now();
    try { if (typeof ChatRoomCharacterUpdate === 'function') ChatRoomCharacterUpdate(Player); } catch (e) {}
}

function setExprBatch(map, broadcast) {
    try {
        if (!Player?.Appearance) return;
        const changed = [];
        for (const [g, val] of Object.entries(map)) {
            try {
                if (val == null) continue;
                const it = Player.Appearance.find(a => a.Asset.Group.Name === g);
                if (!it) continue;
                const allow = it.Asset?.Group?.AllowExpression;
                if (Array.isArray(allow) && !allow.includes(val)) continue;
                if (!it.Property) it.Property = {};
                if (it.Property.Expression === val) continue;
                it.Property.Expression = val;
                changed.push(g);
            } catch (e) {}
        }
        if (!changed.length) return;
        try { if (typeof CharacterRefresh === 'function') CharacterRefresh(Player, false, false); } catch (e) {}
        if (!broadcast) return;
        notifyExprMods(map, changed);
        broadcastAppearance();
    } catch (e) {}
}

// ── 通知钩子链（互操作，不是广播）──
// 值已经写进 Property 了，这里再走一趟 BC 原生 CharacterSetFacialExpression：
//   · 没装动画引擎：BC 本体在 `item.Property.Expression == Expression` 早退
//     （Character.js:1973）—— 不刷新、不发包，纯零成本
//   · 装了 LCE/WCE：它们的钩子排在 BC 本体前面，会把这一通登记成 MANUAL 覆写
//     （BC-LCE/src/features/expressions.js:760），从此引擎不再每 250ms 把脸抢回去
// 不走这一步的后果就是拉锯战：引擎每 250ms 重算重套 → PEX 的封锁钩子弹回 →
// 自己画面同 tick 收敛看不太出来，别人看到的是表情抽动，而且这场仗持续整个失神期。
// 做法同 LCE 自己的 notifyMods（expressions.js:151）。
function notifyExprMods(map, changed) {
    if (typeof CharacterSetFacialExpression !== 'function') return;
    _selfApplying = true;
    try {
        for (const g of changed) {
            // Eyes2 跳过：BC 本体设 Eyes 时会自己递归到 Eyes2（Character.js:1964）
            if (g === 'Eyes2') continue;
            try { CharacterSetFacialExpression(Player, g, map[g]); } catch (e) {}
        }
    } finally { _selfApplying = false; }
}

// 应用一组表情（四维逐部位，含左右眼；批量写入 + 单次重建 + 广播）
export function applyExpression(exprSet) {
    try {
        if (!exprSet) return;
        if (_prevExpression === null) _prevExpression = getCurrentExpression();
        setExprBatch(expandExpr(exprSet), true);
    } catch (e) {}
}

// 失神表现（目光呆滞）：维持排出时的身体姿态（不跪下、不闭眼、没有睡眠符号），
// 眼睛强制 Dazed（目光呆滞），其余部位用排出表情组；批量单次重建 + 广播
export function applyBlankFace(exprOverride = null) {
    try {
        if (_savedEyes === null) {
            const cur = getCurrentExpression();
            _savedEyes = cur?.Eyes ?? null;
            _savedEyes2 = cur?.Eyes2 ?? null;
            _savedEmoticon = cur?.Emoticon ?? null;
        }
        const map = {};
        if (exprOverride) {
            for (const [k, v] of Object.entries(exprOverride)) {
                if (v != null) map[k] = v;
            }
        }
        map.Eyes = 'Dazed';    // 眼睛强制目光呆滞（用户要求）
        map.Eyes2 = 'Dazed';
        setExprBatch(map, true);
    } catch (e) {}
}

// 恢复表情与姿势（还原之前记录的值；批量单次重建）
export function restoreCharacterFx() {
    try {
        const map = {};
        if (_savedEyes !== null) map.Eyes = _savedEyes;
        if (_savedEyes2 !== null) map.Eyes2 = _savedEyes2;
        if (_savedEmoticon !== null) map.Emoticon = _savedEmoticon;
        if (_prevExpression) {
            for (const [k, v] of Object.entries(_prevExpression)) {
                if (v != null && map[k] === undefined) map[k] = v;
            }
        }
        setExprBatch(map, true);
    } catch (e) {}
    _prevExpression = null;
    _savedEyes = null;
    _savedEyes2 = null;
    _savedEmoticon = null;
}

// ── 失神不能动（身体封锁）──
// 借 BC 原生的能力检查：CanWalk（走/离开房间）、CanInteract（动作/拿东西）、
// CanChangeOwnClothes（换衣服）、CanKneel（下跪）。失神时全部返回 false，
// 恢复时放行。纯本地 hook，零消息。
let _bodyBlock = false;
let _savedBlinkFactor = null;   // 眨眼间隔原值（失神时设极大值 → 不眨眼）
export function setBodyBlock(on) {
    _bodyBlock = !!on;
    try {
        if (_bodyBlock && Player) {
            // 不眨眼：BC 眨眼条件 CurrentTime/400 % BlinkFactor == 0，设极大值永远不满足
            if (_savedBlinkFactor === null) _savedBlinkFactor = Player.BlinkFactor;
            Player.BlinkFactor = 999999;
            // 姿势当场封锁：主动触发一次 PoseRefresh，让 hook 立即把允许列表压空
            // （不能等别的刷新——applyBlankFace 的刷新发生在设标志之前，会漏一次
            //   压空，导致排出后还能改一下姿势才灰）
            if (typeof PoseRefresh === 'function') PoseRefresh(Player);
        } else if (!_bodyBlock && Player) {
            if (_savedBlinkFactor !== null) {
                Player.BlinkFactor = _savedBlinkFactor;
                _savedBlinkFactor = null;
            }
            // 恢复姿势允许列表：调 BC 原生 PoseRefresh 从身上物品重建
            // （保留物品的原生限制——有拘束照样动不了；不能直接清空，否则会破坏限制）
            if (typeof PoseRefresh === 'function') PoseRefresh(Player);
        }
    } catch (e) {}
}

// ── 眨眼 = 角色级表现（失神者无论哪个客户端渲染都不眨眼）──
// 自己客户端：setBodyBlock(true) 已把 Player.BlinkFactor 锁 999999（本地）。
// 别人客户端：对方角色缓存的 BlinkFactor 是本地随机值，正常眨眼——需在绘制时锁。
// BC 眨眼判断在 DrawCharacter 内读 C.BlinkFactor（CurrentTime/400 % BlinkFactor == 0），
// 故 DrawCharacter 绘制前临时置 999999、绘制后还原。只影响失神角色，正常人不受影响。
let _drawBlinkSaved = null;
export function lockRemoteBlink(C) {
    try {
        const st = readRemoteState(C);
        if (st && st.mode === MODE.BLANK && st.type !== 'normal') {
            _drawBlinkSaved = C.BlinkFactor;
            C.BlinkFactor = 999999;
            return true;
        }
    } catch (e) {}
    return false;
}
export function unlockRemoteBlink(C) {
    if (_drawBlinkSaved !== null) {
        try { C.BlinkFactor = _drawBlinkSaved; } catch (e) {}
        _drawBlinkSaved = null;
    }
}

export function registerBodyBlockHooks(modApi) {
    if (!modApi) return;
    const block = (name) => {
        try {
            modApi.hookFunction(name, 4, (args, next) => {
                if (!_bodyBlock) return next(args);
                return false;
            });
        } catch (e) {}
    };
    block('Player.CanWalk');
    block('Player.CanInteract');
    block('Player.CanChangeOwnClothes');
    block('Player.CanKneel');
    // 交互动作：失神者发起的活动（对话框里的"拿起凝胶"同类的活动）全部不可用
    try {
        modApi.hookFunction('ActivityCheckPrerequisites', 4, (args, next) => {
            const [activity, acting] = args;
            if (acting && typeof acting.IsPlayer === 'function' && acting.IsPlayer() && _bodyBlock) return false;
            return next(args);
        });
    } catch (e) {}
    // 姿势 = 原生拘束效果：PoseRefresh（每次 CharacterRefresh 都会跑）把姿势允许列表
    // 压成全类别空 → 姿势菜单像全身拘束时一样全部禁用（不碰身上任何物品）
    try {
        modApi.hookFunction('PoseRefresh', 4, (args, next) => {
            const result = next(args);
            try {
                const C = args && args[0];
                if (C && typeof C.IsPlayer === 'function' && C.IsPlayer() && _bodyBlock) {
                    C.AllowedActivePoseMapping = { BodyUpper: [], BodyLower: [], BodyFull: [] };
                }
            } catch (e) {}
            return result;
        });
    } catch (e) {}
    // 表情：失神时【直接吞掉】外部改动，不是"改了弹回"。
    // 弹回的写法会打拉锯战：BC 本体设 Eyes 时自己递归到 Eyes2（Character.js:1964）
    // → 一次外部改动触发两次弹回；对方装了动画引擎的话更是每 250ms 抢一轮，
    // 每一轮都要重新广播 → 别人看到表情抽动，且整个失神期都在发包。
    // 吞掉则零成本：玩家菜单、物品表情触发（InventoryExpressionTriggerApply）、
    // 限时表情到期（TimerInventoryRemove）全部当场作废，脸纹丝不动。
    // 引擎那种绕过本函数直接写 Property 的，由 notifyExprMods 登记 MANUAL 覆写解决。
    try {
        modApi.hookFunction('CharacterSetFacialExpression', 4, (args, next) => {
            if (_selfApplying || !_bodyBlock) return next(args);
            try {
                const C = args && args[0];
                if (C && typeof C.IsPlayer === 'function' && C.IsPlayer()) return;   // 吞掉
            } catch (e) {}
            return next(args);
        });
    } catch (e) {}
}

// ── 禁言拦截：失神中按 Enter 发言 → 不能说话，2 秒后播"旁白"──
// 拦截 ChatRoomSendChat：清空输入 → 延迟 2 秒 → 随机播一条
// 失神旁白（Action 圆括号 (内容)），原话不发送
// 文案方向：身体僵住/一动不动（像木头），不是"想说但说不出"
const BLANK_NARRATIONS = [
    '%NAME%像个木头一样一动不动…',
    '%NAME%身体僵在原地，毫无反应…',
    '%NAME%双目无神，呆呆地杵在那里…',
    '%NAME%仿佛被抽走了魂，一动不动…',
    '%NAME%像坏掉的木偶一样僵住了…',
    '%NAME%全身僵硬，连手指头都不动一下…',
];

export function setSpeechBlock(on) {
    _speechBlockActive = !!on;
}

export function registerSpeechBlockHook(modApi) {
    if (!modApi) return;
    try {
        modApi.hookFunction('ChatRoomSendChat', 5, (args, next) => {
            if (!_speechBlockActive) return next(args);
            let val = '';
            try { val = (document.getElementById('InputChat') || {}).value || ''; } catch (e) {}
            const t = val.trim();
            if (!t) return next(args);
            // 不拦：指令 / 、OOC（、*表情、.开头、悄悄话
            if (/^[/(*.]/.test(t)) return next(args);
            try {
                if (typeof ChatRoomTargetMemberNumber === 'number' && ChatRoomTargetMemberNumber >= 0) return next(args);
            } catch (e) {}
            // 拦截：清空输入，阻止原版发送
            const input = document.getElementById('InputChat');
            if (input) {
                input.value = '';
                try { input.dispatchEvent(new InputEvent('input')); } catch (e) {}
            }
            // 故意延迟 2 秒后播旁白（失神说话迟钝感）
            const line = BLANK_NARRATIONS[Math.floor(Math.random() * BLANK_NARRATIONS.length)];
            setTimeout(() => {
                try { pexSendAction(line); } catch (e) {}
            }, 2000);
            return;   // 拦截：不调用 next（原消息不发送）
        });
    } catch (e) {
        console.warn('⚗️[PEX] 禁言挂钩失败:', e.message);
    }
}
