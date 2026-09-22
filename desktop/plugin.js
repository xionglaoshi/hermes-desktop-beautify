/**
 * 桌面美化（plugin id: desktop-beautify）
 *
 * 插件名 = 「桌面美化」：本机 UI 改造集合，后续界面改动都往这里加。
 * （2026-09-22 从旧 id `sidebar-more-tools` 改名：旧名只描述了当时的第一个功能。）
 * 现有能力（全部靠注入实现，不改桌面端源码）：
 *   ① 侧栏导航折叠组：技能与工具 / 消息平台 / 产物 / 定时任务 / 插件页面 →
 *      收进一行「更多工具」，默认折叠，点击原地展开收起，新插件贡献的行自动收进来。
 *   ② 搜索会话框：提到侧栏最上（用 order 排序，不搬 React 管的节点）；不要边框、不要底色，
 *      只留放大镜与文字，占位文字加深、不再半透明。
 *   ③ 会话区：**略舒展排版**（行高 / 段距 / 轮间距各加一档）。
 *      同区块的用户气泡配色、用户发言加粗、AI 左侧渐变竖条**都已按用户口径停用**（本体保留，
 *      改 `USER_BUBBLE_FILL` / `USER_BUBBLE_BOLD` / `CONVO_AI_BAR` 三个开关即恢复），
 *      CSS 全部以 `[data-slot="aui_thread-viewport"]` 打头，绝不外溢到侧栏/设置/输入框。
 *   ④ 统一台面：把「窗口/会话区、侧栏、输入框、浮层」这些**大面**的背景统一到同一层
 *      （= 输入框用的卡片层 `--ui-bg-editor`），消掉原生那三种极浅灰白拼成的"色块感"；
 *      只改面、不改悬停/选中这些交互反馈层。⌘K 可单独开关。
 *   ⑤ 「已置顶」挪到「会话」下方（侧栏最下方）：只给置顶分区根打一个属性，
 *      CSS 用 `order` 排到最后 —— **不搬节点、不点按钮、不动它自己的任何行为**。
 *   ⑥ 「更多工具」展开后的最末端加一行「内置浏览器」：点它在**会话区**整块打开一个浏览器标签
 *      （与侧栏「Office 查看器」同形；`host.openWorkspace`）。里面的内核就是桌面端自带浏览器那套
 *      webview（同一个 `persist:hermes-preview` 分区 ⇒ 登录状态共用）。宿主没有 `openWorkspace` 时
 *      退回「前台化右栏浏览器标签」，再不行才按当前键位合成 keydown（见 `SHOW_BROWSER_ACTION`）。
 *   ⑦ 右侧栏（⌘J）那条标签条：文件 / 文档预览 / 浏览器 / 会议记录，**只能切换不能关闭**。
 *      本插件贡献「浏览器」（内部就是自带浏览器那个 webview + 我们画的一条地址栏）与
 *      「会议记录」（只嵌 meeting-recorder 的前端页，没有任何别的 chrome）两个面板；
 *      两者 `uncloseable`（宿主不渲染 ✕），应用自带标签的 ✕ 用注入 CSS 藏掉；
 *      应用自带的「文件」标签名按用户口径**藏掉**（`RAIL_HIDE_FILE_TAB`，⌘K 可开关）
 *      ⇒ ⌘J 出来固定就三个标签：文档预览 / 浏览器 / 会议记录。副作用两处都已处理：
 *      ① 活动标签恰是藏起来的「文件」时，切到第一个可见标签；② 侧栏「内置浏览器」行改走
 *      右栏那个「浏览器」标签（不再另开应用的临时预览标签），面板没就位时仍退回原生键位。
 *   ⑧ 「文件」面板里点文件：不再让应用另开预览标签 —— md/txt/doc/docx/xls/xlsx/ppt/pptx
 *      转到「文档预览」标签预览（换一个文件就替换上一个），html 转到「浏览器」标签打开。
 *
 * 全局字体（PingFang SC）走官方设置，不在这里改：`hermes config set desktop.font_family "PingFang SC"`
 * → 应用把它落到 `--dt-font-sans`，正是「App 字体」该走的那条路（Appearance → 聊天字体同源）。
 *
 * 抓手（都来自源码；机制说明与踩坑记录见 https://hermes-agent.nousresearch.com/docs 的桌面插件章节）：
 *   - 导航行标签带 `data-tour="sidebar-nav-<id>"`，行容器是 `[data-slot="sidebar-menu"] > li`。
 *   - 侧栏内容列 `[data-slot="sidebar-content"]` 是 flex column → 排序用 `order`，不搬 DOM：
 *     搬 React 管的兄弟节点有被它下一次重排搬回去的风险。
 *
 * 失效时的行为（诚实说明）
 *   上游若改了结构/类名，选择器一条都对不上 → 本插件什么都不注入，界面就是原生侧栏，
 *   不会把侧栏搞坏。禁用插件 → onDispose 摘掉 <style>、注入节点、全部属性与观察器，完全还原。
 */

import { jsx, jsxs } from 'react/jsx-runtime'
import { useCallback, useEffect, useRef, useState } from 'react'
import { atom, Codicon, host, PALETTE_AREA, PANES_AREA, useValue } from '@hermes/plugin-sdk'

const PLUGIN_ID = 'desktop-beautify'
const STYLE_ID = 'hermes-more-tools-style'
const ROW_ATTR = 'data-hermes-more-tools'
const ROOT_ATTR = 'data-hermes-more-tools-state'
const SEARCH_WRAP_ATTR = 'data-hermes-search-wrap'
const SEARCH_FIELD_ATTR = 'data-hermes-search-field'
const NEW_SESSION_TOUR = 'sidebar-nav-new-session'
const MENU_SELECTOR = '[data-slot="sidebar-menu"]'
const CONTENT_SELECTOR = '[data-slot="sidebar-content"]'
const NAV_ROW_SELECTOR = '[data-tour^="sidebar-nav-"]'
const LABEL = '更多工具' // 侧栏那一行显示的字（插件名是「桌面美化」，见头部注释）
const HINT = '技能与工具 / 消息平台 / 产物 / 定时任务 / Office 查看器等'
/** 折叠组里再加一行：内置浏览器（点开右侧栏那个带地址栏的浏览器）。 */
const BROWSER_LABEL = '内置浏览器'
/** 右栏标签 / 会话区标签用的名字（与侧栏那一行的行名分开）。 */
const RAIL_TAB_LABEL_BROWSER = '浏览器'
const BROWSER_ROW_ATTR = 'data-hermes-browser-row'
/** 前缀与原生导航行一致 ⇒ 上面那条「折叠态隐藏」的规则自动把它一起收起来，不必再写一条。 */
const BROWSER_TOUR = 'sidebar-nav-hermes-builtin-browser'
/** 图标与原生导航行的图标同款（原生行是 `size-4 shrink-0 text-[color-mix(…72%…)]`）。 */
const BROWSER_ICON_CLASS = 'codicon codicon-browser size-4 shrink-0 text-[color-mix(in_srgb,currentColor_72%,transparent)]'
/** 「更多工具」组里第二条自建行：会议记录（点它与右栏那个面板同内容，只是开在会话区整块）。 */
const RECORDER_LABEL = '会议记录'
const RECORDER_ROW_ATTR = 'data-hermes-recorder-row'
const RECORDER_TOUR = 'sidebar-nav-hermes-meeting-recorder'
const RECORDER_ICON_CLASS = 'codicon codicon-record size-4 shrink-0 text-[color-mix(in_srgb,currentColor_72%,transparent)]'
const RECORDER_WORKSPACE_KEY = 'meeting-recorder'
/** 「文档预览」那一行是 office-viewer 插件贡献的导航行，靠可见文字认（改名前叫「Office 查看器」）。 */
const OFFICE_ROW_LABELS = ['文档预览', 'Office 查看器']
/**
 * 打开「内置浏览器」= 右侧栏那个带地址栏的浏览器表面。应用把它只挂在快捷键 `view.showBrowser` 上
 * （默认 ⌘⇧L，可在「设置 → 快捷键」改），SDK 里**没有**直接打开它的接口，而且磁盘插件只许 import
 * `@hermes/plugin-sdk` 与 react（应用内部模块被 loader 拦掉）—— 所以走应用自己的入口：
 * 按**当前键位**合成一次 keydown 交给应用的键位分发器（它匹配到 action 就 preventDefault 并执行
 * `openBrowserTab()`）。用户改过键位就先用他改的，没改过/改了没生效再补一次默认值兜底。
 */
const SHOW_BROWSER_ACTION = 'view.showBrowser'
/** 「在会话区打开浏览器」那个按需面板的 key（宿主会拼成 `plugin-workspace:<key>`）。 */
const BROWSER_WORKSPACE_KEY = 'builtin-browser'
const SHOW_BROWSER_FALLBACK = 'mod+shift+l'
const KEYBINDS_KEY = 'hermes.desktop.keybinds'
const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent || '')
/** combo 末段（键名）→ 合成 KeyboardEvent 需要的 `key` / `code`（字母数字按规则推，其余查这张表）。 */
const KEY_SPEC = {
  '[': ['[', 'BracketLeft'],
  ']': [']', 'BracketRight'],
  '/': ['/', 'Slash'],
  '\\': ['\\', 'Backslash'],
  '`': ['`', 'Backquote'],
  '-': ['-', 'Minus'],
  '=': ['=', 'Equal'],
  ',': [',', 'Comma'],
  '.': ['.', 'Period'],
  ';': [';', 'Semicolon'],
  "'": ["'", 'Quote'],
  space: [' ', 'Space'],
  enter: ['Enter', 'Enter'],
  escape: ['Escape', 'Escape'],
  tab: ['Tab', 'Tab'],
  up: ['ArrowUp', 'ArrowUp'],
  down: ['ArrowDown', 'ArrowDown'],
  left: ['ArrowLeft', 'ArrowLeft'],
  right: ['ArrowRight', 'ArrowRight']
}
const RECONCILE_MS = 200

/**
 * ⑤ 「已置顶」排到侧栏最下方（用户 2026-09-22 口径：把「已置顶」和「会话」换个位置）。
 * 做法刻意做到最小：只在**置顶分区根**上打一个属性，由 CSS 用 `order` 把它排到最后。
 *   · 不搬节点 —— React 只管它渲染过的节点，属性它不碰，安全性最高；
 *   · 不点按钮、不改折叠、不动任何文字/样式 —— 置顶分区本身的行为保持官方原版；
 *   · 父容器（承载各分区的那个 div）是 flex column，`order` 才有效；「会话」那块自带
 *     `flex-1`，会自己把剩余高度吃掉，置顶分区自然贴到最下面。
 * 分区根上没有可用的标识属性（源码里没有任何 data-* ），CSS 也做不到按文字匹配，
 * 所以「哪一块是置顶」只能由 JS 按分区头文字认定，认完只做这一件事。
 */
const PIN_LAST_ATTR = 'data-hermes-pin-last'
const PIN_LABELS = ['已置顶', 'Pinned']

