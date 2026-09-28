/** Agreed launch scope. Server capability gates separately require connected-service verification. */
export const launchScope = Object.freeze({
  hittingar: true,
  permanentGroups: true,
  voice: true,
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
