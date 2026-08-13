// 远程状态存储自检：node scripts/test-remote-state.mjs
// 只测一件事 —— seq 门槛挡不挡得住"旧的盖新的"。
// 这是砍掉 5 秒倒数心跳后浮出来的那个 bug：BC 的 CharacterOnlineRefresh
//（Character.js:1223）会把 OnlineSharedSettings 整包覆盖成服务器那份，
// 而服务器扇出比 Hidden 慢 → 刚套用的新状态被旧值回滚（凝胶捡走了又冒出来）。
import assert from 'node:assert/strict';
import { MODE, readRemoteState, applyRemoteState, patchRemoteState, clearRemoteState, clearAllRemoteStates } from '../src/gameplay/state.js';

const ME = 1234;
// 模拟一个房间角色：OnlineSharedSettings 由服务器（可能是旧的）填
const char = (state) => ({ MemberNumber: ME, OnlineSharedSettings: { PEX: { state } } });

clearAllRemoteStates();

// 1. 缓存为空 → 读 OSS 兜底（晚进房的人就走这条）
assert.equal(readRemoteState(char({ mode: MODE.BLANK, gelId: 'g1', seq: 100 }))?.gelId, 'g1');

// 2. idle 视为无状态
assert.equal(readRemoteState(char({ mode: MODE.IDLE, seq: 100 })), null);

// 3. Hidden 先到（seq 200）→ 随后服务器扇出旧 OSS（seq 100）→ 不能回滚
applyRemoteState(ME, { mode: MODE.BLANK, gelId: 'g1', gelHolder: 5678, seq: 200 });
assert.equal(readRemoteState(char({ mode: MODE.BLANK, gelId: 'g1', gelHolder: null, seq: 100 }))?.gelHolder, 5678);

// 4. OSS 追上来了（seq 300 > 缓存 200）→ 该让服务器那份赢
assert.equal(readRemoteState(char({ mode: MODE.BLANK, gelId: 'g1', gelHolder: null, seq: 300 }))?.gelHolder, null);

// 5. 迟到的旧广播不能覆盖新缓存
applyRemoteState(ME, { mode: MODE.BLANK, gelId: 'g2', seq: 400 });
applyRemoteState(ME, { mode: MODE.BLANK, gelId: 'STALE', seq: 399 });
assert.equal(readRemoteState(char(null))?.gelId, 'g2');

// 6. patch 推进 seq → 本地乐观更新（捡起凝胶）扛得住随后到达的旧 OSS
patchRemoteState(char(null), { gelHolder: 9999 });
const patched = readRemoteState(char({ mode: MODE.BLANK, gelId: 'g2', gelHolder: null, seq: 400 }));
assert.equal(patched.gelHolder, 9999);
assert.equal(patched.gelId, 'g2', 'patch 只改指定字段，其余保留');

// 6b. 本地乐观更新只压过手上这一份（+1），公告方真正的新广播立刻夺回权威 ——
//     否则观察者时钟偏快时会把对方的新状态挡住（挡多久 = 时钟偏差）
assert.ok(patched.seq < Date.now(), '乐观更新不该用 Date.now() 当 seq');
applyRemoteState(ME, { mode: MODE.BLANK, gelId: 'g3', gelHolder: null, seq: Date.now() });
assert.equal(readRemoteState(char(null))?.gelId, 'g3');

// 7. clear 后即使 OSS 还留着旧状态也读不到（放回凝胶后立刻消失）
clearRemoteState(char({ mode: MODE.BLANK, gelId: 'g3', seq: 400 }));
assert.equal(readRemoteState(char({ mode: MODE.BLANK, gelId: 'g3', seq: 400 })), null);

console.log('✓ remote state seq guard OK');
