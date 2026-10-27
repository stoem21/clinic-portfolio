// Cascading Thai address lookup (province → district → sub-district → zip).
//
// Data source: `thaiGeoData.json`, vendored from the `geothai` npm package
// (MIT License, Copyright (c) 2024-Present GeoThai — see
// docs/licenses/geothai-MIT.txt and THIRD_PARTY_NOTICES.md) — 77 provinces / 928 districts / 7,436
// subdistricts, each with a verified `name_th` AND `name_en` field, so the
// same dataset serves both UI languages without any transliteration
// guesswork on our part.
//
// geothai's own published API (`getAllProvinces()` etc.) reads its data
// files off disk via `node:fs` at call time — it's a Node.js-only package
// (see its package.json: "for Node.js", `engines.node >= 20`) and throws
// immediately in a browser. We only use its underlying JSON data file, not
// its API, and implement the flatten/search logic ourselves below.
//
// The dataset (~2.6 MB) is dynamically imported so it only loads once a
// user actually opens the address section of the client form, rather than
// shipping in the main app bundle.
import type { Language } from '@/stores/languageStore'

type NamedEntry = {
  name_th: string
  name_en: string
  name_th_lower: string
  name_en_lower: string
}

type Subdistrict = NamedEntry & {
  code: number
  district_code: number
  province_code: number
  postal_code: number
}

type District = NamedEntry & {
  code: number
  province_code: number
  subdistricts: Subdistrict[]
}

type Province = NamedEntry & {
  code: number
  districts: District[]
}

function nameOf(entry: NamedEntry, lang: Language): string {
  return lang === 'en' ? entry.name_en : entry.name_th
}
function lowerOf(entry: NamedEntry, lang: Language): string {
  return lang === 'en' ? entry.name_en_lower : entry.name_th_lower
}

const MAX_RESULTS = 20

interface GeoIndex {
  provinces: Province[]
  districts: District[]
  subdistricts: Subdistrict[]
}

let geo: GeoIndex | null = null
let loading: Promise<GeoIndex> | null = null

// Kick off (or reuse) the lazy load. Callers that need the UI to react once
// data becomes available should await this in a useEffect and trigger a
// re-render — the search functions below simply return [] until it resolves.
export function ensureAddressDataLoaded(): Promise<GeoIndex> {
  if (geo) return Promise.resolve(geo)
  if (!loading) {
    loading = import('./thaiGeoData.json').then((m) => {
      const provinces = m.default as unknown as Province[]
      const districts = provinces.flatMap((p) => p.districts)
      const subdistricts = districts.flatMap((d) => d.subdistricts)
      geo = { provinces, districts, subdistricts }
      return geo
    })
  }
  return loading
}

export function isAddressDataLoaded(): boolean {
  return geo !== null
}

// Distinct province names matching the typed text.
export function searchProvinces(query: string, lang: Language): string[] {
  const q = query.trim().toLowerCase()
  if (!q || !geo) return []
  const out: string[] = []
  for (const p of geo.provinces) {
    if (lowerOf(p, lang).includes(q)) {
      out.push(nameOf(p, lang))
      if (out.length >= MAX_RESULTS) break
    }
  }
  return out
}

// Distinct districts (อำเภอ/เขต) within a province, optionally filtered by text.
export function listDistricts(province: string, lang: Language, query = ''): string[] {
  if (!geo) return []
  const provinceEntry = geo.provinces.find((p) => nameOf(p, lang) === province)
  if (!provinceEntry) return []
  const q = query.trim().toLowerCase()
  const out: string[] = []
  for (const d of geo.districts) {
    if (d.province_code !== provinceEntry.code) continue
    if (q && !lowerOf(d, lang).includes(q)) continue
    out.push(nameOf(d, lang))
  }
  return out
}

// Sub-districts (ตำบล/แขวง) within a province+district, each with its zip code.
export function listSubDistricts(
  province: string,
  district: string,
  lang: Language,
  query = ''
): { subDistrict: string; zipCode: string }[] {
  if (!geo) return []
  const provinceEntry = geo.provinces.find((p) => nameOf(p, lang) === province)
  if (!provinceEntry) return []
  const districtEntry = geo.districts.find(
    (d) => d.province_code === provinceEntry.code && nameOf(d, lang) === district
  )
  if (!districtEntry) return []
  const q = query.trim().toLowerCase()
  const out: { subDistrict: string; zipCode: string }[] = []
  for (const s of geo.subdistricts) {
    if (s.district_code !== districtEntry.code) continue
    if (q && !lowerOf(s, lang).includes(q)) continue
    out.push({ subDistrict: nameOf(s, lang), zipCode: String(s.postal_code) })
  }
  return out
}
