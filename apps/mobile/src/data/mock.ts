import type { ChatMessage, ConversationSummary, OwnProfile, PublicProfile } from '@/types/domain';

const photo = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=82`;

export const mockOwnProfile: OwnProfile = {
  id: 'demo-me', gender:'man', friendsOfFriendsDiscovery:false, displayName: 'Aron', age: 29, dateOfBirth: '1997-04-12', pronouns: 'hann/hans',
  identity: ['gay'], lookingFor: ['chat', 'dates'], bio: 'Hönnuður, sundmaður og óþarflega mikill kaffinörd.',
  tags: ['gaming', 'gym', 'kissing', 'dating'], customTags: ['coffee lover'],
  videos: [], profileVideos: [], socials: [], interests: ['Sund', 'Kaffi', 'Hönnun'],
  region: 'capital', isOnline: true, isHidden: false, showOnline: true, locationSharing: true,
  photos: [{ id: 'mine-1', url: photo('photo-1500648767791-00dcc994a43e'), status: 'approved' }]
};

export const mockProfiles: PublicProfile[] = [
  {
    id: 'p-bjarni', gender:'man', displayName: 'Bjarni', age: 31, pronouns: 'hann/hans', identity: ['gay'],
    lookingFor: ['dates', 'relationship'], bio: 'Arkitekt. Fjöll, jazz og sunnudagskaffi.', region: 'capital',
    tags: ['hiking', 'music', 'romantic', 'dating'], customTags: [],
    videos: [], profileVideos: [], socials: [{ platform: 'instagram', handle: '@bjarni' }], interests: ['Arkitektúr', 'Jazz'],
    isOnline: true, distanceBand: 'under1', photos: [{ id: 'b-1', url: photo('photo-1507003211169-0a1dd7228f2d'), status: 'approved' }]
  },
  {
    id: 'p-elias', gender:'man', displayName: 'Elías', age: 26, pronouns: 'hann/hans', identity: ['bi'],
    lookingFor: ['chat', 'friends'], bio: 'Nýkominn heim. Segðu mér hvar besta súpan er.', region: 'capital',
    tags: ['cooking', 'gaming', 'chill'],
    videos: [], profileVideos: [], customTags: [], socials: [], interests: ['Súpa', 'Leikjaspil'],
    isOnline: true, distanceBand: '1to3', photos: [{ id: 'e-1', url: photo('photo-1506794778202-cad84cf45f1d'), status: 'approved' }]
  },
  {
    id: 'p-salka', gender:'woman', displayName: 'Salka', age: 34, pronouns: 'hún/hennar', identity: ['lesbian', 'queer'],
    lookingFor: ['friends', 'dates'], bio: 'Keramik, kuldi og langar göngur.', region: 'capital',
    tags: ['art', 'hiking', 'kind'],
    videos: [], profileVideos: [], customTags: [], socials: [], interests: ['Keramik', 'Göngur'],
    isOnline: false, distanceBand: '1to3', photos: [{ id: 's-1', url: photo('photo-1494790108377-be9c29b29330'), status: 'approved' }]
  },
  {
    id: 'p-noa', gender:'nonbinary', diagnosisIds:['adhd'], displayName: 'Nóa', age: 24, pronouns: 'hán/háns', identity: ['nonbinary', 'queer'],
    lookingFor: ['chat', 'friends'], bio: 'Tónlist, plöntur og skrýtnar kvikmyndir.', region: 'capital',
    tags: ['movies', 'music', 'anime'],
    videos: [], profileVideos: [], customTags: [], socials: [{ platform: 'tiktok', handle: '@noa' }], interests: ['Plöntur', 'Kvikmyndir'],
    isOnline: true, distanceBand: '3to10', photos: [{ id: 'n-1', url: photo('photo-1527980965255-d3b416303d12'), status: 'approved' }]
  },
  {
    id: 'p-dagur', gender:'man', displayName: 'Dagur', age: 38, pronouns: 'hann/hans', identity: ['gay'],
    lookingFor: ['relationship'], bio: 'Matreiðslumaður með veiðidellu og hund.', region: 'south',
    tags: ['cooking', 'dogperson', 'mature'],
    videos: [], profileVideos: [], customTags: [], socials: [], interests: ['Matreiðsla', 'Veiði'],
    isOnline: false, distanceBand: null, photos: [{ id: 'd-1', url: photo('photo-1534528741775-53994a69daeb'), status: 'approved' }]
  },
  {
    id: 'p-embla', gender:'woman', displayName: 'Embla', age: 28, pronouns: 'hún/hennar', identity: ['trans', 'queer'],
    lookingFor: ['dates', 'friends'], bio: 'Forritari, plötusafnari og eilíf næturugla.', region: 'capital',
    tags: ['music', 'geek', 'trans'],
    videos: [], profileVideos: [], customTags: [], socials: [], interests: ['Forritun', 'Plötur'],
    isOnline: false, distanceBand: '3to10', photos: [{ id: 'em-1', url: photo('photo-1531123897727-8f129e1688ce'), status: 'approved' }]
  },
  {
    id: 'p-oli', displayName: 'Óli', age: 42, pronouns: 'hann/hans', identity: ['gay'],
    lookingFor: ['chat', 'friends'], bio: 'Úr Eyjafirði. Hljóðbækur og heitir pottar.', region: 'north',
    tags: ['reading', 'sauna', 'bear'],
    videos: [], profileVideos: [], customTags: [], socials: [], interests: ['Hljóðbækur', 'Heitir pottar'],
    isOnline: false, distanceBand: '10to25', photos: [{ id: 'o-1', url: photo('photo-1560250097-0b93528c311a'), status: 'approved' }]
  },
  {
    id: 'p-kari', displayName: 'Kári', age: 23, pronouns: 'hann/hans', identity: ['bi'],
    lookingFor: ['chat', 'dates'], bio: 'Nemandi og klifurkappi. Kenndu mér eitthvað nýtt.', region: 'west',
    tags: ['gaming', 'gym', 'adventurous', 'college'],
    videos: [], profileVideos: [], customTags: [], socials: [], interests: ['Klifur', 'Leikjaspil'],
    isOnline: true, distanceBand: '10to25', photos: [{ id: 'k-1', url: photo('photo-1507591064344-4c6ce005b128'), status: 'approved' }]
  }
];

export const mockMessages: Record<string, ChatMessage[]> = {
  'c-bjarni': [
    { id: 'm-1', conversationId: 'c-bjarni', senderId: 'p-bjarni', kind: 'text', body: 'Hæ! Sástu norðurljósin í gær?', createdAt: '2026-08-31T19:02:00.000Z', status: 'sent' },
    { id: 'm-2', conversationId: 'c-bjarni', senderId: 'demo-me', kind: 'text', body: 'Já, ótrúlega skýr yfir Öskjuhlíðinni ✨', createdAt: '2026-08-31T19:04:00.000Z', status: 'sent' },
    { id: 'm-3', conversationId: 'c-bjarni', senderId: 'p-bjarni', kind: 'text', body: 'Kaffi og norðurljósaspá á morgun?', createdAt: '2026-08-31T19:07:00.000Z', status: 'sent' },
    { id: 'm-5', conversationId: 'c-bjarni', senderId: 'p-bjarni', kind: 'album_share', body: 'Private album request', albumShareId: 'share-bjarni', createdAt: '2026-08-31T19:08:00.000Z', status: 'sent' }
  ],
  'c-noa': [
    { id: 'm-4', conversationId: 'c-noa', senderId: 'p-noa', kind: 'text', body: 'Þessi plötubúð sem þú nefndir var frábær!', createdAt: '2026-08-30T15:42:00.000Z', status: 'sent' }
  ]
};

export const mockConversations: ConversationSummary[] = [
  { id: 'c-bjarni', member: mockProfiles[0]!, lastMessage: 'Private album request', lastMessageAt: '2026-08-31T19:08:00.000Z', unreadCount: 1 },
  { id: 'c-noa', member: mockProfiles[3]!, lastMessage: 'Þessi plötubúð sem þú nefndir var frábær!', lastMessageAt: '2026-08-30T15:42:00.000Z', unreadCount: 0 }
];
