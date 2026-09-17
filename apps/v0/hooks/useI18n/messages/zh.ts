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
// Topic-list names are deliberately absent: the whole list menu is hidden in
// the English UI, so those titles never need translating.

export const zh = {
  "nav.contestList": "竞赛列表",
  "nav.practice": "难度练习",
  "nav.recommend": "推荐刷题",
  "nav.search": "搜索题目",
  "nav.topicLists": "题单",
  "nav.profile": "个人进度",
  "nav.theme": "切换主题",
  "nav.language": "切换界面语言",
} as const;

export type MessageKey = keyof typeof zh;
export type Messages = Record<MessageKey, string>;
