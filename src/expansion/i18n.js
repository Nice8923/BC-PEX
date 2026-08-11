// ════════════════════════════════════════
//  PEX 翻译层（i18n）
//  当前仅中文；结构预留多语言（后续加语言包只需补充字典）
// ════════════════════════════════════════

const DICTS = {
    zh: {
        loaded: '⚗️ PEX v{v} 已加载。输入 /pex help 查看指令。',
        help: [
            '⚗️ PEX v{v} 指令：',
            '/pex help     — 本帮助',
            '/pex howto    — 玩法说明',
            '/pex show     — 打开/关闭游戏内控制台面板',
            '/pex status   — 查看当前状态',
            '/pex reset    — 强制恢复（清除等待/失神/凝胶状态）',
            '/pex settings — 打开设置页',
            '/pex save     — 立即保存设置',
            '调试：按 F12 或 Ctrl+Shift+I 打开浏览器控制台，',
            '把 ⚗️[PEX] 开头的报错信息发给作者。',
        ].join('\n'),
        cmdUnknown: '未知指令：/pex {sub}（/pex help 查看帮助）',
        howto: [
            '⚗️ PEX 玩法说明：',
            '1. 制作一瓶饮料（游戏自带道具），在制作名/描述写触发关键词（如"人格药水"）。',
            '2. 喝下或注射带关键词的饮料 → 一阵阵越来越晕。',
            '3. 到排出时刻检查臀部装备位：没东西就排出；',
            '   有东西会等待（拿掉立刻排），超上限则药效消失。',
            '4. 人格凝胶排出后失神（黑白/不能动/视野变窄/禁言），凝胶落在脚边。',
            '5. 点击失神者 → 对话框"捡起凝胶"（手要空）。',
            '6. 把凝胶交还原主人，主人喝下自己的凝胶 → 恢复；',
            '   默认15分钟没喂回自动恢复，凝胶消散（可关闭）。',
            '7. 普通凝胶（另一套关键词）：无眩晕失神，只有短暂表情变化。',
            '8. 安全：/pex reset 或设置页"强制恢复"。',
            '更多：/pex settings 里有完整玩法说明页。',
        ].join('\n'),
        resetDone: '已强制恢复，所有状态已清除。',
        resetConfirm: '确定要强制恢复吗？此操作会立即清除全部 PEX 状态。',
        statusLine: '当前状态：{state}',
        stateIdle: '正常',
        stateWaiting: '等待排出（剩余 {sec} 秒）',
        stateBlocked: '臀部有物品遮挡，等待中（剩余 {min} 分 {sec} 秒）',
        stateExcreting: '排出中…',
        stateBlank: '失神中（剩余 {min} 分 {sec} 秒）',
        stateBlankNormal: '凝胶排出（剩余 {min} 分 {sec} 秒）',
        cantOpenSettings: '无法打开设置页（当前画面不支持）。',
        noChatBox: '找不到聊天框，请先进入聊天室再输入 /pex show。',
        gelExpired: '%NAME%的人格凝胶随时间消散了。',
        gelExpiredNormal: '%NAME%的普通凝胶随时间消散了。',
        gelInvalidated: '%NAME%的人格凝胶失去了效力，变成了无效凝胶…',
        gelInvalidatedNormal: '%NAME%的普通凝胶失去了效力，变成了无效凝胶…',
        // 远程修改
        profileEditBtn: '远程编辑对方 PEX 设置',
        profileEditNoPerm: '不在对方白名单，无法编辑',
        profileEditOff: '对方不允许远程修改',
        accessedYourPEX: '{who} 查看了你的 PEX 设置',
        editedYourPEX: '{who} 修改了你的 PEX 设置',
        remoteEditLoading: '正在获取 {name} 的 PEX 设置…',
        remoteEditLoadFail: '获取失败：对方未安装 PEX 或未响应，可重试。',
    },
};

let lang = 'zh';

// 当前固定中文；多语言接入后：从游戏语言/设置解析
export async function ensureI18n() {
    lang = 'zh';
    return lang;
}

// 取翻译文本；{key} 占位符用 vars 替换
export function ui(key, vars = {}) {
    let t = DICTS[lang]?.[key] ?? DICTS.zh[key] ?? key;
    for (const [k, v] of Object.entries(vars)) {
        t = t.split(`{${k}}`).join(String(v));
    }
    return t;
}
