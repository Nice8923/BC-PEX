// ════════════════════════════════════════
//  PEX 氛围层：借力 BC 原生绘制管线（对照客户端源码验证）
//  - 眩晕模糊：hook Player.GetBlurLevel → BC 在自绘 pass 里模糊
//    "其他角色 + 房间背景"（Scripts_Drawing.js:441/1603），玩家角色不受影响
//  - 失神视野：hook Player.GetBlindLevel → BC 原生失明（画面变暗，DrawGetDarkFactor）
//  - 不写 canvas filter → 近乎零成本；且原生尊重玩家 AllowBlur 设置
// ════════════════════════════════════════

let _blurPx = 0;      // 当前要叠加的模糊 px（0 = 不模糊）
let _blindLv = 0;     // 失神时叠加的 BC 原生失明等级（0/1/2/3）

export function setAtmoBlur(px) { _blurPx = Math.max(0, px || 0); }
export function clearAtmo() { _blurPx = 0; }

export function setAtmoBlind(lv) { _blindLv = Math.max(0, Math.min(3, lv || 0)); }
export function clearAtmoBlind() { _blindLv = 0; }

// 给 hook Player.GetBlurLevel 用：叠加值（玩家关掉 AllowBlur 就不叠加）
export function pexBlurLevel() {
    if (_blurPx <= 0) return 0;
    try {
        if (Player?.GraphicsSettings?.AllowBlur === false) return 0;
    } catch (e) {}
    return _blurPx;
}

// 给 hook Player.GetBlindLevel 用：叠加的失明等级（0 = 不叠加）
export function pexBlindLevel() {
    return _blindLv;
}

// 由 core-init 在 registerMod 后调用一次
export function registerAtmosphereHooks(modApi) {
    if (!modApi) return;
    try {
        modApi.hookFunction('Player.GetBlurLevel', 4, (args, next) => {
            let base = 0;
            try { base = next(args) || 0; } catch (e) {}
            const add = pexBlurLevel();
            return add > base ? add : base;
        });
        // BC 原生失明视野：GetBlindLevel 越高画面越暗（DrawGetDarkFactor 每帧计算暗色）
        modApi.hookFunction('Player.GetBlindLevel', 4, (args, next) => {
            let base = 0;
            try { base = next(args) || 0; } catch (e) {}
            const add = pexBlindLevel();
            return add > base ? add : base;
        });
    } catch (e) {
        console.warn('⚗️[PEX] GetBlurLevel 挂钩失败:', e.message);
    }
}