/**
 * ③ 会话区：**略舒展排版**（行高、段距、轮间距各加一档）。
 *   会话区里另外三样东西都已按用户口径**停用**（规则本体不删，改上面三个开关即恢复）：
 *     · 用户气泡配色（主题强调色 10% 单色块）→ 改用官方「设置 → 外观 → 消息气泡」的透明度滑杆；
 *     · 用户发言加粗 → 用户看过后说「还是有点丑」，先不要；
 *     · AI 消息左侧星云渐变竖条 → 用户说「现在看不好看了」，先不要。
 *   本区块所有规则一律以 `[data-slot="aui_thread-viewport"]` 打头 —— 只在会话正文区生效。
 * 已删除且不要恢复：会话区底色、链接/行内代码/引用/表格染色、思考·工具行染色。
 *
 * 边界（用户明确要求）：**所有规则都以 `[data-slot="aui_thread-viewport"]` 打头**，
 * 只在会话正文区内生效 —— 侧栏、设置页、命令面板、输入框一律不碰。
 */
const THREAD = '[data-slot="aui_thread-viewport"]'
const CONVO_ATTR = 'data-hermes-convo'
const CONVO_SCOPE = `html[${CONVO_ATTR}="on"]`
/** 统一台面用的根属性（全界面生效，不受会话区作用域限制）。 */
const FLAT_ATTR = 'data-hermes-flat'
/** 主题强调色：`--ui-accent` 就是应用自己的强调色别名（= `--theme-midground`，随主题/深浅实时变），
    后面的 fallback 只为万一上游改名时不至于整条规则失效。 */
const ACCENT = 'var(--ui-accent, var(--dt-midground, var(--theme-midground)))'

/** 用户消息气泡 = 主题强调色 **10% 的单色块**（明确不要渐变）。
    为什么压这么低：强调色通常很浓，压到 10% 后里面的**黑色粗体**既看得清、底色也不抢眼
    （用户依次试过 60% / 20%，都嫌重）。要更淡/更明显就改这一个数（15% 更明显、8% 更淡）。
    边框用**同一个百分比**，再把背景裁到 padding-box —— 否则背景会垫在边框下面，
    边框环变成「两层叠加」的深一圈，反而多出一圈难看的描边（实测过）。
    不设 box-shadow：气泡保持纯净色块，没有立体感也看不出边。 */
const CONVO_CARD = `${CONVO_SCOPE} ${THREAD} [data-slot="aui_user-message-root"] .composer-human-message {
  background-image: none !important;
  background-color: color-mix(in srgb, ${ACCENT} 10%, transparent) !important;
  background-clip: padding-box !important;
  border-color: color-mix(in srgb, ${ACCENT} 10%, transparent) !important;
  box-shadow: none;
}`

/** 用户说的话：颜色保持原生（浅色主题下就是黑），只加粗。 */
const CONVO_USER_TEXT = `${CONVO_SCOPE} ${THREAD} [data-slot="aui_user-message-root"] [data-slot="aui_user-inline-text"] {
  font-weight: 600 !important;
}`

/** 排版：略舒展（行高、段距、轮间距各加一档）。旋钮都是应用自己的变量，只在会话区内覆盖。 */
const CONVO_TYPE = `${CONVO_SCOPE} ${THREAD} {
  --dt-line-height: 1.62;
  --paragraph-gap: 0.95rem;
  --conversation-turn-gap: 0.6rem;
  --human-msg-line-height: 1.5;
}`

/**
 * ⑤ 统一台面：把「大面」的背景色全部对齐到**输入框那一层**（= 卡片/编辑器层 `--ui-bg-editor`）。
 *
 * 起因：原生的分层是「侧栏 `#f6f8fa` / 窗口与会话区 ≈`#fefefe` / 卡片与输入框 ≈`#fcfcfc`」，
 * 三种极浅的灰白各占一块，看上去就是一堆色块。统一到卡片层后全界面同色，只剩描边分界。
 *
 * 为什么取 `--ui-bg-editor` 而不是写死 `#ffffff`：
 *   ① 输入框自己就是这么来的 —— `--composer-fill: color-mix(dt-card 90%, dt-background)`，
 *      而 `--dt-card: var(--ui-bg-editor)`；所以「输入框色」== 卡片层色（实测差 <1/255，肉眼无感）。
 *   ② 它是主题算出来的（浅/深色各一套），写死白色会让深色主题直接崩。
 * 只覆盖「面」，**不动** `--ui-bg-primary…quinary` / `--ui-row-hover-background` 这些
 * 「交互反馈层」（悬停、选中、条纹），否则列表和按钮就没有反馈了。
 * 加 `!important` 的原因：应用在「半透明/玻璃」模式下会用**更具体的选择器**重声明其中几个变量
 * （`--ui-chat-surface-background: transparent` 之类），不加就会被它盖掉。 */
const FLAT_BG = `html[${FLAT_ATTR}="on"] {
  --ui-bg-chrome: var(--ui-bg-editor) !important;
  --ui-bg-sidebar: var(--ui-bg-editor) !important;
  --ui-chat-surface-background: var(--ui-bg-editor) !important;
  --ui-bg-input: var(--ui-bg-editor) !important;
  --ui-bg-elevated: var(--ui-bg-editor) !important;
}`

/** AI 消息（思考过程 / 工具调用 / 正文都在这块里）左侧的星云渐变竖条。
    画法用「background 细条」而不是 border：
      · `border-left: 1.5px` 的计算值会被浏览器**四舍五入成 1px**（实测），画不出「3px 的一半」；
      · background 尺寸不取整 ⇒ 1.5px 就是 1.5px，且在 Retina（DPR 2）上正好 3 个物理像素，很清晰。
    竖条不透明度 50% 用 color-mix(… 50%, transparent) 落在颜色上，**不要**用元素 opacity —— 那会把文字一起变淡。
    background 细条**不占布局宽度**，所以**不要**再去减 padding-left（实测减了会让正文比原生左移 1.5px）。 */
const CONVO_BAR_LIGHT = `${CONVO_SCOPE} ${THREAD} [data-slot="aui_assistant-message-content"] {
  background-image: linear-gradient(180deg, color-mix(in srgb, #b07d1e 50%, transparent) 0%, color-mix(in srgb, #7c4dd6 50%, transparent) 50%, color-mix(in srgb, #2f6fc4 50%, transparent) 100%);
  background-size: 1.5px 100%;
  background-position: left top;
  background-repeat: no-repeat;
}`

const CONVO_BAR_DARK = `${CONVO_SCOPE}:is(.dark, [data-hermes-mode="dark"]) ${THREAD} [data-slot="aui_assistant-message-content"] {
  background-image: linear-gradient(180deg, color-mix(in srgb, #e0b872 50%, transparent) 0%, color-mix(in srgb, #a76fe0 50%, transparent) 50%, color-mix(in srgb, #6ea8e8 50%, transparent) 100%);
}`

/**
 * 用户气泡皮肤 —— 拆成独立开关（2026-09-22 用户口径：**只要加粗** → 随后又「加粗也停用」）。
 *   · USER_BUBBLE_FILL：气泡底色 + 边框（主题强调色 10% 单色块/无渐变）—— **停用**，
 *     改用官方「设置 → 外观 → 消息气泡」那根透明度滑杆。
 *   · USER_BUBBLE_BOLD：用户发言文字加粗—— **停用**（用户：还是有点丑，先不要）。
 * 规则本体（CONVO_CARD / CONVO_USER_TEXT）一个字没删，改 true/false 即可开关。
 */
const USER_BUBBLE_FILL = false
const USER_BUBBLE_BOLD = false
/** AI 消息（思考过程 / 工具调用 / 正文）左侧的星云渐变竖条 —— **停用**（用户：现在看不好看了，想要再开）。 */
const CONVO_AI_BAR = false

/* ═══════════ ⑦ 右侧栏四标签：文件 / 文档预览 / 浏览器 / 会议记录 ═══════════
 * 用户口径（2026-09-22）：⌘J 出来这条标签条上，四个标签**只切换、不关闭**。
 *   · 文件          = 应用自带（自带 ✕）→ 只能靠注入 CSS 把它藏掉（应用源码不许改）。
 *   · 浏览器        = 本插件贡献的面板。里面就是**桌面端自带浏览器那个 webview**：
 *                     同一个 `partition`（persist:hermes-preview ⇒ 与自带浏览器共用 cookie/登录态）、
 *                     同一组 webpreferences（contextIsolation+sandbox，和 preview-pane 逐字一致）。
 *                     落位用 `dock.before = office-viewer:viewer` ⇒ 标签紧跟在「文件」之后。
 *   · 文档预览      = office-viewer 插件贡献的（它那边标签名就叫「文档预览」），本来就是 `uncloseable`（宿主不渲染 ✕）。
 *   · 会议记录      = 本插件贡献的面板：只嵌 meeting-recorder 那张前端页（无地址栏、无任何别的 chrome）。
 * 我们这两个面板都声明 `uncloseable: true` ⇒ 宿主**根本不渲染**关闭键（不是"藏起来"）；
 * 应用自带标签的 ✕ 则用 CSS 藏（选择器抓的是宿主自带的 `[data-closeable]` 标记，不是类名）。
 * 已知边界：⌘W 与标签右键菜单里的"关闭"仍能关掉**应用自带**标签（那是应用自己的入口，插件管不到外观之外）。
 */
const RAIL_PANES = true
const RAIL_STRIP_ATTR = 'data-hermes-rail-strip'
const RAIL_PANE_CLASS = 'hermes-rail-pane'
/** 「藏掉文件标签」的运行时开关属性（⌘K 可关，默认开）。 */
const FILETAB_ATTR = 'data-hermes-filetab'
/** 会话区（主区）那条标签条：默认整条隐藏，开关可开回；条内「终端」标签一并藏掉（用户口径 2026-09-22）。 */
const SESSIONTABS_ATTR = 'data-hermes-session-tabs'
const SESSION_STRIP_MARK = 'data-hermes-session-strip'
const SESSION_TERMINAL_ATTR = 'data-hermes-session-terminal'
const SESSION_STRIP_CHIPS = ['sessions', 'workspace'] // 认「这是会话区那条标签条」的芯片
const SESSION_TERMINAL_TAB = 'terminal'
const RAIL_BROWSER_KEY = 'browser-pane'
const RAIL_RECORDER_KEY = 'recorder-pane'
const RAIL_BROWSER_TAB = `${PLUGIN_ID}:${RAIL_BROWSER_KEY}`
const RAIL_RECORDER_TAB = `${PLUGIN_ID}:${RAIL_RECORDER_KEY}`
/** 右侧栏那条标签条的识别锚：应用自带的「文件」+ 我们贡献的两个面板，谁先在 DOM 里出现就用谁。 */
const RAIL_FILE_TAB = 'files'                       // 真 id（源码 app/contrib/controller.tsx:227 `id: 'files'`）
/** 同一个面板还会被别名引用（`revealAliases: ['file-browser']`）—— 两个都认，免得再踩一次。 */
const RAIL_FILE_TABS = [RAIL_FILE_TAB, 'file-browser']
/** 再兜一层：上游若改了面板 id，光按 id 认会「藏了个不存在的标签」 ⇒ 按**标签文字**也认一遍。 */
const RAIL_FILE_TAB_LABELS = ['文件', '文档', 'Files']
const RAIL_FILE_LABEL_ATTR = 'data-hermes-filetab-bylabel'
/** 那个面板自己的标签名：宿主按 `sidebar.files` 渲染成「文件」，用户口径叫「右侧栏」。 */
const RAIL_FILE_TITLE = '右侧栏'
const RAIL_FILE_TITLE_ATTR = 'data-hermes-filetab-original'
const RAIL_STRIP_ANCHORS = [...RAIL_FILE_TABS, RAIL_BROWSER_TAB, RAIL_RECORDER_TAB]
/** 「文档预览」在宿主里的全名（= office-viewer 插件 PANE_ID；标签名在那边改）。 */
const RAIL_OFFICE_TAB = 'office-viewer:viewer'
/**
 * 标签顺序：`dock.before` 只在「office-viewer 先于本插件加载」时才生效（实测：反过来的话
 * 我们的 `before` 找不到目标就只能追加，OFFICE 反而落到我们后面）。插件加载顺序我们管不到，
 * 所以顺序**由 CSS `order` 钉死**（标签条是 flex row，order 直接改视觉次序）：
 *   文件(1) → 文档预览(2) → 浏览器(3) → 会议记录(4) → 其它(5)
 * 代价：用鼠标在标签条上拖动标签时，视觉位置与宿主内部次序会不一致（用户口径要的就是固定顺序）。
 */
