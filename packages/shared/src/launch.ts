/** Release scope shared by native, web and the moderation console. */
export const launchScope = Object.freeze({
  hittingar: true,
  permanentGroups: false,
  voice: false,
  personRatings: false,
  explicitEvents: false,
  explicitMedia: false,
});

export const launchLimits = Object.freeze({
  inboxPage: 30,
  messagePage: 50,
  messagesPerMinute: 60,
  newConversationsPerHour: 10,
  uploadsPerHour: 10,
  profileVideoSeconds: 10,
  albumVideoSeconds: 15,
  uploadBytes: 30 * 1024 * 1024,
});

export function isLaunchMeetup(input: { category?: string; intention?: string; isExplicit?: boolean }) {
  return input.isExplicit !== true && input.category !== 'private_adult' && input.intention !== 'casual_adult';
}
