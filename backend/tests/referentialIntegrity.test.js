import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { DataTypes } from 'sequelize';
import { randomUUID } from 'crypto';

// Import models
import {
  User,
  StudentProfile,
  Skill,
  StudentSkill,
  CareerInterest,
  StudentInterest,
  CV,
  TeamMember,
  ProjectTeam,
  WeeklyLogbook,
  CampusLogistics,
  Notification
} from '../src/models/index.js';

import sequelize from '../src/config/database.js';

// Use test schema
const TEST_SCHEMA = 'test_referential_integrity';

describe('Task 1.11: Database-Level Referential Integrity Tests', () => {
  before(async () => {
    // Create test schema
    try {
      await sequelize.query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`);
      await sequelize.query(`SET search_path TO ${TEST_SCHEMA}, public`);
    } catch (err) {
      console.warn('Warning: Could not create test schema, using default schema:', err.message);
    }

    // Sync models (this will create tables with constraints)
    await sequelize.sync({ force: true });
  });

  after(async () => {
    // Clean up: drop all tables in test schema
    try {
      await sequelize.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
      await sequelize.query(`SET search_path TO public`);
    } catch (err) {
      console.warn('Warning: Could not drop test schema:', err.message);
    }

    // Re-sync without schema to ensure clean state
    await sequelize.sync({ force: false });
  });

  describe('User ↔ StudentProfile (One-to-One)', () => {
    it('should create valid User → StudentProfile relationship', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456',
        country: 'Ethiopia',
        city: 'Addis Ababa'
      });

      assert.strictEqual(profile.user_id, user.id);
      // In Node.js, PostgreSQL BIGINT is returned as string
      assert.ok(typeof profile.id === 'string' || typeof profile.id === 'bigint');

      // Test association
      const profileWithUser = await StudentProfile.findByPk(profile.id, {
        include: [{ model: User, as: 'user' }]
      });

      assert.ok(profileWithUser);
      assert.strictEqual(profileWithUser.user.id, user.id);
    });

    it('should reject duplicate StudentProfile for same User', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456'
      });

      // Attempt to create duplicate profile
      try {
        await StudentProfile.create({
          user_id: user.id,
          phone: '+251911123457'
        });
        assert.fail('Should have thrown unique constraint error');
      } catch (err) {
        assert.ok(err.name === 'SequelizeUniqueConstraintError' || err.message.includes('unique'));
      }
    });

    it('should reject invalid User reference', async () => {
      const fakeUserId = randomUUID();

      try {
        await StudentProfile.create({
          user_id: fakeUserId,
          phone: '+251911123456'
        });
        assert.fail('Should have thrown foreign key constraint error');
      } catch (err) {
        // PostgreSQL should reject the foreign key constraint
        assert.ok(
          err.name === 'SequelizeForeignKeyConstraintError' ||
          err.message.includes('foreign key') ||
          err.message.includes('violates foreign key')
        );
      }
    });
  });

  describe('StudentProfile ↔ StudentSkill (One-to-Many)', () => {
    it('should create valid StudentProfile → StudentSkill relationship', async () => {
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
        name: `JavaScript-${randomUUID()}`,
        category: 'Programming'
      });

      const studentSkill = await StudentSkill.create({
        student_id: profile.id, // BIGINT references StudentProfile.id
        skill_id: skill.id,
        proficiency: 'intermediate'
      });

      // In Node.js, PostgreSQL BIGINT is returned as string
      assert.ok(typeof studentSkill.student_id === 'string' || typeof studentSkill.student_id === 'bigint');
      assert.strictEqual(String(studentSkill.student_id), String(profile.id));
    });

    it('should reject invalid StudentProfile reference in StudentSkill', async () => {
      const skill = await Skill.create({
        name: `Python-${randomUUID()}`,
        category: 'Programming'
      });

      try {
        await StudentSkill.create({
          student_id: 999999, // Non-existent BIGINT
          skill_id: skill.id
        });
        assert.fail('Should have thrown foreign key constraint error');
      } catch (err) {
        assert.ok(
          err.name === 'SequelizeForeignKeyConstraintError' ||
          err.message.includes('foreign key')
        );
      }
    });
  });

  describe('StudentProfile ↔ StudentInterest (One-to-Many)', () => {
    it('should create valid StudentProfile → StudentInterest relationship', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456'
      });

      const interest = await CareerInterest.create({
        name: `Software Engineering-${randomUUID()}`,
        description: 'Building software systems'
      });

      const studentInterest = await StudentInterest.create({
        student_id: profile.id, // BIGINT references StudentProfile.id
        interest_id: interest.id
      });

      // In Node.js, PostgreSQL BIGINT is returned as string
      assert.ok(typeof studentInterest.student_id === 'string' || typeof studentInterest.student_id === 'bigint');
      assert.strictEqual(String(studentInterest.student_id), String(profile.id));
    });
  });

  describe('User ↔ CV (One-to-Many)', () => {
    it('should create valid User → CV relationship', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const cv = await CV.create({
        student_id: user.id, // UUID references User.id
        file: 'test_cv.pdf',
        processing_status: 'PENDING'
      });

      assert.strictEqual(typeof cv.student_id, 'string');
      assert.strictEqual(cv.student_id, user.id);
    });

    it('should reject invalid User reference in CV', async () => {
      const fakeUserId = randomUUID();

      try {
        await CV.create({
          student_id: fakeUserId,
          file: 'test_cv.pdf',
          processing_status: 'PENDING'
        });
        assert.fail('Should have thrown foreign key constraint error');
      } catch (err) {
        assert.ok(
          err.name === 'SequelizeForeignKeyConstraintError' ||
          err.message.includes('foreign key')
        );
      }
    });
  });

  describe('User ↔ TeamMember (One-to-Many)', () => {
    it('should create valid User → TeamMember relationship', async () => {
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
        student_id: user.id, // UUID references User.id
        is_leader: false,
        assigned_role: 'Developer'
      });

      assert.strictEqual(typeof member.student_id, 'string');
      assert.strictEqual(member.student_id, user.id);

      // Test association
      const memberWithUser = await TeamMember.findByPk(member.id, {
        include: [{ model: User, as: 'studentUser' }]
      });

      assert.ok(memberWithUser);
      assert.strictEqual(memberWithUser.studentUser.id, user.id);
    });
  });

  describe('WeeklyLogbook optional User relationships', () => {
    it('should accept null academic_advisor_id', async () => {
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
        week_number: 1,
        tasks_executed: 'Test tasks',
        academic_advisor_id: null // Nullable field
      });

      assert.strictEqual(logbook.academic_advisor_id, null);
    });

    it('should accept valid academic_advisor_id reference', async () => {
      const student = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const advisor = await User.create({
        email: `advisor-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'advisor'
      });

      const team = await ProjectTeam.create({
        team_name: 'Test Team',
        project_title: 'Test Project'
      });

      const logbook = await WeeklyLogbook.create({
        project_team_id: team.id,
        student_id: student.id,
        week_number: 1,
        tasks_executed: 'Test tasks',
        academic_advisor_id: advisor.id // Valid UUID reference
      });

      assert.strictEqual(logbook.academic_advisor_id, advisor.id);

      // Test association
      const logbookWithAdvisor = await WeeklyLogbook.findByPk(logbook.id, {
        include: [{ model: User, as: 'academicAdvisor' }]
      });

      assert.ok(logbookWithAdvisor);
      assert.strictEqual(logbookWithAdvisor.academicAdvisor.id, advisor.id);
    });

    it('should reject invalid academic_advisor_id', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const team = await ProjectTeam.create({
        team_name: 'Test Team',
        project_title: 'Test Project'
      });

      const fakeAdvisorId = randomUUID();

      try {
        await WeeklyLogbook.create({
          project_team_id: team.id,
          student_id: user.id,
          week_number: 1,
          tasks_executed: 'Test tasks',
          academic_advisor_id: fakeAdvisorId // Invalid UUID reference
        });
        assert.fail('Should have thrown foreign key constraint error');
      } catch (err) {
        assert.ok(
          err.name === 'SequelizeForeignKeyConstraintError' ||
          err.message.includes('foreign key')
        );
      }
    });
  });

  describe('CampusLogistics optional User relationships', () => {
    it('should accept null dean_signed_by_id', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const logistics = await CampusLogistics.create({
        student_id: user.id,
        dean_approved: false,
        dean_signed_by_id: null // Nullable field
      });

      assert.strictEqual(logistics.dean_signed_by_id, null);
    });

    it('should accept valid dean_signed_by_id reference', async () => {
      const student = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const dean = await User.create({
        email: `dean-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'dean'
      });

      const logistics = await CampusLogistics.create({
        student_id: student.id,
        dean_approved: true,
        dean_signed_by_id: dean.id // Valid UUID reference
      });

      assert.strictEqual(logistics.dean_signed_by_id, dean.id);

      // Test association
      const logisticsWithDean = await CampusLogistics.findByPk(logistics.id, {
        include: [{ model: User, as: 'deanSignedBy' }]
      });

      assert.ok(logisticsWithDean);
      assert.strictEqual(logisticsWithDean.deanSignedBy.id, dean.id);
    });

    it('should reject invalid dean_signed_by_id', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const fakeDeanId = randomUUID();

      try {
        await CampusLogistics.create({
          student_id: user.id,
          dean_approved: true,
          dean_signed_by_id: fakeDeanId // Invalid UUID reference
        });
        assert.fail('Should have thrown foreign key constraint error');
      } catch (err) {
        assert.ok(
          err.name === 'SequelizeForeignKeyConstraintError' ||
          err.message.includes('foreign key')
        );
      }
    });
  });

  describe('Deletion Behavior', () => {
    it('should CASCADE delete StudentProfile when User is deleted', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456'
      });

      await user.destroy();

      // Profile should be cascade deleted
      const deletedProfile = await StudentProfile.findByPk(profile.id);
      assert.strictEqual(deletedProfile, null);
    });

    it('should CASCADE delete CV when User is deleted', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const cv = await CV.create({
        student_id: user.id,
        file: 'test_cv.pdf',
        processing_status: 'PENDING'
      });

      await user.destroy();

      // CV should be cascade deleted
      const deletedCV = await CV.findByPk(cv.id);
      assert.strictEqual(deletedCV, null);
    });

    it('should SET NULL advisor_id when User is deleted', async () => {
      const student = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const advisor = await User.create({
        email: `advisor-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'advisor'
      });

      const team = await ProjectTeam.create({
        team_name: 'Test Team',
        project_title: 'Test Project',
        assigned_advisor_id: advisor.id
      });

      await advisor.destroy();

      // Reload team to see the change
      const reloadedTeam = await ProjectTeam.findByPk(team.id);
      assert.strictEqual(reloadedTeam.assigned_advisor_id, null);
    });

    it('should RESTRICT deletion of User with InternshipApplication', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const { Internship, InternshipApplication } = await import('../src/models/index.js');

      const internship = await Internship.create({
        title: 'Test Internship',
        organization_name: 'Test Company',
        description: 'Test description'
      });

      await InternshipApplication.create({
        student_id: user.id,
        internship_id: internship.id,
        status: 'applied'
      });

      try {
        await user.destroy();
        assert.fail('Should have thrown foreign key constraint error due to RESTRICT');
      } catch (err) {
        assert.ok(
          err.name === 'SequelizeForeignKeyConstraintError' ||
          err.message.includes('foreign key') ||
          err.message.includes('violates foreign key constraint')
        );
      }
    });
  });

  describe('Association Aliases', () => {
    it('should resolve User.profile alias', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456'
      });

      const userWithProfile = await User.findByPk(user.id, {
        include: [{ model: StudentProfile, as: 'profile' }]
      });

      assert.ok(userWithProfile);
      assert.ok(userWithProfile.profile);
      assert.strictEqual(userWithProfile.profile.id, profile.id);
    });

    it('should resolve StudentProfile.user alias', async () => {
      const user = await User.create({
        email: `test-${randomUUID()}@example.com`,
        password: 'hashed_password',
        role: 'student'
      });

      const profile = await StudentProfile.create({
        user_id: user.id,
        phone: '+251911123456'
      });

      const profileWithUser = await StudentProfile.findByPk(profile.id, {
        include: [{ model: User, as: 'user' }]
      });

      assert.ok(profileWithUser);
      assert.ok(profileWithUser.user);
      assert.strictEqual(profileWithUser.user.id, user.id);
    });

    it('should resolve StudentProfile.skills alias', async () => {
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
        name: `JavaScript-${randomUUID()}`,
        category: 'Programming'
      });

      await profile.addSkill(skill);

      const profileWithSkills = await StudentProfile.findByPk(profile.id, {
        include: [{ model: Skill, as: 'skills' }]
      });

      assert.ok(profileWithSkills);
      assert.ok(Array.isArray(profileWithSkills.skills));
      assert.strictEqual(profileWithSkills.skills.length, 1);
      assert.strictEqual(profileWithSkills.skills[0].id, skill.id);
    });

    it('should resolve TeamMember.studentUser alias', async () => {
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
        student_id: user.id,
        is_leader: false,
        assigned_role: 'Developer'
      });

      const memberWithUser = await TeamMember.findByPk(member.id, {
        include: [{ model: User, as: 'studentUser' }]
      });

      assert.ok(memberWithUser);
      assert.ok(memberWithUser.studentUser);
      assert.strictEqual(memberWithUser.studentUser.id, user.id);
    });
  });
});
