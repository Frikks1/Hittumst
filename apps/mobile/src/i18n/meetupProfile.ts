export const meetupProfileIs = {
  'event.gender.man': 'Karl', 'event.gender.woman': 'Kona', 'event.gender.nonbinary': 'Kynsegin', 'event.gender.trans_man': 'Trans karl', 'event.gender.trans_woman': 'Trans kona', 'event.gender.genderqueer': 'Genderqueer', 'event.gender.self_described': 'Önnur kynvitund',
  'event.myGender': 'Kynvitund fyrir þátttökuskilyrði', 'event.genderHint': 'Valfrjálst. Aðeins notað til að athuga þátttökuskilyrði; birtist ekki á gestalista.', 'event.notSet': 'Ekki gefið upp',

  'event.media': 'Myndir og myndskeið', 'event.mediaHint': 'Allt að 8 skrár, 50 MB hver. Fyrsta myndin er forsíðumynd. Sýnilegt öllum sem sjá viðburðinn.',
  'event.addMedia': 'Bæta við mynd eða myndskeiði', 'event.remove': 'Fjarlægja', 'event.mediaError': 'Ekki tókst að vista miðil. Hámark 50 MB; JPEG, PNG, WebP, MP4, MOV eða WebM.',
  'event.tags': 'Eigin merki', 'event.tagHint': 'Skrifaðu hvaða efni sem er. Allt að 20 merki, 40 stafir hvert.', 'event.addTag': 'Bæta við merki',
  'event.rules': 'Reglur viðburðar', 'event.prerequisites': 'Forsendur þátttöku', 'event.addSection': 'Bæta við textareit', 'event.sectionTitle': 'Fyrirsögn', 'event.sectionBody': 'Texti',
  'event.public': 'Opin skráning', 'event.request': 'Óska eftir þátttöku', 'event.invite': 'Aðeins með boði',
  'event.ages': 'Aldur þátttakenda', 'event.minAge': 'Lágmarksaldur', 'event.maxAge': 'Hámarksaldur (valfrjálst)',
  'event.limits': 'Sérstök þátttökuskilyrði', 'event.limitHint': '0 útilokar hópinn. Hærri tala takmarkar fjölda samþykktra þátttakenda. Allir samsvarandi skilmálar gilda. Aldur og kyn byggjast á upplýsingum í prófíl.',
  'event.ageRule': 'Bæta við aldursskilyrði', 'event.genderRule': 'Kyn og hámarksfjöldi', 'event.maxRsvp': 'Hámarksfjöldi', 'event.from': 'Frá aldri', 'event.to': 'Til aldurs', 'event.unlimited': 'Ótakmarkað',
  'event.reviews': 'Umsagnir', 'event.noReviews': 'Engar umsagnir enn.', 'event.reviewHint': 'Þátttakendur sem staðfesta mætingu geta skrifað umsögn eftir viðburðinn. Umsögnin birtist með nafni þínu.', 'event.reviewBody': 'Hvernig var viðburðurinn?', 'event.saveReview': 'Vista umsögn', 'event.deleteReview': 'Eyða minni umsögn',
  'event.invitations': 'Þátttökuboð', 'event.inviteHint': 'Veldu vini sem mega skrá sig. Þeir þurfa einnig að uppfylla þátttökuskilyrðin. Deildu hlekk viðburðarins með þeim.', 'event.noFriends': 'Samþykktir vinir birtast hér.', 'event.invited': 'Boð virkt',
  'event.error': 'Ekki tókst að ljúka aðgerðinni. Athugaðu skilyrðin og reyndu aftur.', 'event.saved': 'Vistað', 'event.limited': 'Þátttökuskilyrði gilda',
  'hittingar.create.error.eventProfile': 'Athugaðu merki, textareiti og aldurs- eða kynjaskilyrði (18–120 ára, hámark 0–1000).',
};
export const meetupProfileEn: Record<keyof typeof meetupProfileIs, string> = {
  'event.gender.man': 'Man', 'event.gender.woman': 'Woman', 'event.gender.nonbinary': 'Non-binary', 'event.gender.trans_man': 'Trans man', 'event.gender.trans_woman': 'Trans woman', 'event.gender.genderqueer': 'Genderqueer', 'event.gender.self_described': 'Another gender identity',
  'event.myGender': 'Gender identity for participation rules', 'event.genderHint': 'Optional. Only used to check participation rules; never displayed on the guest list.', 'event.notSet': 'Not specified',

  'event.media': 'Photos & videos', 'event.mediaHint': 'Up to 8 files, 50 MB each. The first photo is the cover. Visible to everyone who can view the event.',
  'event.addMedia': 'Add photo or video', 'event.remove': 'Remove', 'event.mediaError': 'Could not save media. Maximum 50 MB; JPEG, PNG, WebP, MP4, MOV or WebM.',
  'event.tags': 'Custom tags', 'event.tagHint': 'Choose any topic. Up to 20 tags, 40 characters each.', 'event.addTag': 'Add tag',
  'event.rules': 'Event rules', 'event.prerequisites': 'Prerequisites', 'event.addSection': 'Add information card', 'event.sectionTitle': 'Heading', 'event.sectionBody': 'Text',
  'event.public': 'Public join', 'event.request': 'Request to join', 'event.invite': 'Invite only',
  'event.ages': 'Participant ages', 'event.minAge': 'Minimum age', 'event.maxAge': 'Maximum age (optional)',
  'event.limits': 'Participation restrictions', 'event.limitHint': '0 excludes the group. A higher number caps approved participants. Every matching rule applies. Age and gender use self-reported profile information.',
  'event.ageRule': 'Add age restriction', 'event.genderRule': 'Gender and maximum RSVPs', 'event.maxRsvp': 'Maximum RSVPs', 'event.from': 'From age', 'event.to': 'To age', 'event.unlimited': 'Unlimited',
  'event.reviews': 'Reviews', 'event.noReviews': 'No reviews yet.', 'event.reviewHint': 'Participants who confirm attendance can review after the event. Reviews display your name.', 'event.reviewBody': 'How was the event?', 'event.saveReview': 'Save review', 'event.deleteReview': 'Delete my review',
  'event.invitations': 'Invitations', 'event.inviteHint': 'Choose friends who may join. They must also meet the participation rules. Share the event link with them.', 'event.noFriends': 'Accepted friends appear here.', 'event.invited': 'Invited',
  'event.error': 'Could not complete this action. Check the requirements and try again.', 'event.saved': 'Saved', 'event.limited': 'Participation restrictions apply',
  'hittingar.create.error.eventProfile': 'Check tags, information cards and age/gender restrictions (ages 18–120, limits 0–1000).',
};
