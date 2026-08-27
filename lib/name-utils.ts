import type { Scholar } from "@/types";
import { normalizeAuthorName } from "@/lib/scholar-identity";

export function normalizeName(name: string): string {
  return normalizeAuthorName(name);
}

export function namesMatch(name: string, scholar: Scholar): boolean {
  const candidate = normalizeName(name);
  return [scholar.name, ...(scholar.aliases ?? [])].some(
    (value) => normalizeName(value) === candidate,
  );
}
