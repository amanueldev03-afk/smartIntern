import express from 'express';
import path from 'path';
import { User, StudentProfile, Skill, CareerInterest, CV, StudentSkill, StudentInterest } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { computeProfileCompletion } from '../services/profileCompletion.js';
import { validateResumeFile, extractTextFromFile, extractCVData } from '../services/cvExtractor.js';

const router = express.Router();

const getOrCreateProfile = async (userId) => {
  const [profile] = await StudentProfile.findOrCreate({
    where: { user_id: userId },
    defaults: { user_id: userId }
  });
  return profile;
};

// -------------------------------------------------------------
// GET /api/students/me/ — personal info + education
// -------------------------------------------------------------
router.get('/me/', requireAuth, async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req.user.id);
    const skills = await profile.getSkills();
    const interests = await profile.getInterests();
    const completion = await computeProfileCompletion(profile, skills.length, interests.length);

    return res.status(200).json({
      id: profile.id,
      phone: profile.phone,
      country: profile.country,
      city: profile.city,
      date_of_birth: profile.date_of_birth,
      bio: profile.bio,
      education_level: profile.education_level,
      current_year: profile.current_year,
      field_of_study: profile.field_of_study,
      university: profile.university,
      student_id_number: profile.student_id_number,
      gpa: profile.gpa,
      completion,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// PATCH /api/students/me/ — update personal info + education
// -------------------------------------------------------------
router.patch('/me/', requireAuth, async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req.user.id);
    const allowed = [
      'phone', 'country', 'city', 'date_of_birth', 'bio',
      'education_level', 'current_year', 'field_of_study', 'university',
      'student_id_number', 'gpa'
    ];

    allowed.forEach(field => {
      if (req.body[field] !== undefined) {
        profile[field] = req.body[field];
      }
    });

    await profile.save();

    const skills = await profile.getSkills();
    const interests = await profile.getInterests();
    const completion = await computeProfileCompletion(profile, skills.length, interests.length);

    return res.status(200).json({
      id: profile.id,
      phone: profile.phone,
      country: profile.country,
      city: profile.city,
      date_of_birth: profile.date_of_birth,
      bio: profile.bio,
      education_level: profile.education_level,
      current_year: profile.current_year,
      field_of_study: profile.field_of_study,
      university: profile.university,
      student_id_number: profile.student_id_number,
      gpa: profile.gpa,
      completion,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
    });
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// GET /api/students/me/preferences/
// -------------------------------------------------------------
router.get('/me/preferences/', requireAuth, async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req.user.id);
    return res.status(200).json({
      country: profile.country,
      city: profile.city,
      work_mode: profile.work_type,
      internship_type: profile.internship_type,
      availability_start: profile.availability_start,
      availability_end: profile.availability_end,
      availability_immediately: Boolean(profile.availability_immediately),
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// PATCH /api/students/me/preferences/
// -------------------------------------------------------------
router.patch('/me/preferences/', requireAuth, async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req.user.id);
    const { country, city, work_mode, internship_type, availability_start, availability_end, availability_immediately } = req.body;

    if (country !== undefined) profile.country = country;
    if (city !== undefined) profile.city = city;
    if (work_mode !== undefined) profile.work_type = work_mode;
    if (internship_type !== undefined) profile.internship_type = internship_type;
    if (availability_start !== undefined) profile.availability_start = availability_start;
    if (availability_end !== undefined) profile.availability_end = availability_end;
    if (availability_immediately !== undefined) profile.availability_immediately = Boolean(availability_immediately);

    await profile.save();

    return res.status(200).json({
      country: profile.country,
      city: profile.city,
      work_mode: profile.work_type,
      internship_type: profile.internship_type,
      availability_start: profile.availability_start,
      availability_end: profile.availability_end,
      availability_immediately: Boolean(profile.availability_immediately),
    });
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// GET/POST/DELETE /api/students/me/skills/
// -------------------------------------------------------------
router.get('/me/skills/', requireAuth, async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req.user.id);
    const skills = await profile.getSkills();
    return res.status(200).json(skills);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

router.post('/me/skills/', requireAuth, async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req.user.id);
    let skillId = req.body.skill_id;
    const skillName = req.body.name || (Array.isArray(req.body.skills) ? req.body.skills[0] : null);

    let skill = null;
    if (skillId) {
      skill = await Skill.findByPk(skillId);
    } else if (skillName) {
      [skill] = await Skill.findOrCreate({
        where: { name: skillName.trim() },
        defaults: { name: skillName.trim(), category: req.body.category || 'General' }
      });
    }

    if (skill) {
      await profile.addSkill(skill);
      return res.status(201).json(skill);
    }
    return res.status(400).json({ detail: 'Skill not provided or could not be created.' });
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.delete('/me/skills/', requireAuth, async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req.user.id);
    const skillId = req.body.skill_id;
    if (skillId) {
      await StudentSkill.destroy({
        where: { student_profile_id: profile.id, skill_id: skillId }
      });
    }
    return res.status(204).send();
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// GET /api/students/skills/choices/
// -------------------------------------------------------------
router.get('/skills/choices/', async (req, res) => {
  try {
    const skills = await Skill.findAll({ where: { is_active: true }, limit: 100 });
    return res.status(200).json(skills);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// GET/POST/DELETE /api/students/me/interests/
// -------------------------------------------------------------
router.get('/me/interests/', requireAuth, async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req.user.id);
    const interests = await profile.getInterests();
    return res.status(200).json(interests);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

router.post('/me/interests/', requireAuth, async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req.user.id);
    let interestId = req.body.interest_id;
    const interestName = req.body.name || (Array.isArray(req.body.interests) ? req.body.interests[0] : null);

    let interest = null;
    if (interestId) {
      interest = await CareerInterest.findByPk(interestId);
    } else if (interestName) {
      [interest] = await CareerInterest.findOrCreate({
        where: { name: interestName.trim() },
        defaults: { name: interestName.trim() }
      });
    }

    if (interest) {
      await profile.addInterest(interest);
      return res.status(201).json(interest);
    }
    return res.status(400).json({ detail: 'Interest not provided.' });
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.delete('/me/interests/', requireAuth, async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req.user.id);
    const interestId = req.body.interest_id;
    if (interestId) {
      await StudentInterest.destroy({
        where: { student_profile_id: profile.id, interest_id: interestId }
      });
    }
    return res.status(204).send();
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// GET /api/students/interests/choices/
// -------------------------------------------------------------
router.get('/interests/choices/', async (req, res) => {
  try {
    const choices = await CareerInterest.findAll({ where: { is_active: true }, limit: 100 });
    return res.status(200).json(choices);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// POST /api/students/me/resume/ & /api/students/cv/upload/
// -------------------------------------------------------------
const handleResumeUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ detail: 'No resume/CV file provided.' });
    }

    const filePath = req.file.path;
    validateResumeFile(filePath, req.file.originalname);

    const relativePath = `student_cvs/${req.file.filename}`;
    const profile = await getOrCreateProfile(req.user.id);

    // Create CV record
    const cv = await CV.create({
      student_id: req.user.id,
      file: relativePath,
      processing_status: 'PENDING',
    });

    profile.resume = relativePath;
    profile.cv = relativePath;
    await profile.save();

    // Asynchronously process CV text extraction and heuristics
    (async () => {
      try {
        cv.processing_status = 'PROCESSING';
        await cv.save();

        const rawText = await extractTextFromFile(filePath);
        const extracted = extractCVData(rawText);

        cv.extracted_data = extracted;
        cv.processing_status = 'COMPLETED';
        await cv.save();

        // Update profile with extracted education / skills if empty
        if (!profile.university && extracted.university) profile.university = extracted.university;
        if (!profile.field_of_study && extracted.field_of_study) profile.field_of_study = extracted.field_of_study;
        if (!profile.education_level && extracted.degree) profile.education_level = extracted.degree;
        profile.resume_parsed = true;
        await profile.save();

        // Auto-link extracted skills
        if (extracted.extracted_skills && extracted.extracted_skills.length > 0) {
          for (const sName of extracted.extracted_skills.slice(0, 10)) {
            const [sk] = await Skill.findOrCreate({ where: { name: sName }, defaults: { name: sName } });
            await profile.addSkill(sk);
          }
        }
      } catch (err) {
        console.error('CV Background processing error:', err);
        cv.processing_status = 'FAILED';
        cv.error_message = err.message;
        await cv.save();
      }
    })();

    const fullUrl = `${req.protocol}://${req.get('host')}/media/${relativePath}`;
    return res.status(201).json({
      cv_id: cv.id,
      processing_status: cv.processing_status,
      resume_url: fullUrl,
      message: 'CV uploaded. Processing in background.',
    });
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
};

router.post('/me/resume/', requireAuth, upload.single('resume'), handleResumeUpload);
router.post('/cv/upload/', requireAuth, upload.single('cv'), handleResumeUpload);

// -------------------------------------------------------------
// GET /api/students/me/resume/ & /api/students/cv/status/
// -------------------------------------------------------------
router.get('/me/resume/', requireAuth, async (req, res) => {
  try {
    const cv = await CV.findOne({
      where: { student_id: req.user.id },
      order: [['created_at', 'DESC']]
    });

    if (!cv) {
      return res.status(200).json({ has_cv: false, processing_status: 'NONE' });
    }

    const fullUrl = `${req.protocol}://${req.get('host')}/media/${cv.file}`;
    return res.status(200).json({
      has_cv: true,
      processing_status: cv.processing_status,
      resume_url: fullUrl,
      uploaded_at: cv.uploaded_at,
      extracted_data: cv.extracted_data || {},
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

router.get('/cv/status/', requireAuth, async (req, res) => {
  try {
    const cv = await CV.findOne({
      where: { student_id: req.user.id },
      order: [['created_at', 'DESC']]
    });

    if (!cv) {
      return res.status(200).json({
        has_cv: false,
        processing_status: 'NONE',
        message: 'No CV uploaded yet.'
      });
    }

    return res.status(200).json({
      has_cv: true,
      cv_id: cv.id,
      processing_status: cv.processing_status,
      uploaded_at: cv.uploaded_at,
      extracted_data: cv.extracted_data || {},
      error_message: cv.error_message,
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

router.get('/cv/:id/status/', requireAuth, async (req, res) => {
  try {
    const cv = await CV.findByPk(req.params.id);
    if (!cv) return res.status(404).json({ detail: 'CV not found.' });

    return res.status(200).json({
      has_cv: true,
      cv_id: cv.id,
      processing_status: cv.processing_status,
      uploaded_at: cv.uploaded_at,
      extracted_data: cv.extracted_data || {},
      error_message: cv.error_message,
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// GET /api/students/ — Full Student Profile
// -------------------------------------------------------------
router.get('/', requireAuth, async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req.user.id);
    const skills = await profile.getSkills();
    const interests = await profile.getInterests();
    const completion = await computeProfileCompletion(profile, skills.length, interests.length);
    const latestCV = await CV.findOne({ where: { student_id: req.user.id }, order: [['created_at', 'DESC']] });

    return res.status(200).json({
      id: profile.id,
      user: req.user.id,
      phone: profile.phone,
      country: profile.country,
      city: profile.city,
      date_of_birth: profile.date_of_birth,
      bio: profile.bio,
      education_level: profile.education_level,
      field_of_study: profile.field_of_study,
      university: profile.university,
      student_id_number: profile.student_id_number,
      gpa: profile.gpa,
      skills: skills.map(s => s.id),
      interests: interests.map(i => i.id),
      internship_type: profile.internship_type,
      work_type: profile.work_type,
      compensation_preference: profile.compensation_preference,
      minimum_compensation: profile.minimum_compensation,
      maximum_compensation: profile.maximum_compensation,
      compensation_currency: profile.compensation_currency,
      preferred_locations: profile.preferred_locations || [],
      willing_to_relocate: Boolean(profile.willing_to_relocate),
      preferred_industries: profile.preferred_industries || [],
      preferred_roles: profile.preferred_roles || [],
      internship_duration_min_weeks: profile.internship_duration_min_weeks,
      internship_duration_max_weeks: profile.internship_duration_max_weeks,
      availability_start: profile.availability_start,
      availability_end: profile.availability_end,
      cv: profile.cv ? `${req.protocol}://${req.get('host')}/media/${profile.cv}` : null,
      resume: profile.resume ? `${req.protocol}://${req.get('host')}/media/${profile.resume}` : null,
      cv_data: latestCV ? {
        has_cv: true,
        processing_status: latestCV.processing_status,
        ...(latestCV.extracted_data || {})
      } : { has_cv: false },
      completion,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

export default router;