const RAIL_TAB_ORDER = {
  'files': 1,
  'file-browser': 1,
  [RAIL_OFFICE_TAB]: 2,
  [RAIL_BROWSER_TAB]: 3,
  [RAIL_RECORDER_TAB]: 4
}
/** 是否把应用自带的「文件」标签从右栏标签条里藏掉（用户口径 2026-09-22：呼出右栏时不要看见它）。
 *  只是「藏标签名」——面板本身、以及它作为我们落位锚点的作用都还在
 *  （`display:none` 的元素照样能被 `querySelector('[data-tree-tab="files"]')` 命中，
 *   所以 §推迟登记 那套不受影响）。改 false 即不再注入这条规则。 */
const RAIL_HIDE_FILE_TAB = true
/** 锚点最多等这么久；超时就照登记（面板不会再凭空消失）。 */
const RAIL_ANCHOR_WAIT_MAX_MS = 15_000
let railAnchorWaitFrom = 0
/** 面板贡献的 ctx（推迟登记要用）；停用时清空。 */
let railCtx = null
/** 两个面板是否已经登记过（一次挂载只登记一次）。 */
let railPanesRegistered = false
/** 「文件」标签藏掉后，是否已经把活动标签从它挪走过（每次挂载只做一次，见 tagRailStrip）。 */
let railActiveSwitched = false

/**
 * 登记「浏览器」「会议记录」两个面板 —— **必须等「文件」面板真的出现在界面里**才登记。
 *
 * 为什么不能启动就登记（2026-09-22 用户现场）：
 * 宿主对面板只做**一次性采纳**，且启动那一刻右列那一组往往还没进布局树 —— 兜底锚点会把面板
 * 塞到别处（比如主区那一列）并**持久化**；而 `dock.enforce` 那条"每次启动只跑一次"的标记
 * 又**先于锚点检查就被烧掉**（store.ts:1389 `enforcedDocksThisBoot.add` 在 1392 的 `findGroupOfPane`
 * 之前），所以同一次启动内再也不会归位 ⇒ 面板永远躺在错误的那一列。
 * 等锚点出现再登记，采纳时「文件」面板（真 id `files`）必然在树里，直接叠进它那一组，`enforce` 也不会白烧。
 */
function registerRailPanes() {
  if (!RAIL_PANES || railPanesRegistered || !railCtx) {
    return
  }

  if (!RAIL_FILE_TABS.some(id => document.querySelector(`[data-tree-tab="${id}"]`))) {
    // 锚点还没出现 → 等 reconcile 下一轮（200ms）。
    // 但也不能无限等：用户可能把「文件」面板关掉了，那样我们的面板会永远登记不上。
    if (!railAnchorWaitFrom) {
      railAnchorWaitFrom = Date.now()
    }

    if (Date.now() - railAnchorWaitFrom < RAIL_ANCHOR_WAIT_MAX_MS) {
      return
    }
  }

  railPanesRegistered = true

  // 锚点必须用**真 id**（`files`）：宿主 `findGroupOfPane` 不解析别名，
  // 之前写 `file-browser` 时锚点永远找不到，落位其实靠的是"兜底取第一个右列面板"（碰巧对）。
  const dock = { enforce: true, pane: RAIL_FILE_TAB, pos: 'center' } // 顺序由 CSS order 钉死，不用 dock.before

  railCtx.register({
    id: 'browser-pane',
    area: PANES_AREA,
    title: RAIL_TAB_LABEL_BROWSER,
    data: { ...RAIL_PANE_DATA, dock },
    render: () => jsx(BrowserPane, {})
  })

  railCtx.register({
    id: 'recorder-pane',
    area: PANES_AREA,
    title: '会议记录',
    data: { ...RAIL_PANE_DATA, dock: { ...dock } },
    render: () => jsx(RecorderPane, {})
  })
}

/** 面板落位：锚到「文件」面板（真 id `files`）⇒ 叠进它那一组当标签。
 *  一旦某次启动时「文件」那一组还没进树（或树里没有右列面板），回退锚点会把我们塞进别处并**持久化**，
 *  之后就再也不会归位。`enforce` 让宿主**每次启动**都把面板重新归位到声明的锚点上（用户手拖也不豁免，
 *  每启动一次只跑一次，所以同一次会话里手动挪动仍然有效）。
 *  顺序不靠 `dock.before`（加载顺序不确定会让它失效），由 CSS `order` 钉死，见 RAIL_TAB_ORDER。 */
const RAIL_PANE_DATA = { placement: 'right', width: '460px', uncloseable: true }
/** 自带浏览器的 guest 分区（preview-pane.tsx 里那个唯一值）+ 它转发 `_blank` 用的 IPC 频道。 */
const PREVIEW_PARTITION = 'persist:hermes-preview'
const PREVIEW_WEB_PREFERENCES = 'contextIsolation=yes,nodeIntegration=no,sandbox=yes'
const PREVIEW_EXTERNAL_CHANNEL = 'preview-open-external'
const BROWSER_URL_KEY = 'browserUrl'
/** 会议记录：前端页由它自己的服务托管（页面用的是相对接口 `/api`，必须同源才可用）。 */
const RECORDER_ORIGIN = 'http://127.0.0.1:8789'
const RECORDER_START_CMD = 'bash ~/.agents/skills/meeting-recorder/start.sh'

/* ═══════════ ⑧ 「文件」里点文件：别另开预览标签，转给「文档预览」/「浏览器」 ═══════════
 * 用户口径（2026-09-22）：应用原生的行为是**单击/双击**文件行就 `openPreview(...)`，右侧栏会
 * 多长出一个预览标签（用户原话：很丑）。改成：
 *   · md/txt/doc/docx/xls/xlsx/ppt/pptx → 切到「文档预览」标签里预览（换文件即替换上一个）；
 *   · html                              → 切到「浏览器」标签里打开；
 *   · 其它扩展名                         → 不插手，维持应用原生行为（图片/PDF 等）。
 * 怎么拦：应用那套是 React 合成事件（挂在根容器上），所以在 document 的**捕获阶段**先动手 ——
 * `preventDefault` + `stopPropagation` 之后事件到不了根容器，应用的 onClick/onDoubleClick 都不会跑。
 * 副作用：文件行不再出现"选中"高亮（应用把 select 和 activate 绑在同一次点击里，拦掉就都没有了）。
 * 判据都来自源码：行是 `.row-hover` 且 `title` = **绝对路径**（app/right-sidebar/files/use-project-tree.ts
 * 里 "Absolute filesystem path. Doubles as react-arborist node id"）；目录行带 `aria-expanded`；
 * "是不是「文件」面板里的行" = 行所在分区 `[data-tree-group]` 里有「文件」面板的标签（真 id `files`，另认别名 id）。
 */
const FILE_CHANNEL_DIRS = RAIL_FILE_TABS // 「文件」面板所在的标签 id（判"这行是不是文件面板里的行"，见 §⑧）
const FILE_ROW_SELECTOR = '.row-hover[title]'
/** 会话里「产物卡片」的结构锚点（应用源码 components/chat/preview-attachment.tsx）：
 *  卡片 = [图标 span, 名字 span[title=原始 target], 下载 button, 打开预览 button]，
 *  两颗按钮是卡片的**直接子元素**、预览那颗永远在最后 —— 按结构认，不按文案认（文案随 i18n 与状态变）。 */
const CARD_BUTTONS_SEL = ':scope > button'
const CARD_TITLE_SEL = ':scope > span[title]'

/** 点击后**转到右侧栏「文档预览」标签**的格式全集 = 本机 office-viewer 能渲染的全部格式
 *  （与它内部的 ENGINE_EXTS / PDF / 图片 / MARKDOWN / TEXT 五组一一对应）。加格式时两边一起改。 */
const OFFICE_VIEW_EXTS = [
  // Office 系（纯 JS 内核，不依赖 LibreOffice）
  'doc', 'docx', 'docm', 'xls', 'xlsx', 'xlsm', 'csv', 'tsv', 'pptx', 'ppt', 'pps', 'ppsx',
  'rtf', 'odt', 'ods', 'wps', 'et', 'dps', 'ofd',
  // PDF / 图片
  'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'heic', 'avif', 'ico',
  // Markdown / 纯文本与脚本
  'md', 'markdown', 'mdx',
  'txt', 'log', 'text', 'json', 'yml', 'yaml', 'toml', 'ini', 'conf', 'env',
  'py', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'sh', 'bash', 'zsh', 'fish',
  'css', 'scss', 'less', 'sql', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'hpp',
  'rb', 'php', 'lua', 'pl', 'swift', 'vue', 'svelte', 'xml', 'diff', 'patch'
]
/** html/htm 仍走「内置浏览器」标签（真实浏览器语义：脚本与同源都在）。 */
const FILE_BROWSER_EXTS = ['html', 'htm']
/** office-viewer 插件监听的事件名（插件之间不能互相 import，只能靠约定 —— 那半边也写了注释）。 */
const OFFICE_OPEN_EVENT = 'hermes-office-open'
/** 让「浏览器」面板换地址用的信令（面板组件订阅它；同插件内的模块级 atom）。 */
const $browserRequest = atom(null)

/** 右侧栏面板自己的样式。不走 Tailwind（插件源码不在应用的扫描范围里，写了也可能没生成），
 *  只用应用的主题变量 + 极小的自定义类；类名统一 `hermes-rail-*`，不会撞到原生。 */
/** 右栏那条标签条的**两种限定写法，两种都发**：宿主在换会话/换布局时会重建这条标签条，
 *  我们打的属性（RAIL_STRIP_ATTR）会随旧节点一起丢掉 —— 只靠属性就会出现用户报的
 *  「新建会话时文件标签没了，点回历史会话它又冒出来」。所以再加一条不依赖我们任何标记的
 *  结构判据：**包含「文件」标签的那条标签条**（`[data-zone-tabstrip]:has(...)`）。
 *  两条都命中时效果一致，任一条存活即可。 */
const RAIL_STRIP_SCOPES = [
  `[${RAIL_STRIP_ATTR}]`,
  `[data-zone-tabstrip]:has([data-tree-tab="${RAIL_FILE_TAB}"])`,
  // 别名 id 单独一条 —— 三条都必须是**单选择器**：把它们写成逗号列表再拼到规则前缀上，
  // 逗号左边那一截会单独成一条选择器（把标签条自己也选中，整条标签条被藏）。
  `[data-zone-tabstrip]:has([data-tree-tab="file-browser"])`
]
const railRules = build => RAIL_STRIP_SCOPES.map(build).join('\n')

