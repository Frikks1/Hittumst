export function straxCopy(locale: 'is' | 'en') {
  const is = locale === 'is';
  const c = (isText: string, enText: string) => (is ? isText : enText);
  return {
    title: 'Strax',
    tagline: c('Akkúrat núna · gildir í 4 klst.', 'Right now · live for 4 hours'),
    intro: c(
      'Finndu félagsskap fyrir eitthvað stutt, í dag.',
      'Find company for something quick, today.',
    ),
    create: c('Búa til Strax', 'Create Strax'),
    publish: c('Birta Strax', 'Publish Strax'),
    name: c('Heiti athafnar *', 'Activity name *'),
    nameHint: c('T.d. Einn í viðbót í leikinn', 'e.g. One more for our game'),
    description: c('Stutt lýsing *', 'Short description *'),
    descriptionHint: c(
      'Hvað ætlarðu að gera og hvar, ef við á?',
      'What are you doing and where, if relevant?',
    ),
    dmShortcut: c(
      'Nota „Sendu mér skilaboð til að fá nánari upplýsingar“',
      'Use “DM me for more info”',
    ),
    dmText: c('Sendu mér skilaboð til að fá nánari upplýsingar.', 'DM me for more info.'),
    requirements: c('Reglur og skilyrði (valfrjálst)', 'Rules and requirements (optional)'),
    requirementsHint: c(
      'T.d. eiga leikinn, 20 ára eða eldri, hafa 2.000 kr. fyrir eigin kostnaði',
      'e.g. own the game, meet the drinking age, bring money for your own costs',
    ),
    location: c('Svæði eða staður (valfrjálst)', 'Area or place (optional)'),
    address: c('Heimilisfang (valfrjálst)', 'Address (optional)'),
    addressHint: c(
      'Heimilisfangið verður sýnilegt öllum sem skoða Strax.',
      'The address will be visible to everyone who views this Strax.',
    ),
    inPerson: c('Á staðnum', 'In person'),
    online: c('Á netinu', 'Online'),
    capacity: c('Hversu marga vantar? (valfrjálst)', 'How many people do you need? (optional)'),
    capacityHint: c(
      '1–50 til viðbótar við þig. Skildu eftir autt fyrir ótakmarkað.',
      '1–50 in addition to you. Leave empty for no limit.',
    ),
    joinMode: c('Hvernig fólk tekur þátt', 'How people join'),
    application: c('Ég samþykki umsóknir', 'I approve applications'),
    open: c('Öllum opið', 'Anyone can join'),
    applicationHint: c(
      'Þú velur hverjir taka þátt. Umsókn tekur ekki pláss.',
      'You choose who joins. Applications do not reserve a place.',
    ),
    expiresHint: c(
      'Birtist strax og rennur sjálfkrafa út eftir 4 klst. Ekkert endurtekið og engin dagsetning.',
      'Publishes immediately and automatically expires after 4 hours. No recurrence or scheduled date.',
    ),
    publicHint: c(
      'Strax birtist opinberlega í Strax og á prófílspjaldinu þínu. Sending til vina eða hópa er valfrjáls.',
      'Strax appears publicly in Strax and on your profile tile. Sharing with friends or groups is optional.',
    ),
    photo: c('Mynd (valfrjálst)', 'Photo (optional)'),
    addPhoto: c('Velja mynd', 'Choose photo'),
    removePhoto: c('Fjarlægja mynd', 'Remove photo'),
    photoHint: c(
      'Ein JPG-, PNG- eða WebP-mynd, allt að 10 MB. Birtist eftir samþykki.',
      'One JPG, PNG or WebP photo, up to 10 MB. Appears after approval.',
    ),
    photoPending: c(
      'Myndin er í yfirferð. Strax er þegar birt.',
      'The photo is under review. Your Strax is already published.',
    ),
    photoRejected: c(
      'Myndin var ekki samþykkt. Þú getur valið aðra.',
      'The photo was not approved. You can choose another.',
    ),
    photoError: c(
      'Myndin fór ekki upp. Strax er áfram birt; reyndu myndina aftur.',
      'The photo did not upload. Your Strax is still published; retry the photo.',
    ),
    photoPickError: c(
      'Veldu JPG-, PNG- eða WebP-mynd undir 10 MB og veittu aðgang að myndum.',
      'Choose a JPG, PNG or WebP photo under 10 MB and allow photo access.',
    ),
    retryPhoto: c('Reyna mynd aftur', 'Retry photo'),
    share: c('Senda til vina og hópa', 'Share with friends and groups'),
    shareHint: c(
      'Þetta sendir boð; breytir ekki opinberri sýnileika.',
      'This sends invitations; it does not change public visibility.',
    ),
    allFriends: c('Allir samþykktir vinir', 'All accepted friends'),
    friendCount: (count: number) =>
      c(
        `${count} ${count === 1 ? 'vinur' : 'vinir'}`,
        `${count} ${count === 1 ? 'friend' : 'friends'}`,
      ),
    groupCount: (count: number) =>
      c(
        `${count} ${count === 1 ? 'hópur' : 'hópar'}`,
        `${count} ${count === 1 ? 'group' : 'groups'}`,
      ),
    participantCount: (count: number) =>
      c(
        `${count} ${count === 1 ? 'þátttakandi' : 'þátttakendur'}`,
        `${count} ${count === 1 ? 'participant' : 'participants'}`,
      ),
    placesCount: (count: number) =>
      c(
        `${count} pláss ${count === 1 ? 'laust' : 'laus'}`,
        `${count} ${count === 1 ? 'place' : 'places'} available`,
      ),
    friends: c('Velja vini', 'Choose friends'),
    groups: c('Velja hópa', 'Choose groups'),
    shareNone: c('Engin boð valin', 'No invitations selected'),
    shareSent: c('Boð send', 'Invitations sent'),
    shareError: c(
      'Ekki tókst að senda boð. Strax er birt; reyndu sendinguna aftur.',
      'Invitations could not be sent. Your Strax is published; retry sharing.',
    ),
    shareLoadError: c(
      'Ekki tókst að hlaða vinum og hópum.',
      'Friends and groups could not be loaded.',
    ),
    noFriends: c('Engir samþykktir vinir enn.', 'No accepted friends yet.'),
    noGroups: c('Engir hópar tiltækir.', 'No groups available.'),
    retryShare: c('Reyna sendingu aftur', 'Retry sharing'),
    send: c('Senda boð', 'Send invitations'),
    published: c('Strax er birt!', 'Your Strax is published!'),
    view: c('Skoða Strax', 'View Strax'),
    validation: c(
      'Bættu við heiti og lýsingu. Fjöldi þarf að vera heil tala frá 1 til 50.',
      'Add a name and description. Capacity must be a whole number from 1 to 50.',
    ),
    alreadyActive: c(
      'Þú ert þegar með virkt Strax. Skoðaðu það eða lokaðu því fyrst.',
      'You already have an active Strax. View it or close it first.',
    ),
    loadError: c('Ekki tókst að hlaða Strax.', 'Strax could not be loaded.'),
    actionError: c(
      'Aðgerðin tókst ekki. Uppfærðu og reyndu aftur.',
      'The action failed. Refresh and try again.',
    ),
    empty: c('Ekkert Strax í boði núna', 'No Strax happening right now'),
    emptyHint: c(
      'Kíktu aftur síðar eða finndu félagsskap sjálf/ur.',
      'Check back soon or invite someone to join you.',
    ),
    expired: c('Þetta Strax er útrunnið', 'This Strax has expired'),
    closed: c('Höfundur hefur lokað þessu Strax', 'The host closed this Strax'),
    expiredHint: c(
      'Það birtist ekki lengur á listanum eða prófílspjöldum og ný þátttaka er lokuð.',
      'It no longer appears in the list or on profile tiles, and new participation is closed.',
    ),
    unavailable: c('Þetta Strax er ekki tiltækt', 'This Strax is unavailable'),
    unavailableHint: c(
      'Það kann að vera útrunnið eða ekki lengur sýnilegt þér.',
      'It may have expired or no longer be visible to you.',
    ),
    remaining: c('eftir', 'left'),
    lessMinute: c('Innan við mínúta eftir', 'Less than a minute left'),
    full: c('Öll pláss tekin', 'All places taken'),
    places: c('pláss laus', 'places available'),
    participants: c('þátttakendur', 'participants'),
    apply: c('Sækja um þátttöku', 'Apply to join'),
    join: c('Taka þátt', 'Join'),
    introduction: c(
      'Stutt skilaboð til höfundar (valfrjálst)',
      'Short note to the host (optional)',
    ),
    acknowledge: c(
      'Ég hef lesið reglur og uppfylli skilyrðin.',
      'I have read the rules and meet the requirements.',
    ),
    pending: c('Umsókn send · bíður samþykkis', 'Application sent · awaiting approval'),
    participationEnded: c('Þátttöku er lokið.', 'Participation has ended.'),
    applicationEnded: c('Umsóknin er ekki lengur virk.', 'This application is no longer active.'),
    joined: c('Þú tekur þátt!', 'You are joining!'),
    declined: c('Umsóknin þín var ekki samþykkt.', 'Your application was not approved.'),
    withdraw: c('Draga umsókn til baka', 'Withdraw application'),
    leave: c('Hætta við þátttöku', 'Leave'),
    message: c('Senda höfundi skilaboð', 'Message the host'),
    manage: c('Þitt Strax', 'Your Strax'),
    close: c('Loka Strax', 'Close Strax'),
    closeTitle: c('Loka þessu Strax?', 'Close this Strax?'),
    closeBody: c(
      'Ný þátttaka verður lokuð og það hverfur af listanum og prófílspjöldum.',
      'New participation closes and it disappears from the list and profile tiles.',
    ),
    requests: c('Umsóknir', 'Applications'),
    roster: c('Þátttakendur', 'Participants'),
    noRequests: c('Engar umsóknir í bið.', 'No pending applications.'),
    noParticipants: c('Enginn hefur bæst við enn.', 'Nobody has joined yet.'),
    approve: c('Samþykkja', 'Approve'),
    decline: c('Hafna', 'Decline'),
    remove: c('Fjarlægja', 'Remove'),
    report: c('Tilkynna Strax', 'Report Strax'),
    reportNotes: c('Hvað er að? *', 'What is wrong? *'),
    reportSent: c(
      'Tilkynning send. Takk fyrir að láta vita.',
      'Report sent. Thank you for letting us know.',
    ),
    mine: c('Mitt Strax', 'My Strax'),
    active: c('Í boði núna', 'Happening now'),
    refresh: c('Uppfæra', 'Refresh'),
    retry: c('Reyna aftur', 'Retry'),
    cancel: c('Hætta við', 'Cancel'),
    loading: c('Hleð…', 'Loading…'),
    notifications: c('Boð og uppfærslur', 'Invitations and updates'),
    noNotifications: c(
      'Engin Strax-boð eða uppfærslur enn.',
      'No Strax invitations or updates yet.',
    ),
    notificationKinds: {
      invited: c('Þér var boðið', 'You were invited'),
      application_received: c('Ný umsókn', 'New application'),
      approved: c('Þú varst samþykkt/ur', 'You were approved'),
      declined: c('Umsókn hafnað', 'Application declined'),
      joined: c('Nýr þátttakandi', 'Someone joined'),
      closed: c('Strax lokað', 'Strax closed'),
      removed: c('Þátttöku lokið', 'Participation ended'),
    },
  };
}
