// 触发检测（双通道，最可靠）：
//  A. 本地通道：hook ActivityRun —— 自己对自己执行 SipItem/Inject 时直接拦截，
//     不依赖网络回声（R130 客户端行为差异的兜底，见 B 的注释）
//  B. 网络通道：ChatRoomMessage 收到 Activity 消息 —— 覆盖"别人对我"（喂食/注射）
//     与"别人喝我的凝胶"等场景；收到即记录诊断日志（/pex show 可查）
import { CONFIG } from '../core/config.js';
import { pexOnMessage, pexSendAction } from '../core/net.js';
import { MODE, PEX_STATE } from './state.js';
import { startFlow, recoverPersona } from './excretion.js';
import { isGelItem, parseGelMeta, consumeGel } from './gel-item.js';
import { itemNameAndDescription, isPhraseInString, pexLog } from '../util/util.js';

// 提取活动元数据（按 R130 真实字典格式解析）
// 字典条目格式（已对照客户端源码验证）：
//   { ActivityName: "SipItem" }                         —— 活动名直存属性
//   { Tag: "FocusAssetGroup", FocusGroupName: "ItemMouth" } —— 部位
//   { TargetCharacter: 成员号 }                          —— 目标
//   { Tag: "UsedAsset", AssetName: 物品名 }              —— 使用的物品
function extractActivityMeta(data) {
    const meta = { activityName: null, groupName: null, target: null, itemName: null };
    try {
        const dict = Array.isArray(data?.Dictionary) ? data.Dictionary : [];
        for (const e of dict) {
            if (!e || typeof e !== 'object') continue;
            if (meta.activityName == null && typeof e.ActivityName === 'string') meta.activityName = e.ActivityName;
            if (meta.groupName == null && e.Tag === 'FocusAssetGroup' && e.FocusGroupName) meta.groupName = e.FocusGroupName;
            if (meta.target == null && typeof e.TargetCharacter === 'number') meta.target = e.TargetCharacter;
            if (meta.itemName == null && e.Tag === 'ActivityAsset' && e.AssetName) meta.itemName = e.AssetName;
        }
    } catch (e) {}
    // 兜底：Content JSON
    if (!meta.activityName) {
        try {
            const parsed = typeof data?.Content === 'string' ? JSON.parse(data.Content) : null;
            if (parsed && typeof parsed === 'object') {
                meta.activityName = parsed.Name ?? parsed.ActivityName ?? meta.activityName;
                meta.groupName = parsed.GroupName ?? meta.groupName;
                meta.target = parsed.TargetMemberNumber ?? parsed.TargetCharacter ?? meta.target;
            }
        } catch (e) {}
    }
    return meta;
}

// 写死关键词（用户要求固定 2 个，一个中文一个英文，永远生效；设置里可追加更多）
export const HARD_KEYWORDS = ['人格药水', 'persona'];

// 关键词匹配：人格凝胶优先，其次普通凝胶
function matchGelType(item) {
    const text = itemNameAndDescription(item);
    if (!text) return null;
    if (HARD_KEYWORDS.concat(CONFIG.keywords || []).some(kw => isPhraseInString(text, kw))) return 'persona';
    if ((CONFIG.normalKeywords || []).some(kw => isPhraseInString(text, kw))) return 'normal';
    return null;
}

// 统一处理一次"对我"的 SipItem/Inject
function handleActivity(activityName, item) {
    try {
        if (activityName === 'SipItem') {
            // ── 凝胶被喝下 ──
            const gelMeta = parseGelMeta(item);
            if (gelMeta) {
                if (gelMeta.invalid) {
                    // 无效凝胶：喝下直接消耗，无任何效果、绝不影响主人（主人早已恢复）
                    consumeGel(item, Player?.MemberNumber, gelMeta);
                    pexSendAction('%NAME%喝了一口，什么味道也没有…');
                    return;
                }
                const isOwner = gelMeta.ownerMemberNumber === Player?.MemberNumber;
                consumeGel(item, Player?.MemberNumber, gelMeta);
                if (isOwner && PEX_STATE.mode === MODE.BLANK) {
                    recoverPersona('%NAME%喝回了自己的人格凝胶，意识一下子回来了！');
                } else {
                    pexLog('凝胶被喝掉:', gelMeta.gelId);
                    pexSendAction('%NAME%迷迷糊糊地把手里的凝胶喝了下去…');
                }
                return;
            }
            // 关键词触发
            const gelType = matchGelType(item);
            if (gelType && CONFIG.enabled) {
                pexLog('命中关键词 →', gelType);
                startFlow(gelType);
            } else {
                pexLog('未命中关键词，物品文本:', itemNameAndDescription(item).slice(0, 60));
            }
            return;
        }
        if (activityName === 'Inject') {
            const gelType = matchGelType(item);
            if (gelType && CONFIG.enabled) {
                pexLog('注射命中关键词 →', gelType);
                startFlow(gelType);
            } else {
                pexLog('注射未命中关键词，物品文本:', itemNameAndDescription(item).slice(0, 60));
            }
        }
    } catch (e) {
        pexLog('处理活动异常:', e.message);
    }
}

