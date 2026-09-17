// Source of truth for interface copy.
//
// Every user-visible string lives here exactly once, keyed by a flat
// `area.thing` name. `en.ts` is typed as Record<MessageKey, string> against
// this file, so adding a key here and forgetting the translation is a compile
// error rather than a Chinese string leaking into the English UI.
//
// Rules for new entries:
//   - key names describe the slot, not the current wording, so copy can change
//     without touching call sites
//   - `{name}` marks an interpolation parameter
//   - where English needs a singular form, define `x.one` / `x.other` and pick
//     in the component; Chinese repeats the same text in both
//
// Labels that belong to an enum (effort bands, gave-up reasons, rating bands)
// live here too rather than next to the enum, so there is exactly one place to
// look for wording. The enum modules export key builders such as
// `bandLabelKey(band)` that are typed against these literals.
//
// Topic-list names are deliberately absent: the whole list menu is hidden in
// the English UI, so those titles never need translating.

export const zh = {
  // --- navigation ---------------------------------------------------------
  "nav.contestList": "竞赛列表",
  "nav.practice": "难度练习",
  "nav.recommend": "推荐刷题",
  "nav.search": "搜索题目",
  "nav.topicLists": "题单",
  "nav.profile": "个人进度",
  "nav.theme": "切换主题",
  "nav.language": "切换界面语言",

  // --- effort bands -------------------------------------------------------
  "band.LE5": "≤5min",
  "band.L5_15": "5–15min",
  "band.L15_30": "15–30min",
  "band.L30_60": "30–60min",
  "band.GT60": ">60min",
  "band.LE5.hint": "秒了",
  "band.L5_15.hint": "顺手",
  "band.L15_30.hint": "想了想",
  "band.L30_60.hint": "很艰难",
  "band.GT60.hint": "差点没做出来",

  // --- attempt labels -----------------------------------------------------
  "gaveup.idea_tedious": "有思路，但太繁琐不想做",
  "gaveup.no_idea": "完全没思路",
  "independence.solo": "独立完成",
  "independence.solution": "参考了题解",
  "attempt.none": "未记录",
  "attempt.solved": "{band} · {mode}",
  "attempt.mode.solo": "独立",
  "attempt.mode.solution": "参考题解",
  "attempt.drill": "{base} · 待强化",
  "attempt.gaveup": "没做出来 · {reason}",

  // --- common -------------------------------------------------------------
  "common.cancel": "取消",
  "common.back": "返回",

  // --- record panel -------------------------------------------------------
  "record.title": "记录这次练习",
  "record.prompt.outcome": "这次做得怎么样？",
  "record.outcome.solved": "做出来了",
  "record.outcome.gaveup": "没做出来",
  "record.prompt.band": "用了多久？",
  "record.required": "必选",
  "record.group.independence": "完成方式",
  "record.group.drill": "强化复习",
  "record.drill.toggle": "值得再复习",
  "record.drill.hint": "模板、API 用法这类要背下来的东西",
  "record.prompt.reason": "卡在哪？",
  "record.footer.outcome": "1 / 0 选择 · Esc 取消",
  "record.footer.steps": "点击即保存 · Esc 返回",

  "settings.progress.summary": "共 {total} 条记录（做出来 {solved} · 没做出来 {gaveup}）",
  "settings.progress.export": "导出到文本框",
  "settings.progress.download": "下载 JSON 文件",
  "settings.progress.copy": "复制到剪贴板",
  "settings.progress.label": "进度数据（可复制到另一台设备）",
  "settings.progress.placeholder": "点击上方按钮导出，或粘贴另一台设备导出的 JSON 后点「导入」",
  "settings.progress.import": "导入",
  "settings.progress.importFailed": "导入失败",
  "settings.progress.imported": "导入完成：{parts}",
  "settings.progress.added": "新增 {count} 条",
  "settings.progress.skipped": "跳过重复 {count} 条",
  "settings.progress.ignored": "忽略无效 {count} 条",

  // --- rating bands -------------------------------------------------------
  "ratingBand.entry": "入门",
  "ratingBand.easy": "普及",
  "ratingBand.improve": "提高",
  "ratingBand.advanced": "进阶",
  "ratingBand.hard": "困难",
  "ratingBand.legendary": "传说",

  // --- progress import ----------------------------------------------------
  "import.badJson": "JSON 解析失败",
  "import.legacyV1": "检测到旧版（v1）进度格式，已不再支持导入",
  "import.unknownFormat": "无法识别的数据格式",

  // --- recommendation reasons --------------------------------------------
  "reason.basics": "从基础题开始，先把地基打牢",
  "reason.newTag": "新题型：{tag}",
  "reason.regainFeel": "先找回手感，难度 ≈{target}",
  "reason.levelUp": "状态不错，难度上调到 ≈{target}",
  "reason.fit": "难度贴合你当前的水平 ≈{target}",
  "reason.drill": "待强化：把这道题里的模板 / 用法再过一遍",
  "reason.leech": "这题已经卡了 {count} 次，先放一放，练练同类更简单的",
  "reason.overdue": "逾期 {days} 天，先把它复习掉",
  "reason.dueToday": "今天到期，趁热复习一遍",
  "reason.sibling": "已经会了，换个题面巩固「{tag}」",
  "reason.prerequisite": "先垫一道更简单的「{tag}」题",
  "reason.steady": "先找回手感，来一道稳的",
} as const;

export type MessageKey = keyof typeof zh;
export type Messages = Record<MessageKey, string>;
