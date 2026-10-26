import express from 'express';
import crypto from 'crypto';
import sequelize from '../config/database.js';
import { CampusLogistics, User } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { generateBase64QR } from '../services/qrGenerator.js';

const router = express.Router();

// Helper to resolve or create student UIL profile id
export const resolveStudentUilId = async (user) => {
  const studentRows = await sequelize.query(
    `INSERT INTO student_profiles_student (user_id, education_level, field_of_study, university, current_year, experience_level, preferred_country, preferred_city, work_mode, internship_type, created_at, updated_at)
     VALUES ($1, 'Undergraduate', 'Software Engineering', 'Addis Ababa University', '4', 'Entry', 'Ethiopia', 'Addis Ababa', 'any', 'any', NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
     RETURNING id;`,
    { bind: [user.id], type: sequelize.QueryTypes.SELECT }
  );
  const studentPk = studentRows[0].id;

  const studentIdNumber = user.staff_id_number || `UGR/${user.id.slice(0, 5)}/16`;
  const uilRows = await sequelize.query(
    `INSERT INTO uil_profiles_uilstudentprofile (student_id, student_id_number, campus_city, department, academic_year, is_active_for_internship, created_at, updated_at, dean_dorm_food_letter_qr, dean_signature_hash, dean_verification_letter_qr, forwarded_to_uil, is_verified_by_dean, dean_allow_dorm, dean_allow_food, dean_allow_internship, dean_letter_notes, dean_letter_qr, dean_letter_title, dean_unique_qr, dorm_food_letter_notes, dorm_food_letter_sent, dorm_food_letter_title, internship_letter_sent, score_letter_notes, score_letter_sent, score_roster_data, forwarded_to_dorm, forwarded_to_student_dean)
     VALUES ($1, $2, 'Addis Ababa', 'Software Engineering', 4, true, NOW(), NOW(), '', '', '', false, false, true, true, true, '', '', '', '', '', false, '', false, '', false, '{}', false, false)
     ON CONFLICT (student_id) DO UPDATE SET updated_at = NOW()
     RETURNING id;`,
    { bind: [studentPk, studentIdNumber], type: sequelize.QueryTypes.SELECT }
  );
  return uilRows[0].id;
};

// Helper to resolve or create a logistics record
export const resolveLogisticsRecord = async (user) => {
  const uilId = await resolveStudentUilId(user);
  let [item] = await sequelize.query(
    `SELECT * FROM logistics_campuslogistics WHERE student_id = $1 LIMIT 1;`,
    { bind: [uilId], type: sequelize.QueryTypes.SELECT }
  );
  if (!item) {
    const cohortRows = await sequelize.query(`SELECT id FROM teams_inhousecohort LIMIT 1;`, { type: sequelize.QueryTypes.SELECT });
    const cohortId = cohortRows[0]?.id || 'ef83c4a7-acb8-4921-bf1c-57ab0421821e';
    const newId = crypto.randomUUID();
    await sequelize.query(
      `INSERT INTO logistics_campuslogistics (
        id, student_id, cohort_id, uil_placed, dean_approved, dean_signature_hash,
        meal_card_number, meal_card_active, dorm_block, dorm_room, dorm_bed_number,
        dorm_status, key_issued, cleared_at_exit, room_checkout, student_union_qr_code,
        student_union_signature_hash, created_at, updated_at
      ) VALUES (
        $1, $2, $3, true, false, '',
        'MC-102938', false, 'Block A', '101', 'Bed 1',
        'UNASSIGNED', false, false, false, '',
        '', NOW(), NOW()
      );`,
      { bind: [newId, uilId, cohortId] }
    );
    [item] = await sequelize.query(
      `SELECT * FROM logistics_campuslogistics WHERE id = $1 LIMIT 1;`,
      { bind: [newId], type: sequelize.QueryTypes.SELECT }
    );
  }
  return item;
};

// Helper to format logistics item
const formatLogistics = (item) => ({
  id: item.id,
  student: item.student_id,
  student_id_number: item.student_id_number || `UGR/${item.student_id}/16`,
  student_name: item.student_name || 'Amanuel Student',
  student_email: item.student_email || 'student@example.com',
  department: item.department || 'Software Engineering',
  academic_year: item.academic_year || 4,
  cohort: item.cohort || item.cohort_id,
  cohort_name: item.cohort_name || 'Summer Cohort 2026',
  cohort_academic_year: item.cohort_academic_year || '2026',
  dean_approved: Boolean(item.dean_approved),
  dean_signature_hash: item.dean_signature_hash,
  dean_signed_by: item.dean_signed_by_id,
  dean_signed_by_name: item.dean_signed_by_name,
  dean_signed_at: item.dean_signed_at,
  signature_verified: Boolean(item.signature_verified),
  meal_card_number: item.meal_card_number,
  meal_card_active: Boolean(item.meal_card_active),
  meal_card_issued_at: item.meal_card_issued_at,
  meal_card_issued_by: item.meal_card_issued_by_id,
  meal_card_issued_by_name: item.meal_card_issued_by_name,
  student_union_signature_hash: item.student_union_signature_hash,
  student_union_qr_code: item.student_union_qr_code,
  dorm_block: item.dorm_block || 'Block A',
  dorm_room: item.dorm_room || '101',
  dorm_bed_number: item.dorm_bed_number || 'Bed 1',
  dorm_status: item.dorm_status || 'UNASSIGNED',
  key_issued: Boolean(item.key_issued),
  key_issued_at: item.key_issued_at,
  key_issued_by: item.key_issued_by_id,
  key_issued_by_name: item.key_issued_by_name,
  valid_from: item.valid_from,
  valid_until: item.valid_until,
  is_valid_today: true,
  cleared_at_exit: Boolean(item.cleared_at_exit),
  created_at: item.created_at,
  updated_at: item.updated_at,
});