const RAIL_CSS = `
${railRules(
  scope => `/* 应用自带标签的 ✕：hover 才显形的那颗，连同它的半透明遮罩一起收掉 */
${scope} [data-tree-tab][data-closeable] > span:has(> button) { display: none !important; }
/* 原生给"可关闭标签"留了 min-width 下限（怕短标签被 ✕ 压住）；✕ 没了就不需要 */
${scope} [data-tree-tab][data-closeable] { min-width: 0 !important; }`
)}
${RAIL_HIDE_FILE_TAB
  ? railRules(
      scope => `/* 藏掉应用自带的「文件」标签（用户口径 2026-09-22）。默认就是藏 —— 不依赖任何前置属性；
   只有显式关掉（html[attr="off"]）才显示回来。 */
${RAIL_FILE_TABS.map(id => `${scope} [data-tree-tab="${id}"] { display: none !important; }`).join('\n')}
${RAIL_FILE_TABS.map(id => `html[${FILETAB_ATTR}="off"] ${scope} [data-tree-tab="${id}"] { display: flex !important; }`).join('\n')}`
    )
  : ''}
/* 标签顺序（理由见上面 RAIL_TAB_ORDER 的注释）：先给全部标签一个默认位次，再点名四个 */
${railRules(scope => `${scope} [data-tree-tab] { order: 5; }`)}
${railRules(scope =>
  Object.entries(RAIL_TAB_ORDER)
    .map(([tab, index]) => `${scope} [data-tree-tab="${tab}"] { order: ${index}; }`)
    .join('\n')
)}
.${RAIL_PANE_CLASS} { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; background: var(--ui-bg-editor, transparent); }
.hermes-rail-bar { display: flex; flex: 0 0 auto; align-items: center; gap: 0.25rem; padding: 0.375rem 0.5rem; border-bottom: 1px solid var(--ui-stroke-tertiary, rgba(0,0,0,0.08)); }
.hermes-rail-btn { display: grid; place-items: center; width: 1.5rem; height: 1.5rem; border: 0; border-radius: 0.375rem; background: transparent; color: var(--ui-text-tertiary, currentColor); cursor: pointer; }
.hermes-rail-btn:hover:not(:disabled) { background: var(--ui-row-hover-background, rgba(0,0,0,0.06)); color: var(--ui-text-primary, currentColor); }
.hermes-rail-btn:disabled { opacity: 0.35; cursor: default; }
.hermes-rail-input { flex: 1 1 auto; min-width: 0; height: 1.5rem; padding: 0 0.5rem; border: 1px solid var(--ui-stroke-tertiary, rgba(0,0,0,0.1)); border-radius: 0.375rem; background: var(--ui-bg-input, transparent); color: inherit; font-size: 0.75rem; outline: none; }
.hermes-rail-input:focus { border-color: var(--ui-accent, currentColor); }
.hermes-rail-body { display: flex; flex: 1 1 auto; min-height: 0; }
.hermes-rail-note { margin: auto; padding: 1.5rem; text-align: center; color: var(--ui-text-tertiary, currentColor); font-size: 0.8125rem; line-height: 1.75; }
.hermes-rail-fail { flex: 0 0 auto; padding: 0.25rem 0.5rem; background: var(--ui-bg-primary, rgba(0,0,0,0.04)); color: var(--ui-text-tertiary, currentColor); font-size: 0.75rem; }
.hermes-rail-cmd { display: inline-block; margin-top: 0.5rem; padding: 0.25rem 0.5rem; border-radius: 0.375rem; background: var(--ui-bg-primary, rgba(0,0,0,0.05)); font-size: 0.75rem; font-family: var(--dt-font-mono, ui-monospace), monospace; user-select: text; }
.hermes-rail-iframe { flex: 1 1 auto; width: 100%; height: 100%; border: 0; background: #fff; }
`

const CSS = [
  // ① 折叠：除「新建会话」外，所有导航行（含插件贡献的）在折叠态隐藏。
  `html[${ROOT_ATTR}="collapsed"] ${MENU_SELECTOR} > li:has(${NAV_ROW_SELECTOR}:not([data-tour="${NEW_SESSION_TOUR}"])):not([${ROW_ATTR}]) { display: none !important; }`,

  // ② 搜索会话：`order:-1` 提到侧栏内容列最上（父列是 flex column）；顶部留白随之从导航组挪给它。
  `[${SEARCH_WRAP_ATTR}] { order: -1; padding: calc(var(--titlebar-height) + 0.375rem) 0.5rem 0.375rem; }`,
  `${CONTENT_SELECTOR} > [data-slot="sidebar-group"]:first-of-type { padding-top: 0.25rem !important; }`,
  // 原生样式是「无框 + 空值时 opacity-30」。用户口径走到底（2026-09-22）：**边框不要、灰底也不要**
  // —— 那层 3% 底色在「统一台面」之后显得像块补丁（用户原话：像个狗皮膏药），所以改成完全透明，
  // 只留文字和放大镜；留 padding 8px 是为了图标与下面导航行的图标对齐（原生行也是 px-2）。
  `[${SEARCH_FIELD_ATTR}] { opacity: 1 !important; border: none !important; background: transparent !important; padding: 0 0.5rem; }`,
  `[${SEARCH_FIELD_ATTR}] input::placeholder { color: color-mix(in srgb, var(--foreground) 62%, transparent) !important; }`,
  `[${SEARCH_FIELD_ATTR}] input { height: 1.875rem; }`,

  // ③ 会话区：现在只剩「略舒展排版」。气泡配色(FILL)/文字加粗(BOLD)/AI 竖条(BAR) 三个开关当前都是 false
  //    —— 规则本体都在，改 true 即恢复。
  ...(USER_BUBBLE_FILL ? [CONVO_CARD] : []),
  ...(USER_BUBBLE_BOLD ? [CONVO_USER_TEXT] : []),
  CONVO_TYPE,
  ...(CONVO_AI_BAR ? [CONVO_BAR_LIGHT, CONVO_BAR_DARK] : []),

  // ④ 统一台面：全界面大面背景 = 输入框/卡片那一层（消除灰白色块）
  FLAT_BG,

  // ⑤ 「已置顶」排到「会话」下方（父容器 flex column ⇒ 用 order 换位，不搬节点）
  `[${PIN_LAST_ATTR}] { order: 9 !important; }`,

  // 会话区（主区）标签条：默认整条隐藏，`html[...="off"]` 时放出来。作用域只认「条内含 sessions / workspace
  // 芯片」那一条 —— 右栏那条标签条不含这两个芯片，不会被误伤。两条分开写，别拼成逗号列表（拼了会把标签条自己选中）。
  `html:not([${SESSIONTABS_ATTR}="off"]) [data-zone-tabstrip]:has([data-tree-tab="sessions"]) { display: none !important; }`,
  `html:not([${SESSIONTABS_ATTR}="off"]) [data-zone-tabstrip]:has([data-tree-tab="workspace"]) { display: none !important; }`,
  // 会话区里的「终端」标签：不显示（同一开关控制，可开回）。
  `[data-zone-tabstrip]:has([data-tree-tab="sessions"]) [data-tree-tab="${SESSION_TERMINAL_TAB}"] { display: none !important; }`,
  `[data-zone-tabstrip]:has([data-tree-tab="workspace"]) [data-tree-tab="${SESSION_TERMINAL_TAB}"] { display: none !important; }`,

  // ⑦ 右侧栏四标签：藏掉应用自带标签的 ✕（我们自己的面板宿主就不渲染 ✕）
  ...(RAIL_PANES ? [RAIL_CSS] : [])
].join('\n')

// 原生导航行（app/chat/sidebar/index.tsx 的 SidebarMenuButton className）逐字照抄。
const BTN_CLASS = [
  'flex h-7 w-full items-center justify-start gap-2 rounded-md border border-transparent px-2 text-left text-[0.8125rem]',
  'font-medium text-(--ui-text-secondary) transition-colors duration-100 ease-out [-webkit-app-region:no-drag]',
  'hover:bg-(--ui-control-hover-background) hover:text-foreground hover:transition-none'
].join(' ')
const LI_CLASS = 'group/menu-item relative'
const ICON_CLASS = 'codicon codicon-ellipsis size-4 shrink-0 text-[color-mix(in_srgb,currentColor_72%,transparent)]'
const NO_DRAG = '[-webkit-app-region:no-drag]'

/**
 * 抄一行原生导航行的**完整 class**（原样，不过滤）。
 * 为什么原样抄：原生行的 class = shadcn 基类（`items-center p-2 overflow-hidden …`）+ 行内那串
 * （`flex h-7 … text-[0.8125rem] font-medium …`）拼起来的；我们当初只抄了后半段，缺 `items-center`
 * → 内容和图标整体上偏 4–5px，看着就是「到上面紧、到下面松」（用户截图实测 56 / 73 对 63 px，dev 复现 -4/-5px）。
 * 为什么不用过滤「选中态」类：选中态是靠 `data-[active=true]:bg-sidebar-accent` 这种**变体类**实现的，
 * 我们这行不带 `data-active`，抄过来也是死的，不会假装被选中。
 */
function nativeLook(refButton) {
  return String(refButton?.className || '').trim() || BTN_CLASS
}

/** 兜底自愈：不管行高从哪来（版本、折叠成图标形态、字号设置），量了原生行再对齐我们那行。 */
function matchRowGeometry(row, anchorRow) {
  const mine = row.querySelector('button')
  const ref = anchorRow.querySelector('button')

  if (!mine || !ref) {
    return
  }

  const height = ref.getBoundingClientRect().height
  const current = mine.getBoundingClientRect().height

  if (!height) {
    return
  }

  if (Math.abs(current - height) > 0.5) {
    mine.style.height = `${height}px`
  } else if (mine.style.height) {
    mine.style.removeProperty('height')
  }
}

/** @type {{ expanded: boolean, setExpanded: ((v: boolean) => void) | null }} */
const state = { expanded: false, setExpanded: null }
/** 会话区排版：默认开；关掉即回到原生排版（CSS 挂在 html 属性上，一条属性开关）。 */
let convoOn = true

/** 会话里产物卡片点击 → 转右侧栏「文档预览」（用户口径：卡片点击要进 Office 查看器，
 *  而不是应用自带的预览面板）。独立开关，一键停用即回应用原生行为（桌面美化惯例）。 */
let cardRoutingOn = true
let persistCardRouting = () => {}

function applyCardRouting(on, persist) {
  cardRoutingOn = on

  if (persist) {
    persistCardRouting(on)
  }
}
let persistConvo = () => {}

function applyConvo(on, persist) {
  convoOn = on

  if (document.documentElement) {
    document.documentElement.setAttribute(CONVO_ATTR, on ? 'on' : 'off')
  }

  if (persist) {
    persistConvo(on)
  }
}

/** 统一台面（全界面背景取同一层颜色）：默认开。 */
let flatOn = true
let persistFlat = () => {}

function applyFlat(on, persist) {
  flatOn = on

  if (document.documentElement) {
    document.documentElement.setAttribute(FLAT_ATTR, on ? 'on' : 'off')
  }

  if (persist) {
    persistFlat(on)
  }
}

/** 藏 / 显「文件」标签：默认藏（用户要的就是呼出右栏时看不到它）。 */
let fileTabOn = true
let persistFileTab = () => {}

