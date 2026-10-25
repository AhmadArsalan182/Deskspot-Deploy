/** Shared pagination helpers for list endpoints. */

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../domain/constants.js";

export function parsePagination(query = {}, { defaultPageSize = DEFAULT_PAGE_SIZE, maxPageSize = MAX_PAGE_SIZE } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const requested = Number.parseInt(query.pageSize, 10) || defaultPageSize;
  const pageSize = Math.min(Math.max(1, requested), maxPageSize);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginationMeta({ total, page, pageSize }) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
