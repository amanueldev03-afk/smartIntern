import express from 'express';
import { Internship, StudentProfile, Recommendation, CV, User, Skill } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { scoreInternship } from '../services/recommendationEngine.js';
import { paginate } from '../utils/pagination.js';

const router = express.Router();

// -------------------------------------------------------------
// GET /api/recommendations/ — Personalised AI Recommendations
// -------------------------------------------------------------
router.get('/', requireAuth, async (req, res) => {
  try {
    const profile = await StudentProfile.findOne({ where: { user_id: req.user.id } });
    const skills = profile ? await profile.getSkills() : [];
    const studentSkillNames = skills.map(s => s.name);

    const latestCV = await CV.findOne({
      where: { student_id: req.user.id },
      order: [['created_at', 'DESC']]
    });

    if (latestCV?.extracted_data?.extracted_skills) {
      latestCV.extracted_data.extracted_skills.forEach(s => {
        if (!studentSkillNames.includes(s)) studentSkillNames.push(s);
      });
    }

    // Active internships
    const internships = await Internship.findAll({
      where: { status: 'active' }, include: [{ model: Skill, as: 'skills' }],
      limit: 100,
    });

    // Score each internship
    const scoredList = internships.map(internship => {
      return scoreInternship(internship, profile, studentSkillNames);
    });

    // Sort descending by match_score
    scoredList.sort((a, b) => b.match_score - a.match_score);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size, 10) || 20));
    const offset = (page - 1) * pageSize;
    const paginatedItems = scoredList.slice(offset, offset + pageSize);

    const paginatedResponse = paginate(req, scoredList.length, paginatedItems, pageSize);

    return res.status(200).json({
      ...paginatedResponse,
      cv_analysis: latestCV ? {
        has_cv: true,
        processing_status: latestCV.processing_status,
        message: 'CV analyzed successfully.',
        extracted_skills: latestCV.extracted_data?.extracted_skills || [],
        extracted_education: latestCV.extracted_data?.extracted_education || [],
        extracted_experience: latestCV.extracted_data?.extracted_experience || [],
        extracted_projects: latestCV.extracted_data?.extracted_projects || [],
        extracted_certifications: latestCV.extracted_data?.extracted_certifications || [],
        uploaded_at: latestCV.uploaded_at,
      } : {
        has_cv: false,
        message: 'No CV uploaded. Recommendations generated from profile.'
      },
      profile_summary: {
        skills: studentSkillNames,
        internship_type: profile?.internship_type || 'any',
        work_type: profile?.work_type || 'either',
        compensation_preference: profile?.compensation_preference || 'either',
        country: profile?.country || 'Ethiopia',
        city: profile?.city || 'Addis Ababa',
        preferred_locations: profile?.preferred_locations || [],
        willing_to_relocate: Boolean(profile?.willing_to_relocate),
        has_embedding: Boolean(profile?.embedding),
        field_of_study: profile?.field_of_study || 'General Engineering',
        education_level: profile?.education_level || 'Undergraduate',
      },
      scoring_metadata: {
        from_cache: false,
        cache_ttl_seconds: 1800,
        weights: {
          semantic: '40%',
          skills: '25%',
          preference: '20%',
          location: '10%',
          salary: '5%',
        }
      }
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// GET /api/recommendations/history/
// -------------------------------------------------------------
router.get('/history/', requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size, 10) || 20));
    const offset = (page - 1) * pageSize;

    const { count, rows } = await Recommendation.findAndCountAll({
      where: { user_id: req.user.id },
      include: [{ model: Internship, as: 'internship' }],
      limit: pageSize,
      offset,
      order: [['created_at', 'DESC']]
    });

    const results = rows.map(r => ({
      id: r.id,
      internship: r.internship_id,
      internship_title: r.internship?.title || '',
      organization_name: r.internship?.organization_name || '',
      overall_score: r.match_score,
      semantic_score: r.semantic_score,
      skill_score: r.skill_score,
      preference_score: r.preference_score,
      location_score: r.location_score,
      salary_score: r.salary_score,
      status: r.status,
      recommendation_date: r.created_at,
      viewed_at: r.viewed_at,
      saved_at: r.saved_at,
      applied_at: r.applied_at,
      ignored_at: r.ignored_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    return res.status(200).json(paginate(req, count, results, pageSize));
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// POST /api/recommendations/:id/feedback/
// -------------------------------------------------------------
router.post('/:id/feedback/', requireAuth, async (req, res) => {
  try {
    const { action } = req.body;
    return res.status(200).json({ message: 'Feedback recorded successfully.', status: action || 'viewed' });
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

export default router;
