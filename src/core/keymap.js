// #AI-task 2026-11-27：面板快捷键动作注册表 + 本地键位映射（可录制/冲突提示/恢复默认）。
// 红线：仅本地存储；浏览器全局命令仍由 Chrome 快捷键页管理（manifest commands 不变）。
// 左右方向键新口径：→ 聚焦当前网页（focus-web）、← 回到插件面板（focus-panel），均可自定义。

// 动作注册表：id 唯一；key 为默认键位（规范串：Ctrl/Alt/Shift/Meta+主键，或单键）。
export const KEY_ACTIONS = [
  { id: "cursor-prev", label: "上移选择", desc: "选择上一条标签", key: "ArrowUp" },
  { id: "cursor-next", label: "下移选择", desc: "选择下一条标签", key: "ArrowDown" },
  { id: "open-selected", label: "打开选中标签", desc: "前台跳转，双击同效", key: "Enter" },
  {
    id: "open-selected-focus",
    label: "显式聚焦网页",
    desc: "前台打开并把窗口焦点交给网页",
    key: "Ctrl+Shift+Enter",
  },
  { id: "trash-selected", label: "删除到回收站", desc: "移入回收站", key: "Delete" },
  { id: "copy-selected", label: "复制当前标签", desc: "直出链接", key: "Ctrl+C" },
  { id: "locate-selected", label: "定位当前标签", desc: "在浏览器中定位该标签", key: "Ctrl+L" },
  { id: "toggle-collapse", label: "展开 / 收起全部", desc: "切换树状态", key: "Ctrl+E" },
  { id: "toggle-links", label: "显示 / 隐藏链接", desc: "切换链接列", key: "Ctrl+Shift+L" },
  {
    id: "open-group",
    label: "打开当前分组",
    desc: "按默认参数打开选中叶子所在分组",
    key: "Ctrl+O",
  },
  { id: "toggle-pip", label: "置顶小窗", desc: "切换置顶小窗模式", key: "Ctrl+P" },
  { id: "focus-web", label: "聚焦当前网页", desc: "→ 前台聚焦选中标签所在网页", key: "ArrowRight" },
  { id: "focus-panel", label: "回到插件面板", desc: "← 回到面板并选中当前行", key: "ArrowLeft" },
  { id: "open-trash", label: "打开回收站", desc: "查看已删除标签", key: "Ctrl+Backspace" },
  { id: "toggle-theme", label: "切换主题", desc: "深色 / 浅色", key: "Ctrl+D" },
];

const DEFAULT_MAP = Object.fromEntries(KEY_ACTIONS.map((a) => [a.id, a.key]));

// 合法主键：单字符（含符号/数字/字母）或命名键白名单。
const NAMED_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Enter",
  "Delete",
  "Backspace",
  "Space",
  "Escape",
  "Tab",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
]);
function isMainKeyValid(main) {
  return main.length === 1 || NAMED_KEYS.has(main);
}

// 键串规范化：修饰键顺序统一为 Ctrl+Alt+Shift+Meta+主键；主键取 e.key 命名。
export function normalizeKeyBinding(v) {
  if (typeof v !== "string") return "";
  const parts = v
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  const mods = { ctrl: false, alt: false, shift: false, meta: false };
  let main = "";
  for (const p of parts) {
    const low = p.toLowerCase();
    if (low === "ctrl" || low === "control") mods.ctrl = true;
    else if (low === "alt") mods.alt = true;
    else if (low === "shift") mods.shift = true;
    else if (low === "meta" || low === "cmd" || low === "command") mods.meta = true;
    else main = p.length === 1 ? p.toUpperCase() : p; // 主键：单字母统一大写
  }
  if (!main || !isMainKeyValid(main)) return "";
  return (
    [
      mods.ctrl ? "Ctrl" : "",
      mods.alt ? "Alt" : "",
      mods.shift ? "Shift" : "",
      mods.meta ? "Meta" : "",
    ]
      .filter(Boolean)
      .join("+") +
    (mods.ctrl || mods.alt || mods.shift || mods.meta ? "+" : "") +
    main
  );
}

// 键位映射规范化：只保留注册表内动作 + 合法键串；非法/空条目回退默认。
export function normalizeKeymap(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const a of KEY_ACTIONS) {
    const v = normalizeKeyBinding(src[a.id]);
    out[a.id] = v || DEFAULT_MAP[a.id];
  }
  return out;
}

// 事件 → 规范键串（与 normalizeKeyBinding 同序），无修饰键时仅主键。
export function formatKeyEvent(e) {
  const main = e.key === " " ? "Space" : e.key;
  if (!main) return "";
  const mods = [
    e.ctrlKey ? "Ctrl" : "",
    e.altKey ? "Alt" : "",
    e.shiftKey ? "Shift" : "",
    e.metaKey ? "Meta" : "",
  ].filter(Boolean);
  return (mods.length ? mods.join("+") + "+" : "") + main;
}

// 匹配：事件 → actionId（按 keymap 精确比对；未配置动作用默认键）。
export function matchAction(keymap, e) {
  const map = normalizeKeymap(keymap);
  const binding = formatKeyEvent(e);
  if (!binding) return null;
  for (const a of KEY_ACTIONS) {
    if (map[a.id] === binding) return a.id;
  }
  return null;
}

// 冲突检测：返回与 binding 冲突的其他动作 id 列表（排除 excludeId）。
export function findConflicts(keymap, binding, excludeId) {
  const map = normalizeKeymap(keymap);
  return KEY_ACTIONS.filter((a) => a.id !== excludeId && map[a.id] === binding).map((a) => a.id);
}

// 恢复默认：返回默认映射副本。
export function defaultKeymap() {
  return { ...DEFAULT_MAP };
}
