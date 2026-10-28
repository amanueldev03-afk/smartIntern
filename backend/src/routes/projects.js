import express from 'express';
import { ProjectTeam, TeamMember, ProjectTeamMessage, WeeklyLogbook, User } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { checkLogbookPlagiarism } from '../services/plagiarismChecker.js';

import sequelize from '../config/database.js';

const router = express.Router();

const formatTeam = async (team, req) => {
  if (!team) return null;
  const members = await TeamMember.findAll({
    where: { team_id: team.id },
  });

  const advisor = team.assigned_advisor_id ? await User.findByPk(team.assigned_advisor_id) : null;

  return {
    id: team.id,
    team_name: team.team_name,
    project_title: team.project_title,
    cohort: team.cohort_id || '2026/1',
    assigned_advisor: advisor ? {
      id: advisor.id,
      email: advisor.email,
      username: advisor.username,
      first_name: advisor.first_name,
      last_name: advisor.last_name,
    } : null,
    srs_status: team.srs_status,
    srs_document: team.srs_document ? `${req.protocol}://${req.get('host')}/media/${team.srs_document}` : null,
    srs_feedback: team.srs_feedback || '',
    srs_revision_deadline: team.srs_revision_deadline,
    coding_unlocked: Boolean(team.srs_status === 'APPROVED'),
    members: members.map(m => ({
      id: m.id,
      student: {
        id: m.student_id,
        user: {
          id: req.user.id,
          first_name: req.user.first_name || '',
          last_name: req.user.last_name || '',
          email: req.user.email || '',
        },
        department: req.user.department || 'Software Engineering',
        primary_skill: 'React / Node.js',
      },
      assigned_role: m.assigned_role,
      primary_stack: 'React / Node.js',
    })),
    created_at: team.created_at,
  };
};

