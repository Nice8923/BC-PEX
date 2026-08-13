// ════════════════════════════════════════
//  PEX 初始化
//  等待顺序：bcModSdk → 游戏就绪 → 账号登录 → 设置载入 → registerMod → 挂全部钩子
// ════════════════════════════════════════

import { MOD_VER, setModApi, getModApi } from './config.js';
import { CONFIG } from './config.js';
import { ensureI18n, ui } from '../expansion/i18n.js';
import {
    loadSettings, publishSharedSettings, publishState,
    waitForExtensionSettings,
} from './storage.js';
import { registerMessageHook, registerTextQueryHook } from './net.js';
import { registerAtmosphereHooks } from '../effects/atmosphere.js';
import { hookChatInput, printChat, registerCommandOnce } from './commands.js';
import { hookChatRoomLifecycle, hookUnload } from './hooks.js';
import { registerGameplay, stopGameplay, clearRoomCaches } from '../gameplay/index.js';
import { registerPreferenceScreen } from '../ui/settings.js';
import { registerTimer } from '../ui/timer.js';
import { registerRemoteEdit } from '../ui/remote.js';
import { restoreStateFromPublished } from '../gameplay/excretion.js';
import { MODE, PEX_STATE } from '../gameplay/state.js';
import { pexLog, pexWarn } from '../util/util.js';

function waitForBcModSdk(timeout = 30000) {
    const start = Date.now();
    return new Promise(resolve => {
        const check = () => {
            if (typeof bcModSdk !== 'undefined' && bcModSdk?.registerMod) resolve(true);
            else if (Date.now() - start > timeout) resolve(false);
            else setTimeout(check, 100);
        };
        check();
    });
}

function waitForGame(timeout = 30000) {
    const start = Date.now();
    return new Promise(resolve => {
        const check = () => {
            try {
                if (typeof Player !== 'undefined' &&
                    typeof CharacterSetFacialExpression === 'function' &&
                    typeof ChatRoomCharacter !== 'undefined') resolve(true);
                else if (Date.now() - start > timeout) resolve(false);
                else setTimeout(check, 100);
            } catch (e) { setTimeout(check, 100); }
        };
        check();
    });
}

// 等账号真正登录后才读设置（防止读空数据 → 存档覆盖真数据）
function waitForLogin() {
    return new Promise(resolve => {
        const check = () => {
            try {
                const loggedIn = (typeof ServerIsLoggedIn === 'function' && ServerIsLoggedIn())
                    || (typeof Player !== 'undefined' && Player && typeof Player.MemberNumber === 'number'
                        && Player.MemberNumber > 0 && !!Player.AccountName);
                if (loggedIn) resolve(true);
                else setTimeout(check, 200);
            } catch (e) { setTimeout(check, 200); }
        };
        check();
    });
}

export async function initialize() {
    pexLog(`初始化 v${MOD_VER}...`);

    const sdkReady = await waitForBcModSdk();
    const gameReady = await waitForGame();
    if (!gameReady) {
        pexWarn('游戏加载超时，放弃初始化');
        return;
    }

    await ensureI18n();
    await waitForLogin();
    await waitForExtensionSettings();
    loadSettings();
    // 登录还原：从 OnlineSharedSettings 读回上次公告的状态
    //  —— 必须在 publishSharedSettings 覆写公告前调用
    restoreStateFromPublished();
    publishSharedSettings(true);

    if (sdkReady) {
        try {
            setModApi(bcModSdk.registerMod({
                name: 'Personality Excretion (PEX)',
                fullName: 'Personality Excretion',
                version: MOD_VER,
            }));
        } catch (e) {
            pexWarn('registerMod 失败，进入兼容模式:', e.message);
        }
    }

    const modApi = getModApi();
    if (modApi) {
        // 消息接收
        registerMessageHook(modApi);
        // Action 播报翻译兜底（MISSING TEXT 根治）
        registerTextQueryHook(modApi);
        // 氛围层（眩晕模糊走 BC 原生管线）
        registerAtmosphereHooks(modApi);
        // 房间生命周期：进房注册指令 + 公告；离房发布空闲状态兜底
        hookChatRoomLifecycle(
            () => {
                registerCommandOnce();
                setTimeout(() => { try { publishSharedSettings(true); } catch (e) {} }, 800);
                // 进房后：恢复自己公告的状态显示（断线重连补发）
                setTimeout(() => {
                    try {
                        if (PEX_STATE.mode !== MODE.IDLE && PEX_STATE.phaseEndsAt > 0) {
                            pexLog('进房还原状态:', PEX_STATE.mode);
                            publishState({
                                mode: PEX_STATE.mode,
                                type: PEX_STATE.gelType,
                                expiresAt: PEX_STATE.phaseEndsAt,
                                owner: PEX_STATE.ownerMemberNumber ?? Player?.MemberNumber,
                                gelId: PEX_STATE.gelId,
                                gelHolder: PEX_STATE.gelHolder,
                            });
                        }
                    } catch (e) {}
                }, 1500);
            },
            () => { try { clearRoomCaches(); } catch (e) {} }
        );
        hookUnload(() => {
            try { stopGameplay(); } catch (e) {}
            try { registerMessageHook && clearMessageHandlersSafe(); } catch (e) {}
        });
    }

    hookChatInput();   // /pex 指令 keydown 兜底（CommandCombine 在进房后注册）

    // 玩法总装（触发/状态循环/表现）——不依赖 registerMod 是否成功
    registerGameplay();
    // UI：设置页 + 数字计时器 + 远程编辑
    registerPreferenceScreen();
    registerTimer();
    registerRemoteEdit();

    // 数据保险：关页/重连前强制 flush 账号更新队列
    try {
        if (typeof window !== 'undefined' && !window._pexUnloadFlush) {
            window._pexUnloadFlush = () => {
                try { if (typeof ServerAccountUpdate?.SyncToServer === 'function') ServerAccountUpdate.SyncToServer(); } catch (e) {}
            };
            window.addEventListener('pagehide', window._pexUnloadFlush);
            window.addEventListener('beforeunload', window._pexUnloadFlush);
        }
    } catch (e) {}

    pexLog(`初始化完成 v${MOD_VER}`);

    // 进房后播报一次安装完成（一次性）
    let _loadedNotified = false;
    const _loadCheck = setInterval(() => {
        try {
            if (typeof CurrentScreen === 'undefined' || CurrentScreen !== 'ChatRoom') return;
            clearInterval(_loadCheck);
            if (_loadedNotified) return;
            _loadedNotified = true;
            setTimeout(() => printChat(ui('loaded', { v: MOD_VER })), 1000);
        } catch (e) { clearInterval(_loadCheck); }
    }, 500);
}

// 卸载清理辅助（避免循环引用）
function clearMessageHandlersSafe() {
    import('./net.js').then(m => m.clearMessageHandlers()).catch(() => {});
}
