import { databaseErrorResponse } from './transactions.js';

const redactConnectionCredentials = (message) => String(message || '')
  .replace(/(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s/]+@/gi, '$1[REDACTED]@');

/** Stable HTTP error mapping for route catches and the final Express handler. */
export function routeErrorResponse(error, fallbackDetail = 'Request could not be completed.') {
  const code = error?.original?.code || error?.parent?.code || error?.code;
  const name = error?.name || 'Error';
  console.error('[API] Request failed', {
    name,
    code,
    message: redactConnectionCredentials(error?.message),
    stack: error?.stack,
  });

  if (error?.status >= 400 && error.status < 500
      && !error?.original && !error?.parent
      && !name.startsWith('Sequelize')) {
    return { status: error.status, detail: error.message || fallbackDetail };
  }

  if (name === 'MulterError' || error?.type === 'entity.parse.failed') {
    return { status: 400, detail: 'The submitted request is invalid.' };
  }

  const mapped = databaseErrorResponse(error);
  if (mapped.status !== 500) return mapped;
  return { status: 500, detail: fallbackDetail };
}

export function sendRouteError(res, error, fallbackDetail) {
  const mapped = routeErrorResponse(error, fallbackDetail);
  return res.status(mapped.status).json({ detail: mapped.detail });
}
