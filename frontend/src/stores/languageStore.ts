import { create } from 'zustand'

export type Language = 'th' | 'en'

const LANGUAGE_KEY = 'language'

function loadLanguage(): Language {
  // Apply the new demo default once; subsequent language choices are retained.
  if (!localStorage.getItem('demo-thai-default-v1')) {
    localStorage.setItem(LANGUAGE_KEY, 'th')
    localStorage.setItem('demo-thai-default-v1', 'true')
  }
  const raw = localStorage.getItem(LANGUAGE_KEY)
  return raw === 'en' ? 'en' : 'th'
}

interface LanguageState {
  language: Language
  setLanguage: (language: Language) => void
}

export const useLanguageStore = create<LanguageState>((set) => ({
  language: loadLanguage(),
  setLanguage: (language) => {
    localStorage.setItem(LANGUAGE_KEY, language)
    set({ language })
  },
}))
