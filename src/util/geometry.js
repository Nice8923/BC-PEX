// ════════════════════════════════════════
//  PEX 角色查询
// ════════════════════════════════════════

// 取角色对象（成员号 → ChatRoomCharacter 或 Player）
export function getCharacterByNumber(memberNumber) {
    try {
        if (memberNumber == null) return null;
        if (Player && Player.MemberNumber === memberNumber) return Player;
        if (typeof ChatRoomCharacter !== 'undefined' && Array.isArray(ChatRoomCharacter)) {
            return ChatRoomCharacter.find(c => c && c.MemberNumber === memberNumber) || null;
        }
    } catch (e) {}
    return null;
}
