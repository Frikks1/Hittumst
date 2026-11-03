export function onboardingChecklistCopy(locale: 'is' | 'en') {
  return locale === 'is' ? {
    title: 'Gerðu fyrstu kynnin auðveldari', body: 'Valfrjáls skref sem hjálpa fólki að kynnast þér.',
    photo: 'Bættu við mynd', prompt: 'Skrifaðu samtalskveikju', interests: 'Veldu áhugamál', conversation: 'Hefðu samtal',
    dismiss: 'Sleppa í bili', completed: 'Lokið', open: 'Opna', progress: (done: number) => `${done} af 4 lokið`,
    restored: 'Drögin þín hafa verið endurheimt. Samþykktu núverandi skilmála aftur áður en þú heldur áfram.',
    draftUnavailable: 'Ekki tókst að vista drög í þessu tæki. Haltu áfram til að klára prófílinn.',
  } : {
    title: 'Make your first connection easier', body: 'Optional steps to help people get to know you.',
    photo: 'Add a photo', prompt: 'Write a conversation prompt', interests: 'Choose interests', conversation: 'Start a conversation',
    dismiss: 'Dismiss for now', completed: 'Completed', open: 'Open', progress: (done: number) => `${done} of 4 completed`,
    restored: 'Your draft has been restored. Accept the current terms again before continuing.',
    draftUnavailable: 'Your draft could not be saved on this device. Continue to finish your profile.',
  };
}
