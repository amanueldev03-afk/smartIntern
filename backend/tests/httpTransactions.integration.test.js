import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import { createServer } from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import sequelize from '../src/config/database.js';
import { Internship, InternshipApplication, ProjectTeam, StudentActivityLog, StudentProfile, TeamMember, User } from '../src/models/index.js';
import { generateTokens } from '../src/services/authService.js';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = process.env.TASK_1_18_TEST_SCHEMA || '';
const runId = process.env.TASK_1_18_TEST_RUN_ID || '';
let serverProcess;
let baseUrl;
let serverOutput = '';

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function request(route, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: response.status, body: json, text };
}

async function createUser(role = 'student') {
  const user = await User.create({
    email: `task118-http-${role}-${crypto.randomUUID()}@example.test`,
    username: `task118-http-${crypto.randomUUID()}`,
    password: 'integration-test-hash',
    role,
    is_active: true,
    is_email_verified: true,
    is_approved: true,
  });
  return { user, token: generateTokens(user).access };
}

describe('Task 1.18 HTTP transaction integration', () => {
  before(async () => {
    assert.equal(sequelize.getDialect(), 'postgres');
    assert.match(schema, /^task_1_18_test_[a-f0-9]{32}$/);
    const [identity] = await sequelize.query(`SELECT current_database() AS database_name,
      current_schema() AS schema_name, (SELECT run_id FROM _task_1_18_run_marker LIMIT 1) AS run_id,
      EXISTS (SELECT 1 FROM "_migrations" WHERE version='20261111_add_runtime_model_schema') AS runtime_migration`);
    assert.equal(identity[0].database_name, 'ai_internship');
    assert.equal(identity[0].schema_name, schema);
    assert.equal(identity[0].run_id, runId);
    assert.equal(identity[0].runtime_migration, true);

    const port = await availablePort();
    baseUrl = `http://127.0.0.1:${port}`;
    serverProcess = spawn(process.execPath, ['server.js'], {
      cwd: backendDir,
      env: { ...process.env, NODE_ENV: 'production', PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput = (serverOutput + chunk).slice(-8000); });
    serverProcess.stderr.setEncoding('utf8').on('data', (chunk) => { serverOutput = (serverOutput + chunk).slice(-8000); });

    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (serverProcess.exitCode !== null) throw new Error(`HTTP test server exited early: ${serverOutput}`);
      try {
        const health = await fetch(`${baseUrl}/api/health/`);
        if (health.ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
    throw new Error(`HTTP test server did not become ready: ${serverOutput}`);
  });

  after(async () => {
    if (serverProcess && serverProcess.exitCode === null) {
      serverProcess.kill('SIGTERM');
      await new Promise((resolve) => serverProcess.once('exit', resolve));
    }
    await sequelize.close();
  });

  it('registers students over HTTP, resolves duplicate races, and hides database details on rollback', async () => {
    const email = `task118-http-register-${crypto.randomUUID()}@example.test`;
    const username = `task118-http-${crypto.randomUUID()}`;
    const payload = { email, username, password: 'integration-password', full_name: 'HTTP Test Student' };
    const registrations = await Promise.all([
      request('/api/auth/register/', { method: 'POST', body: payload }),
      request('/api/auth/register/', { method: 'POST', body: payload }),
    ]);
    assert.equal(registrations.filter((result) => result.status === 201).length, 1);
    assert.ok(registrations.every((result) => [201, 400, 409].includes(result.status)));
    assert.equal(await User.count({ where: { email } }), 1);
    const registered = await User.findOne({ where: { email } });
    assert.equal(await StudentProfile.count({ where: { user_id: registered.id } }), 1);

    const functionName = 'task_1_18_http_registration_failure';
    await sequelize.query(`CREATE FUNCTION "${schema}".${functionName}() RETURNS trigger LANGUAGE plpgsql
      AS $$ BEGIN RAISE EXCEPTION 'HTTP_DATABASE_SENTINEL'; END $$`);
    await sequelize.query(`CREATE TRIGGER task_1_18_http_registration_failure BEFORE INSERT
      ON "${schema}"."student_profiles_studentprofile" FOR EACH ROW
      EXECUTE FUNCTION "${schema}".${functionName}()`);
    const failedEmail = `task118-http-failure-${crypto.randomUUID()}@example.test`;
    try {
      const result = await request('/api/auth/register/', {
        method: 'POST', body: { email: failedEmail, password: 'integration-password' },
      });
      assert.equal(result.status, 500);
      assert.equal(result.body.detail, 'Registration could not be completed.');
      assert.ok(!result.text.includes('HTTP_DATABASE_SENTINEL'));
      assert.equal(await User.count({ where: { email: failedEmail } }), 0, 'The failed profile insert must roll back the user insert.');
    } finally {
      await sequelize.query(`DROP TRIGGER IF EXISTS task_1_18_http_registration_failure ON "${schema}"."student_profiles_studentprofile"`);
      await sequelize.query(`DROP FUNCTION IF EXISTS "${schema}".${functionName}()`);
    }
  });

  it('enforces auth and allows one application across concurrent duplicate HTTP requests', async () => {
    const student = await createUser();
    const internship = await Internship.create({
      title: 'HTTP Integration Placement', organization_name: 'Test Org', description: 'Isolated HTTP test',
    });
    const pathName = '/api/internships/applications/add/';
    assert.equal((await request(pathName, { method: 'POST', body: { internship_id: internship.id } })).status, 401);
    const submit = () => request(pathName, {
      method: 'POST', token: student.token, body: { internship_id: internship.id, cover_letter: 'Test' },
    });
    const [first, second] = await Promise.all([submit(), submit()]);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.ok(first.body.id);
    assert.equal(await InternshipApplication.count({ where: { student_id: student.user.id, internship_id: internship.id } }), 1);
  });

  it('creates one fallback team for concurrent authorized requests', async () => {
    const student = await createUser();
    assert.equal((await request('/api/v1/projects/my-channel/')).status, 401);
    const call = () => request('/api/v1/projects/my-channel/', { token: student.token });
    const [first, second] = await Promise.all([call(), call()]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.body.team.id, second.body.team.id);
    assert.equal(await ProjectTeam.count({ where: { id: first.body.team.id } }), 1);
    assert.equal(await TeamMember.count({ where: { team_id: first.body.team.id, student_id: student.user.id } }), 1);
  });

  it('authorizes account activation and rolls back state when activity logging fails', async () => {
    const admin = await createUser('admin');
    const student = await createUser();
    const endpoint = `/api/admin/students/${student.user.id}/deactivate/`;
    assert.equal((await request(endpoint, { method: 'POST' })).status, 401);
    assert.equal((await request(endpoint, { method: 'POST', token: student.token })).status, 403);

    const functionName = 'task_1_18_http_log_failure';
    await sequelize.query(`CREATE FUNCTION "${schema}".${functionName}() RETURNS trigger LANGUAGE plpgsql
      AS $$ BEGIN RAISE EXCEPTION 'HTTP_ACTIVITY_SENTINEL'; END $$`);
    await sequelize.query(`CREATE TRIGGER task_1_18_http_log_failure BEFORE INSERT
      ON "${schema}"."administration_studentactivitylog" FOR EACH ROW
      EXECUTE FUNCTION "${schema}".${functionName}()`);
    try {
      const failed = await request(endpoint, { method: 'POST', token: admin.token });
      assert.equal(failed.status, 500);
      assert.equal(failed.body.detail, 'Student account could not be deactivated.');
      assert.ok(!failed.text.includes('HTTP_ACTIVITY_SENTINEL'));
      assert.equal((await User.findByPk(student.user.id)).is_active, true);
      assert.equal(await StudentActivityLog.count({ where: { student_id: student.user.id } }), 0);
    } finally {
      await sequelize.query(`DROP TRIGGER IF EXISTS task_1_18_http_log_failure ON "${schema}"."administration_studentactivitylog"`);
      await sequelize.query(`DROP FUNCTION IF EXISTS "${schema}".${functionName}()`);
    }

    const deactivated = await request(endpoint, { method: 'POST', token: admin.token });
    assert.equal(deactivated.status, 200);
    assert.equal((await User.findByPk(student.user.id)).is_active, false);
    const activated = await request(`/api/admin/students/${student.user.id}/activate/`, { method: 'POST', token: admin.token });
    assert.equal(activated.status, 200);
    assert.equal((await User.findByPk(student.user.id)).is_active, true);
    assert.equal(await StudentActivityLog.count({ where: { student_id: student.user.id } }), 2);
  });
});
