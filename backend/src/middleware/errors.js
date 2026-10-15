export function notFound(req, res) { res.status(404).json({ error: 'The requested resource was not found.' }); }
export function errors(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must be valid JSON.' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body exceeds the 100 KB limit.' });
  if (err?.status === 429) return res.status(429).json({ error: 'Too many attempts. Please try again shortly.' });
  if (err?.status === 400) return res.status(400).json({ error: err.message || 'The request is invalid.' });
  if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'This value has already been used.' });
  console.error(err);
  return res.status(500).json({ error: 'An unexpected server error occurred.' });
}
