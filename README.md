# Personality Excretion（PEX）
# Personality Excretion (PEX)

Bondage Club（R130+）的 Tampermonkey 插件：喝下带关键词的人格药水后，触发 **眩晕 → 等待 → 排出 → 失神 → 凝胶 → 喂回恢复** 的完整玩法流程。
A Tampermonkey plugin for Bondage Club (R130+): drink a persona potion carrying the trigger keyword and go through the full flow — **Dizzy → Wait → Excrete → Blank → Gel → Feed-back & Recover**.

## 玩法流程
## Gameplay Flow

1. **触发**：物品的制作名 / 制作描述 / 雕刻描述含关键词（如"人格药水"），喝下或注射后进入眩晕。
   **Trigger**: an item whose craft name / craft description / engraved description contains a keyword (e.g. "人格药水" / "persona potion") — drinking or injecting it starts the dizzy phase.
2. **等待**：臀部槽位被物品遮挡时进入等待期（默认 50 秒，可在设置里调），期间播放等待音效与表情（与音效分段同步）。
   **Wait**: while the butt slot is blocked by an item you enter the waiting phase (default 50 s, adjustable). Waiting sounds and expressions play in sync with the sound segments.
3. **排出**：拿掉遮挡物立刻排出——排出动画 + 排出音效（时长对齐）。
   **Excrete**: removing the blocking item triggers excretion immediately — animation + excretion sound (durations aligned).
4. **失神 / 凝胶**：
   **Blank / Gel**:
   - **人格凝胶**：失神者失去意识（黑白画面 + 禁言 + 失神表情），凝胶出现在所有人脚下；任何人可捡起，喂回主人后恢复意识。
     **Persona gel**: the character loses consciousness (black & white screen, speech blocked, blank expression) and the gel appears at their feet for everyone; anyone can pick it up and feed it back to the owner to restore them.
   - **普通凝胶**：无失神表现，短暂表情变化后结束。
     **Normal gel**: no blank state, just a brief expression change.
5. **恢复**：凝胶被喂回 / 到期自动回归 / 强制恢复。
   **Recover**: by feeding the gel back, by auto-revert on expiry, or by force reset.

## 功能
## Features

- **关键词触发**：人格与普通凝胶各 4 个默认关键词，设置页可自定义。
  **Keyword trigger**: 4 default keywords each for persona and normal gels, fully customizable in settings.
- **音效系统**：等待（最多 5 段，随等待时长自动分段）、排出、放回三类音效；本地播放走 Web Audio（CDN 加载 + 自动回退），音量随特效强度；三类音效可分别开关；默认关闭"听到其他玩家音效"，可打开。
  **Sound system**: three sound types — waiting (up to 5 segments, auto-split by wait duration), excretion and feed-back. Local playback uses Web Audio (CDN with automatic raw fallback); volume scales with effect level; each type can be toggled; "hear other players' sounds" is off by default and can be enabled.
- **表情系统**：等待表情池（最多 10 组，与音效分段同步）+ 排出表情 + 失神表情。
  **Expression system**: waiting expression pool (up to 10 sets, synced with sound segments) + excretion expression + blank expression.
- **特效强度**：1–5 档，实际影响眩晕/模糊/震屏/音量等效果。
  **Effect level**: 1–5, actually affects dizziness / blur / screen shake / volume.
- **多人并发**：凝胶唯一性、按角色独立状态，多人同时排出互不干扰。
  **Multiplayer concurrency**: unique gel ownership and per-character state — simultaneous excretion by multiple players never conflicts.
- **设置页**：完整设置界面（触发关键词、等待时长、特效、可见性、白名单、远程编辑权限等），支持导入/导出。
  **Settings screen**: full settings UI (keywords, wait duration, effects, timer visibility, whitelist, remote-edit permissions…), with import/export.
- **远程编辑**：资料页按钮远程编辑他人的 PEX 设置（权限可配）。
  **Remote editing**: a profile-page button to edit another player's PEX settings remotely (permission-based).
- **游戏内指令**：`/pex help` `/pex howto` `/pex show` `/pex status` `/pex reset` `/pex settings`。
  **In-game commands**: `/pex help` `/pex howto` `/pex show` `/pex status` `/pex reset` `/pex settings`.
- **断线保护**：设置三层存储（账号 ExtensionSettings + 本地备份 + OnlineSharedSettings 状态公告），页关闭时强制刷盘。
  **Connection safety**: three-layer settings storage (account ExtensionSettings + local backup + OnlineSharedSettings state broadcast), force-flushed on page close.

