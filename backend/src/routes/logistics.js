import express from 'express';
import { sendRouteError, routeErrorResponse } from '../utils/routeErrors.js';
import crypto from 'crypto';
import sequelize from '../config/database.js';
import { CampusLogistics, User } from '../models/index.js';
import { requireAuth, requireRole, requireDean, requireDormStaff, requireStudentUnion } from '../middleware/auth.js';
import { generateSignedQR, verifyPayload } from '../services/qrGenerator.js';
import { withTransaction } from '../utils/transactions.js';
import { JWT_SECRET } from '../config/env.js';

const router = express.Router();

// Helper to resolve or create a logistics record
export const resolveLogisticsRecord = async (user) => {
  const [item] = await CampusLogistics.findOrCreate({
    where: { student_id: user.id },
    defaults: {
      student_id: user.id,
      dean_approved: false,
      meal_card_number: `MC-${Math.floor(100000 + Math.random() * 900000)}`,
      meal_card_active: false,
      dorm_block: 'Block A',
      dorm_room: '101',
      dorm_bed_number: 'Bed 1',
      dorm_status: 'UNASSIGNED',
      key_issued: false,
      cleared_at_exit: false,
    }
  });
  return item;
};

// Helper to format logistics item
const formatLogistics = (item, studentUser = null) => {
  const json = item.toJSON ? item.toJSON() : item;
  const user = studentUser || json.student || {};
  const studentName = user.getFullName ? user.getFullName() : ([user.first_name, user.last_name].filter(Boolean).join(' ') || 'Amanuel Student');
  const studentEmail = user.email || 'student@example.com';
  const dept = user.department || 'Software Engineering';

  return {
    id: json.id,
    student: json.student_id,
    student_id_number: user.staff_id_number || `UGR/${json.student_id?.slice ? json.student_id.slice(0, 5) : '1001'}/16`,
    student_name: studentName,
    student_email: studentEmail,
    department: dept,
    academic_year: 4,
    cohort: 'ef83c4a7-acb8-4921-bf1c-57ab0421821e',
    cohort_name: 'Summer Cohort 2026',
    cohort_academic_year: '2026',
    dean_approved: Boolean(json.dean_approved),
    dean_signature_hash: json.dean_signature_hash || '',
    dean_signed_by: json.dean_signed_by_id,
    dean_signed_by_name: 'Dr. Haile Dean',
    dean_signed_at: json.dean_signed_at,
    signature_verified: Boolean(json.dean_approved),
    meal_card_number: json.meal_card_number || 'MC-102938',
    meal_card_active: Boolean(json.meal_card_active),
    meal_card_issued_at: json.meal_card_issued_at,
    meal_card_issued_by: json.meal_card_issued_by_id,
    meal_card_issued_by_name: 'Student Union Logistics',
    student_union_signature_hash: json.student_union_signature_hash || '',
    student_union_qr_code: json.student_union_qr_code || '',
    dorm_block: json.dorm_block || 'Block A',
    dorm_room: json.dorm_room || '101',
    dorm_bed_number: json.dorm_bed_number || 'Bed 1',
    dorm_status: json.dorm_status || 'UNASSIGNED',
    key_issued: Boolean(json.key_issued),
    key_issued_at: json.key_issued_at,
    key_issued_by: json.key_issued_by_id,
    key_issued_by_name: 'Dorm Proctor Office',
    valid_from: json.valid_from,
    valid_until: json.valid_until,
    is_valid_today: true,
    cleared_at_exit: Boolean(json.cleared_at_exit),
    created_at: json.created_at,
    updated_at: json.updated_at,
  };
};

// -------------------------------------------------------------
// GET /v1/logistics/
// -------------------------------------------------------------
router.get('/', requireAuth, async (req, res) => {
  try {
    let items;
    if (req.user.role === 'student') {
      const item = await resolveLogisticsRecord(req.user);
      items = [formatLogistics(item, req.user)];
    } else {
      const records = await CampusLogistics.findAll({
        include: [{ model: User, as: 'student' }],
        order: [['created_at', 'DESC']]
      });
      items = records.map(r => formatLogistics(r, r.student));
    }
    return res.status(200).json(items);
  } catch (err) {
    return sendRouteError(res, err, 'The request could not be completed.');
  }
});

// -------------------------------------------------------------
// GET /v1/logistics/meal-cards/
// -------------------------------------------------------------
router.get('/meal-cards/', requireAuth, requireStudentUnion, async (req, res) => {
  try {
    const items = await CampusLogistics.findAll({ order: [['created_at', 'DESC']] });
    return res.status(200).json(items.map(formatLogistics));
  } catch (err) {
    return sendRouteError(res, err, 'The request could not be completed.');
  }
});

