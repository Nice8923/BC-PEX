// ════════════════════════════════════════
//  PEX 画面效果层（DOM 覆盖层）
//  - 眩晕波浪：canvas 抖动（合成器级）+ 模糊交给原生管线（GetBlurLevel 钩子）
//    + 闪层用 CSS 动画（合成器驱动，JS 不参与每帧）
//  - 失神：画面黑白（canvas grayscale，静态单滤镜）
//  - 视野收窄：暗角遮罩（all=无 / surround=四周压暗 / self=仅留中心小窗）
// ════════════════════════════════════════

import { CONFIG } from '../core/config.js';
import { setAtmoBlur, clearAtmo } from './atmosphere.js';

const OVERLAY_ID = 'pex-overlay';
let _overlay = null;
let _dizzyTimer = null;
let _dizzyRunning = false;
let _dizzyLevel = 3;
let _viewMaskEl = null;
let _animStyleInjected = false;

function getCanvas() {
    return document.getElementById('MainCanvas') || document.querySelector('canvas');
}

function ensureOverlay() {
    if (_overlay && document.getElementById(OVERLAY_ID)) return _overlay;
    let el = document.getElementById(OVERLAY_ID);
    if (!el) {
        el = document.createElement('div');
        el.id = OVERLAY_ID;
        Object.assign(el.style, {
            position: 'fixed', left: '0', top: '0', width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: '99998', overflow: 'hidden',
        });
        document.body.appendChild(el);
    }
    _overlay = el;
    return el;
}

// CSS 动画样式只注入一次（合成器驱动，替代逐帧 opacity/transform 写入）
function ensureAnimStyles() {
    if (_animStyleInjected) return;
    _animStyleInjected = true;
    try {
        const st = document.createElement('style');
        st.id = 'pex-anim-styles';
        st.textContent =
            '@keyframes pexDizzyFlash{0%,100%{opacity:0.04}30%{opacity:0.16}60%{opacity:0.24}85%{opacity:0.10}}' +
            '@keyframes pexDizzyPulse{0%,100%{opacity:0.25}40%{opacity:0.85}70%{opacity:0.35}}';
        document.head.appendChild(st);
    } catch (e) {}
}

// ── 眩晕波浪 ──
// 断续脉冲：每波 1.4s（0.8s 发作 + 0.6s 平息），波数由等待时长决定；发作强度随波次递增
// 性能：零 canvas 写入（不抖动画布、不写 filter）——模糊走原生 GetBlurLevel（只改一个数字），
//   闪层/脉冲纯 CSS 动画由合成器驱动 → 轻量
export function startDizzy(totalMs, level = 3) {
    stopDizzy();
    _dizzyLevel = Math.max(1, Math.min(5, level || 3));
    _dizzyRunning = true;
    ensureAnimStyles();
    const overlay = ensureOverlay();
    // 闪层（CSS 动画）
    const flash = document.createElement('div');
    flash.style.cssText = 'position:fixed;inset:0;pointer-events:none;' +
        'background:radial-gradient(circle at 50% 50%, transparent 42%, rgba(242,123,168,0.55));' +
        'animation:pexDizzyFlash 1400ms ease-in-out infinite;';
    overlay.appendChild(flash);
    // 脉冲晕眩层（CSS 动画，代替 canvas 抖动）
    const pulse = document.createElement('div');
    pulse.style.cssText = 'position:fixed;inset:0;pointer-events:none;' +
        'background:radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(15,8,28,0.42) 100%);' +
        'animation:pexDizzyPulse 1400ms ease-in-out infinite;';
    overlay.appendChild(pulse);

    const waveMs = 1400;
    const activeMs = 800;
    const totalWaves = Math.max(2, Math.round(totalMs / waveMs));
    let wave = 0;
    let lastUpdate = 0;
    const step = (now) => {
        if (!_dizzyRunning) return;
        if (now - lastUpdate >= 100) {   // 10fps
            lastUpdate = now;
            const t = (now % waveMs) / waveMs;
            const waveProgress = Math.min(1, wave / Math.max(1, totalWaves - 1));
            // 发作段内：sin 脉冲；平息段：几乎归零 → 一阵一阵、不连续
            const active = (now % waveMs) < activeMs ? Math.sin((t / (activeMs / waveMs)) * Math.PI) : 0;
            // 模糊交给原生管线（其他角色+房间背景）——唯一每帧更新的东西，只改一个数字
            setAtmoBlur(active > 0.02 ? (1.0 + 2.2 * waveProgress * (_dizzyLevel / 3) * active) : 0.3);
            if (t < 0.05 && wave < totalWaves) wave++;
        }
        _dizzyTimer = requestAnimationFrame(step);
    };
    _dizzyTimer = requestAnimationFrame(step);
}

