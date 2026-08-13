// ════════════════════════════════════════
//  PEX 排出流程编排（状态机核心）
//  trigger → startFlow → WAITING(眩晕) → attemptExcrete(臀部判定)
//    → 空: EXCRETING(动画) → 人格: BLANK(失神+凝胶) / 普通: 表情闪现后恢复
//    → 挡: BLOCKED(眩晕渐消, 等待) → 拿掉立刻排 / 上限静默取消
// ════════════════════════════════════════

import { CONFIG, ES_KEY } from '../core/config.js';
import { MODE, PEX_STATE, setMode } from './state.js';
import { publishState } from '../core/storage.js';
import { pexSendAction } from '../core/net.js';
import { startDizzy, fadeOutDizzy, clearAllEffects, applyBlankView, stopDizzy, startExcreteFx, stopExcreteFx, fadeOutBlankView } from '../effects/overlay.js';
import { setAtmoBlur, clearAtmo, setAtmoBlind, clearAtmoBlind } from '../effects/atmosphere.js';
import { applyExpression, applyBlankFace, restoreCharacterFx, setSpeechBlock, setBodyBlock } from './state-fx.js';
import { createGelId, broadcastGelExpired, broadcastGelInvalidated, checkHeldGelExpired } from './gel-item.js';
import { scheduleWaitFx, clearWaitFxTimers, broadcastSound } from './wait-fx.js';
import { ui } from '../expansion/i18n.js';
import { pexLog, playSound } from '../util/util.js';

let _flowId = 0;          // 流程序号（取消/强恢时作废进行中的动画）
let _normalTimer = null;  // 普通凝胶表情计时

// 恢复时黑白/暗角淡出时长：淡出完成后才播"放回"音效
export const RECOVER_FADE_MS = 800;

// 臀部是否有东西阻挡（ItemButt 装备位）
export function isButtBlocked() {
    try {
        return !!InventoryGet(Player, 'ItemButt');
    } catch (e) { return false; }
}

// 触发流程（由 trigger.js 调用）
export function startFlow(gelType) {
    if (PEX_STATE.mode !== MODE.IDLE) {
        // 普通凝胶状态中（凝胶还在、人没失神）允许再次喝下：清掉旧凝胶，重新开始
        // 人格凝胶失神中保持拒绝（人被封着动不了，本来也喝不到）
        if (PEX_STATE.mode === MODE.BLANK && PEX_STATE.gelType === 'normal') {
            pexLog('普通凝胶状态中再次喝下：清掉旧凝胶，重新开始');
            clearWaitFxTimers();
            if (_normalTimer) { clearTimeout(_normalTimer); _normalTimer = null; }
            if (PEX_STATE.gelId) broadcastGelExpired(PEX_STATE.gelId);
            setMode(MODE.IDLE);
        } else {
            pexLog('已有活动状态，忽略本次触发');
            return false;
        }
    }
    _flowId++;
    const my = _flowId;
    const waitMs = Math.max(0, CONFIG.waitSeconds) * 1000;
    setMode(MODE.WAITING, { gelType, endsAt: Date.now() + waitMs });
    // 等待期表现（人格/普通凝胶都有）：眩晕脉冲（可关）+ 等待音效/等待表情同步
    // 段数 = 等待秒数/10（10 秒 1 段…50 秒及以上 5 段），每段同一时间点随机抽音效+表情
    // 第 N+1 个表情（排出表情）在排出动画开始时播（excreteNow 里），不是等待期
    if (waitMs > 0) {
        if (CONFIG.fxDizzy) startDizzy(waitMs, CONFIG.effectLevel);
        scheduleWaitFx(() => my === _flowId, waitMs);
    }
    // expiresAt 是绝对时间戳：即时收到的人和晚进房读 OSS 的人用同一个字段各自算剩余秒数，
    // 不需要重播倒数，也不需要为"晚进房"另做一套机制
    // ponytail: 绝对时间戳吃客户端时钟偏移（收端时钟偏几秒倒数就偏几秒）。
    //   相对秒数不吃偏移但对"晚进房读 OSS"无效（不知道那个值是多久前写的），
    //   要两者兼顾只能等 BC 给服务器时钟。浏览器普遍 NTP 同步，差几秒是纯视觉问题。
    publishState({
        mode: MODE.WAITING,
        type: gelType,
        expiresAt: PEX_STATE.phaseEndsAt,
        owner: Player?.MemberNumber,
    });
    pexSendAction(gelType === 'persona'
        ? '%NAME%喝下了什么奇怪的东西，一阵异样的感觉涌了上来…'
        : '%NAME%喝下了什么黏糊糊的东西…');
    return true;
}