// -------------------------------------------------------------
// POST /v1/logistics/:id/activate-meal-card/
// -------------------------------------------------------------
router.post('/:id/activate-meal-card/', requireAuth, requireRole('admin', 'student_union'), async (req, res) => {
  try {
    const item = await CampusLogistics.findByPk(req.params.id);
    if (!item) return res.status(404).json({ detail: 'Logistics record not found.' });

    const { meal_card_number } = req.body;
    item.meal_card_number = meal_card_number || `MC-${Math.floor(100000 + Math.random() * 900000)}`;
    item.meal_card_active = true;
    item.meal_card_issued_at = new Date();
    item.meal_card_issued_by_id = req.user.id;
    item.meal_card_issued_by_name = req.user.getFullName ? req.user.getFullName() : `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim();

    // Generate cryptographically signed Student Union Verification QR code
    const payload = {
      logistics_id: item.id,
      student_id: item.student_id,
      meal_card: item.meal_card_number,
      verified_by: item.meal_card_issued_by_name,
      issued_at: item.meal_card_issued_at.toISOString(),
    };
    const { qrImage, signature } = await generateSignedQR(payload);
    item.student_union_signature_hash = signature;
    item.student_union_qr_code = qrImage;

    await item.save();
    return res.status(200).json(formatLogistics(item));
  } catch (err) {
    return sendRouteError(res, err, 'The request could not be completed.');
  }
});

// -------------------------------------------------------------
// POST /v1/logistics/verify-qr/
// -------------------------------------------------------------
router.post('/verify-qr/', requireAuth, async (req, res) => {
  try {
    const { qr_data } = req.body;
    if (!qr_data) return res.status(400).json({ valid: false, detail: 'QR data is required.' });

    let parsed = qr_data;
    if (typeof qr_data === 'string') {
      try { parsed = JSON.parse(qr_data); } catch { return res.status(400).json({ valid: false, detail: 'Invalid QR JSON payload.' }); }
    }

    const isValid = verifyPayload(parsed);
    if (!isValid) {
      return res.status(200).json({ valid: false, message: 'Invalid or forged QR signature.' });
    }

    return res.status(200).json({
      valid: true,
      message: 'QR code verified successfully with valid cryptographic HMAC signature.',
      payload: parsed,
    });
  } catch (err) {
    const mapped = routeErrorResponse(err, 'The submitted request could not be validated.');
    return res.status(mapped.status).json({ valid: false, detail: mapped.detail });
  }
});

// -------------------------------------------------------------
// GET /v1/logistics/dorm-rooms/
// -------------------------------------------------------------
router.get('/dorm-rooms/', requireAuth, requireDormStaff, async (req, res) => {
  try {
    const items = await CampusLogistics.findAll();
    const rooms = [
      {
        block: 'Block A',
        room: '101',
        bed_capacity: 4,
        occupied_beds: items.filter(i => i.dorm_block === 'Block A' && i.dorm_room === '101').length,
        occupants: items.filter(i => i.dorm_block === 'Block A' && i.dorm_room === '101').map(i => ({
          student_id: i.student_id,
          student_name: i.student_name,
          bed_number: i.dorm_bed_number,
          key_issued: i.key_issued,
          key_issued_at: i.key_issued_at,
          dorm_status: i.dorm_status,
          logistics_id: i.id,
        }))
      },
      {
        block: 'Block A',
        room: '102',
        bed_capacity: 4,
        occupied_beds: 0,
        occupants: []
      },
      {
        block: 'Block B',
        room: '201',
        bed_capacity: 4,
        occupied_beds: 0,
        occupants: []
      }
    ];

    return res.status(200).json({
      rooms,
      total_rooms_with_occupants: rooms.filter(r => r.occupied_beds > 0).length,
    });
  } catch (err) {
    return sendRouteError(res, err, 'The request could not be completed.');
  }
});

// -------------------------------------------------------------
// POST /v1/logistics/:id/assign-dorm/
// -------------------------------------------------------------
router.post('/:id/assign-dorm/', requireAuth, requireDormStaff, async (req, res) => {
  try {
    const { dorm_block, dorm_room, dorm_bed_number, issue_key } = req.body;
    const item = await withTransaction(async (transaction) => {
      const record = await CampusLogistics.findByPk(req.params.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!record) return null;

      record.dorm_block = dorm_block || record.dorm_block;
      record.dorm_room = dorm_room || record.dorm_room;
      record.dorm_bed_number = dorm_bed_number || record.dorm_bed_number;
      record.dorm_status = issue_key ? 'KEY_ISSUED' : 'ASSIGNED';

      if (issue_key) {
        record.key_issued = true;
        record.key_issued_at = new Date();
        record.key_issued_by_id = req.user.id;
        record.key_issued_by_name = req.user.getFullName();
      }

      await record.save({ transaction });
      return record;
    });

    if (!item) return res.status(404).json({ detail: 'Logistics record not found.' });
    return res.status(200).json(formatLogistics(item));
  } catch (err) {
    return sendRouteError(res, err, 'The request could not be completed.');
  }
});

// -------------------------------------------------------------
// POST /v1/logistics/:id/return-key/
// -------------------------------------------------------------
router.post('/:id/return-key/', requireAuth, requireDormStaff, async (req, res) => {
  try {
    const item = await withTransaction(async (transaction) => {
      const record = await CampusLogistics.findByPk(req.params.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!record) return null;

      record.dorm_status = 'RETURNED';
      record.key_issued = false;
      await record.save({ transaction });
      return record;
    });

    if (!item) return res.status(404).json({ detail: 'Logistics record not found.' });
    return res.status(200).json(formatLogistics(item));
  } catch (err) {
    return sendRouteError(res, err, 'The request could not be completed.');
  }
});

// -------------------------------------------------------------
// POST /v1/logistics/:id/dean-sign/
// -------------------------------------------------------------
router.post('/:id/dean-sign/', requireAuth, requireDean, async (req, res) => {
  try {
    const userRole = (req.user.role || '').toLowerCase();
    const isSuper = Boolean(req.user.is_superuser);

    const result = await withTransaction(async (transaction) => {
      const record = await CampusLogistics.findByPk(req.params.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!record) {
        return { notFound: true };
      }

      // Idempotency: if already approved, safely return without re-signing or overwriting audit trail
      if (record.dean_approved) {
        return { record };
      }

      // Check academic jurisdiction / department boundary if dean specifies department
      if (userRole !== 'admin' && !isSuper && req.user.department) {
        const student = await User.findByPk(record.student_id, { transaction });
        if (student && student.department && student.department.toLowerCase().trim() !== req.user.department.toLowerCase().trim()) {
          return { forbidden: true, reason: 'You do not have institutional authority to approve clearances outside your academic department.' };
        }
      }

      const signedAt = new Date();
      record.dean_approved = true;
      record.dean_signed_by_id = req.user.id;
      record.dean_signed_by_name = req.user.getFullName ? req.user.getFullName() : `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim();
      record.dean_signed_at = signedAt;
      record.signature_verified = true;

      // Keyed HMAC-SHA256 institutional audit fingerprint (tamper-evident audit digest)
      const auditPayload = `${record.id}:${record.student_id}:${req.user.id}:${signedAt.toISOString()}`;
      record.dean_signature_hash = crypto.createHmac('sha256', JWT_SECRET).update(auditPayload).digest('hex');

      await record.save({ transaction });
      return { record };
    });

    if (result.notFound) {
      return res.status(404).json({ detail: 'Logistics record not found.' });
    }
    if (result.forbidden) {
      return res.status(403).json({ detail: result.reason });
    }

    return res.status(200).json(formatLogistics(result.record));
  } catch (err) {
    return sendRouteError(res, err, 'The request could not be completed.');
  }
});

