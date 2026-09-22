#!/usr/bin/env bash
# ============================================================================
#  desktop-beautify · 安装脚本
#
#  把本仓库装成一个 Hermes 桌面端插件：
#    ① 复制 <仓库> → ~/.hermes/plugins/desktop-beautify/
#    ② 打印启用步骤（应用里点「重新扫描」+ 打开开关）
#  只复制文件，不改应用、不改配置。先看它要做什么：bash install.sh --dry-run
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1
run() { if [ "$DRY" = "1" ]; then echo "  [dry-run] $*"; else eval "$@"; fi; }

TARGET="${HERMES_PLUGIN_DIR:-$HOME/.hermes/plugins}/desktop-beautify"
echo "📦 源目录：$PWD"
echo "🎯 目标：  ${TARGET}"
echo

if [ -e "${TARGET}" ]; then
  echo "⚠ ${TARGET} 已存在 —— 先把它挪走留个备份，再装新的"
  STAMP="$(date +%Y%m%d-%H%M%S)"
  run "mv '${TARGET}' '${TARGET}.bak-${STAMP}'"
  echo "  → 旧目录已备份为 ${TARGET}.bak-${STAMP}"
fi

echo "── 复制插件文件 ──"
run "mkdir -p '${TARGET}'"
for f in plugin.yaml LICENSE README.md install.sh; do
  [ -e "$f" ] && { run "cp '$f' '${TARGET}/'"; echo "  + $f"; }
done
run "mkdir -p '${TARGET}/desktop'"
run "cp desktop/plugin.js '${TARGET}/desktop/plugin.js'"
echo "  + desktop/plugin.js"

echo
echo "✅ 装好了。在应用里启用（两步）："
echo "   1) ⌘K →「技能与工具」→「桌面插件」标签 → 点「重新扫描」"
echo "   2) 在同一页找到「桌面美化」那一行，打开开关（默认关闭是应用对桌面插件的强制 opt-in）"
echo
echo "   建议一并装上它的两个依赖（不装也能用，只是少两个功能）："
echo "     git clone https://github.com/xionglaoshi/hermes-office-viewer.git   # 「文档预览」面板"
echo "     git clone https://github.com/xionglaoshi/meeting-recorder.git       # 「会议记录」面板"
