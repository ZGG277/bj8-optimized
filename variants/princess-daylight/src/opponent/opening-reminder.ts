export const OPENING_REMINDERS = {
  profile: '我可以叫你的名字吗？点一下你的头像就能设置。',
  companion: '下次还想一起打？点我的头像，把我加入球友列表吧。',
} as const;

export type OpeningReminder = keyof typeof OPENING_REMINDERS;

export function nextOpeningReminder(profileCustomized: boolean, companionChosen: boolean, previous?: OpeningReminder): OpeningReminder | undefined {
  if (!profileCustomized && (companionChosen || previous !== 'profile')) return 'profile';
  return companionChosen ? undefined : 'companion';
}
