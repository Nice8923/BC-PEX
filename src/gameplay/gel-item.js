// ════════════════════════════════════════
//  PEX 凝胶物品
//  凝胶 = 游戏道具（载体 GlassFilled，带 Craft 元信息，天然抗断连）：
//    Craft.Name      = "XX的人格凝胶"
//    Craft.Description = "PEX|凝胶ID|主人ID|过期时间戳"
//  显示 = 层 7 伪资产：凝胶画在角色画布的身体层（Layer 7），会被衣服遮住；
//    CharacterLoadCanvas 时注入 DrawAppearance → SortLayers 排到层 7 → BuildCanvas 绘制
//  喂回 = 主人喝下自己的凝胶；他人喝掉 = 凝胶被消耗，主人保持失神
//  过期 = 广播 PEX_GelExpired，各持有者客户端自删
// ════════════════════════════════════════

import { pexSendHidden, pexOnMessage } from '../core/net.js';
import { pexLog } from '../util/util.js';
import { getCharacterByNumber } from '../util/geometry.js';
import { startExcreteAnim, getCanvasAnimEntry, deleteCanvasAnimEntry, getAnimDuration } from './excretion.js';
import { lockRemoteBlink, unlockRemoteBlink } from './state-fx.js';
import { CONFIG, ES_KEY } from '../core/config.js';
import { PEX_STATE } from './state.js';
import { publishState } from '../core/storage.js';

const GEL_ITEM = 'GlassFilled';   // 凝胶容器道具
const META_PREFIX = 'PEX|';

// 生成凝胶 ID（逻辑凝胶在失神时立即存在；真物品等手空再穿）
export function createGelId(ownerMemberNumber) {
    return `${ownerMemberNumber}-${Date.now()}`;
}

// 生成凝胶物品（穿到主人手上）；手被占则返回 null（捡起失败，保持现状提示）
// type: persona=人格凝胶 / normal=普通凝胶（决定物品名）
export function spawnGelItem(ownerMemberNumber, gelId, expiresAt, type = 'persona') {
    try {
        if (typeof InventoryGet !== 'function' || typeof InventoryWear !== 'function') return null;
        if (InventoryGet(Player, 'ItemHandheld')) return null;
        const ownerName = getNickname(ownerMemberNumber) || '某人';
        const suffix = type === 'normal' ? '普通凝胶' : '人格凝胶';
        const craft = {
            Name: `${ownerName}的${suffix}`,
            Description: `${META_PREFIX}${gelId}|${ownerMemberNumber}|${expiresAt}`,
            MemberNumber: ownerMemberNumber,
            Property: 'Normal',
        };
        const item = InventoryWear(Player, GEL_ITEM, 'ItemHandheld', undefined, undefined, ownerMemberNumber, craft, false);
        if (!item) return null;
        try { if (typeof ChatRoomCharacterUpdate === 'function') ChatRoomCharacterUpdate(Player); } catch (e) {}
        pexLog('凝胶物品已生成:', gelId);
        return item;
    } catch (e) {
        pexLog('生成凝胶失败:', e.message);
        return null;
    }
}

// 解析凝胶元信息（第 4 段 INVALID = 已失效：不能喂回，永久保留）
export function parseGelMeta(item) {
    try {
        const desc = item?.Craft?.Description ?? '';
        if (!desc.startsWith(META_PREFIX)) return null;
        const parts = desc.slice(META_PREFIX.length).split('|');
        const [gelId, ownerId, expiresAt] = parts;
        return { gelId, ownerMemberNumber: +ownerId, expiresAt: +expiresAt, invalid: parts[3] === 'INVALID' };
    } catch (e) { return null; }
}

export function isGelItem(item) {
    return !!parseGelMeta(item);
}

// 从自己手上移除指定凝胶
export function removeGelFromSelf(gelId) {
    try {
        const item = InventoryGet(Player, 'ItemHandheld');
        const meta = parseGelMeta(item);
        if (meta && (!gelId || meta.gelId === gelId)) {
            InventoryRemove(Player, 'ItemHandheld', false);
            try { if (typeof ChatRoomCharacterUpdate === 'function') ChatRoomCharacterUpdate(Player); } catch (e) {}
            pexLog('凝胶已从手上移除:', meta.gelId);
            return true;
        }
    } catch (e) {}
    return false;
}

