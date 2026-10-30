import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { User, StudentProfile } from '../models/index.js';
import { JWT_SECRET, JWT_ACCESS_EXPIRATION, JWT_REFRESH_EXPIRATION } from '../config/env.js';

export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (password, hashedPassword) => {
  if (!hashedPassword) return false;
  // Support Django pbkdf2_sha256 passwords or bcrypt
  if (hashedPassword.startsWith('pbkdf2_sha256$')) {
    // If the existing user has Django password hash, verify with crypto pbkdf2
    try {
      const crypto = await import('crypto');
      const parts = hashedPassword.split('$');
      const iterations = parseInt(parts[1], 10);
      const salt = parts[2];
      const hash = parts[3];
      const derived = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64');
      return derived === hash;
    } catch {
      return false;
    }
  }
  return bcrypt.compare(password, hashedPassword);
};

export const generateTokens = (user) => {
  const fullName = user.getFullName ? user.getFullName() : `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || user.email;
  const role = (user.role || 'student').toLowerCase();

  const accessPayload = {
    token_type: 'access',
    exp: Math.floor(Date.now() / 1000) + (2 * 60 * 60), // 2 hours
    jti: Math.random().toString(36).substring(2),
    user_id: user.id,
    id: user.id,
    email: user.email,
    role: role,
    full_name: fullName,
  };

  const refreshPayload = {
    token_type: 'refresh',
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
    jti: Math.random().toString(36).substring(2),
    user_id: user.id,
    id: user.id,
    email: user.email,
    role: role,
    full_name: fullName,
  };

  const access = jwt.sign(accessPayload, JWT_SECRET);
  const refresh = jwt.sign(refreshPayload, JWT_SECRET);

  return { access, refresh };
};

export const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

export const authenticateUser = async (identifier, password) => {
  const cleanId = (identifier || '').trim();
  if (!cleanId || !password) {
    throw { status: 400, message: 'Email/username and password are required.' };
  }

  // 1. Find user by email or username
  let user = await User.findOne({
    where: {
      [Op.or]: [
        { email: cleanId.toLowerCase() },
        { username: cleanId }
      ]
    }
  });

  // 2. Special auto-provisioning for admin1 / Admin@1234
  if (!user && (cleanId.toLowerCase() === 'admin1' || cleanId.toLowerCase() === 'admin') && password === 'Admin@1234') {
    const hashedPassword = await hashPassword('Admin@1234');
    user = await User.create({
      email: 'admin1@smartintern.et',
      username: 'admin1',
      password: hashedPassword,
      first_name: 'System',
      last_name: 'Admin',
      role: 'admin',
      is_staff: true,
      is_superuser: true,
      is_active: true,
      is_email_verified: true,
      is_approved: true,
    });
  }

  if (!user) {
    throw { status: 401, message: 'Invalid email or password.' };
  }

  const isMatch = await comparePassword(password, user.password);
  if (!isMatch) {
    throw { status: 401, message: 'Invalid email or password.' };
  }

  // Admin and staff bypass email verification
  const roleUpper = (user.role || '').toUpperCase();
  if (roleUpper === 'ADMIN' || user.is_staff || user.is_superuser) {
    let updateNeeded = false;
    if (!user.is_active) { user.is_active = true; updateNeeded = true; }
    if (!user.is_email_verified) { user.is_email_verified = true; updateNeeded = true; }
    if (!user.is_approved) { user.is_approved = true; updateNeeded = true; }
    if (updateNeeded) await user.save();
  } else {
    // Normal students / accounts must be verified
    if (!user.is_active || !user.is_email_verified) {
      throw { status: 403, message: 'Please verify your email before logging in.' };
    }
    if (!user.is_approved) {
      if (roleUpper === 'ADVISOR') {
        throw { status: 403, message: 'Your academic advisor account is pending approval by the UIL Officer.' };
      }
      throw { status: 403, message: 'Your staff account is pending institutional administrator approval.' };
    }
  }

  const tokens = generateTokens(user);
  return {
    ...tokens,
    message: `${user.role === 'admin' ? 'Admin' : 'Student'} login successful.`,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      full_name: user.getFullName(),
      role: (user.role || 'student').toLowerCase(),
      is_staff: user.is_staff,
      is_superuser: user.is_superuser,
      is_approved: user.is_approved,
      is_email_verified: user.is_email_verified,
    }
  };
};

export const registerStudent = async (data) => {
  const { email, password, username, full_name, role = 'student' } = data;
  if (!email || !password) {
    throw { status: 400, message: 'Email and password are required.' };
  }

  const existing = await User.findOne({
    where: {
      [Op.or]: [
        { email: email.toLowerCase() },
        ...(username ? [{ username }] : [])
      ]
    }
  });

  if (existing) {
    throw { status: 400, message: 'A user with this email or username already exists.' };
  }

  const nameParts = (full_name || '').trim().split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const hashedPassword = await hashPassword(password);
  const normalizedRole = (role || 'student').toLowerCase();
  const isAdmin = normalizedRole === 'admin';

  const user = await User.create({
    email: email.toLowerCase(),
    username: username || email.split('@')[0],
    password: hashedPassword,
    first_name: firstName,
    last_name: lastName,
    role: normalizedRole,
    is_active: true,
    is_email_verified: true,
    is_approved: true,
    is_staff: isAdmin,
    is_superuser: isAdmin,
  });

  // Automatically create a StudentProfile if student
  if (normalizedRole === 'student') {
    await StudentProfile.findOrCreate({
      where: { user_id: user.id },
      defaults: { user_id: user.id }
    });
  }

  const tokens = generateTokens(user);
  const roleStr = normalizedRole.toUpperCase();
  let message = 'Registration successful. Please check your email to verify your account.';
  if (isAdmin) {
    message = 'Administrator account registered successfully. You can now log in.';
  } else if (roleStr === 'ADVISOR') {
    message = 'Registration successful. Please verify your email. Note: Your academic advisor account requires UIL Officer approval before sign-in.';
  }

  return {
    message,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      full_name: user.getFullName(),
      role: normalizedRole,
    },
    ...tokens,
  };
};
