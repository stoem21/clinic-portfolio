// Maps a treatment item's `type` to a function that decides which special
// reporting category (if any) its cost belongs to, based on that item's own
// `data`. Each entry is self-contained — e.g. the X-ray resolver only looks at
// filmType; a future "lab cost" resolver for some other type would check
// whatever field is relevant to *it*, with no shared logic between entries.
// Items whose type has no resolver, or whose resolver returns null, report
// under their own `type` exactly as before (see dashboard.ts).
type CostCategoryResolver = (data: Record<string, unknown>) => string | null;

const COST_CATEGORY_RESOLVERS: Partial<Record<string, CostCategoryResolver>> = {
  supply: () => 'supply',
  // NOTE: reads XRayData's filmType/type shape (frontend/src/types/index.ts,
  // frontend/src/components/treatment/XRayForm.tsx) — keep in sync if that changes.
  xRay: (data) => {
    const filmType = Array.isArray(data.filmType) ? (data.filmType as string[]) : [];
    return data.type === 'big' && filmType.includes('opg') ? 'xRayOpg' : null;
  },
};

export function resolveCostCategory(item: { type: string; data: unknown }): string | null {
  const resolver = COST_CATEGORY_RESOLVERS[item.type];
  return resolver ? resolver((item.data ?? {}) as Record<string, unknown>) : null;
}