## 安装
## Installation

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)。
   Install [Tampermonkey](https://www.tampermonkey.net/).
2. 从 [Releases](https://github.com/Nice8923/BC-PEX/releases) 下载 `loader.embedded.user.js`（bundle 内嵌，零外部依赖）。
   Download `loader.embedded.user.js` from [Releases](https://github.com/Nice8923/BC-PEX/releases) (bundle embedded, zero external dependencies).
3. 拖入 Tampermonkey 安装，刷新游戏页面。
   Drag it into Tampermonkey and refresh the game page.

## 游戏内指令
## In-game Commands

```
/pex help      — 帮助 / help
/pex howto     — 玩法说明 / how to play
/pex show      — 打开/关闭控制台面板 / toggle console panel
/pex status    — 当前状态 / current status
/pex reset     — 强制恢复（安全阀）/ force reset (safety valve)
/pex settings  — 打开设置页 / open settings
```

## 音效素材
## Sound Assets

- 默认音效素材来自 [pincree.jp](https://pincree.jp) 的免费资源（Free Assets）。
  Default sounds come from free assets on [pincree.jp](https://pincree.jp) (Free Assets).
- 音效通过 jsDelivr CDN 加载（`Sound/` 目录），加载失败自动回退 raw.githubusercontent。
  Sounds load from the jsDelivr CDN (`Sound/` folder) with automatic fallback to raw.githubusercontent.
- 设置页可填写自定义音效 URL，或关闭某类音效。
  Custom sound URLs can be set in the settings screen, and each sound type can be turned off.

## 缺的美术资源（欢迎投稿！）
## Missing Art Assets (Contributions Welcome!)

插件目前全部使用程序化占位绘制，以下美术资源缺失，**欢迎画师/开发者贡献**（投稿方式见 [CONTRIBUTING.md](CONTRIBUTING.md)）：
The plugin currently uses procedural placeholders everywhere. The following art assets are missing — **contributions from artists/developers are very welcome** (see [CONTRIBUTING.md](CONTRIBUTING.md)):

| # | 资源 / Asset | 现状（占位）Current (placeholder) | 用途 / Usage | 期望规格 / Spec |
|---|------|-------------|------|---------|
| 1 | **排出动画精灵图** / Excretion animation spritesheet | 白色方块 4 帧 / white square, 4 frames | 排出动画（臀部→地面）/ excretion animation (butt → floor) | 4–8 帧精灵图，透明底 PNG / 4–8 frame spritesheet, transparent PNG |
| 2 | **凝胶落地贴图** / Gel floor sprite | BC 自带 GlassFilled 预览图 / built-in GlassFilled preview | 失神者脚边的凝胶 / gel at the blanked character's feet | 单帧 PNG，约 64×64，半透明 / single frame PNG, ~64×64, semi-transparent |
| 3 | **远程编辑按钮图标** / Remote-edit button icon | "REX" 文字按钮 / "REX" text button | 资料页远程编辑入口 / profile-page remote-edit entry | 90×90 图标 PNG / 90×90 icon PNG |
| 4 | **凝胶物品外观** / Gel item appearance | 默认玻璃杯 / default glass | 捡起后手上的凝胶道具 / gel item in hand after pickup | 游戏内物品（换肤方向）/ in-game item (reskin) |
| 5 | **特效素材** / Effect assets | 纯程序化绘制 / fully procedural | 眩晕/排出粒子等 / dizzy & excretion particles… | 精灵图或粒子贴图 / spritesheet or particle textures |
| 6 | **设置页按钮图标** / Settings-button icon | 纯文字按钮 / plain text button | 偏好设置页入口图标 / preferences entry icon | 代码已留好启用位（`Images/pex-icon.png`，取消 settings.js 中对应注释即启用）/ enabled slot already in code (`Images/pex-icon.png`; uncomment in settings.js to enable) |

## 开发
## Development

```bash
npm install
npm run build                        # vite 构建到 dist/ / build with vite into dist/
node scripts/build-loader.mjs        # 由模板生成 loader.embedded.user.js / generate loader.embedded.user.js from the template
npm run dev                          # 本地开发：vite 构建 + 预览（5174 端口）/ local dev: vite build + preview (port 5174)
```

- 开发期可用 `loader.local.user.js`（读 localhost:5174）或 `loader.ebc.user.js`（读 localhost:8000）代替发布版。
  For development, use `loader.local.user.js` (localhost:5174) or `loader.ebc.user.js` (localhost:8000) instead of the release build.
- 目录结构 / Folder structure：
  - `src/` — 插件源码（`core/` 配置与存储、`gameplay/` 玩法、`effects/` 视觉特效、`ui/` 界面、`util/` 工具、`expansion/` 文案）/ plugin source (`core/` config & storage, `gameplay/` gameplay, `effects/` visual effects, `ui/` interface, `util/` helpers, `expansion/` texts)
  - `Assets/Sound/` — 默认音效（发布到仓库后走 CDN）/ default sounds (served from the repo via CDN)
  - `Images/` — 美术资源目录（目前为空，等待投稿）/ art asset folder (currently empty, awaiting contributions)
  - `test.html` — 浏览器内全量回归测试（约 124 项断言，Mock 全部游戏接口）/ in-browser full regression suite (~124 assertions, all game APIs mocked)

## 许可证
## License

[MIT](LICENSE) © 2026 Nice8923

## 参与贡献
## Contributing

资源投稿 / Bug 报告 / 功能建议：见 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [Issue 模板](.github/ISSUE_TEMPLATE/)。
Asset submissions / bug reports / feature requests: see [CONTRIBUTING.md](CONTRIBUTING.md) and the [issue templates](.github/ISSUE_TEMPLATE/).
