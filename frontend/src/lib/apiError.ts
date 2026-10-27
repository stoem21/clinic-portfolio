import { AxiosError } from 'axios'

import i18n from '@/i18n'

interface ApiErrorData {
  code?: unknown
  message?: unknown
  params?: unknown
}

// Pull a human message off an API error. The backend returns a Thai
// `message` on every error response, and — for the subset of responses
// covered so far — a stable `code` alongside it. Prefer a translated lookup
// by `code` (works in both languages); fall back to the server's raw
// `message` (Thai) if the code is missing or not yet in the `errors`
// dictionary, so nothing breaks for responses that haven't been migrated to
// carry a code yet; fall back to a generic message as a last resort.
export function getApiErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as ApiErrorData | undefined
    if (data) {
      if (typeof data.code === 'string') {
        const key = `errors:${data.code}`
        if (i18n.exists(key)) {
          const params =
            data.params && typeof data.params === 'object'
              ? (data.params as Record<string, unknown>)
              : undefined
          return i18n.t(key, params)
        }
      }
      if (typeof data.message === 'string' && data.message.trim()) {
        return data.message
      }
    }
  }
  return i18n.t('common:genericError')
}
