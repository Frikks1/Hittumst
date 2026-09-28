import { profileTagById } from './profileTags';
const labels: Record<string, string> = {
  anime: 'Anime', 'apres-ski': 'Eftir skíði', art: 'Listir', beach: 'Ströndin', brunch: 'Dögurður', concerts: 'Tónleikar', cooking: 'Matreiðsla', dancing: 'Dans', diy: 'Handverk', fashion: 'Tíska', gaming: 'Tölvuleikir', gym: 'Líkamsrækt', hiking: 'Gönguferðir', karaoke: 'Karaókí', movies: 'Kvikmyndir', music: 'Tónlist', naps: 'Lúr', pickleball: 'Spaðabolti', popmusic: 'Popptónlist', reading: 'Bækur', rpdr: 'Drag Race', tattoos: 'Húðflúr', tennis: 'Tennis', theater: 'Leikhús', tv: 'Sjónvarp', weightlifting: 'Lyftingar', workingout: 'Æfingar', writing: 'Skrif', yoga: 'Jóga',
};
export function interestLabel(id: string, locale: 'is' | 'en') { return (locale === 'is' ? labels[id] : undefined) ?? profileTagById.get(id)?.label ?? id; }