function applyFileTab(on, persist) {
  fileTabOn = on

  if (document.documentElement) {
    document.documentElement.setAttribute(FILETAB_ATTR, on ? 'on' : 'off')
  }

  if (persist) {
    persistFileTab(on)
  }

  // 同理立刻重算（别依赖别的 DOM 变动顺手触发重排）。
  tagRailStrip()
}

/** 隐藏「左侧栏」与「会话区（主区）」两条标签条：默认隐藏（用户要的是这两处别顶标签，右栏那条照旧显示）。
 *  作用域按条内芯片判：左侧栏那条含 `sessions`，会话区那条含 `workspace`，右栏那条两者都不含。 */
let sessionTabsOn = true
let persistSessionTabs = () => {}

function applySessionTabs(on, persist) {
  sessionTabsOn = on

  if (document.documentElement) {
    document.documentElement.setAttribute(SESSIONTABS_ATTR, on ? 'on' : 'off')
  }

  if (persist) {
    persistSessionTabs(on)
  }

  // 立刻重算，不等观察器：我们自己写的 `data-hermes-*` 属性被观察器过滤掉了，不主动跑这一趟就没人跑
  // （实测：合成场景里切开关后内联 display:none 一直挂着，标签条出不来）。
  applySessionStrip()
}

/** 会话区那条标签条：①整条隐藏（开关控制）②条里的「终端」标签一并藏掉。 */
function applySessionStrip() {
  for (const strip of document.querySelectorAll('[data-zone-tabstrip]')) {
    if (!SESSION_STRIP_CHIPS.some(id => strip.querySelector(`[data-tree-tab="${id}"]`))) {
      continue // 不是会话区那条（右栏那条不含 sessions/workspace 芯片）
    }

    const chips = strip.querySelectorAll(`[data-tree-tab="${SESSION_TERMINAL_TAB}"]`)

    if (sessionTabsOn) {
      if (strip.style.display !== 'none') {
        strip.style.display = 'none'
      }

      strip.setAttribute(SESSION_STRIP_MARK, '')

      for (const chip of chips) {
        if (chip.style.display !== 'none') {
          chip.style.display = 'none'
        }

        chip.setAttribute(SESSION_TERMINAL_ATTR, '')
      }
    } else {
      if (strip.style.display === 'none') {
        strip.style.removeProperty('display')
      }

      strip.removeAttribute(SESSION_STRIP_MARK)

      for (const chip of chips) {
        chip.style.removeProperty('display')
        chip.removeAttribute(SESSION_TERMINAL_ATTR)
      }
    }
  }
}


function buildRow(template) {
  const li = document.createElement('li')

  li.className = LI_CLASS
  li.setAttribute(ROW_ATTR, '')

  const button = document.createElement('button')
  const refButton = template?.querySelector('button')

  button.type = 'button'
  // 行样式抄原生行（见 nativeLook 注释）；抓不到才退回写死的那套。
  button.className = `${nativeLook(refButton)} ${NO_DRAG}`
  button.setAttribute('aria-expanded', String(state.expanded))
  button.setAttribute('title', `${LABEL}：${HINT}`)
  // 工具提示锚点：与原生行一致（悬停/提示层按该区域定位）。
  button.setAttribute('data-tip-region', '')
  button.addEventListener('click', () => {
    state.setExpanded?.(!state.expanded)
  })

  const icon = document.createElement('i')

  icon.setAttribute('aria-hidden', 'true')
  icon.className = ICON_CLASS

  const label = document.createElement('span')

  label.className = 'min-w-0 truncate'
  label.textContent = LABEL

  // 刻意不放展开箭头（`>` 贴在右端不好看）：展开状态仍在 aria-expanded 上。
  button.append(icon, label)
  li.append(button)

  return li
}

/** 用户改过的「打开浏览器」键位（没改过就空）＋ 默认值兜底，返回尝试顺序。 */
function showBrowserCombos() {
  const combos = []

  try {
    const raw = window.localStorage.getItem(KEYBINDS_KEY)
    const stored = raw ? JSON.parse(raw) : null
    const own = stored?.[SHOW_BROWSER_ACTION]

    if (Array.isArray(own)) {
      combos.push(...own.filter(combo => typeof combo === 'string' && combo))
    }
  } catch {
    // 存储不可用/内容坏了都当「没改过」
  }

  if (!combos.includes(SHOW_BROWSER_FALLBACK)) {
    combos.push(SHOW_BROWSER_FALLBACK)
  }

  return combos
}

/** combo 末段 → [key, code]（字母 a-z / 数字 0-9 按规则推，其余查 KEY_SPEC）。 */
function keySpec(token) {
  if (KEY_SPEC[token]) {
    return KEY_SPEC[token]
  }

  if (/^[a-z]$/.test(token)) {
    return [token, `Key${token.toUpperCase()}`]
  }

  if (/^[0-9]$/.test(token)) {
    return [token, `Digit${token}`]
  }

  return [token, '']
}

/** 键位给人看的写法：⌘⇧L（mac）/ Ctrl+Shift+L（其它平台）。 */
function comboLabel(combo) {
  const parts = String(combo || '').toLowerCase().split('+').filter(Boolean)
  const [key] = keySpec(parts.pop() ?? '')
  const names = { mod: IS_MAC ? '⌘' : 'Ctrl', ctrl: IS_MAC ? '⌃' : 'Ctrl', shift: IS_MAC ? '⇧' : 'Shift', alt: IS_MAC ? '⌥' : 'Alt' }
  let mods = ''

  for (const part of parts) {
    mods += names[part] ?? ''
  }

  const head = mods ? `${mods}${IS_MAC ? '' : '+'}` : ''

  return `${head}${key === ' ' ? 'Space' : String(key).toUpperCase()}`
}

/** 打开内置浏览器：**在会话区整块打开**一个「浏览器」标签（见函数内注释）。
 *  里面用的仍是桌面端自带浏览器那套（同一个 `persist:hermes-preview` 分区 ⇒ 登录状态共用）。 */
function openBuiltinBrowser() {
  // 用户口径（2026-09-22 第二轮）：要跟侧栏「Office 查看器」一样 —— 在**会话区整块**打开浏览器，
  // 不是塞进右侧栏。`host.openWorkspace` 就是那个形态：它临时注册一个 `placement:'main'` 的面板
  // （宿主内部 id = plugin-workspace:<key>、默认 dock 到 workspace 那一组），于是会话区多出一个
  // 占满整块的「浏览器」标签，和 Office 查看器那个页面同形。
  if (typeof host.openWorkspace === 'function') {
    try {
      host.openWorkspace(BROWSER_WORKSPACE_KEY, {
        title: RAIL_TAB_LABEL_BROWSER, // 会话区那个标签也叫「浏览器」（与右栏一致），不是行名「内置浏览器」
        render: () => jsx(BrowserPane, {})
      })

      return
    } catch (error) {
      host.notifyError?.(error, '无法在会话区打开内置浏览器')
    }
  }

  // 老宿主没有 openWorkspace：退回「前台化右栏那个浏览器标签」，再不行才合成键位。
  if (RAIL_PANES && railPanesRegistered) {
    try {
      host.revealPane?.(RAIL_BROWSER_TAB)

      return
    } catch {
      /* 连 revealPane 也没有 ⇒ 落到键位兜底 */
    }
  }

  synthesizeShowBrowser()
}

/** 侧栏「会议记录」那一行：与右栏那个面板**同内容同行为**（复用 RecorderPane：服务在跑就给网页本身，
 *  没跑就给启动命令 + 重试），只是开在**会话区整块**。 */
function openRecorder() {
  if (typeof host.openWorkspace === 'function') {
    try {
      host.openWorkspace(RECORDER_WORKSPACE_KEY, {
        title: RECORDER_LABEL,
        render: () => jsx(RecorderPane, {})
      })

      return
    } catch (error) {
      host.notifyError?.(error, '无法在会话区打开会议记录')
    }
  }

  // 老宿主：退回「前台化右栏那个会议记录标签」。
  try {
    host.revealPane?.(RAIL_RECORDER_TAB)
  } catch {
    host.notifyError?.(new Error('openWorkspace / revealPane 都不可用'), '无法打开会议记录')
  }
}

/** 最后的兜底：合成键位那一套（见 SHOW_BROWSER_ACTION 上方注释），返回应用有没有认这条键位。 */
function synthesizeShowBrowser() {
  for (const combo of showBrowserCombos()) {
    const parts = combo.toLowerCase().split('+').filter(Boolean)
    const [key, code] = keySpec(parts.pop() ?? '')
    const mod = parts.includes('mod')
    const event = new KeyboardEvent('keydown', {
      key,
      code,
      bubbles: true,
      cancelable: true,
      shiftKey: parts.includes('shift'),
      altKey: parts.includes('alt'),
      metaKey: IS_MAC && mod,
      ctrlKey: parts.includes('ctrl') || (!IS_MAC && mod)
    })

    window.dispatchEvent(event)

    if (event.defaultPrevented) {
      return true // 应用认了这条键位（匹配到 action 才会 preventDefault）⇒ 浏览器正在打开
    }
  }

  return false
}

/** 「更多工具」组里的自建行（行样式抄原生行；文字带 `data-tour`，与原生行一样）。 */
function buildExtraRow(template, spec) {
  const li = document.createElement('li')

  li.className = LI_CLASS
  li.setAttribute(spec.attr, '')

  const button = document.createElement('button')

  button.type = 'button'
  button.className = `${nativeLook(template?.querySelector('button'))} ${NO_DRAG}`
  button.setAttribute('data-tip-region', '')
  button.setAttribute('title', `${spec.label}（在会话区打开）`)
  button.addEventListener('click', () => {
    spec.open()
  })

  const icon = document.createElement('i')

  icon.setAttribute('aria-hidden', 'true')
  icon.className = spec.icon

  const label = document.createElement('span')

  label.className = 'min-w-0 truncate'
  label.setAttribute('data-tip-arrow-only', '')
  label.setAttribute('data-tour', spec.tour)
  label.textContent = spec.label

  button.append(icon, label)
  li.append(button)

  return li
}

/** 组里那两条自建行：内置浏览器排在「文档预览」上面，会议记录排它下面。 */
const EXTRA_NAV_ROWS = [
  { attr: BROWSER_ROW_ATTR, icon: BROWSER_ICON_CLASS, label: BROWSER_LABEL, open: openBuiltinBrowser, place: 'before', tour: BROWSER_TOUR },
  { attr: RECORDER_ROW_ATTR, icon: RECORDER_ICON_CLASS, label: RECORDER_LABEL, open: openRecorder, place: 'after', tour: RECORDER_TOUR }
]

/** 行上显示的文字（导航行的文字就是它的标签）。 */
function rowLabelText(li) {
  const text = (li.textContent || '').trim()

  return text.length > 40 ? '' : text // 太长的不是标签，别拿去比对
}