// 消耗凝胶（喝掉/喂回）：从手上移除 + 通知原主人
export function consumeGel(item, drinkerMemberNumber, gelMeta) {
    removeGelFromSelf(gelMeta?.gelId);
    pexSendHidden('PEX_GelConsumed', [
        { Tag: 'GelId', Value: String(gelMeta?.gelId ?? '') },
        { Tag: 'Drinker', Value: String(drinkerMemberNumber) },
        { Tag: 'Owner', Value: String(gelMeta?.ownerMemberNumber) },
    ]);
}

// 广播凝胶过期：各持有者客户端自删
export function broadcastGelExpired(gelId) {
    pexSendHidden('PEX_GelExpired', [{ Tag: 'GelId', Value: gelId }], { dedupeKey: 'expire-' + gelId, dedupeMs: 5000 });
}

// 无效化自己手上的凝胶（原主人恢复的同一时刻调用）：
// 改名"XX的无效凝胶"+ 描述追加 INVALID 标记 → 别人能看到他拿着无效凝胶
// 只改自己手上的物品（原版标准操作），已无效则跳过（幂等）
export function invalidateGelOnSelf(gelId, ownerMemberNumber) {
    try {
        const item = InventoryGet(Player, 'ItemHandheld');
        const meta = parseGelMeta(item);
        if (!meta || meta.gelId !== gelId || meta.invalid) return false;
        const ownerName = getNickname(ownerMemberNumber) || '某人';
        if (!item.Craft) item.Craft = {};
        item.Craft.Name = `${ownerName}的无效凝胶`;
        item.Craft.Description = `${META_PREFIX}${gelId}|${ownerMemberNumber}|${meta.expiresAt}|INVALID`;
        item.Craft.Property = 'Normal';
        try { if (typeof ChatRoomCharacterUpdate === 'function') ChatRoomCharacterUpdate(Player); } catch (e) {}
        pexLog('凝胶已变为无效凝胶:', gelId);
        return true;
    } catch (e) {
        pexLog('无效化凝胶失败:', e.message);
        return false;
    }
}

// 广播凝胶失效（invalid 模式到期）：持有者客户端把手上凝胶变无效，永久保留
export function broadcastGelInvalidated(gelId, ownerMemberNumber) {
    pexSendHidden('PEX_GelInvalidated', [
        { Tag: 'GelId', Value: String(gelId) },
        { Tag: 'Owner', Value: String(ownerMemberNumber) },
    ], { dedupeKey: 'invalidate-' + gelId, dedupeMs: 5000 });
}

// 手持凝胶过期兜底（任何模式/任何房间，由 publishTick 每秒调用）：
// 持有者没收到到期广播时（跨房间/离线重进），用物品上同一个 expiresAt
// （= 主人恢复时刻）按设置把凝胶无效化或移除。天然幂等：
// 已移除 → 手上没物品；已无效 → invalid 标记跳过；未到期 → 不动。
export function checkHeldGelExpired() {
    try {
        const item = InventoryGet(Player, 'ItemHandheld');
        const meta = parseGelMeta(item);
        if (!meta || !(meta.expiresAt > 0) || meta.expiresAt > Date.now()) return;
        if (meta.invalid) return;
        if (typeof CONFIG !== 'undefined' && CONFIG.gelExpireMode === 'invalid') {
            invalidateGelOnSelf(meta.gelId, meta.ownerMemberNumber);
        } else {
            removeGelFromSelf(meta.gelId);
        }
    } catch (e) {}
}

// ── 凝胶/动画底层绘制（DrawCharacter 钩子，图层可调 0~99，默认 24）──
// gelLayer < 24：next 前画到角色脚下 → 角色画布（含衣服）覆盖 = 被衣服遮住
// gelLayer >= 24：next 后画 = 顶层（不被遮）。所有装 PEX 的客户端都这样渲染。
export function registerGelUnderlay(modApi) {
    if (!modApi) return;
    try {
        modApi.hookFunction('DrawCharacter', 1, (args, next) => {
            const [C, X, Y, Zoom] = args;
            const under = !(CONFIG.gelLayer >= 24);   // 顶层（24+）角色之后画，否则角色之下
            try {
                if (under && C && C.MemberNumber != null && typeof X === 'number' && typeof Y === 'number') {
                    drawGelUnder(C, X, Y, Zoom || 1);
                }
            } catch (e) {}
            // 眨眼角色级锁定（失神者在他处渲染也不眨眼）
            const blinkLocked = (C && C.MemberNumber != null) ? lockRemoteBlink(C) : false;
            const r = next(args);
            if (blinkLocked) unlockRemoteBlink(C);
            try {
                if (!under && C && C.MemberNumber != null && typeof X === 'number' && typeof Y === 'number') {
                    drawGelUnder(C, X, Y, Zoom || 1);   // 顶层：角色之后画（覆盖）
                }
            } catch (e) {}
            return r;
        });
    } catch (e) {
        pexLog('凝胶底层绘制挂钩失败:', e.message);
    }
}

