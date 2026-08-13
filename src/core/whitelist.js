// ════════════════════════════════════════
//  白名单代号解析
//  配置里的 whitelist 可填数字成员号，或代号：
//    $owner  —— 被授权方（目标本人）的主人
//    $lover  —— 被授权方（目标本人）的恋人
//  比较时 relativeTo 必须是【被授权方本人】的角色对象：
//    查看者端 = 被看的角色 C；接收端 = Player（接收方即被授权方）。
//  代号相对它解析。两条 BC 原生 API（Character 原型方法）：
//    IsOwnedByMemberNumber(n) / IsLoverOfMemberNumber(n)
// ════════════════════════════════════════

// candidate：要判断的成员号（查看者 / 发送者）。返回是否放行。
export function whitelistAllows(list, candidate, relativeTo) {
    if (candidate == null) return false;
    const c = Number(candidate);
    if (!Number.isFinite(c) || c <= 0) return false;
    for (const e of (list || [])) {
        const s = String(e).trim();
        if (/^\d+$/.test(s)) { if (Number(s) === c) return true; continue; }
        try {
            // 代号相对被授权方本人解析；各方法独立判断，缺哪个都不影响其它代号
            if (s === '$owner') {
                if (relativeTo && typeof relativeTo.IsOwnedByMemberNumber === 'function'
                    && relativeTo.IsOwnedByMemberNumber(c)) return true;
            } else if (s === '$lover' || s === '$lovers') {
                if (relativeTo && typeof relativeTo.IsLoverOfMemberNumber === 'function'
                    && relativeTo.IsLoverOfMemberNumber(c)) return true;
                // 兜底：方法缺失时直接查 Lovership 数组
                const lv = relativeTo && relativeTo.Lovership;
                if (Array.isArray(lv) && lv.map(Number).includes(c)) return true;
            }
        } catch (e) {}
    }
    return false;
}