/** 幂等：把两条自建行摆到「文档预览」上下（顺序 = 内置浏览器 → 文档预览 → 会议记录）。 */
function reconcileExtraRows() {
  for (const menu of document.querySelectorAll(MENU_SELECTOR)) {
    const anchor = menu.querySelector(`[data-tour="${NEW_SESSION_TOUR}"]`)
    const anchorRow = anchor ? anchor.closest('li') : null

    if (!anchorRow || anchorRow.parentElement !== menu) {
      continue
    }

    // 「文档预览」那一行（office-viewer 贡献）：按可见文字认，排除我们自己的两条行。
    const officeRow = [...menu.children].find(
      li => !EXTRA_NAV_ROWS.some(spec => li.hasAttribute(spec.attr)) && OFFICE_ROW_LABELS.includes(rowLabelText(li))
    )

    for (const spec of EXTRA_NAV_ROWS) {
      let row = [...menu.children].find(li => li.hasAttribute(spec.attr))

      if (!row) {
        row = buildExtraRow(anchorRow, spec)
      }

      if (officeRow) {
        // 有「文档预览」：一条摆它上面、一条摆它下面。
        if (spec.place === 'before') {
          if (row.nextElementSibling !== officeRow) {
            officeRow.before(row)
          }
        } else if (row.previousElementSibling !== officeRow) {
          officeRow.after(row)
        }
      } else if (spec.place === 'before') {
        if (row.previousElementSibling !== anchorRow) {
          anchorRow.after(row) // 没有「文档预览」（插件被停用）：内置浏览器就顶到组里第一条
        }
      } else if (row !== menu.lastElementChild) {
        menu.append(row) // 会议记录垫底
      }

      matchRowGeometry(row, anchorRow) // 行高对齐原生行
    }
  }
}

/** 幂等：确保每个导航列表里，「更多工具」行紧跟在「新建会话」之后。 */
function reconcileRow() {
  for (const menu of document.querySelectorAll(MENU_SELECTOR)) {
    const anchor = menu.querySelector(`[data-tour="${NEW_SESSION_TOUR}"]`)
    const anchorRow = anchor ? anchor.closest('li') : null

    if (!anchorRow || anchorRow.parentElement !== menu) {
      continue // 还没渲染出顶部导航（或该列表不是导航列表）
    }

    let row = null

    for (const child of menu.children) {
      if (child.hasAttribute(ROW_ATTR)) {
        row = child

        break
      }
    }

    if (!row) {
      row = buildRow(anchorRow)
      anchorRow.after(row)
    } else if (row.previousElementSibling !== anchorRow) {
      anchorRow.after(row) // 被重排/挪位 → 归位（after 对已在树中的节点是移动）
    }

    matchRowGeometry(row, anchorRow) // 行高对齐原生行：否则「上紧下松」（见 nativeLook 注释）

    const button = row.querySelector('button')

    if (button && button.getAttribute('aria-expanded') !== String(state.expanded)) {
      button.setAttribute('aria-expanded', String(state.expanded))
    }
  }
}

/** 幂等：给「搜索会话」那一段（外层留白 div + 输入框容器）打标记，供上面的 CSS 选中。 */
function tagSearchField() {
  for (const content of document.querySelectorAll(CONTENT_SELECTOR)) {
    const input = content.querySelector('input[type="text"]')
    const field = input?.parentElement
    const wrap = field?.parentElement

    // 只认「外层留白 div 直接挂在侧栏内容列下」的那一个，避免误标别的输入框。
    if (!input || !field || !wrap || wrap.parentElement !== content) {
      continue
    }

    field.setAttribute(SEARCH_FIELD_ATTR, '')
    wrap.setAttribute(SEARCH_WRAP_ATTR, '')
  }
}

/** 元素里第一个「叶子」节点的文字（分区头里的标签 span 就是这种）。 */
function firstLeafText(el) {
  if (!el) {
    return ''
  }

  for (const node of el.querySelectorAll('*')) {
    if (node.children.length === 0 && (node.textContent || '').trim()) {
      return (node.textContent || '').trim()
    }
  }

  return ''
}

/** 幂等：找出「已置顶」分区根，打上标记（CSS 靠它把这一块排到最下面）。其余分区的标记会清掉。 */
function tagPinnedLast() {
  const groups = [...document.querySelectorAll('[data-slot="sidebar-group"]')]
  const target = groups.find(group => PIN_LABELS.includes(firstLeafText(group.firstElementChild))) ?? null

  for (const group of groups) {
    if (group !== target) {
      group.removeAttribute(PIN_LAST_ATTR) // 视图/搜索切换后旧节点可能被复用，标记要跟着走
    }
  }

  target?.setAttribute(PIN_LAST_ATTR, '')
}

function reconcile() {
  if (!document.body) {
    return
  }

  reconcileRow()
  tagSearchField()
  tagPinnedLast()
  reconcileExtraRows()
  tagRailStrip()
  registerRailPanes() // 锚点（「文件」标签）一出现就登记我们的两个面板；见该函数的注释
}

function apply(next, persist) {
  state.expanded = next

  if (document.documentElement) {
    document.documentElement.setAttribute(ROOT_ATTR, next ? 'expanded' : 'collapsed')
  }

  reconcile()

  if (persist) {
    persist(next)
  }
}

/* ══════════════ ⑦ 的两个面板：浏览器 / 会议记录（贡献给右侧栏，见头部注释） ══════════════ */

/** 插件的 ctx 能力转交（贡献只拿到 ctx，面板组件拿不到）；这里只用到 storage（记住上次访问的地址）。 */
const doors = { storage: null }

/** 从点击事件上找「文件」面板里的**文件行**，返回绝对路径；不是文件行就返回 null。 */
function fileRowPathFrom(event) {
  const row = event.target?.closest?.(FILE_ROW_SELECTOR)

  if (!row || row.hasAttribute('aria-expanded')) {
    return null // 带 aria-expanded 的是目录行（源码里只有目录才挂这个属性）
  }

  const group = row.closest('[data-tree-group]')

  if (!FILE_CHANNEL_DIRS.some(id => group?.querySelector(`[data-tree-tab="${id}"]`))) {
    return null // 不在「文件」面板所在的那个分区里
  }

  const path = String(row.getAttribute('title') || '')

  return path.startsWith('/') ? path : null
}

/** 从点击事件上找会话里的**产物卡片**，返回绝对路径；不是卡片就返回 null。
 *  只有绝对路径才接：相对路径要按所属会话的 cwd 解析，而 DOM 里拿不到 cwd —— 那种情况留给应用原生行为。 */
function cardPathFrom(event) {
  const button = event.target?.closest?.('button')

  if (!button) {
    return null
  }

  const card = button.parentElement

  if (!card) {
    return null
  }

  const buttons = card.querySelectorAll(CARD_BUTTONS_SEL)

  // 卡片里两颗按钮：先「下载」、后「打开预览」；不是最后那颗就不是预览入口。
  if (buttons.length < 2 || buttons[buttons.length - 1] !== button) {
    return null
  }

  const path = String(card.querySelector(CARD_TITLE_SEL)?.getAttribute('title') || '')

  return path.startsWith('/') ? path : null
}

/** 本地路径 → file:// URL（逐段编码：空格、`#`、中文都得转义，否则会被当成 URL 片段/查询）。 */
function fileUrl(path) {
  return `file://${String(path)
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')}`
}

function extOf(path) {
  const name = String(path).split('/').pop() || ''
  const dot = name.lastIndexOf('.')

  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** 「文件」里点文件的拦截器（capture + 冒泡都挂，见 ⑧ 的注释）。 */
function routeFileClick(event) {
  if (event.defaultPrevented || event.button !== 0) {
    return
  }

  // 带修饰键的点击是应用自己的语义（shift=附加到消息、⌘/ctrl=多选），不抢。
  if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
    return
  }

  const path = fileRowPathFrom(event) || (cardRoutingOn ? cardPathFrom(event) : null)

  if (!path) {
    return
  }

  const extension = extOf(path)
  const toOffice = OFFICE_VIEW_EXTS.includes(extension)
  const toBrowser = FILE_BROWSER_EXTS.includes(extension)

  if (!toOffice && !toBrowser) {
    return // 其它格式不插手，维持应用原生行为
  }

  // 先拦住（事件到不了 React 根容器 ⇒ 应用的 openPreview 不会跑），再转给我们那两个标签。
  event.preventDefault()
  event.stopPropagation()

  if (toOffice) {
    // office-viewer 是本机的另一个插件：插件之间不能互相 import，走约定好的 window 事件。
    window.dispatchEvent(new CustomEvent(OFFICE_OPEN_EVENT, { detail: { path } }))

    return
  }

  $browserRequest.set({ nonce: `${Date.now()}-${Math.random()}`, url: fileUrl(path) })

  try {
    host.revealPane?.(RAIL_BROWSER_TAB)
  } catch {
    /* 老宿主没有 revealPane：面板本来就在右列里，用户点一下标签也能看到 */
  }
}

/** 给「右侧栏那条标签条」打标记：CSS 据此藏掉应用自带标签的 ✕。
 *  锚点用「文件」和我们两个面板的 tab id —— 谁的 DOM 先出现就用谁，不依赖任何内部 id。 */
/** 界面文案改写：应用把它叫「文件浏览器」（`i18n/zh.ts` 里 `view.toggleRightSidebar` / `view.showFiles`），
 *  用户口径统一叫「右侧栏」。**只改宿主渲染出来的那几处界面文字，不动桌面端源码**；范围也卡死，
 *  免得把用户对话/文档里同样的词一起改掉。 */
const UI_RENAMES = [
  { from: '切换文件浏览器', to: '切换右侧栏' },
  { from: '显示文件浏览器', to: '显示右侧栏' }
]
/** 允许改写的容器：⌘K 的条目、悬浮提示/气泡（Radix popper）、标题栏那个开关按钮。 */
const RENAME_SCOPE = '[cmdk-item], [role="tooltip"], [data-radix-popper-content-wrapper], [data-tour="right-pane-toggle"]'

function renameTextIn(root, list) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue

    if (!text) {
      continue
    }

    let next = text

    for (const rule of list) {
      if (next.includes(rule.from)) {
        next = next.split(rule.from).join(rule.to)
      }
    }

    if (next !== text) {
      node.nodeValue = next
    }
  }
}

function renameUiText() {
  for (const scope of document.querySelectorAll(RENAME_SCOPE)) {
    renameTextIn(scope, UI_RENAMES)
  }
}

/** 归还：把改过的文案换回去（`to → from`），停用插件时界面回到原生叫法。 */
function restoreUiText() {
  for (const scope of document.querySelectorAll(RENAME_SCOPE)) {
    renameTextIn(scope, UI_RENAMES.map(rule => ({ from: rule.to, to: rule.from })))
  }
}


/** 只改标签上的**标题文字节点**：直接写 `textContent` 会把关闭键的按钮一起抹掉。 */
function setRailTabTitle(chip, value) {
  const walker = document.createTreeWalker(chip, NodeFilter.SHOW_TEXT)

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if ((node.nodeValue || '').trim()) {
      node.nodeValue = value

      return true
    }
  }

  return false
}


/** 标签上显示的文字。**不能直接读 `textContent`**：关闭键的「✕」也在里面（实测「文件✕」⇒ 比对永远不等）。 */
function railTabLabel(chip) {
  const clone = chip.cloneNode(true)

  clone.querySelectorAll('button, svg, [aria-hidden="true"]').forEach(node => node.remove())

  return (clone.textContent || '').trim()
}


