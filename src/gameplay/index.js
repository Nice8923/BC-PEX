// ════════════════════════════════════════
//  PEX 玩法总装：注册触发/消息/表现钩子 + 主循环
// ════════════════════════════════════════

import { getModApi } from '../core/config.js';
import { registerTrigger, registerLocalActivityHook, registerClickHook } from './trigger.js';
import { tick, publishTick, recoverPersona } from './excretion.js';
import { registerSpeechBlockHook, registerBodyBlockHooks } from './state-fx.js';
import { registerGelMessageHandlers, clearRemoteAnims, registerGelUnderlay } from './gel-item.js';
import { registerPickup } from './pickup.js';
import { registerWaitFx, broadcastSound } from './wait-fx.js';
import { pexLog, playSound } from '../util/util.js';
import { MODE, PEX_STATE, clearAllRemoteStates } from './state.js';

let _tickTimer = null;
let _publishTimer = null;

// 凝胶被喝回/喂回 → 若我是主人且状态中：恢复（人格凝胶恢复意识；普通凝胶只是状态结束）
// 放回音效时机：恢复时黑白/暗角淡出结束（0.8s）后才播——"黑白特效结束就开始播放回的音频"
function onGelConsumed({ gelId, owner, drinker }) {
    try {
        if (owner === Player?.MemberNumber) {
            if (PEX_STATE.mode === MODE.BLANK) {
                const isNormal = PEX_STATE.gelType === 'normal';
                pexLog('我的凝胶被放回身体:', gelId, 'drinker:', drinker);
                recoverPersona(isNormal
                    ? '%NAME%喝回了自己的凝胶，胃里一阵翻腾…'
                    : '%NAME%喝回了自己的人格凝胶，意识一下子回来了！',
                () => {
                    const url = playSound('feed');   // 放回音效（淡出结束后）
                    broadcastSound('feed', url);
                });
            } else {
                pexLog('我的凝胶被消耗:', gelId);
            }
        }
    } catch (e) {}
}

export function registerGameplay() {
    const modApi = getModApi();

    registerTrigger();
    if (modApi) registerLocalActivityHook(modApi);
    if (modApi) registerClickHook(modApi);
    if (modApi) registerSpeechBlockHook(modApi);
    if (modApi) registerBodyBlockHooks(modApi);
    if (modApi) registerGelUnderlay(modApi);   // 凝胶/动画底层绘制 + 眨眼锁
    registerGelMessageHandlers(onGelConsumed);
    registerWaitFx();                          // 等待音效/表情同步 + 其他玩家音效接收
    registerPickup();

    // 主循环：状态推进（250ms，纯本地）+ 手持凝胶过期兜底（1s，纯本地）
    // 他人排出动画原本还有第三个每秒定时器扫全房 —— 已删，改由 drawGelUnder
    // 在绘制时判断（零轮询，而且晚进房的人能接上正在播的动画）
    if (_tickTimer) clearInterval(_tickTimer);
    _tickTimer = setInterval(() => {
        try { tick(Date.now()); } catch (e) {}
    }, 250);

    if (_publishTimer) clearInterval(_publishTimer);
    _publishTimer = setInterval(() => {
        try { publishTick(); } catch (e) {}
    }, 1000);
}

// 卸载清理（modApi.onUnload 调用）
export function stopGameplay() {
    if (_tickTimer) { clearInterval(_tickTimer); _tickTimer = null; }
    if (_publishTimer) { clearInterval(_publishTimer); _publishTimer = null; }
    try { clearRemoteAnims(); } catch (e) {}
    try { clearAllRemoteStates(); } catch (e) {}
}