// 排出时刻：检查臀部 → 空则排，挡则等待
export function attemptExcrete() {
    if (isButtBlocked()) {
        // 被挡：眩晕渐消，表情恢复正常（不再停留在最后一个等待表情），进入等待
        fadeOutDizzy(1500);
        restoreCharacterFx();
        const endMs = Math.max(1, CONFIG.blockedWaitMinutes) * 60 * 1000;
        setMode(MODE.BLOCKED, { endsAt: Date.now() + endMs });
        publishState({
            mode: MODE.BLOCKED,
            type: PEX_STATE.gelType,
            expiresAt: PEX_STATE.phaseEndsAt,
            owner: Player?.MemberNumber,
        });
        pexSendAction('%NAME%的臀部被什么东西挡住了，凝胶堵在里面出不来…');
        return;
    }
    excreteNow();
}

async function excreteNow() {
    if (PEX_STATE.mode === MODE.EXCRETING) return;   // 防重入：动画进行中不重复启动
    const my = _flowId;
    setMode(MODE.EXCRETING);
    // 排出表情：与排出动画同时播（等待期表情由 wait-fx 排程）
    const exprSets = CONFIG.expressions || {};
    if (exprSets.excrete) applyExpression(exprSets.excrete);
    // 排出剧烈特效：震动 + 持续高模糊（比等待期眩晕更剧烈）；先清掉等待期眩晕
    // 震动/模糊可分别关闭（特效开关）
    stopDizzy();
    if (CONFIG.fxShake || CONFIG.fxBlur) {
        startExcreteFx(ANIM_DURATION + 300, CONFIG.effectLevel, CONFIG.fxShake, CONFIG.fxBlur);
    }
    const excreteUrl = playSound('excrete');   // 排出音效（返回实际 URL 供广播）
    broadcastSound('excrete', excreteUrl);
    // startedAt 供远程去重：同一个排出动作只播一次动画（防"播了 2 遍"）
    const excreteStartedAt = Date.now();
    publishState({ mode: MODE.EXCRETING, type: PEX_STATE.gelType, owner: Player?.MemberNumber, startedAt: excreteStartedAt });
    // 排出动画（白色方块 4 帧占位，正式素材后换）；时长对齐排出音效：
    // 动画结束（进黑白）正好排出音效播完——探测实际音效时长，短于默认用默认
    await playExcreteAnimation(excreteUrl);
    if (my !== _flowId) return;

    if (PEX_STATE.gelType === 'normal') {
        // 普通凝胶：凝胶照常落地，但人不失神——没有任何失神限制
        // （黑白/失明/禁言/不能动全都不套；姿势/动作/说话/离开照常）
        const autoSec = CONFIG.autoRevertEnabled ? Math.max(1, CONFIG.autoRevertMinutes) * 60 * 1000 : 0;
        const gelId = createGelId(Player?.MemberNumber);
        stopExcreteFx();      // 停排出震动（模糊清 0——普通凝胶无失神表现）
        setAtmoBlur(0);
        setMode(MODE.BLANK, { endsAt: autoSec ? Date.now() + autoSec : 0, gelId, gelHolder: null, gelType: 'normal' });
        // 短暂表情变化后恢复（普通凝胶的表现）
        applyExpression(CONFIG.normalExpression);
        if (_normalTimer) clearTimeout(_normalTimer);
        _normalTimer = setTimeout(() => {
            _normalTimer = null;
            if (my !== _flowId) return;
            restoreCharacterFx();
        }, Math.max(1, CONFIG.normalExpressionSeconds) * 1000);
        publishState({
            mode: MODE.BLANK,
            type: 'normal',
            owner: Player?.MemberNumber,
            gelId,
            gelHolder: null,
            expiresAt: PEX_STATE.phaseEndsAt,
        });
        pexSendAction('%NAME%排出了一坨软趴趴的普通凝胶，落在脚边…');
        return;
    }

    // 人格凝胶：失神，凝胶落在脚边（逻辑状态；捡起时生成物品到手）
    const autoSec = CONFIG.autoRevertEnabled ? Math.max(1, CONFIG.autoRevertMinutes) * 60 * 1000 : 0;
    const gelId = createGelId(Player?.MemberNumber);
    // 排出完成：停掉排出震动，进入静态失神（黑白 + 固定模糊，画面不再动）
    stopExcreteFx();
    stopDizzy();
    if (CONFIG.fxBlur) setAtmoBlur(1.5 + CONFIG.effectLevel * 0.5);
    setAtmoBlind(CONFIG.blindLevel);   // BC 原生失明视野（blindLevel 0=关）
    setMode(MODE.BLANK, { endsAt: autoSec ? Date.now() + autoSec : 0, gelId, gelHolder: null });
    _blankViewMode = CONFIG.viewMode;
    _blankEffectLevel = CONFIG.effectLevel;
    _blankBlind = CONFIG.blindLevel;
    if (CONFIG.fxBlank) applyBlankView(CONFIG.viewMode);
    // 失神 = 目光呆滞（不跪不闭眼，维持排出动作）+ 失神定格表情
    applyBlankFace(exprSets.blank || exprSets.excrete);
    if (CONFIG.restrictions) {   // 失神限制（不能动/禁言/不眨眼/姿势锁定），可关闭
        setSpeechBlock(true);
        setBodyBlock(true);
    }
    publishState({
        mode: MODE.BLANK,
        type: 'persona',
        owner: Player?.MemberNumber,
        gelId,
        gelHolder: null,
        expiresAt: PEX_STATE.phaseEndsAt,
    });
    pexSendAction('%NAME%的身体一阵脱力，瘫坐下来眼神空洞——人格凝胶被排了出来，落在脚边…');
}

