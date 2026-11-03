export function sendData(res, data, status = 200, meta) {
  const body = { data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export function readPage(query) {
  const page = query.page || 1;
  const limit = query.limit || 20;
  return { page, limit, skip: (page - 1) * limit };
}
