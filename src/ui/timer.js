// ════════════════════════════════════════
//  PEX 数字计时器挂件
//  在角色头顶绘制 mm:ss 倒计时（读 OnlineSharedSettings 公告状态）
//  可见性四档：self=仅自己 / whitelist=仅白名单 / others=仅他人 / all=所有人（旧值 both 兼容为 all）
// ════════════════════════════════════════

import { CONFIG, ES_KEY } from '../core/config.js';
import { getModApi } from '../core/config.js';

// 读角色的 PEX 公告状态
function readState(C) {
    try {
        return C?.OnlineSharedSettings?.[ES_KEY]?.state || null;
    } catch (e) { return null; }
}

// 是否该给这个角色画计时器（可见性读【被观察者】公告的设置，不是观察者自己的）
function shouldDraw(C) {
    try {
        const st = readState(C);
        if (!st || !st.remainingSec || st.remainingSec <= 0) return false;
        if (st.mode !== 'waiting' && st.mode !== 'blocked' && st.mode !== 'blank') return false;
        const isMe = C?.MemberNumber != null && Player?.MemberNumber != null && C.MemberNumber === Player.MemberNumber;
        // 优先用对方公告的可见性设置（对方设"仅自己"→ 别人不画他的）；兜底读自己的配置
        const vis = st.timerVisibility || CONFIG.timerVisibility || 'all';
        if (vis === 'all' || vis === 'both') return true;   // both 兼容旧值
        if (vis === 'self') return isMe;
        if (vis === 'others') return !isMe;
        if (vis === 'whitelist') {
            // 仅白名单：自己总能看到自己的；别人要看他在不在被观察者公告的白名单里
            if (isMe) return true;
            const wl = C?.OnlineSharedSettings?.[ES_KEY]?.wl || [];
            const myNo = Player?.MemberNumber;
            return wl.includes(String(myNo));
        }
        return false;
    } catch (e) { return false; }
}

function fmt(sec) {
    const s = Math.max(0, Math.ceil(sec));
    const m = Math.floor(s / 60);
    return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// 每帧绘制（BC 每帧重建整个 canvas，只在文本变化时画会被下一帧冲掉 → 闪烁）。
// 只有处于 PEX 状态的角色才画（一般 1-2 个），每帧 2 次 DrawText 开销可接受。
// 只显示 mm:ss（无文字标签，字号小，方便后续在数字后面加图片）。
// 每秒递减：优先用 expiresAt 本地推算（5.4.3…），不依赖 5 秒一次的广播量化值。
// 可见性：读【被观察者】公告的设置（对方设了"仅自己"→ 别人不画他的倒计时）。
// 位置：charY + 95*zoom = 角色头顶区域
function drawOnce(C, charX, charY, zoom, st) {
    const z = zoom || 1;
    const x = charX + 100 * z;          // 头顶中心 x 偏移
    const y = charY + 95 * z;           // 头顶上方
    // 剩余秒数：本地每秒推算（st.expiresAt 精确时间戳），广播的 remainingSec 只是 5 秒量化兜底
    let rem;
    if (st.expiresAt > 0) {
        rem = Math.max(0, Math.ceil((st.expiresAt - Date.now()) / 1000));
    } else {
        rem = Math.max(0, st.remainingSec || 0);
    }
    const text = fmt(rem);
    // 临时换小字号（DrawText 直接用 canvas 当前字体；画完恢复 36px 默认）
    let prevFont = null;
    const canvas = (typeof MainCanvas !== 'undefined') ? MainCanvas : null;
    if (canvas) {
        try { prevFont = canvas.font; canvas.font = '600 ' + Math.max(12, Math.round(15 * z)) + 'px "Segoe UI", Arial, sans-serif'; } catch (e) {}
    }
    // 白色数字 + 黑色描边（用户要求）
    DrawText(text, x + 1, y + 1, 'Black', '');
    DrawText(text, x, y, '#ffffff', '');
    if (canvas && prevFont != null) {
        try { canvas.font = prevFont; } catch (e) {}
    }
}

export function registerTimer() {
    const modApi = getModApi();
    if (!modApi) return;
    try {
        modApi.hookFunction('ChatRoomCharacterViewDrawOverlay', 1, (args, next) => {
            const result = next(args);
            try {
                if (typeof ChatRoomHideIconState !== 'undefined' && ChatRoomHideIconState >= 2) return result;
                const [character, charX, charY, zoom] = args;
                if (!character || !shouldDraw(character)) return result;
                const st = readState(character);
                drawOnce(character, charX, charY, zoom, st);
            } catch (e) {}
            return result;
        });
    } catch (e) {
        console.warn('⚗️[PEX] 计时器挂钩失败:', e.message);
    }
}
