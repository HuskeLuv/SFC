import { NextRequest } from 'next/server';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Parse pagination query params from a request.
 * Returns null if neither `page` nor `limit` is present (backwards compatibility).
 */
export function parsePaginationParams(request: NextRequest): PaginationParams | null {
  const url = new URL(request.url);
  const rawPage = url.searchParams.get('page');
  const rawLimit = url.searchParams.get('limit');

  if (rawPage === null && rawLimit === null) {
    return null;
  }

  const page = Math.max(1, Math.floor(Number(rawPage) || 1));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(rawLimit) || DEFAULT_LIMIT)));
  const skip = (page - 1) * limit;

  return { page, limit, skip, take: limit };
}

/**
 * Build a paginated response envelope.
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponse<T> {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}
