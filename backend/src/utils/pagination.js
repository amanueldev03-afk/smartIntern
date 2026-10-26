export const paginate = (req, totalCount, results, defaultPageSize = 20) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size, 10) || defaultPageSize));
  const totalPages = Math.ceil(totalCount / pageSize);

  const fullUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`;
  const queryParams = new URLSearchParams(req.query);

  let next = null;
  if (page < totalPages) {
    queryParams.set('page', page + 1);
    queryParams.set('page_size', pageSize);
    next = `${fullUrl}?${queryParams.toString()}`;
  }

  let previous = null;
  if (page > 1) {
    queryParams.set('page', page - 1);
    queryParams.set('page_size', pageSize);
    previous = `${fullUrl}?${queryParams.toString()}`;
  }

  return {
    count: totalCount,
    next,
    previous,
    results,
  };
};

export const getPaginationParams = (req, defaultPageSize = 20) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size, 10) || defaultPageSize));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset, limit: pageSize };
};
