import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function authRequired(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = jwt.verify(token, config.jwtSecret);
    } catch {
      // ignore invalid token for optional auth
    }
  }
  next();
}

function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  if (req.query.token) return req.query.token;
  return null;
}

export function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, config.jwtSecret, { expiresIn: '7d' });
}
