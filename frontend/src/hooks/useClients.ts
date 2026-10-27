import { useCallback } from 'react'
import { api } from '@/lib/api'
import type { Client, ClientInput, ClientListResponse } from '@/types'

export interface ClientListParams {
  q?: string
  hn?: string
  hnFrom?: string
  hnTo?: string
  name?: string
  firstName?: string
  lastName?: string
  phoneNumber?: string
  nationalId?: string
  hasOrtho?: boolean
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  page?: number
  limit?: number | 'all' // 'all' = no pagination (e.g. CSV export)
}

// Plain axios-backed CRUD helpers (no React Query — the project keeps data
// fetching simple with useState/useEffect in the pages).
export function useClients() {
  const fetchClients = useCallback(
    async (params: ClientListParams = {}): Promise<ClientListResponse> => {
      const { data } = await api.get<ClientListResponse>('/api/clients', {
        params: {
          q: params.q || undefined,
          hn: params.hn || undefined,
          hnFrom: params.hnFrom || undefined,
          hnTo: params.hnTo || undefined,
          name: params.name || undefined,
          firstName: params.firstName || undefined,
          lastName: params.lastName || undefined,
          phoneNumber: params.phoneNumber || undefined,
          nationalId: params.nationalId || undefined,
          hasOrtho: params.hasOrtho ? 'true' : undefined,
          sortBy: params.sortBy || undefined,
          sortDir: params.sortDir || undefined,
          page: params.page ?? 1,
          limit: params.limit ?? 10,
        },
      })
      return data
    },
    []
  )

  const fetchClient = useCallback(async (id: string): Promise<Client> => {
    const { data } = await api.get<Client>(`/api/clients/${id}`)
    return data
  }, [])

  const createClient = useCallback(
    async (input: ClientInput): Promise<Client> => {
      const { data } = await api.post<Client>('/api/clients', input)
      return data
    },
    []
  )

  const updateClient = useCallback(
    async (id: string, input: ClientInput): Promise<Client> => {
      const { data } = await api.put<Client>(`/api/clients/${id}`, input)
      return data
    },
    []
  )

  const deleteClient = useCallback(async (id: string): Promise<void> => {
    await api.delete(`/api/clients/${id}`)
  }, [])

  const restoreClient = useCallback(async (id: string): Promise<void> => {
    await api.patch(`/api/clients/${id}/restore`)
  }, [])

  const fetchClientCount = useCallback(async (): Promise<number> => {
    const { data } = await api.get<{ count: number }>('/api/clients/count')
    return data.count
  }, [])

  // Reserve (consume) the next HN so it can be shown before submit.
  const reserveHn = useCallback(async (): Promise<{ hn: string; version: number }> => {
    const { data } = await api.post<{ hn: string; version: number }>('/api/clients/reserve-hn')
    return data
  }, [])

  // Best-effort rollback of a reserved-but-unused HN (server only rolls back if
  // it's still the newest, unused number).
  const releaseHn = useCallback(async (hn: string, version: number): Promise<void> => {
    try {
      await api.post('/api/clients/release-hn', { hn, version })
    } catch {
      // ignore — leaving the gap is harmless
    }
  }, [])

  return {
    fetchClients,
    fetchClient,
    createClient,
    updateClient,
    deleteClient,
    fetchClientCount,
    reserveHn,
    releaseHn,
    restoreClient,
  }
}