// 眩晕渐消（被挡时用）：模糊幅度逐渐归零后停止（10fps 节流）
export function fadeOutDizzy(durationMs = 1500) {
    if (!_dizzyRunning) return;
    const start = performance.now();
    let last = 0;
    const fade = (now) => {
        if (!_dizzyRunning) return;
        const p = Math.min(1, (now - start) / durationMs);
        if (now - last >= 100) {
            last = now;
            setAtmoBlur(0.4 * (1 - p));
        }
        if (p < 1) requestAnimationFrame(fade);
        else stopDizzy();
    };
    requestAnimationFrame(fade);
}

export function stopDizzy() {
    _dizzyRunning = false;
    if (_dizzyTimer) { cancelAnimationFrame(_dizzyTimer); _dizzyTimer = null; }
    setAtmoBlur(0);
    // 清理 canvas 上可能残留的过渡/抖动样式（不动黑白，黑白由 blankView 单独管理）
    const canvas = getCanvas();
    if (canvas) {
        canvas.style.transition = '';
        canvas.style.transform = '';
        const cur = canvas.style.filter || '';
        canvas.style.filter = cur.replace(/blur\([^)]*\)/g, '').trim();
    }
    if (_overlay) _overlay.innerHTML = '';
}

// ── 排出剧烈特效（动画期间）：画面震动 + 持续高模糊 ──
// 比等待期眩晕更剧烈：canvas transform 随机抖动（合成器级，零重绘）+ 原生管线
// 持续高模糊（不脉冲衰减）。模糊由调用方管理（人格失神保持 / 普通凝胶清 0）。
let _shakeTimer = null;
let _shakeRunning = false;

export function startExcreteFx(durationMs, level = 3, shake = true, blur = true) {
    stopExcreteFx();
    if (!shake && !blur) return;   // 特效全关：不启动
    _shakeRunning = true;
    ensureAnimStyles();
    if (shake) {
        // 快节奏闪层（CSS 动画，合成器驱动）
        const overlay = ensureOverlay();
        const flash = document.createElement('div');
        flash.style.cssText = 'position:fixed;inset:0;pointer-events:none;' +
            'background:radial-gradient(circle at 50% 50%, transparent 40%, rgba(242,123,168,0.62));' +
            'animation:pexDizzyFlash 900ms ease-in-out infinite;';
        overlay.appendChild(flash);
    }
    // 持续高模糊（全程不衰减，比等待期脉冲峰值更强；模糊由调用方管理）
    if (blur) setAtmoBlur(3 + (level || 3) * 0.8);
    // 画面震动：随机平移抖动（transform 合成器级）
    const canvas = getCanvas();
    const amp = 3 + (level || 3) * 1.2;
    const step = () => {
        if (!_shakeRunning) return;
        if (canvas && shake) {
            const dx = (Math.random() - 0.5) * amp * 2;
            const dy = (Math.random() - 0.5) * amp * 2;
            canvas.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
        }
        _shakeTimer = requestAnimationFrame(step);
    };
    _shakeTimer = requestAnimationFrame(step);
    // 到时停止抖动（模糊由调用方决定保留/清除）
    setTimeout(() => { if (_shakeRunning) stopExcreteFx(); }, Math.max(500, durationMs || 2600));
}

export function stopExcreteFx() {
    _shakeRunning = false;
    if (_shakeTimer) { cancelAnimationFrame(_shakeTimer); _shakeTimer = null; }
    const canvas = getCanvas();
    if (canvas) canvas.style.transform = '';
    if (_overlay) _overlay.innerHTML = '';
}