// 静默取消（阻挡等待上限到 / 强制）
export function cancelFlow(silent = true) {
    _flowId++;
    clearWaitFxTimers();
    if (_normalTimer) { clearTimeout(_normalTimer); _normalTimer = null; }
    clearAllEffects();
    clearAtmoBlind();
    restoreCharacterFx();
    setSpeechBlock(false);
    setBodyBlock(false);
    setMode(MODE.IDLE);
    publishState(null);
    if (!silent) pexSendAction('%NAME%恢复了正常。');
}

// 恢复人格（喂回成功 / 自动回归 / 强恢）
// onFaded：黑白/暗角淡出完成后的回调（放回音效在淡出结束后才播）
export function recoverPersona(announce, onFaded) {
    _flowId++;
    clearWaitFxTimers();
    if (_normalTimer) { clearTimeout(_normalTimer); _normalTimer = null; }
    stopDizzy();
    stopExcreteFx();
    clearAtmo();
    clearAtmoBlind();
    restoreCharacterFx();
    setSpeechBlock(false);
    setBodyBlock(false);
    setMode(MODE.IDLE);
    publishState(null);
    // 黑白/暗角淡出（0.8s）；"放回"音效在淡出完成后由调用方通过 onFaded 播放
    fadeOutBlankView(RECOVER_FADE_MS, onFaded);
    if (announce) pexSendAction(announce);
}

// 自动回归：凝胶到期（= 主人恢复的同一时刻）→ 凝胶按设置消散或变无效凝胶
export function autoRevert() {
    pexLog('自动回归触发');
    const isNormal = PEX_STATE.gelType === 'normal';
    if (PEX_STATE.gelId) {
        if (CONFIG.gelExpireMode === 'invalid') {
            // 变无效凝胶：广播给持有者客户端 → 手上凝胶永久保留（归持有者）
            broadcastGelInvalidated(PEX_STATE.gelId, Player?.MemberNumber);
            recoverPersona(ui(isNormal ? 'gelInvalidatedNormal' : 'gelInvalidated'));
            return;
        }
        broadcastGelExpired(PEX_STATE.gelId);
    }
    recoverPersona(ui(isNormal ? 'gelExpiredNormal' : 'gelExpired'));   // %NAME%由发送端替换，名字只出现一次
}