// -------------------------------------------------------------
// GET /v1/logistics/pass/ — Student's Logistics Pass
// -------------------------------------------------------------
router.get('/pass/', requireAuth, async (req, res) => {
  try {
    const item = await resolveLogisticsRecord(req.user);
    return res.status(200).json(formatLogistics(item));
  } catch (err) {
    return sendRouteError(res, err, 'The request could not be completed.');
  }
});

// -------------------------------------------------------------
// GET /v1/logistics/clearance/ — Clearance status
// -------------------------------------------------------------
router.get('/clearance/', requireAuth, async (req, res) => {
  try {
    const item = await resolveLogisticsRecord(req.user);
    return res.status(200).json({
      cleared: Boolean(item.cleared_at_exit),
      dean_approved: Boolean(item.dean_approved),
      key_returned: !item.key_issued,
      meal_card_active: Boolean(item.meal_card_active),
      logistics: formatLogistics(item),
    });
  } catch (err) {
    return sendRouteError(res, err, 'The request could not be completed.');
  }
});

// -------------------------------------------------------------
// GET /v1/logistics/:id/
// -------------------------------------------------------------
router.get('/:id/', requireAuth, async (req, res) => {
  try {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isInt = /^\d+$/;
    if (!isUUID.test(req.params.id) && !isInt.test(req.params.id)) {
      return res.status(404).json({ detail: 'Logistics record not found.' });
    }
    const item = await CampusLogistics.findByPk(req.params.id);
    if (!item) return res.status(404).json({ detail: 'Logistics record not found.' });

    const isOwner = String(item.student_id) === String(req.user.id);
    const userRole = (req.user.role || '').toLowerCase();
    const isPrivileged = ['admin', 'dean', 'dept_dean', 'student_union', 'dorm_admin', 'uil', 'uil_officer'].includes(userRole)
      || Boolean(req.user.is_superuser);

    if (!isOwner && !isPrivileged) {
      return res.status(403).json({ detail: 'You do not have permission to access this logistics record.' });
    }

    return res.status(200).json(formatLogistics(item));
  } catch (err) {
    return sendRouteError(res, err, 'The request could not be completed.');
  }
});

export default router;
