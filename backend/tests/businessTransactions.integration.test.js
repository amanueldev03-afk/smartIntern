import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import sequelize from '../src/config/database.js';
import {
  Internship,
  InternshipApplication,
  ProjectTeam,
  StudentActivityLog,
  StudentProfile,
  TeamMember,
  User,
} from '../src/models/index.js';
import { registerStudent } from '../src/services/authService.js';
import { withTransaction } from '../src/utils/transactions.js';

const schema = process.env.TASK_1_18_TEST_SCHEMA || '';
const runId = process.env.TASK_1_18_TEST_RUN_ID || '';
const testEmail = () => `task118-${randomUUID()}@example.test`;

async function createUser() {
  return User.create({
    email: testEmail(),
    username: `task118-${randomUUID()}`,
    password: 'integration-test-hash',
    role: 'student',
    is_active: true,
  });
}

describe('Task 1.18 PostgreSQL business workflow integration', () => {
  before(async () => {
    assert.equal(sequelize.getDialect(), 'postgres');
    assert.match(schema, /^task_1_18_test_[a-f0-9]{32}$/);
    await sequelize.authenticate();
    const [rows] = await sequelize.query(`SELECT current_database() AS database_name,
      current_schema() AS schema_name,
      (SELECT run_id FROM _task_1_18_run_marker LIMIT 1) AS run_id`);
    assert.equal(rows[0].database_name, 'ai_internship');
    assert.equal(rows[0].schema_name, schema);
    assert.equal(rows[0].run_id, runId);

    for (const model of [User, StudentProfile, Internship, InternshipApplication, ProjectTeam, TeamMember, StudentActivityLog]) {
      const table = model.getTableName();
      assert.equal(table.schema, schema, `${model.name} must be scoped to the isolated test schema.`);
    }

    const [migrations] = await sequelize.query('SELECT version FROM "_migrations" ORDER BY version');
    assert.ok(migrations.some(({ version }) => version === '20261111_add_runtime_model_schema'),
      'Business workflows require the migration-created runtime schema.');
    for (const model of [User, StudentProfile, Internship, InternshipApplication, ProjectTeam, TeamMember, StudentActivityLog]) {
      await sequelize.getQueryInterface().describeTable(model.getTableName());
    }
  });

  after(async () => {
    await sequelize.close();
  });

  it('creates user and student profile atomically, including rollback on profile failure', async () => {
    const success = await registerStudent({
      email: testEmail(),
      password: 'test-password',
      username: `task118-${randomUUID()}`,
      full_name: 'Integration Student',
    });
    assert.ok(success.user.id);
    assert.equal(await StudentProfile.count({ where: { user_id: success.user.id } }), 1);

    const failingEmail = testEmail();
    const functionName = 'task_1_18_reject_profile_insert';
    await sequelize.query(`CREATE FUNCTION "${schema}".${functionName}() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected profile insert failure'; END $$`);
    await sequelize.query(`CREATE TRIGGER task_1_18_reject_profile_insert
      BEFORE INSERT ON "${schema}"."student_profiles_studentprofile"
      FOR EACH ROW EXECUTE FUNCTION "${schema}".${functionName}()`);

    try {
      await assert.rejects(registerStudent({ email: failingEmail, password: 'test-password' }));
      assert.equal(await User.count({ where: { email: failingEmail } }), 0,
        'The user insert must roll back with the failed profile insert.');
    } finally {
      await sequelize.query(`DROP TRIGGER IF EXISTS task_1_18_reject_profile_insert
        ON "${schema}"."student_profiles_studentprofile"`);
      await sequelize.query(`DROP FUNCTION IF EXISTS "${schema}".${functionName}()`);
    }
  });

  it('keeps concurrent internship applications unique using the database constraint', async () => {
    const user = await createUser();
    const internship = await Internship.create({
      title: 'Task 1.18 Integration Placement',
      organization_name: 'Test Organization',
      description: 'Isolated concurrency fixture',
    });
    const submit = () => withTransaction((transaction) => InternshipApplication.findOrCreate({
      where: { student_id: user.id, internship_id: internship.id },
      defaults: { student_id: user.id, internship_id: internship.id, status: 'applied' },
      transaction,
    }));

    const results = await Promise.all([submit(), submit()]);
    assert.equal(results.length, 2);
    assert.equal(await InternshipApplication.count({ where: { student_id: user.id, internship_id: internship.id } }), 1);
  });

  it('serializes fallback team and membership creation with the route advisory lock', async () => {
    const user = await createUser();
    const resolveFallbackTeam = () => withTransaction(async (transaction) => {
      await sequelize.query('SELECT pg_advisory_xact_lock(11818001)', { transaction });
      const [team] = await ProjectTeam.findOrCreate({
        where: { team_name: 'Task 1.18 Isolated Fallback Team' },
        defaults: { team_name: 'Task 1.18 Isolated Fallback Team', project_title: 'Concurrency Test' },
        transaction,
      });
      await TeamMember.findOrCreate({
        where: { team_id: team.id, student_id: user.id },
        defaults: { team_id: team.id, student_id: user.id, assigned_role: 'Tester' },
        transaction,
      });
      return team.id;
    });

    const teams = await Promise.all([resolveFallbackTeam(), resolveFallbackTeam()]);
    assert.equal(teams[0], teams[1]);
    assert.equal(await ProjectTeam.count({ where: { team_name: 'Task 1.18 Isolated Fallback Team' } }), 1);
    assert.equal(await TeamMember.count({ where: { team_id: teams[0], student_id: user.id } }), 1);
  });

  it('commits account state and activity log atomically under a row lock', async () => {
    const user = await createUser();
    await Promise.all([true, false].map((isActive) => withTransaction(async (transaction) => {
      const lockedUser = await User.findByPk(user.id, { transaction, lock: transaction.LOCK.UPDATE });
      lockedUser.is_active = isActive;
      await lockedUser.save({ transaction });
      await StudentActivityLog.create({
        student_id: user.id,
        action: isActive ? 'ACCOUNT_ACTIVATED' : 'ACCOUNT_DEACTIVATED',
        details: { source: 'task_1_18_integration_test' },
      }, { transaction });
    })));

    assert.equal(await StudentActivityLog.count({ where: { student_id: user.id } }), 2);
    const persisted = await User.findByPk(user.id);
    assert.equal(typeof persisted.is_active, 'boolean');
  });
});
