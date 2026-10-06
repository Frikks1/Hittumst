const en = {
  title: 'Interest',
  views: 'Views',
  taps: 'Taps',
  tap: 'Tap',
  tapped: 'Tap sent',
  tapHint: 'Say hello with a tap',
  tapFailed: 'Could not send your tap. Please try again.',
  tapCooldown: 'You can tap each person once every 24 hours.',
  tapRateLimited: 'Tap limit reached. Try again later.',
  hostedMeetups: 'Meetups & community',
  profileUnavailable: 'Profile unavailable',
  profileUnavailableBody: 'This profile may be hidden or no longer available.',
  nearby: 'People nearby',
  currentLocation: 'Current location',
  protectedLocation: 'Approximate location · privacy settings',
  online: 'Online',
  filters: 'Filters',
  lookingFor: 'Looking for',
  grid: 'Grid view',
  list: 'List view',
  newest: 'Newest first',
  loaded: 'Profiles loaded',
  partial: 'More profiles are available. Load more to see them.',
  viewEmpty: 'No views yet',
  viewEmptyBody: 'People who visit your profile will appear here.',
  tapEmpty: 'No taps yet',
  tapEmptyBody: 'A tap is a quick hello. People who tap your profile will appear here.',
  error: 'Could not load your activity',
  more: 'Load more',
  end: 'You’re all caught up',
  today: 'Today',
  yesterday: 'Yesterday',
  unknownTime: 'Recent activity',
  viewed: 'Viewed your profile',
  tappedYou: 'Sent you a tap',
};

const is: typeof en = {
  title: 'Áhugi',
  views: 'Skoðanir',
  taps: 'Snertingar',
  tap: 'Senda snertingu',
  tapped: 'Snerting send',
  tapHint: 'Segðu hæ með snertingu',
  tapFailed: 'Ekki tókst að senda snertingu. Reyndu aftur.',
  tapCooldown: 'Þú getur sent hverjum einstaklingi snertingu einu sinni á sólarhring.',
  tapRateLimited: 'Snertingamörkum náð. Reyndu aftur síðar.',
  hostedMeetups: 'Hittingar og samfélag',
  profileUnavailable: 'Prófíll ekki tiltækur',
  profileUnavailableBody: 'Prófíllinn gæti verið falinn eða ekki lengur í boði.',
  nearby: 'Fólk nálægt',
  currentLocation: 'Núverandi staðsetning',
  protectedLocation: 'Námunduð staðsetning · persónuvernd',
  online: 'Á netinu',
  filters: 'Síur',
  lookingFor: 'Leita að',
  grid: 'Reitasýn',
  list: 'Listasýn',
  newest: 'Nýjast fyrst',
  loaded: 'Prófílar hlaðnir',
  partial: 'Fleiri prófílar eru í boði. Hladdu inn fleiri til að sjá þá.',
  viewEmpty: 'Engar skoðanir enn',
  viewEmptyBody: 'Fólk sem skoðar prófílinn þinn birtist hér.',
  tapEmpty: 'Engar snertingar enn',
  tapEmptyBody: 'Snerting er stutt kveðja. Fólk sem sendir þér snertingu birtist hér.',
  error: 'Ekki tókst að hlaða virkni',
  more: 'Hlaða fleiri',
  end: 'Þú hefur séð allt',
  today: 'Í dag',
  yesterday: 'Í gær',
  unknownTime: 'Nýleg virkni',
  viewed: 'Skoðaði prófílinn þinn',
  tappedYou: 'Sendi þér snertingu',
};

export function profileActivityCopy(locale: 'is' | 'en') {
  return locale === 'is' ? is : en;
}

export function profileActivityTime(value: string, locale: 'is' | 'en', now = new Date()): string {
  const date = new Date(value);
  const copy = profileActivityCopy(locale);
  if (!Number.isFinite(date.getTime())) return copy.unknownTime;
  const time = date.toLocaleTimeString(locale === 'is' ? 'is-IS' : 'en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const sameDay = (left: Date, right: Date) => left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
  if (sameDay(date, now)) return `${copy.today} · ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(date, yesterday)) return `${copy.yesterday} · ${time}`;
  const day = date.toLocaleDateString(locale === 'is' ? 'is-IS' : 'en-GB', { day: 'numeric', month: 'short', ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
  return `${day} · ${time}`;
}
