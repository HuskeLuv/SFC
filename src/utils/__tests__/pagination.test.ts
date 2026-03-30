import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { parsePaginationParams, paginatedResponse } from '../pagination';

const createRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/test');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
};

describe('parsePaginationParams', () => {
  it('returns null when no page or limit params', () => {
    const result = parsePaginationParams(createRequest());
    expect(result).toBeNull();
  });

  it('parses valid page and limit', () => {
    const result = parsePaginationParams(createRequest({ page: '2', limit: '20' }));
    expect(result).toEqual({ page: 2, limit: 20, skip: 20, take: 20 });
  });

  it('defaults page to 1 when only limit is provided', () => {
    const result = parsePaginationParams(createRequest({ limit: '10' }));
    expect(result).toEqual({ page: 1, limit: 10, skip: 0, take: 10 });
  });

  it('defaults limit to 50 when only page is provided', () => {
    const result = parsePaginationParams(createRequest({ page: '3' }));
    expect(result).toEqual({ page: 3, limit: 50, skip: 100, take: 50 });
  });

  it('clamps page to minimum 1', () => {
    const result = parsePaginationParams(createRequest({ page: '0', limit: '10' }));
    expect(result!.page).toBe(1);
    expect(result!.skip).toBe(0);
  });

  it('clamps negative page to 1', () => {
    const result = parsePaginationParams(createRequest({ page: '-5', limit: '10' }));
    expect(result!.page).toBe(1);
  });

  it('clamps limit to max 200', () => {
    const result = parsePaginationParams(createRequest({ page: '1', limit: '500' }));
    expect(result!.limit).toBe(200);
    expect(result!.take).toBe(200);
  });

  it('defaults limit to 50 when value is 0', () => {
    const result = parsePaginationParams(createRequest({ page: '1', limit: '0' }));
    expect(result!.limit).toBe(50);
  });

  it('handles non-numeric values gracefully', () => {
    const result = parsePaginationParams(createRequest({ page: 'abc', limit: 'xyz' }));
    expect(result).toEqual({ page: 1, limit: 50, skip: 0, take: 50 });
  });

  it('floors decimal values', () => {
    const result = parsePaginationParams(createRequest({ page: '2.7', limit: '15.9' }));
    expect(result).toEqual({ page: 2, limit: 15, skip: 15, take: 15 });
  });
});

describe('paginatedResponse', () => {
  it('calculates totalPages correctly', () => {
    const result = paginatedResponse(['a', 'b'], 10, 1, 3);
    expect(result.pagination.totalPages).toBe(4); // ceil(10/3)
  });

  it('sets hasNextPage true when not on last page', () => {
    const result = paginatedResponse(['a'], 10, 1, 5);
    expect(result.pagination.hasNextPage).toBe(true);
  });

  it('sets hasNextPage false on last page', () => {
    const result = paginatedResponse(['a'], 10, 2, 5);
    expect(result.pagination.hasNextPage).toBe(false);
  });

  it('sets hasPreviousPage false on first page', () => {
    const result = paginatedResponse(['a'], 10, 1, 5);
    expect(result.pagination.hasPreviousPage).toBe(false);
  });

  it('sets hasPreviousPage true on page 2+', () => {
    const result = paginatedResponse(['a'], 10, 2, 5);
    expect(result.pagination.hasPreviousPage).toBe(true);
  });

  it('handles empty data array', () => {
    const result = paginatedResponse([], 0, 1, 10);
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.totalPages).toBe(1);
    expect(result.pagination.hasNextPage).toBe(false);
  });

  it('returns correct data and metadata', () => {
    const items = [{ id: 1 }, { id: 2 }];
    const result = paginatedResponse(items, 25, 3, 10);
    expect(result).toEqual({
      data: items,
      pagination: {
        page: 3,
        limit: 10,
        total: 25,
        totalPages: 3,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    });
  });
});
