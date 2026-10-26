import express from 'express';
import { CampusLogistics, User, StudentProfile } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { generateDeanScoreRosterTemplate } from '../services/excelGenerator.js';

const router = express.Router();

// -------------------------------------------------------------
// GET /v1/uil-profiles/dorm/forwarded-letters/
// -------------------------------------------------------------
router.get('/dorm/forwarded-letters/', requireAuth, async (req, res) => {
  try {
    const items = await CampusLogistics.findAll({
      where: { dean_approved: true }
    });

    const results = items.map(i => ({
      student_id: i.student_id,
      student_id_number: i.student_id_number,
      student_name: i.student_name,
      student_email: i.student_email,
      department: i.department,
      university_name: 'Addis Ababa University',
      academic_year: i.academic_year,
      dean_title: 'Associate Dean of Academic Affairs',
      dean_verified_at: i.dean_signed_at,
      dean_signature_hash: i.dean_signature_hash,
      letter_title: `Official Summer Internship Campus Housing Letter - ${i.student_name}`,
      letter_notes: 'Approved for dormitory accommodation during in-house campus software project track.',
      allow_dorm: true,
      allow_food: true,
      valid_from: i.valid_from,
      valid_until: i.valid_until,
      qr_code: i.student_union_qr_code,
      forwarded_at: i.created_at,
    }));

    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// GET /v1/uil-profiles/student-dean/forwarded-letters/
// -------------------------------------------------------------
router.get('/student-dean/forwarded-letters/', requireAuth, async (req, res) => {
  try {
    const items = await CampusLogistics.findAll({
      where: { dean_approved: true }
    });

    const results = items.map(i => ({
      student_id: i.student_id,
      student_id_number: i.student_id_number,
      student_name: i.student_name,
      student_email: i.student_email,
      department: i.department,
      university_name: 'Addis Ababa University',
      academic_year: i.academic_year,
      dean_title: 'Dean of Students',
      dean_verified_at: i.dean_signed_at,
      dean_signature_hash: i.dean_signature_hash,
      letter_title: `Student Affairs Clearance & Meal Card Letter - ${i.student_name}`,
      letter_notes: 'Approved for cafeteria meal service privileges.',
      allow_dorm: true,
      allow_food: true,
      valid_from: i.valid_from,
      valid_until: i.valid_until,
      qr_code: i.student_union_qr_code,
      forwarded_at: i.created_at,
    }));

    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// GET /v1/uil-profiles/student/me/
// -------------------------------------------------------------
router.get('/student/me/', requireAuth, async (req, res) => {
  try {
    const profile = await StudentProfile.findOne({ where: { user_id: req.user.id } });
    return res.status(200).json({
      student_id: req.user.id,
      student_id_number: req.user.staff_id_number || `UGR/${req.user.id}/16`,
      full_name: req.user.getFullName(),
      email: req.user.email,
      department: req.user.department || profile?.field_of_study || 'Software Engineering',
      university: req.user.university_name || profile?.university || 'Addis Ababa University',
      academic_year: 4,
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// GET /v1/uil/departments/roster-excel/ — Download Excel Roster
// -------------------------------------------------------------
const excelRosterHandler = async (req, res) => {
  try {
    const dept = req.query.department || 'Software Engineering';
    const year = parseInt(req.query.year, 10) || 4;

    const students = await User.findAll({
      where: { role: 'student' },
      limit: 50,
    });

    const studentList = students.map((s, idx) => ({
      student_id: s.staff_id_number || `UGR/${1000 + idx}/16`,
      full_name: s.getFullName(),
      department: dept,
      academic_year: year,
      advisor_score: 23,
      uil_score: 24,
      doc_score: 22,
      pres_score: 25,
    }));

    const buffer = await generateDeanScoreRosterTemplate(dept, year, studentList);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="UIL_Score_Roster_${dept.replace(/\s+/g, '_')}_Year${year}.xlsx"`);
    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

router.get('/departments/roster-excel/', requireAuth, excelRosterHandler);
router.get('/export-excel/', requireAuth, excelRosterHandler);
router.get('/roster-excel/', requireAuth, excelRosterHandler);

export default router;
