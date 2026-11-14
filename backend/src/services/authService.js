import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { User, StudentProfile } from '../models/index.js';
import { JWT_SECRET, JWT_ACCESS_EXPIRATION, JWT_REFRESH_EXPIRATION } from '../config/env.js';
import { withTransaction } from '../utils/transactions.js';

export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (password, hashedPassword) => {
  if (!hashedPassword) return false;
  // Support Django pbkdf2_sha256 passwords or bcrypt
  if (hashedPassword.startsWith('pbkdf2_sha256$')) {
    try {
      const parts = hashedPassword.split('$');
      const iterations = parseInt(parts[1], 10);
      const salt = parts[2];
      const hash = parts[3];
      const derived = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64');
      const derivedBuf = Buffer.from(derived);
      const hashBuf = Buffer.from(hash);
      if (derivedBuf.length !== hashBuf.length) return false;
      return crypto.timingSafeEqual(derivedBuf, hashBuf);
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

export const getEmailVerificationStateHash = (user) => {
  return crypto.createHash('sha256')
    .update(`${user.id}:${user.password}:${user.is_email_verified}:${user.is_active}`)
    .digest('hex')
    .slice(0, 16);
};

export const generateEmailVerificationToken = (user, expiresIn = '24h') => {
  const payload = {
    token_type: 'email_verification',
    sub: user.id,
    email: user.email,
    state: getEmailVerificationStateHash(user),
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

export const verifyEmailVerificationToken = async (uid, token) => {
  if (!uid || !token || typeof token !== 'string') {
    throw { status: 400, message: 'Verification token and identifier are required.' };
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw { status: 400, message: 'Email verification token has expired.' };
    }
    throw { status: 400, message: 'Email verification token is invalid.' };
  }

  if (decoded.token_type !== 'email_verification' || !decoded.sub) {
    throw { status: 400, message: 'Email verification token is invalid.' };
  }

  // Resolve user by UID (supports UUID string or base64 encoded UUID)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let resolvedId = uid;
  if (!isUUID.test(uid)) {
    try {
      const decodedStr = Buffer.from(uid, 'base64').toString('utf8');
      if (isUUID.test(decodedStr)) {
        resolvedId = decodedStr;
      }
    } catch {}
  }

  if (decoded.sub !== resolvedId) {
    throw { status: 400, message: 'Email verification token is invalid or does not match the specified user.' };
  }

  const user = await User.findByPk(resolvedId);
  if (!user) {
    throw { status: 400, message: 'Email verification token is invalid or user not found.' };
  }

  if (user.is_email_verified) {
    throw { status: 400, message: 'Email has already been verified.' };
  }

  const expectedState = getEmailVerificationStateHash(user);
  if (decoded.state !== expectedState) {
    throw { status: 400, message: 'Email verification token is invalid or has already been used.' };
  }

  user.is_email_verified = true;
  user.is_active = true;
  await user.save();

  return {
    message: 'Email verified successfully. You can now log in.',
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: (user.role || 'student').toLowerCase(),
    },
  };
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
  // Security: Public self-registration is strictly restricted to 'student'.
  // Administrative and staff roles must be provisioned internally.
  const normalizedRole = 'student';

  const user = await withTransaction(async (transaction) => {
    const createdUser = await User.create({
      email: email.toLowerCase(),
      username: username || email.split('@')[0],
      password: hashedPassword,
      first_name: firstName,
      last_name: lastName,
      role: normalizedRole,
      is_active: true,
      is_email_verified: true,
      is_approved: true,
      is_staff: false,
      is_superuser: false,
    }, { transaction });

    // This required profile either commits with the user or not at all.
    await StudentProfile.findOrCreate({
      where: { user_id: createdUser.id },
      defaults: { user_id: createdUser.id },
      transaction,
    });
    return createdUser;
  });

  const tokens = generateTokens(user);
  const message = 'Registration successful. Welcome to SmartIntern-ET!';

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