// 失神中修改的视觉参数缓存（viewMode/effectLevel 变化 → 立即重应用）
let _blankViewMode = null;
let _blankEffectLevel = null;
let _blankBlind = null;

// 主循环 tick（由 index.js 每 250ms 调用）
export function tick(now) {
    const s = PEX_STATE;
    if (s.mode === MODE.WAITING) {
        if (s.phaseEndsAt > 0 && now >= s.phaseEndsAt) attemptExcrete();
    } else if (s.mode === MODE.BLOCKED) {
        if (!isButtBlocked()) {
            // 拿掉遮挡 → 立刻排
            pexSendAction('%NAME%臀部的遮挡被拿开了，凝胶开始往外挤…');
            excreteNow();
        } else if (s.phaseEndsAt > 0 && now >= s.phaseEndsAt) {
            // 上限到 → 静默取消
            cancelFlow();
            pexSendAction('%NAME%好像什么也没发生。');
        }
    } else if (s.mode === MODE.BLANK) {
        // 失神中修改视野/特效强度 → 立即生效（不用重新失神）。
        // 普通凝胶没有失神表现，跳过视觉重应用（否则会把普通凝胶也变黑白）；
        // 黑白/模糊开关关闭时同样跳过
        if (s.gelType !== 'normal') {
            if (CONFIG.fxBlank && _blankViewMode !== CONFIG.viewMode) {
                _blankViewMode = CONFIG.viewMode;
                applyBlankView(CONFIG.viewMode);
            }
            if (CONFIG.fxBlur && _blankEffectLevel !== CONFIG.effectLevel) {
                _blankEffectLevel = CONFIG.effectLevel;
                setAtmoBlur(1.5 + CONFIG.effectLevel * 0.5);
            }
            if (_blankBlind !== CONFIG.blindLevel) {
                _blankBlind = CONFIG.blindLevel;
                setAtmoBlind(CONFIG.blindLevel);
            }
        }
        if (CONFIG.autoRevertEnabled && s.phaseEndsAt > 0 && now >= s.phaseEndsAt) autoRevert();
    }
}

// 手持凝胶过期兜底（任何模式都跑；由 index.js 每秒调用）：
// 持有者没收到到期广播时（跨房间/离线重进），用物品上同一个 expiresAt
// （= 主人恢复时刻）按设置无效化或移除。
// 这里曾经还每 5 秒重播一次倒数状态 —— 已删：剩余秒数收端用 expiresAt 自己算。
export function publishTick() {
    try { checkHeldGelExpired(); } catch (e) {}
}

// ── 排出动画（白色方块 4 帧，画进角色画布的身体层——会被衣服遮住）──
// 动画帧由 gel-item 的层 7 伪资产绘制（gelLayerDraw）；这里只记录动画状态，
// 并在动画期间每帧置 MustDraw=true 强制重绘角色画布 → 层 7 帧随动画更新
// 动画时长 = 默认排出音效时长（7.34s）：动画结束进黑白正好排出音效播完
const ANIM_DURATION = 7340;
let _animDuration = ANIM_DURATION;   // 实际动画时长（探测到自定义音效更长时用实际值）
let _animOverride = 0;               // 测试覆写（独立于探测，防被覆盖）
const _canvasAnims = new Map();   // memberNumber → startedAt

// 供层 7 伪资产读取动画状态与时长（gel-item.drawGelUnder 按比例画 4 帧）
export function getCanvasAnimEntry(memberNumber) { return _canvasAnims.get(memberNumber) || 0; }
export function deleteCanvasAnimEntry(memberNumber) { _canvasAnims.delete(memberNumber); }
export function getAnimDuration() { return _animOverride > 0 ? _animOverride : _animDuration; }
// 测试钩子：覆盖动画时长（回归用 2600 加速；传 0 恢复默认）
export function setAnimDurationOverride(ms) { _animOverride = ms > 0 ? ms : 0; }