// 从活动消息字典构造"对方使用的物品"（Tag: ActivityAsset 带 AssetName/GroupName/CraftName）
// 关键：别人对我注射/喂食时，物品在别人手上，绝不能拿自己手上的物品匹配关键词！
function dictActivityItem(data) {
    try {
        const dict = Array.isArray(data?.Dictionary) ? data.Dictionary : [];
        const e = dict.find(x => x?.Tag === 'ActivityAsset');
        if (!e) return null;
        return {
            Asset: e.AssetName ? { Name: e.AssetName, Group: { Name: e.GroupName } } : null,
            Craft: e.CraftName ? { Name: e.CraftName } : null,
        };
    } catch (e) { return null; }
}

// B. 网络通道（别人对我的动作 / 网络回声）
export function registerTrigger() {
    pexOnMessage((data) => {
        try {
            if (data?.Type !== 'Activity') return;
            const meta = extractActivityMeta(data);
            if (!meta.activityName) return;
            pexLog('收到活动消息:', meta.activityName, '目标:', meta.target, '物品:', meta.itemName || '?', '发送者:', data.Sender);
            const targetIsMe = meta.target != null && meta.target === Player?.MemberNumber;
            if (!targetIsMe) return;
            handleActivity(meta.activityName, dictActivityItem(data) || getHandheld());
        } catch (e) {
            pexLog('触发检测异常:', e.message);
        }
    });
}

// A. 本地通道：自己对自己执行活动（ActivityRun 由客户端本地调用，最可靠）
export function registerLocalActivityHook(modApi) {
    if (!modApi) return;
    try {
        modApi.hookFunction('ActivityRun', 1, (args, next) => {
            const r = next(args);
            try {
                const [actor, acted, targetGroup, itemActivity] = args;
                if (!actor || !acted || !itemActivity?.Activity?.Name) return r;
                const selfAct = typeof actor.IsPlayer === 'function' && actor.IsPlayer()
                    && typeof acted.IsPlayer === 'function' && acted.IsPlayer();
                if (!selfAct) return r;
                const name = itemActivity.Activity.Name;
                if (name !== 'SipItem' && name !== 'Inject') return r;
                const item = itemActivity.Item || getHandheld();
                pexLog('本地动作(ActivityRun):', name, '物品:', item?.Asset?.Name || '?');
                handleActivity(name, item);
            } catch (e) {}
            return r;
        });
    } catch (e) {
        pexLog('ActivityRun 挂钩失败:', e.message);
    }
}

// A2. 对话框点击通道：玩家点下"喝/注射"按钮的瞬间即触发（最早的时刻）
export function registerClickHook(modApi) {
    if (!modApi) return;
    try {
        modApi.hookFunction('DialogActivityClick', 1, (args, next) => {
            const r = next(args);
            try {
                const [C, clickedActivity] = args;
                if (!C || !clickedActivity?.Activity?.Name) return r;
                if (typeof C.IsPlayer !== 'function' || !C.IsPlayer()) return r;
                const name = clickedActivity.Activity.Name;
                if (name !== 'SipItem' && name !== 'Inject') return r;
                const item = clickedActivity.Item || getHandheld();
                pexLog('点击动作(DialogActivityClick):', name, '物品:', item?.Asset?.Name || '?');
                handleActivity(name, item);
            } catch (e) {}
            return r;
        });
    } catch (e) {
        pexLog('DialogActivityClick 挂钩失败:', e.message);
    }
}

function getHandheld() {
    try { return InventoryGet(Player, 'ItemHandheld'); } catch (e) { return null; }
}