function tagRailStrip() {
  applySessionStrip()
  renameUiText()


  if (!RAIL_PANES) {
    return
  }

  for (const tab of RAIL_STRIP_ANCHORS) {
    const chip = document.querySelector(`[data-tree-tab="${tab}"]`)

    const strip = chip?.closest('[data-zone-tabstrip]')

    if (strip && !strip.hasAttribute(RAIL_STRIP_ATTR)) {
      strip.setAttribute(RAIL_STRIP_ATTR, '') // 只在没有时写：同值重写也算一次属性变更，会唤醒自己的观察器
    }
  }

  // 兜底：除了 CSS，再给「文件」那个标签挂一次内联 display —— CSS 万一被更具体/内联的样式压住也不露脸。
  // 幂等：每轮 reconcile 都对一遍；关掉开关时把内联样式摘干净，交还原生。
  {
    const wantHide = RAIL_HIDE_FILE_TAB && fileTabOn
    const targets = RAIL_FILE_TABS
      .map(id => document.querySelector(`[data-tree-tab="${id}"]`))
      .filter(Boolean)

    // 按文字兜底：只在**右栏那条标签条**（我们打过标记的，或含我们自己面板的那条）里认，
    // 免得误伤别的区域的同名标签。
    const railStrips = new Set()

    for (const strip of document.querySelectorAll('[data-zone-tabstrip]')) {
      const ours = [RAIL_BROWSER_TAB, RAIL_RECORDER_TAB].some(id => strip.querySelector(`[data-tree-tab="${id}"]`))

      if (strip.hasAttribute(RAIL_STRIP_ATTR) || ours) {
        railStrips.add(strip) // 先认「这条就是右栏标签条」，再看条里的标签
      }
    }

    for (const strip of railStrips) {
      for (const chip of strip.querySelectorAll('[data-tree-tab]')) {
        if (targets.includes(chip) || !RAIL_FILE_TAB_LABELS.includes(railTabLabel(chip))) {
          continue
        }

        targets.push(chip)
        chip.setAttribute(RAIL_FILE_LABEL_ATTR, '')
      }
    }

    for (const chip of targets) {
      if (!chip.hasAttribute(RAIL_FILE_TITLE_ATTR)) {
        chip.setAttribute(RAIL_FILE_TITLE_ATTR, railTabLabel(chip)) // 记下原样，停用插件时写回
      }

      if (railTabLabel(chip) !== RAIL_FILE_TITLE) {
        setRailTabTitle(chip, RAIL_FILE_TITLE) // 「文件」→「右侧栏」
      }

      if (wantHide) {
        if (chip.style.display !== 'none') {
          chip.style.display = 'none'
        }
      } else if (chip.style.display === 'none') {
        chip.style.removeProperty('display')
      }
    }

    if (!wantHide) {
      // 开关关掉：把按文字认下的标记也撤掉，完全交还原生
      for (const chip of document.querySelectorAll(`[${RAIL_FILE_LABEL_ATTR}]`)) {
        chip.style.removeProperty('display')
        chip.removeAttribute(RAIL_FILE_LABEL_ATTR)
      }
    }
  }

  // 「文件」标签藏起来后，如果**当前活动标签正是它**（宿主默认常常就是它），标签条上会「一个都不亮」、
  // 而面板区停在文件树 —— 用户看到的是「三个标签但没选中」。这时切到第一个可见标签（文档预览）。
  // 只在活动标签是「文件」时动手，且每次挂载只做一次 ⇒ 用户自己选过的标签不会被抢走。
  if (RAIL_HIDE_FILE_TAB && fileTabOn && !railActiveSwitched) {
    const activeFile = [...document.querySelectorAll('[data-tree-tab][data-active="true"]')]
      .find(chip => RAIL_FILE_TABS.includes(chip.getAttribute('data-tree-tab'))
        || RAIL_FILE_TAB_LABELS.includes(railTabLabel(chip)))

    if (activeFile) {
      railActiveSwitched = true

      try {
        host.revealPane?.(RAIL_OFFICE_TAB)
      } catch {
        /* 老宿主没有 revealPane：那就不动，用户点一下「文档预览」也一样 */
      }
    }
  }
}


/** 地址栏输入 → 能交给 webview 的地址。语义照抄应用自己的 `normalizePreviewAddress`：
 *  回环地址补 `http`（本机 443 上没服务、也没证书），其余补 `https`；
 *  `data:` / `javascript:` 一律拒（它们是在当前页里执行，不是导航）。 */
function normalizeAddress(value) {
  const address = String(value || '').trim()

  if (!address) {
    return null
  }

  const scheme = /^(about|blob|chrome|data|devtools|file|ftp|https?|javascript|view-source):/i.exec(address)?.[1]
  const loopback = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(address)
  const candidate = scheme ? address : `${loopback ? 'http' : 'https'}://${address}`

  if (scheme && /^(data|javascript)$/i.test(scheme)) {
    return null
  }

  try {
    // 解析失败才是真正的过滤器：`://broken`、`htp:/x`、半截域名都落这里。
    new URL(candidate)

    return candidate
  } catch {
    return null
  }
}

function lastBrowserUrl() {
  try {
    const saved = doors.storage?.get?.(BROWSER_URL_KEY, '')

    return typeof saved === 'string' ? saved : ''
  } catch {
    return ''
  }
}

function rememberBrowserUrl(url) {
  try {
    if (/^https?:\/\//i.test(url)) {
      doors.storage?.set?.(BROWSER_URL_KEY, url)
    }
  } catch {
    /* 记不住不影响浏览 */
  }
}

/** 工具条上的小图标按钮（样式走注入 CSS 的 `.hermes-rail-btn`，不依赖 Tailwind）。 */
function railButton({ disabled = false, icon, key, label, onClick }) {
  return jsx('button', {
    children: jsx(Codicon, { name: icon, spinning: icon === 'loading' }),
    className: 'hermes-rail-btn',
    disabled,
    key,
    onClick,
    title: label,
    type: 'button'
  })
}

/** 右侧栏「浏览器」：里面就是桌面端自带浏览器那个 webview（同分区、同 webpreferences），
 *  外面这条地址栏是我们自己画的（应用的面板不给插件复用，能复用的只有这层 guest 本身）。 */
function BrowserPane() {
  const hostRef = useRef(null)
  const viewRef = useRef(null)
  const [address, setAddress] = useState('')
  const [snapshot, setSnapshot] = useState({ back: false, failed: '', forward: false, loading: false })
  // 「文件」里点了 html ⇒ 这个 atom 被塞进一条请求，面板据此换地址（同插件内通信）。
  const request = useValue($browserRequest)

  const patch = useCallback(next => setSnapshot(previous => ({ ...previous, ...next })), [])

  useEffect(() => {
    const host = hostRef.current

    if (!host) {
      return undefined
    }

    const webview = document.createElement('webview')

    webview.className = 'flex h-full w-full flex-1 bg-transparent'
    webview.setAttribute('partition', PREVIEW_PARTITION)
    webview.setAttribute('webpreferences', PREVIEW_WEB_PREFERENCES)

    const syncAddress = () => {
      try {
        setAddress(webview.getURL?.() || '')
      } catch {
        /* 还没 attach 时 getURL 会抛 */
      }
    }

    const syncHistory = () => {
      try {
        patch({ back: Boolean(webview.canGoBack?.()), forward: Boolean(webview.canGoForward?.()) })
      } catch {
        /* 同上 */
      }
    }

    const onStart = () => patch({ failed: '', loading: true })
    const onStop = () => {
      patch({ loading: false })
      syncAddress()
      syncHistory()
    }
    const onNavigate = () => {
      syncAddress()
      syncHistory()
    }
    const onFail = event => {
      // -3 = ERR_ABORTED：用户自己点了别的链接，不算加载失败。
      if (event?.errorCode === -3) {
        return
      }

      patch({ failed: String(event?.errorDescription || '网页打不开') })
    }
    // guest 里点 `_blank`：这个分区的 preload 会把 URL 送回宿主，由宿主开系统浏览器。
    // 我们用的是同一个分区 ⇒ 同一个 preload ⇒ 照抄宿主那半段即可（仅 http/https）。
    const onGuestMessage = event => {
      if (event?.channel !== PREVIEW_EXTERNAL_CHANNEL) {
        return
      }

      const url = String(event.args?.[0] ?? '')

      if (/^https?:\/\//i.test(url)) {
        void window.hermesDesktop?.openExternal?.(url)
      }
    }

    webview.addEventListener('did-start-loading', onStart)
    webview.addEventListener('did-stop-loading', onStop)
    webview.addEventListener('did-navigate', onNavigate)
    webview.addEventListener('did-navigate-in-page', onNavigate)
    webview.addEventListener('did-fail-load', onFail)
    webview.addEventListener('ipc-message', onGuestMessage)
    webview.setAttribute('src', lastBrowserUrl() || 'about:blank')
    host.appendChild(webview)
    viewRef.current = webview

    return () => {
      webview.removeEventListener('did-start-loading', onStart)
      webview.removeEventListener('did-stop-loading', onStop)
      webview.removeEventListener('did-navigate', onNavigate)
      webview.removeEventListener('did-navigate-in-page', onNavigate)
      webview.removeEventListener('did-fail-load', onFail)
      webview.removeEventListener('ipc-message', onGuestMessage)
      webview.remove()
      viewRef.current = null
    }
  }, [patch])

  const go = useCallback(raw => {
    const next = normalizeAddress(raw)

    if (!next) {
      return
    }

    setAddress(next)
    rememberBrowserUrl(next)

    try {
      viewRef.current?.loadURL?.(next)
    } catch {
      /* attach 之前 loadURL 不可用；之后的导航事件会自己同步 */
    }
  }, [])

  // 外部（「文件」面板的 html 点击）请我们打开某个地址。
  // 注意顺序：上面的建 webview 的 effect 先跑 ⇒ 这里 loadURL 时 viewRef 已经就绪；
  // 面板后挂载（当时被别的标签挡着）也没关系 —— 挂载时这条 effect 会读到最新请求。
  useEffect(() => {
    if (request?.url) {
      go(request.url)
    }
  }, [go, request])

  return jsxs('div', {
    children: [
      jsxs(
        'div',
        {
          children: [
            railButton({
              disabled: !snapshot.back,
              icon: 'arrow-left',
              key: 'back',
              label: '后退',
              onClick: () => void viewRef.current?.goBack?.()
            }),
            railButton({
              disabled: !snapshot.forward,
              icon: 'arrow-right',
              key: 'forward',
              label: '前进',
              onClick: () => void viewRef.current?.goForward?.()
            }),
            railButton({
              icon: snapshot.loading ? 'loading' : 'refresh',
              key: 'reload',
              label: '刷新',
              onClick: () => void viewRef.current?.reload?.()
            }),
            jsx('form', {
              children: jsx('input', {
                className: 'hermes-rail-input',
                onChange: event => setAddress(event.target.value),
                placeholder: '输入网址，回车打开',
                spellCheck: false,
                value: address
              }),
              key: 'address',
              onSubmit: event => {
                event.preventDefault()
                go(address)
              },
              style: { display: 'flex', flex: '1 1 auto', minWidth: 0 }
            })
          ],
          className: 'hermes-rail-bar',
          key: 'bar'
        }
      ),
      snapshot.failed ? jsx('div', { children: snapshot.failed, className: 'hermes-rail-fail', key: 'fail' }) : null,
      jsx('div', { className: 'hermes-rail-body', key: 'body', ref: hostRef })
    ],
    className: RAIL_PANE_CLASS
  })
}

/** 右侧栏「会议记录」：只嵌 meeting-recorder 那张前端页 —— 没有地址栏、没有任何别的 chrome。
 *  页面用的是它自己的相对接口 `/api`，所以必须由它自己的服务托管（探一探再决定显示什么）。 */