// 绘制：动画帧优先（排出动画也在同一图层），否则静态凝胶（脚边）
// 屏幕坐标：角色画布 1000 高 → 臀部 Y+525*z、落点（脚）Y+950*z；中心 X+250*z
//（整体上移 35px：动画最终落到脚的位置，而不是脚下地面）
// 动画 4 帧按时长（默认 7340ms = 排出音效时长，探测到更长音效时跟随）等比分布：
//   0-25% 臀部 → 25-50% 45% 高度 → 50-75% 82% + 地面先兆 → 75-100% 落地
function drawGelUnder(C, X, Y, z) {
    try {
        // 排出动画帧
        const t0 = getCanvasAnimEntry(C.MemberNumber);
        if (t0) {
            const dur = getAnimDuration() || 7340;
            const elapsed = Date.now() - t0;
            if (elapsed > dur) { deleteCanvasAnimEntry(C.MemberNumber); return; }
            if (typeof DrawRect !== 'function') return;
            const cx = X + 250 * z;
            const buttY = Y + 525 * z;
            const footY = Y + 950 * z;
            const p = Math.min(1, elapsed / dur);
            if (p < 0.25) {
                DrawRect(cx - 14 * z, buttY - 14 * z, 28 * z, 28 * z, '#ffffff');
            } else if (p < 0.5) {
                DrawRect(cx - 14 * z, buttY + (footY - buttY) * 0.45 - 14 * z, 28 * z, 28 * z, '#ffffff');
            } else if (p < 0.75) {
                DrawRect(cx - 14 * z, buttY + (footY - buttY) * 0.82 - 14 * z, 28 * z, 28 * z, '#ffffff');
                DrawRect(cx - 18 * z, footY - 8 * z, 36 * z, 16 * z, '#ffffff');
            } else {
                DrawRect(cx - 24 * z, footY - 11 * z, 48 * z, 22 * z, '#ffffff');
            }
            return;
        }
        // 静态凝胶：失神且凝胶在脚边（被捡走 → gelHolder 有值 → 不画）
        const st = C.OnlineSharedSettings?.[ES_KEY]?.state;
        if (st && st.mode === 'blank' && st.gelId && !st.gelHolder) {
            if (typeof DrawImageResize === 'function') {
                DrawImageResize('Assets/Female3DCG/ItemHandheld/Preview/GlassFilled.png', X + 250 * z - 20 * z, Y + 950 * z - 17 * z, 40 * z, 34 * z);
            }
        }
    } catch (e) {}
}

// ── 远程排出动画（跨客户端）──
// 对方进入 excreting（刚排出）→ 在他臀部→地面播动画，所有装 PEX 的都看得到
const _remoteAnims = new Map();   // memberNumber → startedAt（同一 startedAt 永久去重）

export function scanRemoteAnimStates() {
    try {
        if (typeof ChatRoomCharacter === 'undefined' || !Array.isArray(ChatRoomCharacter)) return;
        for (const C of ChatRoomCharacter) {
            if (!C || C.MemberNumber == null || C.MemberNumber === Player?.MemberNumber) continue;
            const info = C.OnlineSharedSettings?.[ES_KEY]?.state;
            const was = _remoteAnims.get(C.MemberNumber);
            if (info && info.mode === 'excreting' && info.startedAt) {
                // 同一 startedAt 永不重播：房间同步延迟时旧 EXCRETING 状态可能滞留
                // 很久（2.8s 删 key 的方案会被扫到重播——"动画播了 2 遍"的根因）
                if (was !== info.startedAt) {
                    _remoteAnims.set(C.MemberNumber, info.startedAt);
                    startExcreteAnim(C);
                }
            } else if (was !== undefined) {
                _remoteAnims.delete(C.MemberNumber);
            }
        }
    } catch (e) {}
}

export function clearRemoteAnims() {
    _remoteAnims.clear();
}

