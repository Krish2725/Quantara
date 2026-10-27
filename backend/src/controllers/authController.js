import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { User, normalizeEmail, safeUser } from '../models/User.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordInput = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const dummyPasswordHash = bcrypt.hash(passwordInput('quantara-invalid-login'), 12);
export function createAuthController({ users = User } = {}) {
  return {
    csrf(req, res) {
      if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString('hex');
      res.json({ csrfToken: req.session.csrfToken });
    },
    async register(req, res, next) {
      try {
        const { name, email: rawEmail, password, confirmPassword } = req.body || {};
        const email = normalizeEmail(rawEmail);
        const allowed = new Set(['name', 'email', 'password', 'confirmPassword']);
        if (Object.keys(req.body || {}).some((key) => !allowed.has(key)) || typeof name !== 'string' || !name.trim() || name.trim().length > 80 || !emailPattern.test(email) || email.length > 254 || typeof password !== 'string' || password.length < 12 || password.length > 128 || (confirmPassword !== undefined && confirmPassword !== password)) {
          return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Enter a name, valid email, and password of at least 12 characters. Password confirmation must match.' } });
        }
        const passwordHash = await bcrypt.hash(passwordInput(password), 12);
        const user = await users.create({ name: name.trim(), email, passwordHash });
        await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
        req.session.userId = String(user._id);
        req.session.csrfToken = randomBytes(32).toString('hex');
        return req.session.save((error) => error ? next(error) : res.status(201).json({ user: safeUser(user), csrfToken: req.session.csrfToken }));
      } catch (error) {
        if (error?.code === 11000) return res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' } });
        next(error);
      }
    },
    async login(req, res, next) {
      try {
        if (Object.keys(req.body || {}).some((key) => !['email', 'password'].includes(key))) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Enter a valid email and password.' } });
        const email = normalizeEmail(req.body?.email);
        const password = req.body?.password;
        if (!emailPattern.test(email) || typeof password !== 'string' || password.length > 128) return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
        const user = await users.findOne({ email }).select('+passwordHash');
        const passwordMatches = await bcrypt.compare(passwordInput(password), user?.passwordHash || await dummyPasswordHash);
        if (!user || !passwordMatches) return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
        await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
        req.session.userId = String(user._id);
        req.session.csrfToken = randomBytes(32).toString('hex');
        req.session.save((error) => error ? next(error) : res.json({ user: safeUser(user), csrfToken: req.session.csrfToken }));
      } catch (error) { next(error); }
    },
    async me(req, res, next) {
      try {
        if (!req.session?.userId) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });
        const user = await users.findById(req.session.userId);
        if (!user) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });
        res.json({ user: safeUser(user) });
      } catch (error) { next(error); }
    },
    logout(req, res, next) {
      if (!req.session) return res.json({ ok: true });
      req.session.destroy((error) => {
        if (error) return next(error);
        res.clearCookie('quantara.sid', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
        res.json({ ok: true });
      });
    },
  };
}
