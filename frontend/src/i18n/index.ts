import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import thCommon from './locales/th/common.json'
import thFollowUp from './locales/th/followUp.json'
import enFollowUp from './locales/en/followUp.json'
import thNav from './locales/th/nav.json'
import thLogin from './locales/th/login.json'
import thChangePassword from './locales/th/changePassword.json'
import thDashboard from './locales/th/dashboard.json'
import thClients from './locales/th/clients.json'
import thTreatments from './locales/th/treatments.json'
import thTreatmentItems from './locales/th/treatmentItems.json'
import thLabWork from './locales/th/labWork.json'
import thDentists from './locales/th/dentists.json'
import thUsers from './locales/th/users.json'
import thAudit from './locales/th/audit.json'
import thBackups from './locales/th/backups.json'
import thReceipts from './locales/th/receipts.json'
import thTrash from './locales/th/trash.json'
import thAccount from './locales/th/account.json'
import thErrors from './locales/th/errors.json'

import enCommon from './locales/en/common.json'
import enNav from './locales/en/nav.json'
import enLogin from './locales/en/login.json'
import enChangePassword from './locales/en/changePassword.json'
import enDashboard from './locales/en/dashboard.json'
import enClients from './locales/en/clients.json'
import enTreatments from './locales/en/treatments.json'
import enTreatmentItems from './locales/en/treatmentItems.json'
import enLabWork from './locales/en/labWork.json'
import enDentists from './locales/en/dentists.json'
import enUsers from './locales/en/users.json'
import enAudit from './locales/en/audit.json'
import enBackups from './locales/en/backups.json'
import enReceipts from './locales/en/receipts.json'
import enTrash from './locales/en/trash.json'
import enAccount from './locales/en/account.json'
import enErrors from './locales/en/errors.json'

import { useLanguageStore } from '@/stores/languageStore'

export const defaultNS = 'common'

const resources = {
  th: {
    followUp: thFollowUp,
    common: thCommon,
    nav: thNav,
    login: thLogin,
    changePassword: thChangePassword,
    dashboard: thDashboard,
    clients: thClients,
    treatments: thTreatments,
    treatmentItems: thTreatmentItems,
    labWork: thLabWork,
    dentists: thDentists,
    users: thUsers,
    audit: thAudit,
    backups: thBackups,
    receipts: thReceipts,
    trash: thTrash,
    account: thAccount,
    errors: thErrors,
  },
  en: {
    followUp: enFollowUp,
    common: enCommon,
    nav: enNav,
    login: enLogin,
    changePassword: enChangePassword,
    dashboard: enDashboard,
    clients: enClients,
    treatments: enTreatments,
    treatmentItems: enTreatmentItems,
    labWork: enLabWork,
    dentists: enDentists,
    users: enUsers,
    audit: enAudit,
    backups: enBackups,
    receipts: enReceipts,
    trash: enTrash,
    account: enAccount,
    errors: enErrors,
  },
} as const

i18n.use(initReactI18next).init({
  resources,
  lng: useLanguageStore.getState().language,
  fallbackLng: 'th',
  defaultNS,
  ns: Object.keys(resources.th),
  interpolation: { escapeValue: false },
  returnNull: false,
})

// Keep i18next in sync whenever the language store changes (e.g. via the
// header toggle), without every consumer needing to call i18n.changeLanguage
// itself.
useLanguageStore.subscribe((state) => {
  if (i18n.language !== state.language) {
    i18n.changeLanguage(state.language)
  }
})

export default i18n
