export interface PaginationInput {
  query: Record<string, unknown>;
}

export function parsePagination(
  req: PaginationInput,
  defaultLimit = 50,
  maxLimit = 200,
): { limit: number; offset: number } {
  const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : defaultLimit;
  const rawOffset = typeof req.query.offset === 'string' ? Number(req.query.offset) : 0;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), maxLimit)
    : defaultLimit;
  const offset = Number.isFinite(rawOffset) ? Math.max(Math.trunc(rawOffset), 0) : 0;
  return { limit, offset };
}
