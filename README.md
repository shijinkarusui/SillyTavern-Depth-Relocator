# SillyTavern Depth 提示词重排

这是一个面向 SillyTavern 1.14.0 及以上版本 Chat Completion 的第三方扩展。

它会把带有 Depth 的提示词从 Chat History 中移到两个可由 Prompt Manager 拖动的 Maker 标记之间：

- `深度前`：`stDepthRelocatorBefore`
- `深度后`：`stDepthRelocatorAfter`

## 功能

- 首次加载当前预设时，在 `chatHistory` 前后创建两个 Maker 标记。
- 配置保存在当前 Chat Completion 预设的 `extensions.st_depth_relocator` 中。
- 支持 `D ≤ N`、`D ≥ N` 和 `全部 Depth` 三种拦截范围。
- `D ≤ 分割深度` 的条目移动到 `深度后`，其余选中条目移动到 `深度前`。
- 只处理真正通过 Depth 注入的提示词，不处理普通聊天历史、世界书前后置内容或非 Depth 扩展提示词。
- 当前预设未配置、功能关闭、Text Completion 或系统消息合并开启时不进行重排。

## 安装

在 SillyTavern 的 Extensions 面板中，通过第三方扩展 Git URL 安装本仓库：

```text
https://github.com/shijinkarusui/SillyTavern-Depth-Relocator
```

也可以手动将仓库目录放到：

```text
SillyTavern/public/scripts/extensions/third-party/
```

## 开发

需要 Node.js 22+ 和 pnpm：

```bash
pnpm install
pnpm test
pnpm lint
pnpm build
```

构建产物位于 `dist/index.js` 和 `dist/index.css`，与 SillyTavern 扩展清单中的入口一致。

## 运行时安全策略

扩展在最终 Chat Completion 提示词就绪事件中使用 SillyTavern 的内部 `chatHistory-N` 标识定位 Depth 注入消息，而不是仅凭消息文本匹配。如果消息结构无法与 SillyTavern 的 Depth 注入算法一致，扩展会保持原提示词不变并提示用户。

当预设启用 `squash_system_messages` 时，原始 Maker 边界不可安全恢复，因此该次请求会跳过重排。
