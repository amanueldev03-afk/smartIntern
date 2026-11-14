import express from 'express';
import { sendRouteError } from '../utils/routeErrors.js';
import { Op } from 'sequelize';
import { ProjectTeam, TeamMember, ProjectTeamMessage, WeeklyLogbook, User } from '../models/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { checkLogbookPlagiarism } from '../services/plagiarismChecker.js';
import { verifyTeamAccess } from '../middleware/teamAuth.js';

import sequelize from '../config/database.js';
import { databaseErrorResponse, withTransaction } from '../utils/transactions.js';

const router = express.Router();

const formatTeam = async (team, req) => {
  if (!team) return null;
  const members = await TeamMember.findAll({
    where: { team_id: team.id },
    include: [{ model: User, as: 'studentUser' }],
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
    members: members.map(m => {
      const u = m.studentUser || req.user;
      return {
        id: m.id,
        student: {
          id: m.student_id,
          user: {
            id: u?.id || req.user.id,
            first_name: u?.first_name || '',
            last_name: u?.last_name || '',
            email: u?.email || '',
          },
          department: u?.department || 'Software Engineering',
          primary_skill: 'React / Node.js',
        },
        assigned_role: m.assigned_role,
        primary_stack: 'React / Node.js',
      };
    }),
    created_at: team.created_at,
  };
};

// -------------------------------------------------------------
// GET /v1/projects/my-channel/
// -------------------------------------------------------------
router.get('/my-channel/', requireAuth, async (req, res) => {
  try {
    let team = null;
    if (req.user.role === 'student') {
      const member = await TeamMember.findOne({ where: { student_id: req.user.id } });
      if (member) {
        team = await ProjectTeam.findByPk(member.team_id);
      }
    } else if (req.user.role === 'advisor') {
      team = await ProjectTeam.findOne({ where: { assigned_advisor_id: req.user.id } });
    }

    if (!team) {
      const cohortId = '033d8b4d-e23c-40f1-915a-b1a8ef907655';

      team = await withTransaction(async (transaction) => {
        // Serialize creation of the one fallback team. The xact lock is
        // transaction-scoped, so PostgreSQL releases it on commit/rollback.
        if (sequelize.getDialect() === 'postgres') {
          await sequelize.query('SELECT pg_advisory_xact_lock(11818001)', { transaction });
        }
        const [resolvedTeam] = await ProjectTeam.findOrCreate({
          where: { team_name: 'Campus Software House Team 1' },
          defaults: {
            team_name: 'Campus Software House Team 1',
            project_title: 'Smart Health Monitoring System',
            cohort_id: cohortId,
            srs_status: 'DRAFT',
            channels_active: true,
          },
          transaction,
        });

        if (req.user.role === 'student') {
          await TeamMember.findOrCreate({
            where: { team_id: resolvedTeam.id, student_id: req.user.id },
            defaults: {
              team_id: resolvedTeam.id,
              student_id: req.user.id,
              assigned_role: 'Full Stack Engineer',
              is_leader: false,
            },
            transaction,
          });
        }
        return resolvedTeam;
      });
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
    const mapped = databaseErrorResponse(err);
    return res.status(mapped.status).json({
      detail: mapped.status >= 500 ? 'Project team could not be loaded.' : mapped.detail,
    });
  }
});

// -------------------------------------------------------------
// POST /v1/projects/teams/:teamId/srs/upload/
// -------------------------------------------------------------
router.post('/teams/:teamId/srs/upload/', requireAuth, upload.single('srs_document'), async (req, res) => {
  try {
    const access = await verifyTeamAccess(req.params.teamId, req.user, { requireMemberOnly: true });
    if (access.status !== 200) {
      return res.status(access.status).json({ detail: access.detail });
    }
    const team = access.team;

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
    return sendRouteError(res, err, 'The request could not be completed.');
  }
});

// -------------------------------------------------------------
// POST /v1/projects/teams/:teamId/srs/review/
// -------------------------------------------------------------
router.post('/teams/:teamId/srs/review/', requireAuth, requireRole('advisor', 'admin'), async (req, res) => {
  try {
    const access = await verifyTeamAccess(req.params.teamId, req.user, { requireAdvisorOnly: true });
    if (access.status !== 200) {
      return res.status(access.status).json({ detail: access.detail });
    }
    const team = access.team;

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
    return sendRouteError(res, err, 'The request could not be completed.');
  }
});

// -------------------------------------------------------------
// GET & POST /v1/projects/teams/:teamId/messages/
// -------------------------------------------------------------
router.get('/teams/:teamId/messages/', requireAuth, async (req, res) => {
  try {
    const access = await verifyTeamAccess(req.params.teamId, req.user);
    if (access.status !== 200) {
      return res.status(access.status).json({ detail: access.detail });
    }

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
    return sendRouteError(res, err, 'The request could not be completed.');
  }
});

router.post('/teams/:teamId/messages/', requireAuth, async (req, res) => {
  try {
    const access = await verifyTeamAccess(req.params.teamId, req.user);
    if (access.status !== 200) {
      return res.status(access.status).json({ detail: access.detail });
    }

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
    return sendRouteError(res, err, 'The request could not be completed.');
  }
});

// -------------------------------------------------------------
// GET /v1/projects/teams/
// -------------------------------------------------------------
router.get('/teams/', requireAuth, async (req, res) => {
  try {
    const userRole = (req.user.role || '').toLowerCase();
    const isAdmin = userRole === 'admin' || Boolean(req.user.is_superuser || req.user.is_staff);

    let teams;
    if (isAdmin) {
      teams = await ProjectTeam.findAll({ order: [['created_at', 'DESC']] });
    } else if (userRole === 'advisor') {
      teams = await ProjectTeam.findAll({
        where: { assigned_advisor_id: req.user.id },
        order: [['created_at', 'DESC']],
      });
    } else {
      const memberships = await TeamMember.findAll({
        where: { student_id: req.user.id },
        attributes: ['team_id'],
      });
      const teamIds = memberships.map(m => m.team_id).filter(Boolean);
      if (teamIds.length === 0) {
        return res.status(200).json([]);
      }
      teams = await ProjectTeam.findAll({
        where: { id: { [Op.in]: teamIds } },
        order: [['created_at', 'DESC']],
      });
    }

    const formatted = await Promise.all(teams.map(t => formatTeam(t, req)));
    return res.status(200).json(formatted);
  } catch (err) {
    return sendRouteError(res, err, 'The request could not be completed.');
  }
});

// -------------------------------------------------------------
// GET /v1/projects/teams/:id/
// -------------------------------------------------------------
router.get('/teams/:id/', requireAuth, async (req, res) => {
  try {
    const access = await verifyTeamAccess(req.params.id, req.user);
    if (access.status !== 200) {
      return res.status(access.status).json({ detail: access.detail });
    }
    const formatted = await formatTeam(access.team, req);
    return res.status(200).json(formatted);
  } catch (err) {
    return sendRouteError(res, err, 'The request could not be completed.');
  }
});

// -------------------------------------------------------------
// Logbooks & Alerts
// -------------------------------------------------------------
router.get('/logbooks/', requireAuth, async (req, res) => {
  try {
    const userRole = (req.user.role || '').toLowerCase();
    const isAdmin = userRole === 'admin' || Boolean(req.user.is_superuser || req.user.is_staff);

    let whereClause = { student_id: req.user.id };
    if (isAdmin) {
      whereClause = {};
      if (req.query.student_id) whereClause.student_id = req.query.student_id;
    } else if (userRole === 'advisor') {
      whereClause = { academic_advisor_id: req.user.id };
      if (req.query.student_id) whereClause.student_id = req.query.student_id;
    }

    const logbooks = await WeeklyLogbook.findAll({
      where: whereClause,
      order: [['week_number', 'DESC']]
    });
    return res.status(200).json(logbooks);
  } catch (err) {
    return sendRouteError(res, err, 'The request could not be completed.');
  }
});

router.post('/logbooks/', requireAuth, async (req, res) => {
  try {
    const studentId = req.user.id;
    const tasksPlanned = typeof req.body.tasks_planned === 'string' ? req.body.tasks_planned : '';
    const tasksExecuted = req.body.tasks_executed || req.body.content || req.body.tasks_completed || '';
    const challengesFaced = req.body.challenges_faced || req.body.blockers || '';
    const weekNumber = Math.max(1, parseInt(req.body.week_number, 10) || 1);

    let gitCommitUrls = [];
    if (Array.isArray(req.body.git_commit_urls)) {
      gitCommitUrls = req.body.git_commit_urls.map(u => String(u)).filter(Boolean);
    }

    let projectTeamId = req.body.project_team_id || req.body.team_id || null;
    let resolvedAdvisorId = null;

    if (projectTeamId) {
      const membership = await TeamMember.findOne({
        where: { team_id: projectTeamId, student_id: studentId },
      });
      if (!membership && !req.user.is_superuser && req.user.role !== 'admin') {
        return res.status(403).json({ detail: 'You are not a member of the specified project team.' });
      }
      const team = await ProjectTeam.findByPk(projectTeamId);
      if (team && team.assigned_advisor_id) {
        resolvedAdvisorId = team.assigned_advisor_id;
      }
    } else {
      const membership = await TeamMember.findOne({ where: { student_id: studentId } });
      if (membership) {
        projectTeamId = membership.team_id;
        const team = await ProjectTeam.findByPk(projectTeamId);
        if (team && team.assigned_advisor_id) {
          resolvedAdvisorId = team.assigned_advisor_id;
        }
      }
    }

    let plagiarismResult = { similarity_score: 0.0, is_flagged: false, matched_snippet: '' };
    try {
      plagiarismResult = await checkLogbookPlagiarism(tasksExecuted, studentId, weekNumber);
    } catch (plagErr) {
      console.warn('[Logbook] Plagiarism check error:', plagErr.message);
    }

    // Explicitly pick allowed attributes — no mass-assignment of advisor_approved or advisor_feedback
    const logbook = await WeeklyLogbook.create({
      project_team_id: projectTeamId,
      student_id: studentId,
      academic_advisor_id: resolvedAdvisorId,
      company_mentor_id: null,
      week_number: weekNumber,
      tasks_planned: tasksPlanned,
      tasks_executed: tasksExecuted,
      challenges_faced: challengesFaced,
      git_commit_urls: gitCommitUrls,
      similarity_score: plagiarismResult.similarity_score,
      is_flagged: plagiarismResult.is_flagged,
      matched_snippet: plagiarismResult.matched_snippet,
      advisor_approved: false,
      advisor_feedback: '',
    });
    return res.status(201).json(logbook);
  } catch (err) {
    return sendRouteError(res, err, 'The request could not be completed.');
  }
});

router.get('/alerts/', requireAuth, (req, res) => {
  return res.status(200).json([]);
});

router.post('/alerts/:id/read/', requireAuth, (req, res) => {
  return res.status(200).json({ message: 'Alert marked as read.' });
});

router.get('/cohorts/my-cohorts/', requireAuth, (req, res) => {
  return res.status(200).json({ cohorts: [] });
});

router.post('/cohorts/:cohortId/accept/', requireAuth, (req, res) => {
  return res.status(200).json({ message: 'Successfully enrolled in Track 1 In-House Cohort!' });
});

router.get('/cohorts/', requireAuth, (req, res) => {
  return res.status(200).json([{ id: '1', name: 'Summer Cohort 2026', academic_year: '2026' }]);
});

export default router;