const RECORDER_PROBE_TIMEOUT_MS = 2500

function RecorderPane() {
  const [status, setStatus] = useState('checking')
  const [nonce, setNonce] = useState(0)

  const check = useCallback(() => {
    setStatus('checking')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), RECORDER_PROBE_TIMEOUT_MS)

    // no-cors：拿不到响应内容（也不需要），只用来区分「连得上」和「连不上」。
    fetch(`${RECORDER_ORIGIN}/api/state`, { cache: 'no-store', mode: 'no-cors', signal: controller.signal })
      .then(() => setStatus('up'))
      .catch(() => setStatus('down'))
      .finally(() => clearTimeout(timer))
  }, [])

  useEffect(() => {
    check()
  }, [check, nonce])

  if (status === 'up') {
    // 服务在跑：只给网页本身（换 nonce 重挂 = 重新加载）。
    return jsx('iframe', {
      className: 'hermes-rail-iframe',
      src: `${RECORDER_ORIGIN}/`,
      title: '会议记录'
    })
  }

  return jsxs('div', {
    children: [
      jsxs('div', {
        children: [
          railButton({ icon: 'refresh', key: 'retry', label: '重试', onClick: () => setNonce(count => count + 1) }),
          jsx('span', {
            children: status === 'checking' ? '正在连接录音服务…' : '录音服务未启动',
            key: 'title',
            style: { color: 'var(--ui-text-tertiary, currentColor)', fontSize: '0.75rem' }
          })
        ],
        className: 'hermes-rail-bar',
        key: 'bar'
      }),
      jsxs('div', {
        children: [
          jsx('div', { children: '这个页面要靠它自己的服务（127.0.0.1:8789）托管才能用。先在终端启动：', key: 'lead' }),
          jsx('div', { children: RECORDER_START_CMD, className: 'hermes-rail-cmd', key: 'cmd' }),
          jsx('div', { children: '然后点上面的「重试」。', key: 'tail', style: { marginTop: '0.5rem' } })
        ],
        className: 'hermes-rail-note',
        key: 'note'
      })
    ],
    className: RAIL_PANE_CLASS
  })
}

export default {
  id: PLUGIN_ID,
  name: '桌面美化',
  description:
    '桌面美化（本机 UI 改造集合）· 侧栏「更多工具」折叠组（默认折叠，组内三行：内置浏览器 / 文档预览 / 会议记录，点前两者与会议记录都在会话区整块打开）+ 搜索框上移无边框 + 会话区排版 + 统一台面 + 「已置顶」排到「会话」下方 + 右侧栏四标签（文件 / 文档预览 / 浏览器 / 会议记录，只能切换不能关闭，按此从左到右排序）+ 「文件」里点文件转到对应标签预览',
  defaultEnabled: true,

  register(ctx) {
    if (typeof document === 'undefined') {
      return
    }

    let persist = () => {}

    state.setExpanded = next => apply(next, persist)
    doors.storage = ctx.storage
    railCtx = ctx // 面板要推迟到锚点出现才登记，得留着 ctx；见 registerRailPanes

    const boot = () => {
      const style = document.createElement('style')

      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)

      const saved = ctx.storage.get('expanded', false)

      apply(saved === true, false)
      persist = value => ctx.storage.set('expanded', value)

      persistCardRouting = value => ctx.storage.set('cardroute', value)
      applyCardRouting(ctx.storage.get('cardroute', true) !== false, false)

      persistConvo = value => ctx.storage.set('convo', value)
      applyConvo(ctx.storage.get('convo', true) !== false, false)

      persistFlat = value => ctx.storage.set('flat', value)
      applyFlat(ctx.storage.get('flat', true) !== false, false)

      persistFileTab = value => ctx.storage.set('filetab', value)
      applyFileTab(ctx.storage.get('filetab', true) !== false, false)

      persistSessionTabs = value => ctx.storage.set('sessiontabs', value)
      applySessionTabs(ctx.storage.get('sessiontabs', true) !== false, false)

      // 事件流（聊天天天在重渲染）每次都跑太重 —— 限流到 RECONCILE_MS，代价可忽略。
      let timer = null

      const observer = new MutationObserver(records => {
        // 只改了我们自己写的 `data-hermes-*` 属性？那不算外部变化 —— 否则插件的每次写入又会唤醒自己，空转。
        if (records.every(record => record.type === 'attributes' && /^data-hermes-/.test(record.attributeName ?? ''))) {
          return
        }

        if (timer !== null) {
          return
        }

        timer = setTimeout(() => {
          timer = null
          reconcile()
        }, RECONCILE_MS)
      })

      // `attributes: true` 也要：宿主重建标签条/换 id 时可能只改属性（不改结构），只听 childList 会漏掉，
      // 于是「藏『文件』标签」这类按属性写的逻辑反应不过来（实测踩过）。
      observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true })

      // ⑧ 「文件」里点文件 → 转到「文档预览」/「浏览器」标签（capture 阶段，抢在 React 前面）。
      document.addEventListener('click', routeFileClick, true)
      document.addEventListener('dblclick', routeFileClick, true)

      ctx.register({
        id: 'toggle',
        area: PALETTE_AREA,
        data: {
          id: `${PLUGIN_ID}.toggle`,
          label: `${LABEL}：展开 / 收起侧栏工具组`,
          keywords: ['更多工具', '桌面美化', 'more tools', 'sidebar', '侧栏', '折叠', 'collapse'],
          detail: () => (state.expanded ? '已展开' : '已收起'),
          detailVariant: 'state',
          run: () => state.setExpanded?.(!state.expanded)
        }
      })

      ctx.register({
        id: 'cardroute',
        area: PALETTE_AREA,
        data: {
          id: `${PLUGIN_ID}.cardroute`,
          label: '桌面美化：产物卡片点击 → 右侧栏「文档预览」 开 / 关',
          keywords: ['卡片', '产物', '预览', '文档预览', 'office', '查看器', 'card', 'preview', '美化'],
          detail: () => (cardRoutingOn ? '已开启' : '已关闭'),
          detailVariant: 'state',
          run: () => applyCardRouting(!cardRoutingOn, true)
        }
      })

      ctx.register({
        id: 'convo',
        area: PALETTE_AREA,
        data: {
          id: `${PLUGIN_ID}.convo`,
          label: '桌面美化：会话区排版（行高 / 段距）开 / 关',
          keywords: ['会话区', '排版', '行高', '段距', 'conversation', 'typography', '美化'],
          detail: () => (convoOn ? '已开启' : '已关闭'),
          detailVariant: 'state',
          run: () => applyConvo(!convoOn, true)
        }
      })

      ctx.register({
        id: 'sessiontabs',
        area: PALETTE_AREA,
        data: {
          id: `${PLUGIN_ID}.sessiontabs`,
          label: `${LABEL}：隐藏左侧栏 / 会话区标签条 开 / 关`,
          detail: () => (sessionTabsOn ? '已隐藏（含会话区的终端标签）' : '已显示'),
          run: () => applySessionTabs(!sessionTabsOn, true)
        }
      })

      ctx.register({
        id: 'filetab',
        area: PALETTE_AREA,
        data: {
          id: `${PLUGIN_ID}.filetab`,
          label: '桌面美化：隐藏右侧栏「文件」标签 开 / 关',
          keywords: ['文件', '标签', '隐藏', '右栏', 'file', 'tab', 'hide', '美化'],
          detail: () => (fileTabOn ? '已隐藏' : '已显示'),
          detailVariant: 'state',
          run: () => applyFileTab(!fileTabOn, true)
        }
      })

      ctx.register({
        id: 'flat',
        area: PALETTE_AREA,
        data: {
          id: `${PLUGIN_ID}.flat`,
          label: '桌面美化：统一台面背景（全界面 = 输入框色）开 / 关',
          keywords: ['统一背景', '台面', '色块', '背景色', 'flat', 'surface', '输入框', '美化'],
          detail: () => (flatOn ? '已开启' : '已关闭'),
          detailVariant: 'state',
          run: () => applyFlat(!flatOn, true)
        }
      })

      registerRailPanes()

      ctx.onDispose(() => {
        observer.disconnect()
        document.removeEventListener('click', routeFileClick, true)
        document.removeEventListener('dblclick', routeFileClick, true)

        if (timer !== null) {
          clearTimeout(timer)
        }

        style.remove()

        for (const row of document.querySelectorAll(`[${ROW_ATTR}], [${BROWSER_ROW_ATTR}], [${RECORDER_ROW_ATTR}]`)) {
          row.remove()
        }

        for (const el of document.querySelectorAll(`[${SEARCH_WRAP_ATTR}], [${SEARCH_FIELD_ATTR}]`)) {
          el.removeAttribute(SEARCH_WRAP_ATTR)
          el.removeAttribute(SEARCH_FIELD_ATTR)
        }

        document.documentElement.removeAttribute(ROOT_ATTR)
        document.documentElement.removeAttribute(CONVO_ATTR)
        document.documentElement.removeAttribute(FLAT_ATTR)
        document.documentElement.removeAttribute(FILETAB_ATTR)
        document.documentElement.removeAttribute(SESSIONTABS_ATTR)
        document.querySelectorAll(`[${SESSION_STRIP_MARK}]`).forEach(el => {
          el.style.removeProperty('display')
          el.removeAttribute(SESSION_STRIP_MARK)
        })
        document.querySelectorAll(`[${SESSION_TERMINAL_ATTR}]`).forEach(el => {
          el.style.removeProperty('display')
          el.removeAttribute(SESSION_TERMINAL_ATTR)
        })
        document.querySelectorAll(`[${PIN_LAST_ATTR}]`).forEach(el => el.removeAttribute(PIN_LAST_ATTR)) // 置顶分区回原位
        document.querySelectorAll(`[${RAIL_STRIP_ATTR}]`).forEach(el => el.removeAttribute(RAIL_STRIP_ATTR)) // 标签条的 ✕ 交还应用
        // 标签归还：按**我们自己的标记**收，不按 id —— 凡是被认下动过的标签都带着 TITLE_ATTR / LABEL_ATTR，
        // 按 id 收会漏掉「id 被上游改掉、只能按文字认」的那一枚（实测漏过，留下内联 display:none）。
        document.querySelectorAll(`[${RAIL_FILE_TITLE_ATTR}], [${RAIL_FILE_LABEL_ATTR}]`)
          .forEach(el => el.style.removeProperty('display'))

        restoreUiText() // 界面文案归还原生叫法

        document.querySelectorAll(`[${RAIL_FILE_TITLE_ATTR}]`).forEach(chip => {
          setRailTabTitle(chip, chip.getAttribute(RAIL_FILE_TITLE_ATTR) || '')
          chip.removeAttribute(RAIL_FILE_TITLE_ATTR)
        }) // 标签名写回宿主原本的叫法

        document.querySelectorAll(`[${RAIL_FILE_LABEL_ATTR}]`).forEach(el => {
          el.style.removeProperty('display')
          el.removeAttribute(RAIL_FILE_LABEL_ATTR)
        }) // 按文字认下的也归还

        railCtx = null
        railPanesRegistered = false // 重新启用时重新等锚点
        railAnchorWaitFrom = 0
        railActiveSwitched = false

      })
    }

    if (document.body && document.documentElement) {
      boot()
    } else {
      document.addEventListener('DOMContentLoaded', boot, { once: true })
    }
  }
}