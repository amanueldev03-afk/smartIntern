import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { JWT_SECRET } from '../config/env.js';

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ detail: 'Authentication credentials were not provided.' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ detail: 'Given token not valid for any token type', code: 'token_not_valid' });
    }

    const userId = decoded.user_id || decoded.id;
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(401).json({ detail: 'User not found or inactive.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ detail: 'User account is inactive.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(500).json({ detail: 'Internal authentication error.' });
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      const userId = decoded.user_id || decoded.id;
      const user = await User.findByPk(userId);
      if (user && user.is_active) {
        req.user = user;
      }
    }
  } catch {
    // Ignore invalid token on optionalAuth
  }
  next();
};

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ detail: 'Authentication required.' });
    }
    const userRole = (req.user.role || '').toLowerCase();
    const isSuper = req.user.is_superuser || req.user.is_staff;
    const allowed = roles.map(r => r.toLowerCase());

    if (allowed.includes(userRole) || (allowed.includes('admin') && isSuper)) {
      return next();
    }

    return res.status(403).json({ detail: 'You do not have permission to perform this action.' });
  };
};

export const requireAdmin = requireRole('admin');
export const requireStudent = requireRole('student');
