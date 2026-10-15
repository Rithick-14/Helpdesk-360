import jwt from 'jsonwebtoken';
import { db } from '../db.js';

export function requireAuth(req, res, next) {
  const token = req.cookies?.helpdesk_session;
  if (!token) return res.status(401).json({ error: 'Sign in is required.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id, username, display_name, role FROM users WHERE id = ?').get(payload.sub);
    if (!user) return res.status(401).json({ error: 'Sign in is required.' });
    req.user = user;
    next();
  } catch { return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' }); }
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in is required.' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission to perform this action.' });
  next();
};