// 开始动画（本地与远程共用：记录角色成员号 + 开始时间）
// startedAt：远程用对方广播的时间戳对齐进度（中途才看到的人接上正在播的那一段，
//   而不是从头重播）；本地不传 = 现在开始
export function startExcreteAnim(C, startedAt) {
    try {
        if (!C || C.MemberNumber == null) return;
        _canvasAnims.set(C.MemberNumber, startedAt > 0 ? startedAt : Date.now());
    } catch (e) {}
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 探测音效实际时长（loadedmetadata）：动画长度对齐音效，动画结束=音效播完
function probeAudioDuration(url) {
    if (!url) return Promise.resolve(0);
    return new Promise(resolve => {
        try {
            const a = new Audio(String(url));
            let done = false;
            const fin = (v) => { if (!done) { done = true; resolve(v); } };
            a.addEventListener('loadedmetadata', () => fin(a.duration > 0 ? a.duration * 1000 : 0));
            a.addEventListener('error', () => fin(0));
            setTimeout(() => fin(0), 3000);
        } catch (e) { resolve(0); }
    });
}

async function playExcreteAnimation(excreteUrl) {
    startExcreteAnim(Player);
    if (_animOverride > 0) { await sleep(_animOverride); return; }   // 测试覆写优先
    const probed = await probeAudioDuration(excreteUrl);
    _animDuration = Math.max(ANIM_DURATION, probed);   // 探测到更长 → 对齐实际音效
    await sleep(_animDuration);
}

// ── 登录还原──
// 页面刷新/重连后，从 OnlineSharedSettings 读回自己上次公告的状态，
// 还原 PEX_STATE + 全部表现（黑白/表情/禁言/凝胶/倒计时继续走）
export function restoreStateFromPublished() {
    try {
        const saved = Player?.OnlineSharedSettings?.[ES_KEY]?.state;
        if (!saved || typeof saved !== 'object' || !saved.mode) return;
        if (saved.mode === MODE.BLANK) {
            const isNormal = saved.type === 'normal';
            setMode(MODE.BLANK, {
                endsAt: saved.expiresAt || 0,
                gelId: saved.gelId || null,
                gelHolder: null,
                gelType: isNormal ? 'normal' : 'persona',
            });
            if (isNormal) {
                // 普通凝胶：只还原状态和凝胶，不套失神表现（可以动/说话）
                pexLog('登录还原：普通凝胶状态（凝胶 ' + (saved.gelId || '无') + '）');
                return;
            }
            stopDizzy();
            if (CONFIG.fxBlur) setAtmoBlur(1.5 + CONFIG.effectLevel * 0.5);
            setAtmoBlind(CONFIG.blindLevel);
            if (CONFIG.fxBlank) applyBlankView(CONFIG.viewMode);
            const exprObj = CONFIG.expressions || {};
            applyBlankFace(exprObj.blank || exprObj.excrete);
            if (CONFIG.restrictions) {
                setSpeechBlock(true);
                setBodyBlock(true);
            }
            pexLog('登录还原：失神状态（凝胶 ' + (saved.gelId || '无') + '）');
        } else if (saved.mode === MODE.WAITING || saved.mode === MODE.BLOCKED) {
            // 用绝对 expiresAt 续跑（旧存档没有 expiresAt 的退回 remainingSec）
            const endsAt = saved.expiresAt > 0
                ? saved.expiresAt
                : Date.now() + Math.max(1, saved.remainingSec || 30) * 1000;
            const remainMs = endsAt - Date.now();
            if (remainMs <= 0) return;   // 已经过期：不还原（tick 会立刻推进，没意义）
            setMode(saved.mode, { gelType: saved.type || 'persona', endsAt });
            if (saved.mode === MODE.WAITING) startDizzy(remainMs, CONFIG.effectLevel);
            pexLog('登录还原：' + saved.mode + '（剩余 ' + Math.round(remainMs / 1000) + ' 秒）');
        }
    } catch (e) {
        pexLog('登录还原失败:', e.message);
    }
}
