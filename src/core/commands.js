// ════════════════════════════════════════
//  PEX 指令系统（/pex）
//  CommandCombine 注册（与其它插件共存）+ keydown 兜底
// ════════════════════════════════════════

import { CONFIG, MOD_VER, PREF_ID } from './config.js';
import { ui } from '../expansion/i18n.js';
import { saveSettings } from './storage.js';
import { forceRecover } from '../gameplay/revert.js';
import { getStateSummary } from '../gameplay/state.js';
import { panelOpen, buildPanel, removePanel } from '../ui/panel.js';

// 本地聊天框提示（独立配色：凝胶紫粉）
export function printChat(text, timeoutMs = 0) {
    try {
        const log = document.getElementById('TextAreaChatLog');
        if (!log) throw new Error('no log');
        const el = document.createElement('div');
        el.className = 'ChatMessage ChatMessageLocalMessage';
        Object.assign(el.style, {
            background: 'rgba(160,50,120,0.16)',
            borderLeft: '3px solid rgb(242,123,168)',
            padding: '4px 8px',
            margin: '2px 0',
            color: 'rgb(242,175,205)',
            fontSize: '0.92em',
            fontFamily: 'inherit',
            whiteSpace: 'pre-wrap',
            transition: 'opacity 0.5s ease',
        });
        el.innerHTML = '<span style="opacity:0.6;font-size:0.85em">⚗️ PEX</span>　' + text.split('\n').join('<br>');
        log.appendChild(el);
        log.scrollTop = log.scrollHeight;
        if (timeoutMs > 0) {
            setTimeout(() => {
                el.style.opacity = '0';
                setTimeout(() => el.remove(), 500);
            }, timeoutMs);
        }
        return;
    } catch (e) {}
    try {
        if (typeof ChatRoomMessage === 'function') {
            ChatRoomMessage({
                Type: 'LocalMessage',
                Sender: Player?.MemberNumber,
                Content: `<font color="#f2afcd">⚗️ [PEX] ${text}</font>`,
            });
        }
    } catch (e2) {}
}

export function handlePexCommand(input) {
    const parts = input.trim().split(/\s+/);
    if ((parts[0] || '').toLowerCase() !== '/pex') return false;
    const sub = (parts[1] || '').toLowerCase();

    if (!sub || sub === 'help') {
        printChat(ui('help', { v: MOD_VER }));
        return true;
    }

    if (sub === 'howto') {
        printChat(ui('howto', { v: MOD_VER }));
        return true;
    }

    if (sub === 'reset') {
        if (parts[2] === 'yes') {
            forceRecover();
            printChat(ui('resetDone'));
        } else {
            printChat(ui('resetConfirm') + '（再次输入 /pex reset yes 确认）');
        }
        return true;
    }

    if (sub === 'show') {
        const chatContainer = document.getElementById('TextAreaChatLog') || document.querySelector('.ChatLog');
        if (!chatContainer) {
            printChat(ui('noChatBox'));
            return true;
        }
        // 已开则关，未开则建（游戏内控制台面板）
        if (panelOpen()) removePanel();
        else buildPanel(chatContainer);
        return true;
    }

    if (sub === 'status') {
        printChat(ui('statusLine', { state: getStateSummary() }));
        return true;
    }

    if (sub === 'settings') {
        try {
            if (typeof PreferenceSubscreenExtensionsOpen === 'function') {
                PreferenceSubscreenExtensionsOpen(PREF_ID);
            } else {
                printChat(ui('cantOpenSettings'));
            }
        } catch (e) {
            printChat('⚠️ 打开设置页失败: ' + e.message);
        }
        return true;
    }

    if (sub === 'save') {
        saveSettings(true);
        printChat('设置已保存。');
        return true;
    }

    printChat(ui('cmdUnknown', { sub }));
    return true;
}

// 策略1：CommandCombine（最佳）
function tryRegisterCommand() {
    try {
        if (typeof CommandCombine === 'function') {
            CommandCombine([{
                Tag: 'pex',
                Description: '人格排泄插件指令（/pex help 查看说明）',
                Action: (text) => {
                    handlePexCommand('/pex ' + (text ?? ''));
                },
            }]);
            return true;
        }
    } catch (e) {
        console.warn('⚗️[PEX] CommandCombine 注册失败:', e.message);
    }
    return false;
}

// 策略3：keydown Enter 兜底
function setupKeydownFallback() {
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const input = document.getElementById('InputChat') || document.querySelector('textarea[id*="Chat"]');
        if (!input) return;
        const val = input.value.trim();
        if (!val.toLowerCase().startsWith('/pex')) return;
        handlePexCommand(val);
        e.preventDefault();
        e.stopPropagation();
        input.value = '';
    }, true);
}

let _cmdRegistered = false;
export function registerCommandOnce() {
    if (_cmdRegistered) return;
    _cmdRegistered = true;
    if (tryRegisterCommand()) return;
    setupKeydownFallback();
}

export function hookChatInput() {
    setupKeydownFallback();
}
