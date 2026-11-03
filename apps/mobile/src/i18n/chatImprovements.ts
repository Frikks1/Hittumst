const en = {
  all: 'All', unread: 'Unread', archived: 'Archived', pin: 'Pin', unpin: 'Unpin', archive: 'Archive', unarchive: 'Move to inbox',
  mute: 'Mute notifications', unmute: 'Unmute notifications', draft: 'Draft', options: 'Conversation options',
  draftError: 'Could not save your draft on this device.', preferencesError: 'Could not save conversation preferences. Please try again.',
  unreadEmpty: 'No unread conversations', archivedEmpty: 'No archived conversations',
  promptReply: 'Replying to this profile prompt', sharedTitle: 'A shared interest',
  sharedStarter: (interest: string) => `We both like ${interest}. What got you into it?`,
  promptStarter: (prompt: string) => `About “${prompt}”: `,
  meetupChats: 'Hittingar',
};
const is: typeof en = {
  all: 'Öll', unread: 'Ólesin', archived: 'Í geymslu', pin: 'Festa', unpin: 'Losa', archive: 'Setja í geymslu', unarchive: 'Færa í innhólf',
  mute: 'Þagga niður tilkynningar', unmute: 'Kveikja á tilkynningum', draft: 'Drög', options: 'Valkostir samtals',
  draftError: 'Ekki tókst að vista drög á þessu tæki.', preferencesError: 'Ekki tókst að vista stillingar samtals. Reyndu aftur.',
  unreadEmpty: 'Engin ólesin samtöl', archivedEmpty: 'Engin samtöl í geymslu',
  promptReply: 'Svar við samtalskveikju á prófíl', sharedTitle: 'Sameiginlegt áhugamál',
  sharedStarter: (interest: string) => `Við höfum bæði áhuga á ${interest}. Hvernig byrjaði sá áhugi?`,
  promptStarter: (prompt: string) => `Varðandi „${prompt}“: `,
  meetupChats: 'Hittingar',
};
export function chatImprovementsCopy(locale: 'is' | 'en') { return locale === 'is' ? is : en; }