// -------------------------------------------------------------
// GET /v1/projects/my-channel/
// -------------------------------------------------------------
router.get('/my-channel/', requireAuth, async (req, res) => {
  try {
    let studentProfileId = null;
    if (req.user.role === 'student') {
      const studentIdNumber = req.user.staff_id_number || `UGR/${req.user.id.slice(0, 5)}/16`;
      const p = await sequelize.query(
        `INSERT INTO accounts_studentprofile (user_id, student_id_number, university_name, campus_city, department, academic_year, bio, skill_tags, is_active_for_internship, created_at, updated_at)
         VALUES ($1, $2, 'Addis Ababa University', 'Addis Ababa', 'Software Engineering', 4, '', '[]', true, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
         RETURNING id;`,
        { bind: [req.user.id, studentIdNumber], type: sequelize.QueryTypes.SELECT }
      );
      studentProfileId = p[0].id;
    }

    let member = studentProfileId ? await TeamMember.findOne({ where: { student_id: studentProfileId } }) : null;
    let team = null;

    if (member) {
      team = await ProjectTeam.findByPk(member.team_id);
    } else if (req.user.role === 'advisor') {
      team = await ProjectTeam.findOne({ where: { assigned_advisor_id: req.user.id } });
    }

    if (!team) {
      const cohortRows = await sequelize.query(`SELECT id FROM universities_inhousecohort LIMIT 1;`, { type: sequelize.QueryTypes.SELECT });
      const cohortId = cohortRows[0]?.id || '033d8b4d-e23c-40f1-915a-b1a8ef907655';

      [team] = await ProjectTeam.findOrCreate({
        where: { team_name: 'Campus Software House Team 1' },
        defaults: {
          team_name: 'Campus Software House Team 1',
          project_title: 'Smart Health Monitoring System',
          cohort_id: cohortId,
          srs_status: 'DRAFT',
          channels_active: true,
        }
      });

      if (studentProfileId) {
        await TeamMember.findOrCreate({
          where: { team_id: team.id, student_id: studentProfileId },
          defaults: {
            team_id: team.id,
            student_id: studentProfileId,
            assigned_role: 'Full Stack Engineer',
            is_leader: false
          }
        });
      }
    }

    const formattedTeam = await formatTeam(team, req);
    const messages = await ProjectTeamMessage.findAll({
      where: { team_id: team.id },
      include: [{ model: User, as: 'sender' }],
      order: [['created_at', 'ASC']]
    });

    return res.status(200).json({
      team: formattedTeam,
      messages: messages.map(m => ({
        id: m.id,
        team: m.team_id,
        sender: {
          id: m.sender?.id || m.sender_id,
          email: m.sender?.email || '',
          first_name: m.sender?.first_name || '',
          last_name: m.sender?.last_name || '',
          role: (m.sender?.role || 'student').toLowerCase(),
        },
        message_type: m.message_type,
        content: m.content,
        created_at: m.created_at,
      }))
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// POST /v1/projects/teams/:teamId/srs/upload/
// -------------------------------------------------------------
router.post('/teams/:teamId/srs/upload/', requireAuth, upload.single('srs_document'), async (req, res) => {
  try {
    const team = await ProjectTeam.findByPk(req.params.teamId);
    if (!team) return res.status(404).json({ detail: 'Team not found.' });

    if (req.file) {
      team.srs_document = `srs_docs/${req.file.filename}`;
      team.srs_status = 'SUBMITTED';
      await team.save();
    }

    return res.status(200).json({
      message: 'SRS document uploaded successfully.',
      srs_status: team.srs_status,
      srs_document: team.srs_document ? `${req.protocol}://${req.get('host')}/media/${team.srs_document}` : null,
    });
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// POST /v1/projects/teams/:teamId/srs/review/
// -------------------------------------------------------------
router.post('/teams/:teamId/srs/review/', requireAuth, async (req, res) => {
  try {
    const team = await ProjectTeam.findByPk(req.params.teamId);
    if (!team) return res.status(404).json({ detail: 'Team not found.' });

    const { decision, feedback } = req.body;
    team.srs_status = decision === 'APPROVED' ? 'APPROVED' : 'REVISION_REQUIRED';
    if (feedback) team.srs_feedback = feedback;
    if (decision === 'APPROVED') team.coding_unlocked = true;
    await team.save();

    return res.status(200).json({
      message: `SRS ${decision.toLowerCase()} successfully.`,
      srs_status: team.srs_status,
      coding_unlocked: team.coding_unlocked,
    });
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// GET & POST /v1/projects/teams/:teamId/messages/
// -------------------------------------------------------------
router.get('/teams/:teamId/messages/', requireAuth, async (req, res) => {
  try {
    const messages = await ProjectTeamMessage.findAll({
      where: { team_id: req.params.teamId },
      include: [{ model: User, as: 'sender' }],
      order: [['created_at', 'ASC']]
    });

    return res.status(200).json(messages.map(m => ({
      id: m.id,
      team: m.team_id,
      sender: {
        id: m.sender?.id || m.sender_id,
        email: m.sender?.email || '',
        first_name: m.sender?.first_name || '',
        last_name: m.sender?.last_name || '',
        role: (m.sender?.role || 'student').toLowerCase(),
      },
      message_type: m.message_type,
      content: m.content,
      created_at: m.created_at,
    })));
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

router.post('/teams/:teamId/messages/', requireAuth, async (req, res) => {
  try {
    const { content, message: bodyMessage, message_type = 'GENERAL' } = req.body;
    const text = content || bodyMessage;
    if (!text) return res.status(400).json({ detail: 'Content is required.' });

    const msg = await ProjectTeamMessage.create({
      team_id: req.params.teamId,
      sender_id: req.user.id,
      message_type,
      message: text,
    });

    return res.status(201).json({
      id: msg.id,
      team: msg.team_id,
      sender: {
        id: req.user.id,
        email: req.user.email,
        first_name: req.user.first_name,
        last_name: req.user.last_name,
        role: (req.user.role || 'student').toLowerCase(),
      },
      message_type: msg.message_type,
      content: msg.content,
      created_at: msg.created_at,
    });
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// GET /v1/projects/teams/
// -------------------------------------------------------------
router.get('/teams/', requireAuth, async (req, res) => {
  try {
    const teams = await ProjectTeam.findAll({ order: [['created_at', 'DESC']] });
    const formatted = await Promise.all(teams.map(t => formatTeam(t, req)));
    return res.status(200).json(formatted);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// GET /v1/projects/teams/:id/
// -------------------------------------------------------------
router.get('/teams/:id/', requireAuth, async (req, res) => {
  try {
    const team = await ProjectTeam.findByPk(req.params.id);
    if (!team) return res.status(404).json({ detail: 'Team not found.' });
    const formatted = await formatTeam(team, req);
    return res.status(200).json(formatted);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// Logbooks & Alerts
// -------------------------------------------------------------
router.get('/logbooks/', requireAuth, async (req, res) => {
  try {
    const logbooks = await WeeklyLogbook.findAll({
      where: { student_id: req.user.id },
      order: [['week_number', 'DESC']]
    });
    return res.status(200).json(logbooks);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
});

router.post('/logbooks/', requireAuth, async (req, res) => {
  try {
    const tasksExecuted = req.body.tasks_executed || req.body.content || req.body.tasks_completed || '';
    const weekNumber = Number(req.body.week_number) || 1;

    let plagiarismResult = { similarity_score: 0.0, is_flagged: false, matched_snippet: '' };
    try {
      plagiarismResult = await checkLogbookPlagiarism(tasksExecuted, req.user.id, weekNumber);
    } catch (plagErr) {
      console.warn('[Logbook] Plagiarism check error:', plagErr.message);
    }

    const logbook = await WeeklyLogbook.create({
      ...req.body,
      student_id: req.user.id,
      week_number: weekNumber,
      tasks_executed: tasksExecuted,
      similarity_score: plagiarismResult.similarity_score,
      is_flagged: plagiarismResult.is_flagged,
      matched_snippet: plagiarismResult.matched_snippet,
      advisor_approved: false,
    });
    return res.status(201).json(logbook);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
});

router.get('/alerts/', requireAuth, (req, res) => {
  return res.status(200).json([]);
});

router.post('/alerts/:id/read/', requireAuth, (req, res) => {
  return res.status(200).json({ message: 'Alert marked as read.' });
});

router.get('/cohorts/', requireAuth, (req, res) => {
  return res.status(200).json([{ id: '1', name: 'Summer Cohort 2026', academic_year: '2026' }]);
});

export default router;
