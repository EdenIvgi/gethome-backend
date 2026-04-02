import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createUser, getUserByUsername } from '../db/queries.js';
import { authRequired, signToken } from '../middleware/auth.js';

const router = Router();

router.post('/register', (req, res, next) => {
  try {
    const { username, password, email } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const passwordHash = bcrypt.hashSync(password, 10);
    const user = createUser({ username, passwordHash, email: email || null });
    const token = signToken(user);
    res.status(201).json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    next(err);
  }
});

router.post('/login', (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const user = getUserByUsername(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user);
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, telegram_chat_id: user.telegram_chat_id } });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authRequired, (req, res, next) => {
  try {
    const user = getUserByUsername(req.user.username);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, username: user.username, email: user.email, telegram_chat_id: user.telegram_chat_id });
  } catch (err) {
    next(err);
  }
});

export default router;
