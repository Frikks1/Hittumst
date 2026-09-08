import type { ProfileTag, ProfileTagCategory } from '@/types/domain';

// Exact English My Tags glossary snapshot, 2026-08-31. Labels intentionally remain untranslated.
const catalog: Record<ProfileTagCategory, string[]> = {
  kinks: [
    'Anon', 'Bator', 'BB', 'BDSM', 'Bondage', 'Brat', 'Breeding', 'Bubblebutt', 'Carplay', 'Chastity', 'CMNM', 'Commando',
    'Condoms', 'Condomsonly', 'Cruising', 'Cuck', 'Cumdump', 'Cut', 'Deepthroat', 'Dirty', 'Discreet', 'DL', 'Dom', 'DTF',
    'Edging', 'Eyecontact', 'Feet', 'Femboy', 'FF', 'Fingering', 'Flexible', 'Foreplay', 'Frot', 'Furries', 'Furry', 'FWB',
    'Gear', 'GH', 'Gooner', 'Group', 'Hands', 'Hosting', 'Humiliation', 'Hung', 'JO', 'Kink', 'Kissing', 'Latex', 'Leather',
    'Limits', 'Lingerie', 'Looking', 'Married', 'Masc', 'Monogamy', 'Musk', 'Nipples', 'NSA', 'Nudist', 'Nylon', 'Oral',
    'Piercings', 'Pig', 'Pits', 'Poly', 'Public', 'Pup', 'Pupplay', 'Quickie', 'Rimming', 'Roleplay', 'Rough', 'Rubber',
    'Rugged', 'Safersex', 'Sauna', 'Sexting', 'Showoff', 'Slut', 'Socks', 'Spanking', 'Spit', 'Straight', 'Sub', 'Swallowing',
    'Tentacles', 'Thick', 'Threesome', 'Tickling', 'Toys', 'UC', 'Underwear', 'Vanilla', 'Verbal', 'Videochat', 'Visiting',
    'Watching', 'Worship', 'Wrestling', 'WS',
  ],
  hobbies: [
    'Anime', 'Apres ski', 'Art', 'Beach', 'Brunch', 'Concerts', 'Cooking', 'Dancing', 'DIY', 'Fashion', 'Gaming', 'Gym',
    'Hiking', 'Karaoke', 'Movies', 'Music', 'Naps', 'Pickleball', 'Popmusic', 'Reading', 'RPDR', 'Tattoos', 'Tennis',
    'Theater', 'Tv', 'Weightlifting', 'Workingout', 'Writing', 'Yoga',
  ],
  personality: [
    'Adventurous', 'Aquarius', 'Aries', 'Cancer', 'Capricorn', 'Catperson', 'Chill', 'Confident', 'Curious', 'Direct',
    'Dogperson', 'Fun', 'Gemini', 'Goofy', 'Kind', 'Leo', 'Libra', 'Loyal', 'Mature', 'Outgoing', 'Parent', 'Pisces',
    'Reliable', 'Romantic', 'Sagittarius', 'Scorpio', 'Shy', 'Taurus', 'Unicorn', 'Virgo',
  ],
  other: [
    'Bear', 'Beard', 'Bi', 'Chub', 'Cleancut', 'College', 'Couple', 'Cub', 'Cuddling', 'Daddy', 'Dating', 'Drag',
    'Drugfree', 'Femme', 'FTM', 'Friends', 'Gaymer', 'Geek', 'Hairy', 'Jock', 'Lesbian', 'LTR', 'Military', 'MTF',
    'Muscle', 'Nosmoking', 'Otter', 'Pic4pic', 'Poz', 'Sissy', 'Smooth', 'Sober', 'T4T', 'Trans', 'Twink', 'Twunk',
  ],
};

const toId = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export const profileTags: ProfileTag[] = (Object.entries(catalog) as Array<[ProfileTagCategory, string[]]>)
  .flatMap(([category, labels]) => labels.map((label, index) => ({ id: toId(label), label, category, sortOrder: index + 1 })));

export const profileTagById = new Map(profileTags.map((tag) => [tag.id, tag]));

