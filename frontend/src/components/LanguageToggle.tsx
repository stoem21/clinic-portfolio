import { Languages } from 'lucide-react'

import { useLanguageStore } from '@/stores/languageStore'
import { cn } from '@/lib/utils'

// Compact TH/EN toggle: the button always shows the language you'd switch
// *to*, matching the common pattern for this kind of control.
export function LanguageToggle({ className }: { className?: string }) {
  const language = useLanguageStore((s) => s.language)
  const setLanguage = useLanguageStore((s) => s.setLanguage)
  return (
    <button
      type="button"
      onClick={() => setLanguage(language === 'th' ? 'en' : 'th')}
      className={cn(
        'flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50',
        className
      )}
    >
      <Languages className="h-4 w-4" />
      {language === 'th' ? 'EN' : 'TH'}
    </button>
  )
}
