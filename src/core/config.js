// ════════════════════════════════════════
//  PEX 配置模型
//  持久化于 Player.ExtensionSettings.PEX（账号同步）+ 本地备份
//  CONFIG 为运行时对象，由 storage.loadSettings() 还原
// ════════════════════════════════════════

// 版本号由 package.json 经 vite define 注入
export const MOD_VER = (typeof __PEX_VERSION__ !== 'undefined' && __PEX_VERSION__) || '0.1.0';

// 存储键
export const ES_KEY = 'PEX';                 // ExtensionSettings / OnlineSharedSettings 键
export const PREF_ID = 'PEX_Settings';       // 偏好设置页注册 ID
export const ES_BUDGET = 5120;               // ExtensionSettings 5KB 警戒线

// 触发关键词默认表（可配置；匹配制作名+描述，大小写不敏感）
export const DEFAULT_KEYWORDS = [
    '人格药水', '人格药剂',
    'persona potion', 'personality extraction',
];

// 普通凝胶关键词默认表（无眩晕/黑白）
export const DEFAULT_NORMAL_KEYWORDS = [
    '凝胶药剂', '凝胶药水',
    'plain gel', 'normal gel',
];

// 失神默认表情：
// 等待表情池（喝下后的等待期随机抽，与等待音效同步出现；可自定义加更多，最多 10 组）
export const DEFAULT_WAIT_EXPRESSIONS = [
    { Eyebrows: 'Soft',    Eyes: 'VeryLewd',     Mouth: 'Frown', Blush: 'High'     },
    { Eyebrows: 'Lowered', Eyes: 'HeartPink',    Mouth: 'Moan',  Blush: 'High'     },
];
// 排出表情：与排出动画同时播（第 N+1 个）
export const DEFAULT_EXCRETE_EXPRESSION = { Eyebrows: 'Raised', Eyes: 'LewdHeartPink', Mouth: 'Ahegao', Blush: 'VeryHigh' };
// 失神定格：凝胶排出后定格（目光呆滞 + 嘴巴闭上——排出后不张着嘴）
export const DEFAULT_BLANK_EXPRESSION = { Eyebrows: 'Lowered', Eyes: 'Dazed', Mouth: 'Frown', Blush: 'VeryHigh' };

// 普通凝胶排出后的短暂表情（无失神）
export const DEFAULT_NORMAL_EXPRESSION = { Eyebrows: 'Lowered', Eyes: 'Lewd', Mouth: 'Open', Blush: 'Medium' };

// 音效分类（3 类：wait 等待 / excrete 排出 / feed 放回；素材在设置页填写 URL，存 localStorage）
// 默认音效走 CDN（jsDelivr GitHub CDN，不内嵌 base64）——
// 文件在 GitHub 仓库 BC-PEX 的 Sound/ 目录（wait_1~5 / excrete / feed）
export const CDN_ROOT = 'https://cdn.jsdelivr.net/gh/Nice8923/BC-PEX@main/Sound/';
const CDN = (name) => CDN_ROOT + name;
export const DEFAULT_SOUNDS = {
    wait: [CDN('wait_1.mp3'), CDN('wait_2.mp3'), CDN('wait_3.mp3'), CDN('wait_4.mp3'), CDN('wait_5.mp3')],
    excrete: [CDN('excrete.mp3')],   // 排出音效（7.34s，动画长度按它对齐）
    feed: [CDN('feed.mp3')],         // 放回音效（3.96s，黑白淡出结束后播放）
};

export function makeDefaultConfig() {
    return {
        // ── 主开关 ──
        enabled: true,

        // ── 触发 ──
        keywords: [...DEFAULT_KEYWORDS],
        normalKeywords: [...DEFAULT_NORMAL_KEYWORDS],   // 普通凝胶关键词（无眩晕/黑白）

        // ── 时间（秒/分钟）──
        waitSeconds: 50,            // 排出前等待：10~600 秒（等待音效按它分段：10 秒 1 段…50 秒及以上 5 段）
        blockedWaitMinutes: 15,     // 臀部被挡等待上限：1~30 分钟
        autoRevertEnabled: true,    // 凝胶自动回归开关
        autoRevertMinutes: 15,      // 凝胶自动回归：1~30 分钟
        gelExpireMode: 'vanish',    // 凝胶到期（= 主人恢复时刻）：vanish=消散消失 / invalid=变成持有者手上的无效凝胶（永久保留）
        normalExpressionSeconds: 5, // 普通凝胶排出后表情变化时长：1~30 秒

        // ── 特效 ──
        effectLevel: 3,             // 特效强度滑块：1~5，默认 3（暗角并入强度，随强度缩放）
        viewMode: 'surround',       // 暗角模式（固定周围压暗，不再有单独设置项；强度随 effectLevel）
        blindLevel: 2,              // 失神视野（BC 原生失明）：0=无 1=轻 2=中 3=重
        timerVisibility: 'all',      // 计时器可见：self=仅自己 / whitelist=仅白名单 / others=仅他人 / all=所有人（旧值 both 兼容为 all）

        // ── 特效与限制开关（默认全开，保持现有行为）──
        fxDizzy: true,              // 等待期眩晕脉冲
        fxBlank: true,              // 失神黑白特效（含暗角）
        fxBlur: true,               // 模糊特效（眩晕/排出/失神）
        fxShake: true,              // 排出震动
        restrictions: true,         // 失神限制（不能动/禁言/不眨眼/姿势锁定）
        seeRemoteAnims: true,       // 看别人的排出动画
        hearRemoteSounds: false,    // 听其他玩家的音效（默认关 = 只有自己听得见）

        // ── 表现 ──
        expressions: {
            wait: DEFAULT_WAIT_EXPRESSIONS.map(e => ({ ...e })),   // 等待表情池（随机抽，最多 10 组）
            excrete: { ...DEFAULT_EXCRETE_EXPRESSION },            // 排出表情（与动画同播）
            blank: { ...DEFAULT_BLANK_EXPRESSION },                // 失神定格
        },
        normalExpression: { ...DEFAULT_NORMAL_EXPRESSION },
        gelLayer: 24,  // 凝胶图层（0~99 可调，像 BC 物品一样）：<24 画在角色下面（被衣服遮）/ 24 及以上=顶层
        sounds: {
            wait: DEFAULT_SOUNDS.wait.map(s => s),      // 默认 5 段等待音效（CDN）——引用常量防止 tree-shake
            excrete: DEFAULT_SOUNDS.excrete.map(s => s),
            feed: DEFAULT_SOUNDS.feed.map(s => s),
        },
        soundOn: {      // 三类音效各自开关（关 = 本地不播也不广播）；存 localStorage
            wait: true,
            excrete: true,
            feed: true,
        },

        // ── 权限（每类独立 off/whitelist/any；默认仅自己=off，用户可自行放开）──
        editModes: {
            time: 'off',            // 时间类（等待/上限/自动回归分钟）
            autoRevert: 'off',      // 凝胶自动回归
            timerVisibility: 'off', // 计时器可见性
        },
        whitelist: [],          // 共享白名单（支持 $owner/$lover 等代号）
    };
}

// 运行时配置（只读，改值统一走 setConfig）
export let CONFIG = makeDefaultConfig();
export function setConfig(v) { CONFIG = v; }

// bcModSdk 的 mod api（由 core-init 注册后设置；用存取器延迟读取）
let modApi = null;
export function setModApi(v) { modApi = v; }
export function getModApi() { return modApi; }
