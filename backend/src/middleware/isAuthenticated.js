import { User } from '../models/User.js';

export function isAuthenticated({ users = User } = {}) {
  return async (req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });
    try {
      const user = await users.exists({ _id: req.session.userId });
      if (!user) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });
      req.userId = String(req.session.userId);
      next();
    } catch (error) { next(error); }
  };
}
