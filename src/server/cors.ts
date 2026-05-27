export function buildCorsHeaders(studioOrigin: string, request: Request): Record<string, string> {
  const requestOrigin = request.headers.get('origin') ?? ''
  const allowOrigin = studioOrigin && requestOrigin === studioOrigin ? studioOrigin : ''
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin',
  }
}
