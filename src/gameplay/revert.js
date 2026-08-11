// ════════════════════════════════════════
//  PEX 恢复模块（完整版）
//  - forceRecover：强制恢复（安全阀，/pex reset / 设置页按钮）
//  - autoRevert：自动回归（凝胶超时未回归 → 广播失效 + 恢复）
// ════════════════════════════════════════

import { MODE, PEX_STATE } from './state.js';
import { pexSendAction } from '../core/net.js';
import { broadcastGelExpired, removeGelFromSelf } from './gel-item.js';
import { cancelFlow } from './excretion.js';
import { pexLog } from '../util/util.js';

// 强制恢复：清除一切状态（等待/失神/凝胶/效果），并取消进行中的流程
export function forceRecover() {
    pexLog('强制恢复');
    // 1. 若存在凝胶 → 广播失效（各持有者客户端自删）
    if (PEX_STATE.gelId) broadcastGelExpired(PEX_STATE.gelId);
    // 2. 自己手上的凝胶移除
    removeGelFromSelf(PEX_STATE.gelId);
    // 3. cancelFlow：作废进行中的动画/流程 + 清除效果与状态（含 _flowId 递增）
    cancelFlow(true);
    pexSendAction('%NAME%被强制恢复了，一切回归正常。');
}