// ── 失神：黑白 + 视野收窄 ──
let _blankOn = false;   // 黑白是否激活（供每帧强制，防止被屏幕切换/重绘清掉）

export function applyBlankView(viewMode = 'surround') {
    _blankOn = true;
    const canvas = getCanvas();
    if (canvas) {
        const cur = canvas.style.filter || '';
        if (!cur.includes('grayscale')) canvas.style.filter = (cur ? cur + ' ' : '') + 'grayscale(1)';
    }
    const overlay = ensureOverlay();
    if (_viewMaskEl) _viewMaskEl.remove();
    if (viewMode === 'all') return;
    _viewMaskEl = document.createElement('div');
    _viewMaskEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99997;';
    if (viewMode === 'surround') {
        // 四周压暗，留中心亮区——暗角强度随特效强度缩放（1→0.30 … 5→0.82）
        const lv = Math.max(1, Math.min(5, CONFIG.effectLevel || 3));
        const o = 0.3 + 0.13 * (lv - 1);
        _viewMaskEl.style.background =
            `radial-gradient(ellipse at 50% 55%, transparent 0%, transparent 28%, rgba(5,5,10,${o.toFixed(2)}) 55%, rgba(5,5,10,${Math.min(0.95, o + 0.27).toFixed(2)}) 100%)`;
    } else {
        // 仅自己：极窄视野
        _viewMaskEl.style.background =
            'radial-gradient(ellipse at 50% 60%, transparent 0%, transparent 10%, rgba(5,5,10,0.7) 30%, rgba(5,5,10,0.94) 100%)';
    }
    overlay.appendChild(_viewMaskEl);
}

// 每帧强制黑白（由 ChatRoomRun hook 每帧调用）：
// 打开资料页/选项卡等界面时 BC 会重绘/重置画布样式，一次性设置会被清掉 → 这里兜底
export function enforceBlankFilter() {
    if (!_blankOn) return;
    try {
        const canvas = getCanvas();
        if (!canvas) return;
        const cur = canvas.style.filter || '';
        if (!cur.includes('grayscale')) canvas.style.filter = (cur ? cur + ' ' : '') + 'grayscale(1)';
    } catch (e) {}
}

export function clearBlankView() {
    _blankOn = false;
    const canvas = getCanvas();
    if (canvas) {
        const cur = canvas.style.filter || '';
        canvas.style.filter = cur.replace(/grayscale\(1\)/g, '').replace(/\s+/g, ' ').trim();
    }
    if (_viewMaskEl) { _viewMaskEl.remove(); _viewMaskEl = null; }
}

// 黑白/暗角淡出（恢复时用）：先停掉每帧强制（否则 enforce 会马上补回黑白），
// 再用 CSS transition 平滑淡出画布灰阶与暗角遮罩；淡出完成后回调
// （"放回"音效在淡出结束后才播，由回调驱动）
export function fadeOutBlankView(durationMs = 800, onDone) {
    _blankOn = false;
    const ms = Math.max(1, durationMs || 800);
    try {
        const canvas = getCanvas();
        if (canvas) {
            const cur = canvas.style.filter || '';
            if (cur.includes('grayscale')) {
                canvas.style.transition = 'filter ' + ms + 'ms ease';
                canvas.style.filter = cur.replace(/grayscale\(1\)/g, '').replace(/\s+/g, ' ').trim();
                setTimeout(() => { try { canvas.style.transition = ''; } catch (e) {} }, ms + 50);
            }
        }
    } catch (e) {}
    try {
        if (_viewMaskEl) {
            _viewMaskEl.style.transition = 'opacity ' + ms + 'ms ease';
            _viewMaskEl.style.opacity = '0';
            const mask = _viewMaskEl;
            setTimeout(() => { try { mask.remove(); } catch (e) {} }, ms + 50);
            _viewMaskEl = null;
        }
    } catch (e) {}
    setTimeout(() => { try { if (onDone) onDone(); } catch (e) {} }, ms);
}

// 清空全部效果
export function clearAllEffects() {
    stopDizzy();
    stopExcreteFx();
    clearBlankView();
    clearAtmo();
}