// 注册消息处理：PEX_GelExpired → 自删；PEX_GelConsumed → 回调；PEX_GelHeld → 记录持有者
export function registerGelMessageHandlers(onGelConsumed) {
    pexOnMessage((data) => {
        try {
            if (data?.Type !== 'Hidden') return;
            const dict = Array.isArray(data.Dictionary) ? data.Dictionary : [];
            const get = (tag) => {
                const e = dict.find(x => x?.Tag === tag);
                return e ? (e.Value ?? e.Name) : undefined;
            };
            if (data.Content === 'PEX_GelExpired') {
                const gelId = get('GelId');
                if (gelId) removeGelFromSelf(gelId);
            } else if (data.Content === 'PEX_GelInvalidated') {
                const gelId = get('GelId');
                const owner = +get('Owner');
                if (gelId) invalidateGelOnSelf(gelId, owner);
            } else if (data.Content === 'PEX_GelConsumed') {
                const owner = +get('Owner');
                const drinker = +get('Drinker');
                const gelId = get('GelId');
                // 所有客户端：owner 的凝胶状态立即清空（放回/喝掉后脚下凝胶消失）
                try {
                    const OC = getCharacterByNumber(owner);
                    if (OC?.OnlineSharedSettings?.[ES_KEY]) OC.OnlineSharedSettings[ES_KEY].state = null;
                } catch (e) {}
                if (typeof onGelConsumed === 'function') onGelConsumed({ gelId, owner, drinker });
            } else if (data.Content === 'PEX_GelHeld') {
                const gelId = get('GelId');
                const owner = +get('Owner');
                const holder = +get('Holder');
                // 所有人客户端：更新 owner 的公告状态 → "捡起凝胶"选项立即消失
                try {
                    const OC = getCharacterByNumber(owner);
                    if (OC?.OnlineSharedSettings?.[ES_KEY]?.state) {
                        OC.OnlineSharedSettings[ES_KEY].state.gelHolder = holder;
                    }
                } catch (e) {}
                // 主人端：把持有者同步进本地状态机并立即广播——
                // 否则例行公告会用旧值（无人持有）覆盖 gelHolder → 凝胶"又出现"（唯一性 bug）
                if (owner === Player?.MemberNumber) {
                    try {
                        PEX_STATE.gelHolder = holder;
                        publishState({
                            mode: 'blank',
                            remainingSec: PEX_STATE.phaseEndsAt ? Math.max(0, Math.round((PEX_STATE.phaseEndsAt - Date.now()) / 1000)) : 0,
                            owner: Player?.MemberNumber,
                            gelId,
                            gelHolder: holder,
                            expiresAt: PEX_STATE.phaseEndsAt || 0,
                        }, true);
                    } catch (e) {}
                }
            } else if (data.Content === 'PEX_StateSync') {
                // 实时状态同步：对方的状态立刻刷到我本地的房间角色缓存上
                // （不依赖服务器 OnlineSharedSettings 的房间延迟——那是按钮/凝胶/倒计时/动画
                //   之前"别人看不到"的根因）
                const raw = get('Payload');
                if (!raw) return;
                let payload = null;
                try { payload = JSON.parse(raw); } catch (e) { return; }
                const sender = Number(data.Sender);
                if (!sender || sender === Player?.MemberNumber || !payload || typeof payload !== 'object') return;
                const C = getCharacterByNumber(sender);
                if (!C) return;
                try {
                    if (!C.OnlineSharedSettings) C.OnlineSharedSettings = {};
                    if (!C.OnlineSharedSettings[ES_KEY]) C.OnlineSharedSettings[ES_KEY] = {};
                    C.OnlineSharedSettings[ES_KEY].state = payload;
                } catch (e) {}
            } else if (data.Content === 'PEX_SharedSync') {
                // 实时权限同步：对方改了远程编辑权限 → 资料页按钮立刻按新权限显示
                const raw = get('Payload');
                if (!raw) return;
                let payload = null;
                try { payload = JSON.parse(raw); } catch (e) { return; }
                const sender = Number(data.Sender);
                if (!sender || sender === Player?.MemberNumber || !payload || typeof payload !== 'object') return;
                const C = getCharacterByNumber(sender);
                if (!C) return;
                try {
                    if (!C.OnlineSharedSettings) C.OnlineSharedSettings = {};
                    if (!C.OnlineSharedSettings[ES_KEY]) C.OnlineSharedSettings[ES_KEY] = {};
                    const cur = C.OnlineSharedSettings[ES_KEY];
                    if (payload.edit !== undefined) cur.edit = payload.edit;
                    if (payload.editModes) cur.editModes = payload.editModes;
                    if (payload.wl) cur.wl = payload.wl;
                } catch (e) {}
            }
        } catch (e) {}
    });
}

function getNickname(memberNumber) {
    try {
        if (memberNumber === Player?.MemberNumber) return CharacterNickname(Player);
        const c = ChatRoomCharacter?.find(x => x?.MemberNumber === memberNumber);
        if (c) return CharacterNickname(c);
    } catch (e) {}
    return null;
}
