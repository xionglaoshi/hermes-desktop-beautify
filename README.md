# hermes-desktop-beautify

**Hermes 桌面端的界面美化插件**：侧栏「更多工具」折叠组、搜索框上移与细边框、会话区排版、
会话产物卡片点击转「文档预览」、统一台面……全部靠**注入**实现，**不改桌面端一行源码**，禁用即完全还原。

MIT License.

---

## 依赖（先用这段判断要不要装）

本插件是「桌面端 UI 总包」，它本身只做界面改造，**另外有两块功能是放在独立仓库里的**。
装上它们，侧栏「更多工具」组和右栏才是完整的；不装也能跑，只是少两个面板（见下表）。

| 依赖 | 用来做什么 | 仓库 |
|---|---|---|
| **Hermes 桌面端**（宿主） | 提供桌面插件机制与贡献面（`sidebar.nav`、右栏面板、`host.openWorkspace`…） | 宿主本身 |
| **hermes-office-viewer** | 右栏「**文档预览**」面板（Office / PDF / Markdown / HTML / 图片 / 文本就地预览），以及本插件「会话卡片点击 → 文档预览」所依赖的 `hermes-office-open` 契约 | <https://github.com/xionglaoshi/hermes-office-viewer> |
| **meeting-recorder** | 「**会议记录**」面板（录音 → 实时转写 → 纪要）。它是本地服务，界面在 `127.0.0.1:8789` | <https://github.com/xionglaoshi/meeting-recorder> |

装依赖（各自仓库里都有 `install.sh`）：

```bash
git clone https://github.com/xionglaoshi/hermes-office-viewer.git
git clone https://github.com/xionglaoshi/meeting-recorder.git
```

**缺依赖时的表现**（本插件的设计原则是「优雅降级」，不是报错）：

| 缺谁 | 会怎样 |
|---|---|
| 缺 hermes-office-viewer | 侧栏少一行「文档预览」，右栏没有该标签；会话里的产物卡片点击不会进这个查看器（落到应用自带预览，或不动） |
| 缺 meeting-recorder | 「会议记录」那一行仍在，但打开后提示「这个页面要靠它自己的服务托管」并给出启动命令；服务起来后刷新即可 |
| 两个都缺 | 本插件自身的界面改造（折叠组、搜索框、会话区排版、统一台面）照常工作 |

> 「会议记录」面板默认按 `bash ~/.agents/skills/meeting-recorder/start.sh` 提示启动命令。
> 你把那个仓库 clone 到别处的话，改 `desktop/plugin.js` 里的 `RECORDER_START_CMD` 常量即可。

## 它做什么

1. **侧栏「更多工具」折叠组** —— 把 技能与工具 / 消息平台 / 产物 / 定时任务 等导航行收进一行
   **「更多工具」**，点击原地展开收起，**每次启动都是折叠的**（不记上次状态；想让它在启动时保持展开，
   用 `⌘K` 搜「更多工具」切换）。以后用官方贡献面 `sidebar.nav` 注册的插件导航行
   **会自动收进这一组**，不用改本插件。组内还有三行：**内置浏览器 / 文档预览 / 会议记录**（点它们都在会话区整块打开）。
2. **搜索会话框上移到侧栏最上** —— 加一道 1px 若隐若现的淡灰细框，去掉原生「空值时半透明」，
   占位文字颜色加深（都在「新建会话」之上）。
3. **「已置顶」启动时自动折叠** —— 进应用时自动折一次；之后完全听你手动开关，不跟你抢（`⌘K` 可整体关掉）。
4. **会话区排版** —— 行高 1.62、段距 0.95rem、轮间距 0.6rem（浅深双套自动）。可一键关。
5. **用户气泡配色 / 加粗 / AI 竖条** —— 规则本体都在，当前**默认关闭**（按作者口径停用），
   `⌘K` 搜「会话区」可开回。
6. **会话产物卡片点击 → 文档预览** —— 会话里发出去的产物卡片（下载 / 打开预览那两颗按钮），
   点「打开预览」不再走应用自带预览，而是进右栏「文档预览」里渲染（走 `hermes-office-open` 契约）。
   格式按 Office 查看器能渲染的来，`html` 仍走内置浏览器。可一键关。

## 安装

```bash
git clone https://github.com/xionglaoshi/hermes-desktop-beautify.git
cd hermes-desktop-beautify
bash install.sh            # 先看它要做什么：bash install.sh --dry-run
```

然后在应用里启用（**两步，缺一不可**）：

1. `⌘K` →「**技能与工具**」→「**桌面插件**」标签 → 点「**重新扫描**」；
2. 在同一页找到「**桌面美化**」那一行，**打开开关**（默认关闭：应用对桌面插件强制 opt-in）。

开关一开，侧栏立刻变样，**不用重启应用**。

## 用法

| 想干什么 | 怎么做 |
|---|---|
| 展开 / 收起侧栏工具组 | 点侧栏「更多工具」（只在本次会话有效；下次启动仍是折叠的） |
| 开关某一项 | `⌘K` 搜「**更多工具**」「**会话区**」「**气泡**」「**卡片**」，每项一行，右侧显示当前状态 |
| 换聊天字体 | 不在插件里改，走官方设置：`hermes config set desktop.font_family "PingFang SC"`，之后 `⌘R` 重载一次 |
| 改了插件代码 | 「桌面插件」页再点一次「**重新扫描**」（按 mtime 重新复制并热重载）；**开关不用重开** |

## 卸掉 / 还原

- 关掉「桌面美化」那一行的开关 —— **立即还原，无需重启**；或
- 删掉两处目录：`~/.hermes/plugins/desktop-beautify/` 与 `~/.hermes/desktop-plugins/desktop-beautify/`。

本插件不常驻服务、不写 Hermes 源码或配置；禁用时它自己摘掉注入的 `<style>`、注入的行、
注入的属性与 `MutationObserver`，界面回到原生。

## 原理与边界（诚实说明）

- 一切靠 DOM/CSS/贡献面**注入**：自己不搬 React 管的节点（搬了有被重排回去的风险），
  用 `order` 调位置；`MutationObserver`（幂等、限流 200ms）在 React 重渲染后把注入行归位。
- **上游改了侧栏结构/类名 → 选择器一条都不命中 → 什么都不注入，界面就是原生侧栏**（不会把界面搞坏）。
- 已知边界：折叠时被隐藏的导航行仍在 DOM 里（`display:none`），所以快捷键、路由、深链不受影响；
  但**新用户引导若锚定到被隐藏的那几行**，折叠态下锚点不可见 —— 展开即恢复。
- 「已置顶」只在应用启动后第一次见到时折一次；你若先手动展开，本插件不会再动它。

## 许可

MIT License —— 见 [LICENSE](LICENSE)。

相关项目：[hermes-office-viewer](https://github.com/xionglaoshi/hermes-office-viewer) ·
[meeting-recorder](https://github.com/xionglaoshi/meeting-recorder)