// -------------------------------------------------------------
// GET /v1/logistics/
// -------------------------------------------------------------
router.get('/', requireAuth, async (req, res) => {
  try {
    let items;
    if (req.user.role === 'student') {
      const item = await resolveLogisticsRecord(req.user);
      items = [item];
    } else {
      items = await sequelize.query(
        `SELECT * FROM logistics_campuslogistics ORDER BY created_at DESC;`,
        { type: sequelize.QueryTypes.SELECT }
      );
    }
    return res.status(200).json(items.map(formatLogistics));
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// GET /v1/logistics/meal-cards/
// -------------------------------------------------------------
router.get('/meal-cards/', requireAuth, async (req, res) => {
  try {
    const items = await CampusLogistics.findAll({ order: [['created_at', 'DESC']] });
    return res.status(200).json(items.map(formatLogistics));
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// POST /v1/logistics/:id/activate-meal-card/
// -------------------------------------------------------------
router.post('/:id/activate-meal-card/', requireAuth, async (req, res) => {
  try {
    const item = await CampusLogistics.findByPk(req.params.id);
    if (!item) return res.status(404).json({ detail: 'Logistics record not found.' });

    const { meal_card_number } = req.body;
    item.meal_card_number = meal_card_number || `MC-${Math.floor(100000 + Math.random() * 900000)}`;
    item.meal_card_active = true;
    item.meal_card_issued_at = new Date();
    item.meal_card_issued_by_id = req.user.id;
    item.meal_card_issued_by_name = req.user.getFullName();

    // Generate Student Union Verification QR code
    const qrData = JSON.stringify({
      logistics_id: item.id,
      student_id: item.student_id,
      meal_card: item.meal_card_number,
      verified_by: req.user.getFullName(),
      timestamp: new Date().toISOString(),
    });
    item.student_union_signature_hash = crypto.createHash('sha256').update(qrData).digest('hex');
    item.student_union_qr_code = await generateBase64QR(qrData);

    await item.save();
    return res.status(200).json(formatLogistics(item));
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// GET /v1/logistics/dorm-rooms/
// -------------------------------------------------------------
router.get('/dorm-rooms/', requireAuth, async (req, res) => {
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
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// POST /v1/logistics/:id/assign-dorm/
// -------------------------------------------------------------
router.post('/:id/assign-dorm/', requireAuth, async (req, res) => {
  try {
    const item = await CampusLogistics.findByPk(req.params.id);
    if (!item) return res.status(404).json({ detail: 'Logistics record not found.' });

    const { dorm_block, dorm_room, dorm_bed_number, issue_key } = req.body;
    item.dorm_block = dorm_block || item.dorm_block;
    item.dorm_room = dorm_room || item.dorm_room;
    item.dorm_bed_number = dorm_bed_number || item.dorm_bed_number;
    item.dorm_status = issue_key ? 'KEY_ISSUED' : 'ASSIGNED';

    if (issue_key) {
      item.key_issued = true;
      item.key_issued_at = new Date();
      item.key_issued_by_id = req.user.id;
      item.key_issued_by_name = req.user.getFullName();
    }

    await item.save();
    return res.status(200).json(formatLogistics(item));
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// POST /v1/logistics/:id/return-key/
// -------------------------------------------------------------
router.post('/:id/return-key/', requireAuth, async (req, res) => {
  try {
    const item = await CampusLogistics.findByPk(req.params.id);
    if (!item) return res.status(404).json({ detail: 'Logistics record not found.' });

    item.dorm_status = 'RETURNED';
    item.key_issued = false;
    await item.save();
    return res.status(200).json(formatLogistics(item));
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// POST /v1/logistics/:id/dean-sign/
// -------------------------------------------------------------
router.post('/:id/dean-sign/', requireAuth, async (req, res) => {
  try {
    const item = await CampusLogistics.findByPk(req.params.id);
    if (!item) return res.status(404).json({ detail: 'Logistics record not found.' });

    item.dean_approved = true;
    item.dean_signed_by_id = req.user.id;
    item.dean_signed_by_name = req.user.getFullName();
    item.dean_signed_at = new Date();
    item.signature_verified = true;

    const signaturePayload = `${item.id}-${item.student_id}-${req.user.id}-${item.dean_signed_at.toISOString()}`;
    item.dean_signature_hash = crypto.createHash('sha256').update(signaturePayload).digest('hex');

    await item.save();
    return res.status(200).json(formatLogistics(item));
  } catch (err) {
    return res.status(400).json({ detail: err.message });
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
    return res.status(500).json({ detail: err.message });
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
    return res.status(500).json({ detail: err.message });
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
    return res.status(200).json(formatLogistics(item));
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

export default router;
