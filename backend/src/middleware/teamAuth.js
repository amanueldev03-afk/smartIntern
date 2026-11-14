import { ProjectTeam, TeamMember, StudentProfile } from '../models/index.js';

/**
 * Reusable object-level authorization for project team resources.
 *
 * Verifies that the authenticated user is an authorized member of the team,
 * the assigned academic advisor, or an administrator.
 */
export async function verifyTeamAccess(teamId, user, options = {}) {
  if (!teamId) {
    return { status: 400, detail: 'Team ID is required.', team: null };
  }
  if (!user) {
    return { status: 401, detail: 'Authentication required.', team: null };
  }

  // Inactive or disabled accounts are unconditionally barred from team access
  if (!user.is_active) {
    return { status: 403, detail: 'User account is inactive or disabled.', team: null };
  }

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!isUUID.test(String(teamId))) {
    return { status: 404, detail: 'Team not found.', team: null };
  }

  const team = await ProjectTeam.findByPk(teamId);
  if (!team) {
    return { status: 404, detail: 'Team not found.', team: null };
  }

  const userRole = (user.role || '').toLowerCase();
  const isAdmin = userRole === 'admin' || Boolean(user.is_superuser);

  // If caller is a student, verify that an active student profile exists
  if (userRole === 'student') {
    const profile = await StudentProfile.findOne({ where: { user_id: user.id } });
    if (!profile) {
      return {
        status: 403,
        detail: 'Student profile not found. Please complete profile registration before accessing project teams.',
        team: null,
      };
    }
  }

  // Check if assigned advisor
  const isAdvisor = Boolean(team.assigned_advisor_id && String(team.assigned_advisor_id) === String(user.id));

  // Check if active team member
  const member = await TeamMember.findOne({
    where: { team_id: team.id, student_id: user.id },
  });
  const isMember = Boolean(member);
  const isLeader = Boolean(member?.is_leader);

  const { requireAdvisorOnly = false, requireMemberOnly = false, requireLeaderOnly = false } = options;

  if (requireAdvisorOnly) {
    if (isAdvisor || isAdmin) {
      return { status: 200, team, member, isMember, isAdvisor, isLeader, isAdmin };
    }
    return {
      status: 403,
      detail: 'Only the assigned academic advisor or an administrator can perform this action.',
      team,
    };
  }

  if (requireLeaderOnly) {
    if (isLeader || isAdmin) {
      return { status: 200, team, member, isMember, isAdvisor, isLeader, isAdmin };
    }
    return {
      status: 403,
      detail: 'Only the designated team leader or an administrator can perform this action.',
      team,
    };
  }

  if (requireMemberOnly) {
    if (isMember || isAdmin) {
      return { status: 200, team, member, isMember, isAdvisor, isLeader, isAdmin };
    }
    return {
      status: 403,
      detail: 'Only authorized team members can perform this action.',
      team,
    };
  }

  if (isMember || isAdvisor || isAdmin) {
    return { status: 200, team, member, isMember, isAdvisor, isLeader, isAdmin };
  }

  return {
    status: 403,
    detail: 'You do not have permission to access this project team.',
    team,
  };
}

/**
 * Express middleware helper to enforce team access.
 * Inspects req.params.teamId or req.params.id.
 */
export const requireTeamAccess = (options = {}) => {
  return async (req, res, next) => {
    try {
      const teamId = req.params.teamId || req.params.id;
      const result = await verifyTeamAccess(teamId, req.user, options);
      if (result.status !== 200) {
        return res.status(result.status).json({ detail: result.detail });
      }
      req.team = result.team;
      req.teamMember = result.member;
      req.teamAccess = result;
      next();
    } catch (err) {
      return res.status(500).json({ detail: 'Team authorization could not be verified.' });
    }
  };
};

export default {
  verifyTeamAccess,
  requireTeamAccess,
};
