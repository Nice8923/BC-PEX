// ════════════════════════════════════════
//  PEX 钩子注册表
//  由 core-init 在 registerMod 后调用；玩法钩子各模块自行注册
// ════════════════════════════════════════

import { getModApi } from './config.js';
import { enforceBlankFilter } from '../effects/overlay.js';

// 房间生命周期：进房/离房
// 进房：注册聊天指令、公告设置（进房时关系已同步，白名单代号才准确）
// 离房：清理房间相关状态
// ⚠️ ChatRoomRun 是 BC 每帧调用的主循环函数，不是一次性事件！
//   onEnter 必须只执行一次（曾因每帧执行 → 每帧创建定时器 → 每秒 ~60 条
//   AccountUpdate 服务器消息 → 队列积压 → 打字 10-20 秒延迟 + 服务器限流踢人）
// 每帧同时做轻量兜底：失神黑白强制（打开资料页等界面时 BC 重绘会清掉 canvas 样式）
let _roomEntered = false;
export function hookChatRoomLifecycle(onEnter, onLeave) {
    const modApi = getModApi();
    if (!modApi) return;
    try {
        modApi.hookFunction('ChatRoomRun', 0, (args, next) => {
            const result = next(args);
            try {
                try { enforceBlankFilter(); } catch (e) {}
                if (_roomEntered) return result;
                _roomEntered = true;
                if (onEnter) onEnter();
            } catch (e) {}
            return result;
        });
        modApi.hookFunction('ChatRoomLeave', 0, (args, next) => {
            const result = next(args);
            try {
                if (onLeave) onLeave();
                _roomEntered = false;
            } catch (e) {}
            return result;
        });
    } catch (e) {
        console.warn('⚗️[PEX] 房间生命周期挂钩失败:', e.message);
    }
}

// 卸载时统一清理（modApi.onUnload）
export function hookUnload(cleanup) {
    const modApi = getModApi();
    if (!modApi) return;
    try {
        modApi.onUnload(() => {
            try { if (cleanup) cleanup(); } catch (e) {}
        });
    } catch (e) {
        // 旧版 SDK 不支持 onUnload，忽略
    }
}
