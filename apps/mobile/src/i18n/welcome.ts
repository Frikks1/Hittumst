const en = {
  title: 'Find your people.',
  body: 'A little hello. A real connection. Meet LGBTQ+ people across Iceland.',
  welcome: 'Welcome to Hittumst',
  facebook: 'Continue with Facebook',
  instagram: 'Add Instagram to your profile',
  instagramBody: 'Sign in with email, Apple, Google or Facebook, then add your Instagram handle to your profile. You choose what to share.',
  social: 'Or continue with',
  private: 'Your profile. Your pace.',
  privateBody: 'We never post to your social accounts.',
  language: 'Change language',
};
const is: typeof en = {
  title: 'Finndu þitt fólk.',
  body: 'Lítil kveðja. Ný kynni. Hittu hinsegin fólk um allt Ísland.',
  welcome: 'Velkomin á Hittumst',
  facebook: 'Halda áfram með Facebook',
  instagram: 'Bæta Instagram við prófílinn',
  instagramBody: 'Skráðu þig inn með netfangi, Apple, Google eða Facebook og bættu svo Instagram-notandanafninu við prófílinn. Þú velur hverju þú deilir.',
  social: 'Eða haltu áfram með',
  private: 'Þinn prófíll. Þinn hraði.',
  privateBody: 'Við birtum aldrei á samfélagsmiðlareikningunum þínum.',
  language: 'Breyta tungumáli',
};
export const welcomeCopy = (locale: 'is' | 'en') => locale === 'is' ? is : en;
