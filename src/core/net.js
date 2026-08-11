// ════════════════════════════════════════
//  PEX 消息层（net）
//  发送：Hidden 隐藏消息（广播到房间，带间隔队列+去重）
//  接收：hook ChatRoomMessage 分发给注册的处理器
// ════════════════════════════════════════

const MIN_GAP = 250;              // 任意两则隐藏消息最小间隔
const _sendQ = [];                // 待送队列
const _dedupe = new Map();        // 去重键 -> 上次送出时间
let _sendTimer = null;
let _lastSentAt = 0;

// 客户端发出的 ChatRoomChat 必须带 SourceCharacter 字典条目（对照原版 ChatRoomGenerateChatRoomChatMessage）
function sourceDictionary(extra) {
    const dict = [];
    try {
        if (Player && typeof Player.MemberNumber === 'number') dict.push({ SourceCharacter: Player.MemberNumber });
    } catch (e) {}
    if (Array.isArray(extra)) return dict.concat(extra);
    return dict;
}

function flush() {
    _sendTimer = null;
    if (!_sendQ.length) return;
    const now = Date.now();
    const wait = Math.max(0, MIN_GAP - (now - _lastSentAt));
    if (wait > 0) { _sendTimer = setTimeout(flush, wait); return; }
    const job = _sendQ.shift();
    try { if (typeof ServerSend === 'function') ServerSend('ChatRoomChat', job.payload); } catch (e) {}
    _lastSentAt = Date.now();
    if (_sendQ.length && !_sendTimer) _sendTimer = setTimeout(flush, MIN_GAP);
}

/**
 * 发送一条 PEX 隐藏消息（排入间隔队列）
 * @param {string} content
 * @param {any[]|object} [dictionary]
 * @param {{dedupeKey?:string, dedupeMs?:number, priority?:boolean}} [opts]
 */
export function pexSendHidden(content, dictionary, opts = {}) {
    const { dedupeKey = null, dedupeMs = 800, priority = false } = opts;
    if (dedupeKey) {
        const now = Date.now();
        const prev = _dedupe.get(dedupeKey);
        if (prev && now - prev < dedupeMs) return false;
        _dedupe.set(dedupeKey, now);
        if (_dedupe.size > 200) for (const [k, t] of _dedupe) if (now - t > 60000) _dedupe.delete(k);
    }
    const payload = { Type: 'Hidden', Content: content, Dictionary: sourceDictionary(dictionary) };
    const job = { payload };
    if (priority) _sendQ.unshift(job); else _sendQ.push(job);
    if (!_sendTimer) _sendTimer = setTimeout(flush, 0);
    return true;
}

/**
 * 发送一条房间动作播报 —— Type: Action（渲染为圆括号旁白 (内容)）
 * 对照客户端渲染（Screens_Online_ChatRoom_ChatRoom.js ChatRoomMessageDisplay）：
 *   Chat=名字: 内容 / Emote=*内容* / Action=(内容) —— 播报用 Action，不是 *号
 * 立即发送；原版 ServerSend 队列会自动限速（14条/1.2s）并给 Chat/Emote/Whisper 补 MsgId，
 * 与玩家手动操作同管道。
 * @param {string} text 动作文本（支持 %NAME% 等占位符，发送前本地替换）
 * @param {number} [targetMemberNumber] 指定对象（可选）
 */
export function pexSendAction(text, targetMemberNumber) {
    try {
        const content = substituteActionText(text);
        if (!content) return;
        const payload = { Type: 'Action', Content: content };
        if (targetMemberNumber != null) payload.Target = targetMemberNumber;
        if (typeof ServerSend === 'function') ServerSend('ChatRoomChat', payload);
        // 播报后把聊天日志自动拉到底（原版只在日志已在底部时才滚）
        setTimeout(() => {
            try {
                const log = document.getElementById('TextAreaChatLog');
                if (log) log.scrollTop = log.scrollHeight;
            } catch (e) {}
        }, 60);
    } catch (e) {}
}

// 动作文本占位符替换（Emote 不走服务器替换，需本地完成）
function substituteActionText(text) {
    let nick = '';
    try { nick = CharacterNickname(Player) || ''; } catch (e) {}
    return String(text)
        .split('%NAME%').join(nick)
        .split('%POSSESSIVE%').join('自己的')
        .split('%OPP_NAME%').join('对方')
        .split('%OPP_POSSESSIVE%').join('对方的')
        .split('%PRONOUN%').join('自己')
        .split('%INTENSIVE%').join('自己');
}

// ── 接收端：ChatRoomMessage 处理器注册表 ──
const _handlers = [];

/**
 * 注册消息处理器：handler(data) —— data=消息对象（R130: ChatRoomMessage(data) 单参数）
 */
export function pexOnMessage(handler) {
    if (typeof handler !== 'function') return;
    _handlers.push(handler);
}

// 语言包翻译兜底：BC 收到 Type:'Action' 消息会把内容当语言包 key 查翻译
// （ChatRoomMessage → TextQueryMultiple → Interface.csv），自定义中文内容查不到 →
// 返回 'MISSING TEXT IN "Interface.csv": 内容'。hook 它：翻译失败时返回原文，
// 让 Action 播报原样显示（(某人喝下了…)），不再带 MISSING 前缀。
export function registerTextQueryHook(modApi) {
    if (!modApi) return;
    try {
        modApi.hookFunction('TextQueryMultiple', 0, (args, next) => {
            const key = args && args[0];
            const r = next(args);
            if (typeof r === 'string' && r.indexOf('MISSING TEXT IN') >= 0) {
                return typeof key === 'string' ? key : r;
            }
            return r;
        });
    } catch (e) {}
}

// 由 core-init 在 registerMod 后调用一次
export function registerMessageHook(modApi) {
    if (!modApi) return;
    try {
        modApi.hookFunction('ChatRoomMessage', 1, (args, next) => {
            const result = next(args);
            try {
                // R130 客户端：ChatRoomMessage(data) 只收一个参数（消息对象本体，
                //  服务器事件名是 "ChatRoomMessage"，见 Scripts_Server.js ServerSocket.on）
                const data = args[0];
                if (!data || typeof data !== 'object') return result;
                for (const h of _handlers) {
                    try { h(data); } catch (e) {}
                }
            } catch (e) {}
            return result;
        });
    } catch (e) {
        console.warn('⚗️[PEX] ChatRoomMessage 挂钩失败:', e.message);
    }
}

// 清理所有处理器（卸载时用）
export function clearMessageHandlers() {
    _handlers.length = 0;
}
