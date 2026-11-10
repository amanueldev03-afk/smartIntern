import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'crypto';

// Import all models
import {
  User,
  StudentProfile,
  Skill,
  StudentSkill,
  CareerInterest,
  StudentInterest,
  CV,
  Internship,
  InternshipSkillJoin,
  SavedInternship,
  InternshipApplication,
  Recommendation,
  ProjectTeam,
  TeamMember,
  WeeklyLogbook,
  ProjectTeamMessage,
  CampusLogistics,
  Notification,
  Company,
  DataSource,
  StudentActivityLog
} from '../src/models/index.js';

import sequelize from '../src/config/database.js';

// Use test schema
const TEST_SCHEMA = 'test_model_verification';

describe('Task 1.14: Model and Relationship Verification', () => {
  before(async () => {
    // Create test schema
    try {
      await sequelize.query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`);
      await sequelize.query(`SET search_path TO ${TEST_SCHEMA}, public`);
    } catch (err) {
      console.warn('Warning: Could not create test schema, using default schema:', err.message);
    }

    // Sync models
    await sequelize.sync({ force: true });
  });

  after(async () => {
    // Clean up
    try {
      await sequelize.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
      await sequelize.query(`SET search_path TO public`);
    } catch (err) {
      console.warn('Warning: Could not drop test schema:', err.message);
    }

    await sequelize.sync({ force: false });
  });

  describe('Model Definition Loading', () => {
    it('should load all 21 models without errors', () => {
      assert.ok(User);
      assert.ok(StudentProfile);
      assert.ok(Skill);
      assert.ok(StudentSkill);
      assert.ok(CareerInterest);
      assert.ok(StudentInterest);
      assert.ok(CV);
      assert.ok(Internship);
      assert.ok(InternshipSkillJoin);
      assert.ok(SavedInternship);
      assert.ok(InternshipApplication);
      assert.ok(Recommendation);
      assert.ok(ProjectTeam);
      assert.ok(TeamMember);
      assert.ok(WeeklyLogbook);
      assert.ok(ProjectTeamMessage);
      assert.ok(CampusLogistics);
      assert.ok(Notification);
      assert.ok(Company);
      assert.ok(DataSource);
      assert.ok(StudentActivityLog);
    });

    it('should have find methods on all models', () => {
      assert.ok(typeof User.findOne === 'function');
      assert.ok(typeof StudentProfile.findOne === 'function');
      assert.ok(typeof Skill.findOne === 'function');
      assert.ok(typeof CV.findOne === 'function');
      assert.ok(typeof Internship.findOne === 'function');
      assert.ok(typeof ProjectTeam.findOne === 'function');
      assert.ok(typeof Notification.findOne === 'function');
    });
  });

  describe('Identity Architecture Verification (Task 1.10)', () => {
    it('should use UUID for User.id', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      assert.ok(user.id);
      assert.strictEqual(typeof user.id, 'string');
      assert.ok(user.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i));
    });

    it('should use BIGINT for StudentProfile.id', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456'
      });

      assert.ok(profile.id);
      // PostgreSQL returns BIGINT as string to preserve precision
      assert.ok(typeof profile.id === 'string' || typeof profile.id === 'number');
    });

    it('should use UUID for TeamMember.student_id (references User.id)', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const team = await ProjectTeam.create({
        team_name: 'Test Team',
        project_title: 'Test Project'
      });

      const member = await TeamMember.create({
        team_id: team.id,
        student_id: user.id
      });

      assert.strictEqual(typeof member.student_id, 'string');
      assert.strictEqual(member.student_id, user.id);
    });

    it('should use BIGINT for StudentSkill.student_id (references StudentProfile.id)', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456'
      });

      const skill = await Skill.create({
        name: 'JavaScript'
      });

      const studentSkill = await StudentSkill.create({
        student_id: profile.id,
        skill_id: skill.id
      });

      assert.strictEqual(typeof studentSkill.student_id, 'string' || typeof studentSkill.student_id === 'number');
      assert.strictEqual(String(studentSkill.student_id), String(profile.id));
    });
  });

  describe('One-to-One Relationships', () => {
    it('should support User ↔ StudentProfile one-to-one', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456'
      });

      const userWithProfile = await User.findOne({
        where: { id: user.id },
        include: [{ model: StudentProfile, as: 'profile' }]
      });

      assert.ok(userWithProfile);
      assert.ok(userWithProfile.profile);
      assert.strictEqual(userWithProfile.profile.id, profile.id);
    });
  });

  describe('One-to-Many Relationships', () => {
    it('should support User ↔ CV one-to-many', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const cv1 = await CV.create({
        student_id: user.id,
        file: 'resume1.pdf'
      });

      const cv2 = await CV.create({
        student_id: user.id,
        file: 'resume2.pdf'
      });

      const userWithCVs = await User.findOne({
        where: { id: user.id },
        include: [{ model: CV, as: 'cvs' }]
      });

      assert.ok(userWithCVs);
      assert.strictEqual(userWithCVs.cvs.length, 2);
    });

    it('should support ProjectTeam ↔ TeamMember one-to-many', async () => {
      const user1 = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const user2 = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const team = await ProjectTeam.create({
        team_name: 'Test Team',
        project_title: 'Test Project'
      });

      await TeamMember.create({
        team_id: team.id,
        student_id: user1.id
      });

      await TeamMember.create({
        team_id: team.id,
        student_id: user2.id
      });

      const teamWithMembers = await ProjectTeam.findOne({
        where: { id: team.id },
        include: [{ model: TeamMember, as: 'members' }]
      });

      assert.ok(teamWithMembers);
      assert.strictEqual(teamWithMembers.members.length, 2);
    });
  });

  describe('Many-to-Many Relationships', () => {
    it('should support StudentProfile ↔ Skill many-to-many', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456'
      });

      const skill1 = await Skill.create({ name: `JavaScript-${randomUUID()}` });
      const skill2 = await Skill.create({ name: `Python-${randomUUID()}` });

      await profile.addSkill(skill1);
      await profile.addSkill(skill2);

      const profileWithSkills = await StudentProfile.findOne({
        where: { id: profile.id },
        include: [{ model: Skill, as: 'skills' }]
      });

      assert.ok(profileWithSkills);
      assert.strictEqual(profileWithSkills.skills.length, 2);
    });

    it('should support Internship ↔ Skill many-to-many', async () => {
      const internship = await Internship.create({
        title: 'Test Internship',
        organization_name: 'Test Company',
        description: 'Test description'
      });

      const skill1 = await Skill.create({ name: `React-${randomUUID()}` });
      const skill2 = await Skill.create({ name: `Node.js-${randomUUID()}` });

      await internship.addSkill(skill1);
      await internship.addSkill(skill2);

      const internshipWithSkills = await Internship.findOne({
        where: { id: internship.id },
        include: [{ model: Skill, as: 'skills' }]
      });

      assert.ok(internshipWithSkills);
      assert.strictEqual(internshipWithSkills.skills.length, 2);
    });
  });

  describe('Foreign Key Type Compatibility', () => {
    it('should have compatible UUID foreign keys', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      // CV.student_id should be UUID (references User.id)
      const cv = await CV.create({
        student_id: user.id,
        file: 'resume.pdf'
      });

      assert.strictEqual(typeof cv.student_id, 'string');
      assert.strictEqual(cv.student_id, user.id);
    });

    it('should have compatible BIGINT foreign keys', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456'
      });

      const skill = await Skill.create({ name: 'Test Skill' });

      // StudentSkill.student_id should be BIGINT (references StudentProfile.id)
      const studentSkill = await StudentSkill.create({
        student_id: profile.id,
        skill_id: skill.id
      });

      assert.strictEqual(String(studentSkill.student_id), String(profile.id));
    });
  });

  describe('Unique Constraints', () => {
    it('should enforce unique constraint on StudentProfile.user_id', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456'
      });

      // Should fail to create second profile for same user
      try {
        await StudentProfile.create({
          user_id: user.id,
          phone: '+251911123457'
        });
        assert.fail('Should have thrown unique constraint violation');
      } catch (err) {
        // SequelizeUniqueConstraintError or similar
        assert.ok(err.name === 'SequelizeUniqueConstraintError' || 
                  err.message.includes('unique') || 
                  err.message.includes('duplicate'));
      }
    });

    it('should enforce composite unique on StudentSkill', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456'
      });

      const skill = await Skill.create({ name: `Skill-${randomUUID()}` });

      await StudentSkill.create({
        student_id: profile.id,
        skill_id: skill.id
      });

      // Should fail to create duplicate skill association
      try {
        await StudentSkill.create({
          student_id: profile.id,
          skill_id: skill.id
        });
        assert.fail('Should have thrown unique constraint violation');
      } catch (err) {
        assert.ok(err.name === 'SequelizeUniqueConstraintError' || 
                  err.message.includes('unique') || 
                  err.message.includes('duplicate'));
      }
    });
  });

  describe('Task 1.12 Monetary Fields Preservation', () => {
    it('should preserve DECIMAL for StudentProfile compensation', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456',
        minimum_compensation: '1000.50',
        maximum_compensation: '2500.75'
      });

      assert.strictEqual(typeof profile.minimum_compensation, 'string');
      assert.strictEqual(typeof profile.maximum_compensation, 'string');
      assert.strictEqual(profile.minimum_compensation, '1000.50');
      assert.strictEqual(profile.maximum_compensation, '2500.75');
    });

    it('should preserve DECIMAL for Internship compensation', async () => {
      const internship = await Internship.create({
        title: 'Test Internship',
        organization_name: 'Test Company',
        description: 'Test description',
        minimum_compensation: '1000.50',
        maximum_compensation: '2500.75'
      });

      assert.strictEqual(typeof internship.minimum_compensation, 'string');
      assert.strictEqual(typeof internship.maximum_compensation, 'string');
      assert.strictEqual(internship.minimum_compensation, '1000.50');
      assert.strictEqual(internship.maximum_compensation, '2500.75');
    });
  });

  describe('Task 1.13 Data Type Preservation', () => {
    it('should preserve INTEGER for StudentProfile.current_year', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456',
        current_year: 4
      });

      assert.strictEqual(typeof profile.current_year, 'number');
      assert.strictEqual(profile.current_year, 4);
    });

    it('should preserve DECIMAL for CV.extracted_experience_years', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const cv = await CV.create({
        student_id: user.id,
        file: 'resume.pdf',
        extracted_experience_years: '2.5'
      });

      assert.strictEqual(typeof cv.extracted_experience_years, 'string');
      assert.strictEqual(cv.extracted_experience_years, '2.5');
    });
  });

  describe('Association Aliases', () => {
    it('should use correct alias for User.profile', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456'
      });

      const userWithProfile = await User.findOne({
        where: { id: user.id },
        include: [{ model: StudentProfile, as: 'profile' }]
      });

      assert.ok(userWithProfile.profile);
    });

    it('should use correct alias for StudentProfile.skills', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456'
      });

      const skill = await Skill.create({ name: `Skill-${randomUUID()}` });
      await profile.addSkill(skill);

      const profileWithSkills = await StudentProfile.findOne({
        where: { id: profile.id },
        include: [{ model: Skill, as: 'skills' }]
      });

      assert.ok(profileWithSkills.skills);
      assert.strictEqual(profileWithSkills.skills.length, 1);
    });
  });

  describe('Nullable Foreign Keys', () => {
    it('should allow NULL for ProjectTeam.assigned_advisor_id', async () => {
      const team = await ProjectTeam.create({
        team_name: 'Test Team',
        project_title: 'Test Project'
        // assigned_advisor_id is NULL by default
      });

      assert.strictEqual(team.assigned_advisor_id, null);
    });

    it('should allow NULL for WeeklyLogbook.academic_advisor_id', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const team = await ProjectTeam.create({
        team_name: 'Test Team',
        project_title: 'Test Project'
      });

      const logbook = await WeeklyLogbook.create({
        project_team_id: team.id,
        student_id: user.id,
        week_number: 1
        // academic_advisor_id is NULL by default
      });

      assert.strictEqual(logbook.academic_advisor_id, null);
    });
  });
});
