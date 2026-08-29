# SillyTavern Depth 提示词重排

这是一个面向 SillyTavern 1.14.0 及以上版本 Chat Completion 的第三方扩展。

它会把带有 Depth 的提示词从 Chat History 中移到两个可由 Prompt Manager 拖动的 Maker 标记之间：

- `深度前`：`stDepthRelocatorBefore`
- `深度后`：`stDepthRelocatorAfter`

## 功能

- 仅在配置页手动点击“添加/修复 Maker”后，才在 `chatHistory` 前后创建两个 Maker 标记。
- 插件安装、启动和切换预设都不会自动插入或保存 Maker；保存配置也不会隐式创建 Maker。
- 配置保存在当前 Chat Completion 预设的 `extensions.st_depth_relocator` 中。
- 支持 `D ≤ N`、`D ≥ N` 和 `全部 Depth` 三种拦截范围。
- `D ≤ 分割深度` 的条目移动到 `深度后`，其余选中条目移动到 `深度前`。
- 只处理真正通过 Depth 注入的提示词，不处理普通聊天历史、世界书前后置内容或非 Depth 扩展提示词。
- 对不含 `chatHistory` 容器的独立请求（例如 MVU 额外模型解析）静默跳过，不显示无关的结构告警。
- 当前预设未配置、功能关闭、Text Completion 或系统消息合并开启时不进行重排。

## TauriTavern 兼容性

插件依赖宿主正确保存 Chat Completion 预设和用户设置。TauriTavern v2.2.0 正式版存在已知的设置保存回归：从旧版本导入数据后，设置修订缓存可能与磁盘内容失配，导致保存失败；而预设重命名本身是“先保存新名称，再删除旧名称”，因此失败时可能表现为新预设没有落盘、列表回到空的默认项。

这不是插件主动清空预设造成的。相关问题见 [TauriTavern Issue #172](https://github.com/Darkatse/TauriTavern/issues/172) 和 [Issue #156](https://github.com/Darkatse/TauriTavern/issues/156)，宿主修复提交为 [f5afa579](https://github.com/Darkatse/TauriTavern/commit/f5afa579ad5b6b3dd8340dc1415646896b9a875d)。使用 TauriTavern 时请升级到包含该提交的版本或 Canary；v2.2.0 正式版不在已修复范围内。

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

## 致谢与技术来源

本项目的扩展目录结构、入口配置和部分开发工作流基于 [StageDog/tavern_extension_template](https://github.com/StageDog/tavern_extension_template)。感谢该模板及其维护者；模板贡献者不等同于本插件 Depth 重排功能的作者或维护者。

运行时依赖 SillyTavern 1.14.0 及以上版本提供的 Chat Completion Prompt Manager、`promptManager`、`Message` / `MessageCollection`、`oai_settings` 和 `CHAT_COMPLETION_PROMPT_READY` 事件。界面与构建使用 Vue、Pinia、VueUse、Vite、Tailwind CSS 等开源项目，并使用 SillyTavern 提供的 jQuery、Lodash、Toastr 等运行时库。

GitHub Contributors 页面会根据提交历史自动统计贡献者，因此可能显示模板同步提交者或 `github-actions[bot]`。这不代表他们参与了本插件的 Depth 重排实现；本节用于说明技术来源和致谢，不替代各依赖项目原有的版权与许可证声明。

## 运行时安全策略

扩展在最终 Chat Completion 提示词就绪事件中使用 SillyTavern 的内部 `chatHistory-N` 标识定位 Depth 注入消息，并用角色和内容校验匹配结果。运行时因 token 预算等原因未保留的单个 Depth 消息会被忽略，仍会重排成功定位的其他消息；如果没有任何可定位消息，则保持原提示词不变。

当预设启用 `squash_system_messages` 时，原始 Maker 边界不可安全恢复，因此该次请求会跳过重排。
MVU 额外模型解析等独立请求可能不包含主聊天的 `chatHistory` 容器；扩展会直接跳过这类请求，不修改其提示词，也不报告 Maker 警告。
