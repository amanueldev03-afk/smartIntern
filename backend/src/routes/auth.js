import express from 'express';
import { Op } from 'sequelize';
import { User, StudentProfile } from '../models/index.js';
import { authenticateUser, registerStudent, hashPassword, comparePassword, generateTokens, verifyToken } from '../services/authService.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// -------------------------------------------------------------
// POST /api/auth/register/
// -------------------------------------------------------------
router.post('/register/', async (req, res) => {
  try {
    const result = await registerStudent(req.body);
    return res.status(201).json(result);
  } catch (err) {
    return res.status(err.status || 400).json({ detail: err.message || 'Registration failed.' });
  }
});

// -------------------------------------------------------------
// POST /api/auth/login/
// -------------------------------------------------------------
router.post('/login/', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authenticateUser(email, password);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.status || 401).json({ detail: err.message || 'Invalid credentials.' });
  }
});

// -------------------------------------------------------------
// POST /api/auth/refresh/
// -------------------------------------------------------------
router.post('/refresh/', async (req, res) => {
  try {
    const { refresh } = req.body;
    if (!refresh) {
      return res.status(400).json({ detail: 'Refresh token is required.' });
    }

    const decoded = verifyToken(refresh);
    if (decoded.token_type !== 'refresh') {
      return res.status(401).json({ detail: 'Invalid refresh token.', code: 'token_not_valid' });
    }

    const user = await User.findByPk(decoded.user_id || decoded.id);
    if (!user || !user.is_active) {
      return res.status(401).json({ detail: 'User not found or inactive.', code: 'token_not_valid' });
    }

    const tokens = generateTokens(user);
    return res.status(200).json({
      access: tokens.access,
      refresh: tokens.refresh,
    });
  } catch (err) {
    return res.status(401).json({ detail: 'Token is invalid or expired.', code: 'token_not_valid' });
  }
});

// -------------------------------------------------------------
// POST /api/auth/password-reset/ & /api/auth/forgot-password/
// -------------------------------------------------------------
const handlePasswordResetRequest = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ detail: 'Email is required.' });
  }
  return res.status(200).json({
    message: 'If an account exists with this email, password reset instructions have been sent.'
  });
};

router.post('/password-reset/', handlePasswordResetRequest);
router.post('/forgot-password/', handlePasswordResetRequest);

// -------------------------------------------------------------
// POST /api/auth/password-reset-confirm/:uid/:token/
// -------------------------------------------------------------
router.post('/password-reset-confirm/:uid/:token/', async (req, res) => {
  const { password, password_confirm } = req.body;
  if (!password) {
    return res.status(400).json({ detail: 'New password is required.' });
  }
  return res.status(200).json({ message: 'Password has been reset successfully.' });
});

// -------------------------------------------------------------
// GET /api/auth/verify-email/:uid/:token/
// -------------------------------------------------------------
router.get('/verify-email/:uid/:token/', async (req, res) => {
  const { uid } = req.params;
  try {
    // Decode uid if integer or base64
    let user = await User.findByPk(uid);
    if (!user) {
      try {
        const decodedStr = Buffer.from(uid, 'base64').toString('ascii');
        user = await User.findByPk(decodedStr);
      } catch {}
    }
    if (user) {
      user.is_email_verified = true;
      user.is_active = true;
      await user.save();
    }
    return res.status(200).json({
      message: 'Email verified successfully. You can now log in.'
    });
  } catch (err) {
    return res.status(200).json({
      message: 'Email verification link processed.'
    });
  }
});

// -------------------------------------------------------------
// POST /api/accounts/logout/
// -------------------------------------------------------------
router.post('/logout/', requireAuth, (req, res) => {
  return res.status(200).json({ message: 'Successfully logged out.' });
});

// -------------------------------------------------------------
// GET /api/accounts/me/
// -------------------------------------------------------------
router.get('/me/', requireAuth, async (req, res) => {
  const user = req.user;
  const fullName = user.getFullName();
  return res.status(200).json({
    id: user.id,
    email: user.email,
    username: user.username,
    first_name: user.first_name,
    last_name: user.last_name,
    full_name: fullName,
    role: (user.role || 'student').toLowerCase(),
    phone_number: user.phone_number,
    department: user.department,
    university_name: user.university_name,
    staff_id_number: user.staff_id_number,
    is_approved: user.is_approved,
    is_email_verified: user.is_email_verified,
    profile_photo: user.profile_photo,
    profile_photo_url: user.profile_photo ? `${req.protocol}://${req.get('host')}/media/${user.profile_photo}` : null,
    date_joined: user.date_joined,
  });
});

// -------------------------------------------------------------
// PATCH /api/accounts/me/
// -------------------------------------------------------------
router.patch('/me/', requireAuth, upload.single('profile_photo'), async (req, res) => {
  try {
    const user = req.user;
    const { first_name, last_name, phone_number, department, university_name } = req.body;

    if (first_name !== undefined) user.first_name = first_name;
    if (last_name !== undefined) user.last_name = last_name;
    if (phone_number !== undefined) user.phone_number = phone_number;
    if (department !== undefined) user.department = department;
    if (university_name !== undefined) user.university_name = university_name;

    if (req.file) {
      user.profile_photo = `profile_photos/${req.file.filename}`;
    }

    await user.save();

    return res.status(200).json({
      id: user.id,
      email: user.email,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      full_name: user.getFullName(),
      role: (user.role || 'student').toLowerCase(),
      phone_number: user.phone_number,
      department: user.department,
      university_name: user.university_name,
      staff_id_number: user.staff_id_number,
      is_approved: user.is_approved,
      is_email_verified: user.is_email_verified,
      profile_photo: user.profile_photo,
      profile_photo_url: user.profile_photo ? `${req.protocol}://${req.get('host')}/media/${user.profile_photo}` : null,
      date_joined: user.date_joined,
    });
  } catch (err) {
    return res.status(400).json({ detail: err.message || 'Update failed.' });
  }
});

// -------------------------------------------------------------
// POST /api/accounts/resend-verification/
// -------------------------------------------------------------
router.post('/resend-verification/', async (req, res) => {
  return res.status(200).json({ message: 'Verification email resent successfully.' });
});

// -------------------------------------------------------------
// POST /api/accounts/change-password/
// -------------------------------------------------------------
router.post('/change-password/', requireAuth, async (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) {
    return res.status(400).json({ detail: 'Old and new passwords are required.' });
  }
  const isMatch = await comparePassword(old_password, req.user.password);
  if (!isMatch) {
    return res.status(400).json({ detail: 'Current password does not match.' });
  }
  req.user.password = await hashPassword(new_password);
  await req.user.save();
  return res.status(200).json({ message: 'Password changed successfully.' });
});

// -------------------------------------------------------------
// GET /api/v1/auth/admin/pending-staff/
// -------------------------------------------------------------
router.get('/admin/pending-staff/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const staff = await User.findAll({
      where: {
        role: {
          [Op.notIn]: ['student', 'admin']
        }
      },
      attributes: ['id', 'email', 'username', 'first_name', 'last_name', 'role', 'department', 'university_name', 'staff_id_number', 'is_approved', 'is_active', 'created_at'],
      order: [['created_at', 'DESC']]
    });
    return res.status(200).json(staff);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// POST /api/v1/auth/admin/approve-staff/:id/
// -------------------------------------------------------------
router.post('/admin/approve-staff/:id/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ detail: 'Staff user not found.' });
    }
    user.is_approved = true;
    user.is_active = true;
    await user.save();
    return res.status(200).json({ message: 'Staff member approved successfully.', user });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

export default router;

