export function birthdayPickerCopy(locale: 'is' | 'en') {
  return locale === 'is' ? {
    months: ['janúar', 'febrúar', 'mars', 'apríl', 'maí', 'júní', 'júlí', 'ágúst', 'september', 'október', 'nóvember', 'desember'],
    weekdays: ['sunnudagur', 'mánudagur', 'þriðjudagur', 'miðvikudagur', 'fimmtudagur', 'föstudagur', 'laugardagur'],
    weekdaysShort: ['sun', 'mán', 'þri', 'mið', 'fim', 'fös', 'lau'],
    choose: 'Veldu fæðingardag', chooseMonth: 'Veldu mánuð', chooseYear: 'Veldu fæðingarár',
    month: 'Mánuður', year: 'Ár', previous: 'Fyrri mánuður', next: 'Næsti mánuður',
    apply: 'Nota dagsetningu', cancel: 'Hætta við', back: 'Aftur í dagatal',
    hint: 'Veldu ár, mánuð og dag. Aðeins gildar dagsetningar fyrir 18 ára og eldri eru í boði.',
    keyboard: 'Örvatakkar færa dag. Page Up og Page Down skipta um mánuð; Shift skiptir um ár.',
  } : {
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    weekdaysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    choose: 'Choose your birthday', chooseMonth: 'Choose month', chooseYear: 'Choose birth year',
    month: 'Month', year: 'Year', previous: 'Previous month', next: 'Next month',
    apply: 'Use date', cancel: 'Cancel', back: 'Back to calendar',
    hint: 'Choose a year, month and day. Only valid dates for people aged 18 or older are available.',
    keyboard: 'Arrow keys move by day. Page Up and Page Down change month; Shift changes year.',
  };
}

/** Explicit copy avoids platform Intl implementations falling back from Icelandic to English. */
export function birthdayDateLabel(date: Date, locale: 'is' | 'en', weekday = true): string {
  const copy = birthdayPickerCopy(locale);
  const label = `${date.getUTCDate()}${locale === 'is' ? '.' : ''} ${copy.months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  return weekday ? `${copy.weekdays[date.getUTCDay()]}, ${label}` : label;
}
