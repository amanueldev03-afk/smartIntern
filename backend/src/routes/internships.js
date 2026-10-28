import express from 'express';
import { Op } from 'sequelize';
import {
  Internship,
  SavedInternship,
  InternshipApplication,
  Skill,
  DataSource,
  User,
  StudentProfile,
  Recommendation
} from '../models/index.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { paginate, getPaginationParams } from '../utils/pagination.js';
import { normalizeListing, findExactDuplicate } from '../services/dataNormalizer.js';

const router = express.Router();

// Helper to format internship
const formatInternship = (item) => {
  const json = item.toJSON ? item.toJSON() : item;
  json.required_skills = item.required_skills || [];
  json.is_expired = Boolean(item.is_expired);
  return json;
};

// -------------------------------------------------------------
// GET /api/internships/ — List Active Internships
// -------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { search, internship_type, work_type, compensation_type, category, city, country } = req.query;
    const { limit, offset } = getPaginationParams(req, 20);

    const where = { status: 'active' };

    if (internship_type) where.internship_type = internship_type;
    if (work_type) where.work_type = work_type;
    if (compensation_type) where.compensation_type = compensation_type;
    if (category) where.category = { [Op.like]: `%${category}%` };
    if (city) where.city = { [Op.like]: `%${city}%` };
    if (country) where.country = { [Op.like]: `%${country}%` };

    if (search) {
      where[Op.or] = [
        { title: { [Op.like]: `%${search}%` } },
        { organization_name: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
        { category: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Internship.findAndCountAll({
      where,
      limit,
      offset,
      include: [{ model: Skill, as: 'skills' }],
      order: [['posted_at', 'DESC']]
    });

    const formattedRows = rows.map(formatInternship);
    return res.status(200).json(paginate(req, count, formattedRows));
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// GET /api/internships/latest/
// -------------------------------------------------------------
router.get('/latest/', async (req, res) => {
  try {
    const items = await Internship.findAll({
      where: { status: 'active' },
      limit: 10,
      include: [{ model: Skill, as: 'skills' }],
      order: [['posted_at', 'DESC']]
    });
    return res.status(200).json(items.map(formatInternship));
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// GET /api/internships/saved/
// -------------------------------------------------------------
router.get('/saved/', requireAuth, async (req, res) => {
  try {
    const saved = await SavedInternship.findAll({
      where: { student_id: req.user.id },
      include: [{
        model: Internship,
        as: 'internship',
        include: [{ model: Skill, as: 'skills' }]
      }],
      order: [['created_at', 'DESC']]
    });

    const results = saved.map(item => ({
      id: item.id,
      internship: item.internship_id,
      internship_title: item.internship?.title || '',
      organization_name: item.internship?.organization_name || '',
      application_url: item.internship?.application_url || null,
      source_url: item.internship?.source_url || null,
      internship_details: item.internship ? formatInternship(item.internship) : null,
      created_at: item.created_at,
    }));

    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// POST /api/internships/:id/save/ & DELETE /api/internships/:id/save/
// -------------------------------------------------------------
router.post('/:id/save/', requireAuth, async (req, res) => {
  try {
    const internshipId = parseInt(req.params.id, 10);
    const [saved] = await SavedInternship.findOrCreate({
      where: { student_id: req.user.id, internship_id: internshipId },
      defaults: { student_id: req.user.id, internship_id: internshipId }
    });
    return res.status(201).json({ message: 'Internship saved successfully.', id: saved.id });
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.delete('/:id/save/', requireAuth, async (req, res) => {
  try {
    const internshipId = parseInt(req.params.id, 10);
    await SavedInternship.destroy({
      where: { student_id: req.user.id, internship_id: internshipId }
    });
    return res.status(204).send();
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// POST /api/internships/saved/add/ & DELETE /api/internships/saved/:id/
// -------------------------------------------------------------
router.post('/saved/add/', requireAuth, async (req, res) => {
  try {
    const internshipId = parseInt(req.body.internship_id, 10);
    const [saved] = await SavedInternship.findOrCreate({
      where: { student_id: req.user.id, internship_id: internshipId },
      defaults: { student_id: req.user.id, internship_id: internshipId }
    });
    return res.status(201).json({ message: 'Saved successfully', id: saved.id });
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.delete('/saved/:id/', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await SavedInternship.destroy({
      where: { id, student_id: req.user.id }
    });
    return res.status(204).send();
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// GET /api/internships/applications/ & POST /api/internships/applications/add/
// -------------------------------------------------------------
router.get('/applications/', requireAuth, async (req, res) => {
  try {
    const applications = await InternshipApplication.findAll({
      where: { student_id: req.user.id },
      include: [{
        model: Internship,
        as: 'internship',
        include: [{ model: Skill, as: 'skills' }]
      }],
      order: [['created_at', 'DESC']]
    });
    return res.status(200).json(applications);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

router.post('/applications/add/', requireAuth, async (req, res) => {
  try {
    const { internship_id, cover_letter } = req.body;
    const [app] = await InternshipApplication.findOrCreate({
      where: { student_id: req.user.id, internship_id: parseInt(internship_id, 10) },
      defaults: {
        student_id: req.user.id,
        internship_id: parseInt(internship_id, 10),
        notes: cover_letter || '',
        status: 'applied',
      }
    });
    return res.status(201).json(app);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.get('/applications/:id/', requireAuth, async (req, res) => {
  try {
    const app = await InternshipApplication.findOne({
      where: { id: req.params.id, student_id: req.user.id },
      include: [{ model: Internship, as: 'internship' }]
    });
    if (!app) return res.status(404).json({ detail: 'Application not found.' });
    return res.status(200).json(app);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

router.put('/applications/:id/', requireAuth, async (req, res) => {
  try {
    const app = await InternshipApplication.findOne({ where: { id: req.params.id, student_id: req.user.id } });
    if (!app) return res.status(404).json({ detail: 'Application not found.' });
    if (req.body.cover_letter !== undefined) app.notes = req.body.cover_letter;
    await app.save();
    return res.status(200).json(app);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.patch('/applications/:id/', requireAuth, async (req, res) => {
  try {
    const app = await InternshipApplication.findOne({ where: { id: req.params.id, student_id: req.user.id } });
    if (!app) return res.status(404).json({ detail: 'Application not found.' });
    if (req.body.cover_letter !== undefined) app.notes = req.body.cover_letter;
    await app.save();
    return res.status(200).json(app);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// GET /api/internships/dashboard/ — Student Dashboard Summary
// -------------------------------------------------------------
router.get('/dashboard/', requireAuth, async (req, res) => {
  try {
    const savedCount = await SavedInternship.count({ where: { student_id: req.user.id } });
    const appliedCount = await InternshipApplication.count({ where: { student_id: req.user.id } });
    const recommendedCount = await Internship.count({ where: { status: 'active' } });

    const recentRecommendations = await Internship.findAll({
      where: { status: 'active' },
      limit: 5,
      include: [{ model: Skill, as: 'skills' }],
      order: [['posted_at', 'DESC']]
    });

    return res.status(200).json({
      saved_count: savedCount,
      applied_count: appliedCount,
      recommended_count: recommendedCount,
      recent_recommendations: recentRecommendations.map(formatInternship),
      has_active_application: appliedCount > 0,
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// ADMIN INTERNSHIP ROUTES
// -------------------------------------------------------------
router.get('/admin/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { limit, offset } = getPaginationParams(req, 20);
    const { count, rows } = await Internship.findAndCountAll({
      limit,
      offset,
      include: [{ model: Skill, as: 'skills' }],
      order: [['created_at', 'DESC']]
    });
    return res.status(200).json(paginate(req, count, rows.map(formatInternship)));
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

router.post('/admin/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const normalized = await normalizeListing(req.body, 'manual_admin');
    const existing = await findExactDuplicate(normalized.content_hash);
    if (existing) {
      return res.status(200).json(formatInternship(existing));
    }
    const internship = await Internship.create({
      ...normalized,
      is_verified: true,
      status: 'active',
    });
    return res.status(201).json(formatInternship(internship));
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.get('/admin/dashboard/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const totalInternships = await Internship.count();
    const activeInternships = await Internship.count({ where: { status: 'active' } });
    const pendingInternships = await Internship.count({ where: { status: 'pending' } });
    const totalStudents = await User.count({ where: { role: 'student' } });
    const totalSources = await DataSource.count();

    return res.status(200).json({
      total_internships: totalInternships,
      active_internships: activeInternships,
      pending_internships: pendingInternships,
      total_students: totalStudents,
      total_sources: totalSources,
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

router.get('/admin/sources/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const sources = await DataSource.findAll();
    return res.status(200).json(sources);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

router.post('/admin/sources/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const source = await DataSource.create(req.body);
    return res.status(201).json(source);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.get('/admin/sources/:id/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const source = await DataSource.findByPk(req.params.id);
    if (!source) return res.status(404).json({ detail: 'Source not found.' });
    return res.status(200).json(source);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

router.put('/admin/sources/:id/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const source = await DataSource.findByPk(req.params.id);
    if (!source) return res.status(404).json({ detail: 'Source not found.' });
    await source.update(req.body);
    return res.status(200).json(source);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.patch('/admin/sources/:id/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const source = await DataSource.findByPk(req.params.id);
    if (!source) return res.status(404).json({ detail: 'Source not found.' });
    await source.update(req.body);
    return res.status(200).json(source);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.delete('/admin/sources/:id/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const source = await DataSource.findByPk(req.params.id);
    if (source) await source.destroy();
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

router.get('/admin/collection-logs/', requireAuth, requireAdmin, async (req, res) => {
  return res.status(200).json({ results: [], count: 0 });
});

router.post('/admin/sources/:id/collect/', requireAuth, requireAdmin, async (req, res) => {
  return res.status(200).json({ message: 'Collection triggered successfully.' });
});

router.get('/admin/skills/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const skills = await Skill.findAll({ order: [['name', 'ASC']] });
    return res.status(200).json(skills);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

router.post('/admin/skills/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const skill = await Skill.create(req.body);
    return res.status(201).json(skill);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.get('/admin/skills/:id/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const skill = await Skill.findByPk(req.params.id);
    if (!skill) return res.status(404).json({ detail: 'Skill not found.' });
    return res.status(200).json(skill);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

router.put('/admin/skills/:id/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const skill = await Skill.findByPk(req.params.id);
    if (!skill) return res.status(404).json({ detail: 'Skill not found.' });
    await skill.update(req.body);
    return res.status(200).json(skill);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.patch('/admin/skills/:id/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const skill = await Skill.findByPk(req.params.id);
    if (!skill) return res.status(404).json({ detail: 'Skill not found.' });
    await skill.update(req.body);
    return res.status(200).json(skill);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.delete('/admin/skills/:id/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const skill = await Skill.findByPk(req.params.id);
    if (skill) await skill.destroy();
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

router.get('/admin/review/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pending = await Internship.findAll({
      where: { status: { [Op.in]: ['pending', 'flagged'] } },
      limit: 50,
      include: [{ model: Skill, as: 'skills' }],
      order: [['updated_at', 'DESC']]
    });
    return res.status(200).json(pending.map(formatInternship));
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

router.post('/admin/:id/approve/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const item = await Internship.findByPk(req.params.id);
    if (!item) return res.status(404).json({ detail: 'Internship not found.' });
    item.status = 'active';
    item.is_verified = true;
    await item.save();
    return res.status(200).json({ message: 'Internship approved and published.' });
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.post('/admin/:id/reject/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const item = await Internship.findByPk(req.params.id);
    if (!item) return res.status(404).json({ detail: 'Internship not found.' });
    item.status = 'rejected';
    await item.save();
    return res.status(200).json({ message: 'Internship rejected.' });
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.post('/admin/:id/remove/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const item = await Internship.findByPk(req.params.id);
    if (item) await item.destroy();
    return res.status(200).json({ message: 'Internship removed.' });
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.post('/admin/internships/:id/verify/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const item = await Internship.findByPk(req.params.id);
    if (!item) return res.status(404).json({ detail: 'Internship not found.' });
    item.is_verified = Boolean(req.body.is_verified);
    await item.save();
    return res.status(200).json(formatInternship(item));
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.get('/admin/:id/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const item = await Internship.findByPk(req.params.id, {
      include: [{ model: Skill, as: 'skills' }]
    });
    if (!item) return res.status(404).json({ detail: 'Internship not found.' });
    return res.status(200).json(formatInternship(item));
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

router.put('/admin/:id/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const item = await Internship.findByPk(req.params.id);
    if (!item) return res.status(404).json({ detail: 'Internship not found.' });
    await item.update(req.body);
    return res.status(200).json(formatInternship(item));
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.patch('/admin/:id/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const item = await Internship.findByPk(req.params.id);
    if (!item) return res.status(404).json({ detail: 'Internship not found.' });
    await item.update(req.body);
    return res.status(200).json(formatInternship(item));
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.delete('/admin/:id/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const item = await Internship.findByPk(req.params.id);
    if (item) await item.destroy();
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// GET /api/internships/:id/ — Public details
// -------------------------------------------------------------
router.get('/:id/', async (req, res) => {
  try {
    const item = await Internship.findByPk(req.params.id, {
      include: [{ model: Skill, as: 'skills' }]
    });
    if (!item) return res.status(404).json({ detail: 'Internship not found.' });
    return res.status(200).json(formatInternship(item));
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

export default router;
