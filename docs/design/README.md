# SwilRead — Design Docs Index

> Status: Design Complete · Last updated: 2026-05-01 · 实施进入 `docs/develop/`

产品设计已完成。所有核心决策已固化。开发任务请见 [`docs/develop/phase-1-implementation-plan.md`](../develop/phase-1-implementation-plan.md)。

## 文档列表

| 文件                                                       | 内容                                                                                         |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [vision.md](./vision.md)                                   | 产品愿景、核心问题、定位、原则、AI 时代的深层使命                                            |
| [brand-and-positioning.md](./brand-and-positioning.md)     | 品牌哲学、tagline、声音、视觉身份、killer demo 策略、Sample Vault 内容方向                   |
| [use-cases.md](./use-cases.md)                             | 详细使用场景，覆盖个人用户和开放用户群                                                       |
| [reading-experience.md](./reading-experience.md)           | 沉浸式阅读体验设计：布局、排版、主题、交互                                                   |
| [rendering-spec.md](./rendering-spec.md)                   | 渲染完备性合约：MD 全特性 + 多种文件格式支持                                                 |
| [ftue-and-vault-model.md](./ftue-and-vault-model.md)       | 首次体验流程、Sample Vault 内容策略、单 vault 内 section 结构、多 vault 模型、vault 类型适配 |
| [ai-roadmap.md](./ai-roadmap.md)                           | AI 功能分阶段路线图、CLI 凭证桥接探索、隐私保证                                              |
| [open-source-strategy.md](./open-source-strategy.md)       | 开源路径、社区策略、商业化方向                                                               |
| [gaps-and-open-questions.md](./gaps-and-open-questions.md) | 当前已知的技术盲区、产品缺口和待决策问题                                                     |

## 阅读顺序

1. `vision.md` — 产品的出发点和 AI 时代的深层使命
2. `brand-and-positioning.md` — 品牌哲学、tagline、声音、视觉身份
3. `use-cases.md` — 详细使用场景
4. `reading-experience.md` — 沉浸式阅读体验的精确定义
5. `rendering-spec.md` — 渲染完备性合约
6. `ftue-and-vault-model.md` — 首次体验和多 vault 模型
7. `ai-roadmap.md` — AI 功能的分阶段路线图
8. `open-source-strategy.md` — 开源路径与商业化
9. `gaps-and-open-questions.md` — 已知盲区与决策记录

## 决策日志

- [x] **2026-04-30** — 平台：Web App（FSAPI）优先；Tauri 桌面版延后
- [x] **2026-05-01** — 编辑边界：Phase 1 严格只读；Phase 2 引入当前文档的轻量 source edit（纯 Markdown 文本、仅修订，不做结构化创作）+ 应用内注释（IndexedDB，服务于其他功能）
- [x] **2026-05-01** — 阅读布局：Option B 沉浸式单栏，hover 召唤 UI，⌘K 全局搜索，F 键禅模式
- [x] **2026-05-01** — 主题：Sepia 默认 / Light / Dark / OLED 黑 / Auto 跟随系统；衬线字体（Source Serif + 思源宋体）默认
- [x] **2026-05-01** — 导航哲学：混合模式（Map 首页 + ⌘K 多模式命令栏 + 语义分组文件树）；index.md → README.md → home.md 自动检测；⌘K 默认显示最近 5 个文件；图谱视图延后到 Phase 3 + AI 加持版本
- [x] **2026-05-01** — AI 边界：MVP 完全不做 AI；Phase 2 引入直接增强；Phase 3 加跨 vault 召回；探索 CLI 凭证桥接复用用户已订阅的 Claude Code / Cursor / Codex CLI 额度（Tauri 版可行，Web 需本地 daemon）
- [x] **2026-05-01** — 渲染完备性：覆盖 CommonMark + GFM + Obsidian 全套（callouts、wikilinks、embeds、highlights、tags、frontmatter）+ Math/Mermaid + 多种非 MD 文件格式（txt/csv/json/html/pdf/epub/code/媒体）
- [x] **2026-05-01** — FTUE：Hybrid landing（hero + 2 CTAs + scroll-to-features）；Sample Vault 主题为「Art of Reading」式精选知识；inline consent panel 引导文件夹授权；返回用户自动恢复 vault；无强制 onboarding tour，只有 contextual hints
- [x] **2026-05-01** — Vault 模型：单 vault 内通过 `*-map.md` 自动识别 sections（一级目录 = 子知识库），多 vault 支持硬隔离切换；vault 类型自动识别（Obsidian / Logseq / Foam / plain）；约定优于配置
- [x] **2026-05-01** — 品牌哲学：AI 时代的深度阅读避难所，「Read your knowledge. Beautifully. / A reading sanctuary for the AI era.」；声音文学、克制、温暖；Sample Vault 主题改为「Reading in the Age of AI」
- [x] **2026-05-01** — Killer demo：VS Code vs SwilRead 对比图（hero）+ F 键禅模式 GIF + 60 秒导览视频
- [x] **2026-05-01** — 视觉身份：Bookmark 概念 logo（一根竖线带书签缺口）；Source Serif 4 wordmark；品牌主色 sepia gold (#8b6f47) on cream
- [x] **2026-05-01** — MVP scope 锁定：Phase 1 / Phase 2 / Phase 3 三阶段清晰划分；Phase 1 砍掉所有 AI、编辑、注释、PDF、图谱、桌面版
- [x] **2026-05-01** — 实施计划完成：`docs/develop/phase-1-implementation-plan.md` 包含 M0-M9 共 70+ 个任务，按依赖排序，每个任务可独立由 AI agent 执行
