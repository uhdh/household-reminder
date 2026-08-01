/**
 * Investment product names come from different workbook sections. Normalize
 * harmless formatting differences before matching or aggregating them.
 */
export function normalizeInvestmentProductName(name: string): string {
  return name.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim();
}
