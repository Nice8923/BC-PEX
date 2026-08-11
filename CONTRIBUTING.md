# 贡献指南
# Contributing Guide

感谢你有兴趣为 **Personality Excretion（PEX）** 添砖加瓦！这个项目最需要的是**美术资源**，其次是 Bug 报告与功能建议，代码贡献同样欢迎。
Thanks for your interest in **Personality Excretion (PEX)**! What the project needs most is **art assets**, followed by bug reports and feature suggestions — code contributions are equally welcome.

## 快速导航
## Quick Navigation

- [美术资源投稿](#美术资源投稿) ← 最需要你 / most needed
- [Bug 报告](#bug-报告)
- [功能建议](#功能建议)
- [代码贡献](#代码贡献)
- [开发环境](#开发环境)

## 美术资源投稿
## Art Asset Submissions

插件目前的画面全部是程序化占位（白色方块、文字按钮、BC 自带贴图）。缺失清单见 [README「缺的美术资源」](README.md#缺的美术资源欢迎投稿)。
All visuals in the plugin are currently procedural placeholders (white squares, text buttons, built-in BC sprites). See the missing-asset list in [README](README.md#缺的美术资源欢迎投稿).

### 规格要求
### Specifications

| 资源 / Asset | 文件名（放 `Images/`）/ File (in `Images/`) | 规格 / Spec |
|------|----------------------|------|
| 排出动画精灵图 / Excretion spritesheet | `anim-sheet.png` | 透明底 PNG，单行 4–8 帧，每帧正方形（建议 64×64），帧序：臀部 → 中段 → 中下段 → 落地 / transparent PNG, 4–8 square frames in a row (64×64 suggested), order: butt → mid → lower → floor |
| 凝胶落地贴图 / Gel floor sprite | `gel.png` | 透明底 PNG，约 64×64，半透明质感 / transparent PNG, ~64×64, semi-transparent |
| 远程编辑按钮图标 / Remote-edit icon | `remote-icon.png` | 90×90 图标 PNG，透明底 / 90×90 icon PNG, transparent |
| 设置页按钮图标 / Settings icon | `pex-icon.png` | 方形图标 PNG（建议 64×64），透明底 / square icon PNG (64×64 suggested), transparent |

### 要求
### Requirements

- **原创或可商用授权**素材（请勿使用他人未经授权的画作/游戏内素材）。
  **Original or commercially-licensed** assets only (no unauthorized art or in-game assets).
- 风格与 Bondage Club 默认 3D 风格接近即可，不必完美匹配。
  Style close to Bondage Club's default 3D look is fine; a perfect match is not required.
- 提交时附一句素材说明（画了什么、授权情况），放 PR 描述或 Issue 评论即可。
  Include a short asset description (what it is, licensing) in the PR description or an issue comment.

### 如何提交
### How to Submit

1. 把图片文件放进 `Images/` 目录 / Put the image file(s) in the `Images/` folder.
2. 提 PR（见 [代码贡献](#代码贡献)），或直接开一个 [资源投稿 Issue](.github/ISSUE_TEMPLATE/asset-submission.md) 把图片贴上来。
   Open a PR (see [code contributions](#代码贡献)), or open an [asset-submission issue](.github/ISSUE_TEMPLATE/asset-submission.md) and attach the images.
3. 若图片不方便放 GitHub，也可以开 Issue 说明情况，我会提供替代的接收方式。
   If the images cannot go on GitHub, open an issue describing the situation and an alternative delivery method will be arranged.

收到素材后，我会负责接入代码（绘制逻辑与 CDN 发布），你不需要懂代码。
Once assets are received, integration (drawing logic and CDN publishing) is handled here — no coding knowledge needed.

## Bug 报告
## Bug Reports

开 Issue 时请选 **Bug 报告** 模板，并尽量包含：
Use the **Bug Report** template and include as much as possible:

- 插件版本（`/pex status` 或 Tampermonkey 里的版本号）/ Plugin version (`/pex status` or the Tampermonkey version)
- 游戏客户端版本（如 R130）/ Game client version (e.g. R130)
- 复现步骤（喝了什么、什么设置、什么顺序）/ Steps to reproduce (what was drunk, settings, order)
- 浏览器控制台的 PEX 日志（`/pex show` 面板也有）/ PEX logs from the browser console (also visible via `/pex show`)
- 是单人出现还是多人同时出现（多人并发问题请说明房间人数与操作顺序）/ Single-player or multiplayer (for concurrency issues, include room size and action order)

## 功能建议
## Feature Suggestions

开 Issue 时选 **功能建议** 模板，说明：
Use the **Feature Suggestion** template and describe:

- 想加什么功能 / 改什么行为 / What feature or behavior change
- 使用场景（单人 / 多人、公开房间 / 私人房间）/ Use case (single/multiplayer, public/private room)
- 与现有功能的冲突点（如果有）/ Conflicts with existing features (if any)

注意：本插件遵循"不干扰原版体验"原则，涉及消息格式、服务器行为的改动会非常谨慎，可能被拒绝。
Note: this plugin follows a "don't disturb vanilla experience" principle; changes touching message formats or server behavior are treated very cautiously and may be declined.

## 代码贡献
## Code Contributions

1. Fork 本仓库，从 `main` 开分支 / Fork this repo and branch from `main`.
2. 遵循现有代码风格（中文注释、模块头注释、`try/catch` 包裹对 BC 全局的访问）/ Follow the existing style (Chinese comments, module header comments, `try/catch` around BC globals).
3. **改动必须过测试**：打开 `test.html`（浏览器直接打开即可），所有断言应为绿色（当前约 124 项）/ **Changes must pass the tests**: open `test.html` in a browser; all assertions should be green (~124).
4. 涉及 BC 原版接口/消息的改动，请注释说明验证依据（对照原版客户端的哪个函数/文件）/ For changes touching vanilla BC APIs/messages, note the verification basis in comments (which client function/file).
5. 提 PR 时说明改动内容与测试结果 / Describe the changes and test results in the PR.

## 开发环境
## Development Environment

```bash
npm install
npm run build                # 构建到 dist/ / build into dist/
node scripts/build-loader.mjs  # 生成 loader.embedded.user.js（发布版）/ generate loader.embedded.user.js (release)
npm run dev                  # 本地开发（vite preview :5174）/ local dev (vite preview :5174)
```

- 本地调试用 `loader.local.user.js`（连 localhost:5174）或 `loader.ebc.user.js`（连 localhost:8000）。
  For local debugging use `loader.local.user.js` (localhost:5174) or `loader.ebc.user.js` (localhost:8000).
- 回归测试：`test.html` 在浏览器中打开即跑，全部断言通过后再提交。
  Regression: open `test.html` in a browser — it runs the full suite; only submit when everything passes.
  注意：test.html 依赖本地静态服务（bundle 从 `localhost:8000/bc-pex/dist/assets/main.js` 加载），并引用 `reference/bc-client/Scripts_lib_LZString.js`（BC 客户端文件，不随仓库分发，需自行准备）。
  Note: test.html needs a local static server (the bundle loads from `localhost:8000/bc-pex/dist/assets/main.js`) and references `reference/bc-client/Scripts_lib_LZString.js` (a BC client file not shipped with this repo — prepare it yourself).

## 行为红线
## Hard Limits

- 不进行任何可能导致账号封禁的操作（不改服务器协议、不伪造消息类型、消息走原版队列）。
  Nothing that could get accounts banned: no protocol changes, no forged message types, all messages go through the vanilla queue.
- 不干扰非 PEX 玩家的原版体验 / No interference with the vanilla experience of non-PEX players.
- 多人交互的消息格式必须与已验证的原版客户端格式一致 / Multiplayer message formats must match the verified vanilla client.
