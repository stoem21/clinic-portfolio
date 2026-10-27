// Replace this catalog with real companies later; persist stable IDs on jobs.
export const LAB_COMPANIES = [
  { id: "mock-a", name: "Demo Dental Lab A" },
  { id: "mock-b", name: "Demo Dental Lab B" },
  { id: "mock-c", name: "Demo Dental Lab C" },
];
export function validLabCompany(id: unknown): id is string {
  return typeof id === "string" && LAB_COMPANIES.some((c) => c.id === id);
}
