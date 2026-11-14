import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import { createServer } from 'net';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { mkdir, writeFile, unlink } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sequelize from '../src/config/database.js';
import {
  CampusLogistics,
  ProjectTeam,
  ProjectTeamMessage,
  StudentProfile,
  TeamMember,
  User,
  WeeklyLogbook,
} from '../src/models/index.js';
import {
  generateTokens,
  generateEmailVerificationToken,
  getEmailVerificationStateHash,
  getEmailVerificationSecret,
} from '../src/services/authService.js';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = process.env.TASK_1_18_TEST_SCHEMA || '';
let serverProcess;
let baseUrl;
let serverOutput = '';
const dummySrsFileName = `test-audit-srs-${crypto.randomUUID().slice(0, 8)}.pdf`;
const dummySrsFilePath = path.join(backendDir, 'media', 'srs_docs', dummySrsFileName);

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
  return { status: response.status, body: json, text, headers: response.headers };
}

async function createTestUser(role = 'student', overrides = {}) {
  const id = crypto.randomUUID();
  const user = await User.create({
    id,
    email: `task119-${role}-${id.slice(0, 8)}@example.test`,
    username: `user_${id.slice(0, 8)}`,
    password: 'integration-test-hash',
    role,
    is_active: overrides.is_active !== undefined ? overrides.is_active : true,
    is_email_verified: overrides.is_email_verified !== undefined ? overrides.is_email_verified : true,
    is_approved: overrides.is_approved !== undefined ? overrides.is_approved : true,
    is_staff: overrides.is_staff !== undefined ? overrides.is_staff : false,
    is_superuser: overrides.is_superuser !== undefined ? overrides.is_superuser : false,
    department: overrides.department || 'Software Engineering',
    ...overrides,
  });

  // Automatically provision a student profile for students unless explicitly disabled
  if (role === 'student' && overrides.withProfile !== false) {
    await StudentProfile.create({
      user_id: user.id,
      field_of_study: 'Software Engineering',
      university: 'Addis Ababa University',
    });
  }

  return { user, token: generateTokens(user).access };
}

describe('Task 1.19 Phase 2A security authorization integration', () => {
  before(async () => {
    assert.equal(sequelize.getDialect(), 'postgres');
    assert.match(schema, /^task_1_18_test_[a-f0-9]{32}$/);

    // Prepare dummy SRS document for download testing
    await mkdir(path.join(backendDir, 'media', 'srs_docs'), { recursive: true });
    await writeFile(dummySrsFilePath, '%PDF-1.4 security audit test SRS document content');

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
    try { await unlink(dummySrsFilePath); } catch {}
    if (serverProcess && serverProcess.exitCode === null) {
      serverProcess.kill('SIGTERM');
      await new Promise((resolve) => serverProcess.once('exit', resolve));
    }
    await sequelize.close();
  });

  // =========================================================================
  // 1. Dean Signature Authorization & Keyed HMAC Integrity
  // =========================================================================
  describe('Dean signature authorization and keyed HMAC audit fingerprint', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const student = await createTestUser('student');
      const logistics = await CampusLogistics.create({ student_id: student.user.id });
      const res = await request(`/api/v1/logistics/${logistics.id}/dean-sign/`, { method: 'POST' });
      assert.equal(res.status, 401);
    });

    it('rejects student attempting to sign dean clearance with 403', async () => {
      const student = await createTestUser('student');
      const logistics = await CampusLogistics.create({ student_id: student.user.id });
      const res = await request(`/api/v1/logistics/${logistics.id}/dean-sign/`, {
        method: 'POST',
        token: student.token,
      });
      assert.equal(res.status, 403);
      assert.match(res.body.detail, /permission/i);
    });

    it('rejects generic staff attempting dean clearance with 403', async () => {
      const staff = await createTestUser('staff', { is_staff: true });
      const student = await createTestUser('student');
      const logistics = await CampusLogistics.create({ student_id: student.user.id });
      const res = await request(`/api/v1/logistics/${logistics.id}/dean-sign/`, {
        method: 'POST',
        token: staff.token,
      });
      assert.equal(res.status, 403);
      assert.match(res.body.detail, /permission/i);
    });

    it('rejects dean approving a record outside their academic department boundary with 403', async () => {
      const student = await createTestUser('student', { department: 'Mechanical Engineering' });
      const dean = await createTestUser('dept_dean', { department: 'Electrical Engineering' });
      const logistics = await CampusLogistics.create({ student_id: student.user.id });

      const res = await request(`/api/v1/logistics/${logistics.id}/dean-sign/`, {
        method: 'POST',
        token: dean.token,
      });
      assert.equal(res.status, 403);
      assert.match(res.body.detail, /academic department/i);
    });

    it('allows authorized dept_dean to sign clearance and persists valid HMAC-SHA256 audit fingerprint', async () => {
      const student = await createTestUser('student', { department: 'Software Engineering' });
      const dean = await createTestUser('dept_dean', { department: 'Software Engineering' });
      const logistics = await CampusLogistics.create({ student_id: student.user.id });

      const res = await request(`/api/v1/logistics/${logistics.id}/dean-sign/`, {
        method: 'POST',
        token: dean.token,
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.dean_approved, true);
      assert.equal(res.body.dean_signature_hash.length, 64);

      // Verify in database
      const reloaded = await CampusLogistics.findByPk(logistics.id);
      assert.equal(reloaded.dean_approved, true);
      assert.equal(reloaded.dean_signed_by_id, dean.user.id);
      assert.equal(reloaded.dean_signature_hash, res.body.dean_signature_hash);
    });

    it('handles concurrent dean sign requests safely and idempotently', async () => {
      const student = await createTestUser('student', { department: 'Software Engineering' });
      const dean = await createTestUser('dept_dean', { department: 'Software Engineering' });
      const logistics = await CampusLogistics.create({ student_id: student.user.id });

      const [res1, res2] = await Promise.all([
        request(`/api/v1/logistics/${logistics.id}/dean-sign/`, { method: 'POST', token: dean.token }),
        request(`/api/v1/logistics/${logistics.id}/dean-sign/`, { method: 'POST', token: dean.token }),
      ]);

      assert.equal(res1.status, 200);
      assert.equal(res2.status, 200);
      assert.equal(res1.body.dean_approved, true);
      assert.equal(res2.body.dean_approved, true);
      assert.equal(res1.body.dean_signature_hash, res2.body.dean_signature_hash);
    });

    it('allows administrator to sign clearance regardless of department', async () => {
      const student = await createTestUser('student', { department: 'Civil Engineering' });
      const admin = await createTestUser('admin');
      const logistics = await CampusLogistics.create({ student_id: student.user.id });

      const res = await request(`/api/v1/logistics/${logistics.id}/dean-sign/`, {
        method: 'POST',
        token: admin.token,
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.dean_approved, true);
    });
  });

  // =========================================================================
  // 2. Dorm Assignment and Key Management
  // =========================================================================
  describe('Dorm assignment and key management', () => {
    it('rejects student attempting to assign dorm with 403', async () => {
      const student = await createTestUser('student');
      const logistics = await CampusLogistics.create({ student_id: student.user.id });
      const res = await request(`/api/v1/logistics/${logistics.id}/assign-dorm/`, {
        method: 'POST',
        token: student.token,
        body: { dorm_block: 'Block C', dorm_room: '301', dorm_bed_number: 'Bed 1' },
      });
      assert.equal(res.status, 403);
    });

    it('rejects generic staff attempting to assign dorm with 403', async () => {
      const staff = await createTestUser('staff', { is_staff: true });
      const student = await createTestUser('student');
      const logistics = await CampusLogistics.create({ student_id: student.user.id });
      const res = await request(`/api/v1/logistics/${logistics.id}/assign-dorm/`, {
        method: 'POST',
        token: staff.token,
        body: { dorm_block: 'Block C', dorm_room: '301', dorm_bed_number: 'Bed 1' },
      });
      assert.equal(res.status, 403);
    });

    it('rejects generic staff attempting to return key with 403', async () => {
      const staff = await createTestUser('staff', { is_staff: true });
      const student = await createTestUser('student');
      const logistics = await CampusLogistics.create({ student_id: student.user.id, key_issued: true });
      const res = await request(`/api/v1/logistics/${logistics.id}/return-key/`, {
        method: 'POST',
        token: staff.token,
      });
      assert.equal(res.status, 403);
    });

    it('allows dorm_admin to assign dorm and issue key with 200', async () => {
      const student = await createTestUser('student');
      const dormAdmin = await createTestUser('dorm_admin');
      const logistics = await CampusLogistics.create({ student_id: student.user.id });

      const res = await request(`/api/v1/logistics/${logistics.id}/assign-dorm/`, {
        method: 'POST',
        token: dormAdmin.token,
        body: { dorm_block: 'Block B', dorm_room: '205', dorm_bed_number: 'Bed 2', issue_key: true },
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.dorm_block, 'Block B');
      assert.equal(res.body.dorm_room, '205');
      assert.equal(res.body.dorm_status, 'KEY_ISSUED');
      assert.equal(res.body.key_issued, true);

      const reloaded = await CampusLogistics.findByPk(logistics.id);
      assert.equal(reloaded.dorm_status, 'KEY_ISSUED');
      assert.equal(reloaded.key_issued, true);
      assert.equal(reloaded.key_issued_by_id, dormAdmin.user.id);
    });

    it('allows dorm_admin to process key return with 200', async () => {
      const student = await createTestUser('student');
      const dormAdmin = await createTestUser('dorm_admin');
      const logistics = await CampusLogistics.create({
        student_id: student.user.id,
        key_issued: true,
        dorm_status: 'KEY_ISSUED',
      });

      const res = await request(`/api/v1/logistics/${logistics.id}/return-key/`, {
        method: 'POST',
        token: dormAdmin.token,
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.dorm_status, 'RETURNED');
      assert.equal(res.body.key_issued, false);

      const reloaded = await CampusLogistics.findByPk(logistics.id);
      assert.equal(reloaded.dorm_status, 'RETURNED');
      assert.equal(reloaded.key_issued, false);
    });
  });

  // =========================================================================
  // 3. Project Team Object-Level Access Control
  // =========================================================================
  describe('Project team membership and object-level access control', () => {
    let studentA, studentB, studentWithoutProfile, inactiveStudent, advisor1, advisor2, admin;
    let team1, team2;

    before(async () => {
      studentA = await createTestUser('student');
      studentB = await createTestUser('student');
      studentWithoutProfile = await createTestUser('student', { withProfile: false });
      inactiveStudent = await createTestUser('student', { is_active: false });
      advisor1 = await createTestUser('advisor');
      advisor2 = await createTestUser('advisor');
      admin = await createTestUser('admin');

      team1 = await ProjectTeam.create({
        team_name: `Sec Team 1 - ${crypto.randomUUID().slice(0, 6)}`,
        project_title: 'Security Hardening System',
        assigned_advisor_id: advisor1.user.id,
        srs_status: 'DRAFT',
        srs_document: `srs_docs/${dummySrsFileName}`,
      });
      await TeamMember.create({
        team_id: team1.id,
        student_id: studentA.user.id,
        assigned_role: 'Backend Lead',
        is_leader: true,
      });

      team2 = await ProjectTeam.create({
        team_name: `Sec Team 2 - ${crypto.randomUUID().slice(0, 6)}`,
        project_title: 'Unrelated Team System',
        assigned_advisor_id: advisor2.user.id,
        srs_status: 'DRAFT',
      });
      await TeamMember.create({
        team_id: team2.id,
        student_id: studentB.user.id,
        assigned_role: 'Frontend Lead',
        is_leader: true,
      });
    });

    it('returns 404 for invalid, non-UUID team IDs without database error', async () => {
      const res = await request('/api/v1/projects/teams/not-a-valid-uuid/', { token: studentA.token });
      assert.equal(res.status, 404);
      assert.match(res.body.detail, /team not found/i);
    });

    it('rejects student without a StudentProfile with 403', async () => {
      const res = await request(`/api/v1/projects/teams/${team1.id}/`, { token: studentWithoutProfile.token });
      assert.equal(res.status, 403);
      assert.match(res.body.detail, /student profile not found/i);
    });

    it('rejects inactive or disabled student account with 403', async () => {
      const res = await request(`/api/v1/projects/teams/${team1.id}/`, { token: inactiveStudent.token });
      assert.equal(res.status, 403);
      assert.match(res.body.detail, /inactive/i);
    });

    it('scopes team listing (GET /api/v1/projects/teams/) so students only see their own teams', async () => {
      const res = await request('/api/v1/projects/teams/', { token: studentA.token });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      const teamIds = res.body.map((t) => t.id);
      assert.ok(teamIds.includes(team1.id));
      assert.ok(!teamIds.includes(team2.id));
    });

    it('scopes team listing so advisors only see their assigned teams', async () => {
      const res = await request('/api/v1/projects/teams/', { token: advisor1.token });
      assert.equal(res.status, 200);
      const teamIds = res.body.map((t) => t.id);
      assert.ok(teamIds.includes(team1.id));
      assert.ok(!teamIds.includes(team2.id));
    });

    it('allows admin to see all teams in listing', async () => {
      const res = await request('/api/v1/projects/teams/', { token: admin.token });
      assert.equal(res.status, 200);
      const teamIds = res.body.map((t) => t.id);
      assert.ok(teamIds.includes(team1.id));
      assert.ok(teamIds.includes(team2.id));
    });

    it('forbids student from retrieving another team by id (GET /api/v1/projects/teams/:id/) with 403', async () => {
      const res = await request(`/api/v1/projects/teams/${team2.id}/`, { token: studentA.token });
      assert.equal(res.status, 403);
      assert.match(res.body.detail, /do not have permission/i);
    });

    it('allows team member to retrieve their team by id with 200', async () => {
      const res = await request(`/api/v1/projects/teams/${team1.id}/`, { token: studentA.token });
      assert.equal(res.status, 200);
      assert.equal(res.body.id, team1.id);
    });

    it('forbids unauthorized student from reading team messages with 403', async () => {
      const res = await request(`/api/v1/projects/teams/${team1.id}/messages/`, { token: studentB.token });
      assert.equal(res.status, 403);
    });

    it('forbids unauthorized student from posting to another team channel with 403', async () => {
      const res = await request(`/api/v1/projects/teams/${team1.id}/messages/`, {
        method: 'POST',
        token: studentB.token,
        body: { content: 'Sneaky unauthorized message' },
      });
      assert.equal(res.status, 403);
    });

    it('allows team member and advisor to post and read team messages with 201 and 200', async () => {
      const postRes = await request(`/api/v1/projects/teams/${team1.id}/messages/`, {
        method: 'POST',
        token: studentA.token,
        body: { content: 'Hello Team 1 from student A' },
      });
      assert.equal(postRes.status, 201);
      assert.equal(postRes.body.content, 'Hello Team 1 from student A');

      const getRes = await request(`/api/v1/projects/teams/${team1.id}/messages/`, { token: advisor1.token });
      assert.equal(getRes.status, 200);
      assert.ok(Array.isArray(getRes.body));
      assert.ok(getRes.body.some((m) => m.content === 'Hello Team 1 from student A'));
    });

    it('forbids non-member student from uploading SRS document with 403', async () => {
      const res = await request(`/api/v1/projects/teams/${team1.id}/srs/upload/`, {
        method: 'POST',
        token: studentB.token,
      });
      assert.equal(res.status, 403);
      assert.match(res.body.detail, /authorized team members/i);
    });

    it('forbids unassigned advisor from reviewing another team SRS with 403', async () => {
      const res = await request(`/api/v1/projects/teams/${team1.id}/srs/review/`, {
        method: 'POST',
        token: advisor2.token,
        body: { decision: 'APPROVED', feedback: 'Illegitimate review' },
      });
      assert.equal(res.status, 403);
      assert.match(res.body.detail, /assigned academic advisor/i);
    });

    it('allows assigned advisor to review and approve team SRS with 200', async () => {
      const res = await request(`/api/v1/projects/teams/${team1.id}/srs/review/`, {
        method: 'POST',
        token: advisor1.token,
        body: { decision: 'APPROVED', feedback: 'Architecture looks robust.' },
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.srs_status, 'APPROVED');
      assert.equal(res.body.coding_unlocked, true);

      const reloaded = await ProjectTeam.findByPk(team1.id);
      assert.equal(reloaded.srs_status, 'APPROVED');
    });

    it('forbids non-member student from downloading team SRS document with 403', async () => {
      const res = await request(`/api/v1/projects/teams/${team1.id}/srs/document/`, { token: studentB.token });
      assert.equal(res.status, 403);
      assert.match(res.body.detail, /do not have permission/i);
    });

    it('allows authorized team member to download team SRS document with 200', async () => {
      const res = await request(`/api/v1/projects/teams/${team1.id}/srs/document/`, { token: studentA.token });
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('%PDF-1.4'));
    });
  });

  // =========================================================================
  // 4. Campus Logistics Ownership and Administrative Access
  // =========================================================================
  describe('Campus logistics ownership and administrative access', () => {
    it('forbids student from viewing global meal cards list with 403', async () => {
      const student = await createTestUser('student');
      const res = await request('/api/v1/logistics/meal-cards/', { token: student.token });
      assert.equal(res.status, 403);
    });

    it('forbids generic staff from viewing global meal cards list with 403', async () => {
      const staff = await createTestUser('staff', { is_staff: true });
      const res = await request('/api/v1/logistics/meal-cards/', { token: staff.token });
      assert.equal(res.status, 403);
    });

    it('allows student_union to view global meal cards list with 200', async () => {
      const union = await createTestUser('student_union');
      const res = await request('/api/v1/logistics/meal-cards/', { token: union.token });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });

    it('forbids student from viewing dorm rooms status list with 403', async () => {
      const student = await createTestUser('student');
      const res = await request('/api/v1/logistics/dorm-rooms/', { token: student.token });
      assert.equal(res.status, 403);
    });

    it('allows dorm_admin to view dorm rooms status list with 200', async () => {
      const dormAdmin = await createTestUser('dorm_admin');
      const res = await request('/api/v1/logistics/dorm-rooms/', { token: dormAdmin.token });
      assert.equal(res.status, 200);
      assert.ok(res.body.rooms);
    });

    it('forbids student A from retrieving student B logistics record by ID with 403', async () => {
      const studentA = await createTestUser('student');
      const studentB = await createTestUser('student');
      const logisticsB = await CampusLogistics.create({ student_id: studentB.user.id });

      const res = await request(`/api/v1/logistics/${logisticsB.id}/`, { token: studentA.token });
      assert.equal(res.status, 403);
      assert.match(res.body.detail, /do not have permission/i);
    });

    it('allows student B to retrieve their own logistics record with 200', async () => {
      const studentB = await createTestUser('student');
      const logisticsB = await CampusLogistics.create({ student_id: studentB.user.id });

      const res = await request(`/api/v1/logistics/${logisticsB.id}/`, { token: studentB.token });
      assert.equal(res.status, 200);
      assert.equal(res.body.id, logisticsB.id);
    });

    it('allows staff/admin to retrieve any student logistics record with 200', async () => {
      const student = await createTestUser('student');
      const admin = await createTestUser('admin');
      const logistics = await CampusLogistics.create({ student_id: student.user.id });

      const res = await request(`/api/v1/logistics/${logistics.id}/`, { token: admin.token });
      assert.equal(res.status, 200);
      assert.equal(res.body.id, logistics.id);
    });
  });

  // =========================================================================
  // 5. Academic Roster and Forwarded-Letter Authorization
  // =========================================================================
  describe('Academic roster and forwarded-letter authorization', () => {
    it('forbids student from viewing dorm forwarded letters with 403', async () => {
      const student = await createTestUser('student');
      const res = await request('/api/v1/uil-profiles/dorm/forwarded-letters/', { token: student.token });
      assert.equal(res.status, 403);
    });

    it('forbids generic staff from viewing dorm forwarded letters with 403', async () => {
      const staff = await createTestUser('staff', { is_staff: true });
      const res = await request('/api/v1/uil-profiles/dorm/forwarded-letters/', { token: staff.token });
      assert.equal(res.status, 403);
    });

    it('allows dorm_admin to view dorm forwarded letters with 200', async () => {
      const dormAdmin = await createTestUser('dorm_admin');
      const res = await request('/api/v1/uil-profiles/dorm/forwarded-letters/', { token: dormAdmin.token });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });

    it('forbids student from viewing student-dean forwarded letters with 403', async () => {
      const student = await createTestUser('student');
      const res = await request('/api/v1/uil-profiles/student-dean/forwarded-letters/', { token: student.token });
      assert.equal(res.status, 403);
    });

    it('allows student_union to view student-dean forwarded letters with 200', async () => {
      const union = await createTestUser('student_union');
      const res = await request('/api/v1/uil-profiles/student-dean/forwarded-letters/', { token: union.token });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });

    it('forbids student from downloading department score roster excel with 403 across all routes', async () => {
      const student = await createTestUser('student');
      const res1 = await request('/api/v1/uil/departments/roster-excel/', { token: student.token });
      const res2 = await request('/api/v1/uil/export-excel/', { token: student.token });
      const res3 = await request('/api/v1/uil/roster-excel/', { token: student.token });
      assert.equal(res1.status, 403);
      assert.equal(res2.status, 403);
      assert.equal(res3.status, 403);
    });

    it('allows dept_dean or uil_officer to download department score roster excel', async () => {
      const dean = await createTestUser('dept_dean');
      const uil = await createTestUser('uil_officer');
      const resDean = await request('/api/v1/uil/departments/roster-excel/', { token: dean.token });
      const resUil = await request('/api/v1/uil/export-excel/', { token: uil.token });
      assert.equal(resDean.status, 200);
      assert.equal(resUil.status, 200);
      assert.equal(resDean.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      assert.equal(resUil.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });
  });

  // =========================================================================
  // 6. Email Verification Token Validation, Expiration, Concurrency, and Anti-Reuse
  // =========================================================================
  describe('Email verification token validation, expiration, concurrency, and anti-reuse', () => {
    it('rejects tampered or malformed email verification tokens with 400', async () => {
      const unverified = await createTestUser('student', { is_email_verified: false, is_active: false });
      const res = await request(`/api/auth/verify-email/${unverified.user.id}/tampered-token-value/`);
      assert.equal(res.status, 400);
      assert.match(res.body.detail, /invalid/i);
    });

    it('rejects token when route identifier does not match token subject with 400', async () => {
      const userA = await createTestUser('student', { is_email_verified: false, is_active: false });
      const userB = await createTestUser('student', { is_email_verified: false, is_active: false });
      const tokenA = generateEmailVerificationToken(userA.user);

      const res = await request(`/api/auth/verify-email/${userB.user.id}/${tokenA}/`);
      assert.equal(res.status, 400);
      assert.match(res.body.detail, /does not match|invalid/i);
    });

    it('rejects expired email verification token with 400', async () => {
      const unverified = await createTestUser('student', { is_email_verified: false, is_active: false });
      const secret = getEmailVerificationSecret();
      const expiredToken = jwt.sign({
        token_type: 'email_verification',
        sub: unverified.user.id,
        email: unverified.user.email,
        state: getEmailVerificationStateHash(unverified.user),
      }, secret, { algorithm: 'HS256', expiresIn: '-5s' });

      const res = await request(`/api/auth/verify-email/${unverified.user.id}/${expiredToken}/`);
      assert.equal(res.status, 400);
      assert.match(res.body.detail, /expired/i);
    });

    it('invalidates verification token if user email changes after issuance with 400', async () => {
      const unverified = await createTestUser('student', { is_email_verified: false, is_active: false });
      const token = generateEmailVerificationToken(unverified.user);

      // Mutate user email in database
      unverified.user.email = `mutated-${crypto.randomUUID().slice(0, 6)}@example.test`;
      await unverified.user.save();

      const res = await request(`/api/auth/verify-email/${unverified.user.id}/${token}/`);
      assert.equal(res.status, 400);
      assert.match(res.body.detail, /invalid|changed|already been used/i);
    });

    it('verifies unverified user with valid cryptographic token with 200', async () => {
      const unverified = await createTestUser('student', { is_email_verified: false, is_active: false });
      const token = generateEmailVerificationToken(unverified.user);

      const res = await request(`/api/auth/verify-email/${unverified.user.id}/${token}/`);
      assert.equal(res.status, 200);
      assert.match(res.body.message, /verified successfully/i);

      const reloaded = await User.findByPk(unverified.user.id);
      assert.equal(reloaded.is_email_verified, true);
      assert.equal(reloaded.is_active, true);
    });

    it('rejects token reuse once email has been verified with 400', async () => {
      const unverified = await createTestUser('student', { is_email_verified: false, is_active: false });
      const token = generateEmailVerificationToken(unverified.user);

      // First verification succeeds
      const firstRes = await request(`/api/auth/verify-email/${unverified.user.id}/${token}/`);
      assert.equal(firstRes.status, 200);

      // Replay attempt fails
      const replayRes = await request(`/api/auth/verify-email/${unverified.user.id}/${token}/`);
      assert.equal(replayRes.status, 400);
      assert.match(replayRes.body.detail, /already been verified|already been used/i);
    });

    it('handles concurrent email verification replay attempts safely (exactly one succeeds)', async () => {
      const unverified = await createTestUser('student', { is_email_verified: false, is_active: false });
      const token = generateEmailVerificationToken(unverified.user);

      const [res1, res2] = await Promise.all([
        request(`/api/auth/verify-email/${unverified.user.id}/${token}/`),
        request(`/api/auth/verify-email/${unverified.user.id}/${token}/`),
      ]);

      const statuses = [res1.status, res2.status].sort();
      assert.deepEqual(statuses, [200, 400]);

      const successRes = res1.status === 200 ? res1 : res2;
      const failureRes = res1.status === 400 ? res1 : res2;
      assert.match(successRes.body.message, /verified successfully/i);
      assert.match(failureRes.body.detail, /already been verified|already been used/i);

      const reloaded = await User.findByPk(unverified.user.id);
      assert.equal(reloaded.is_email_verified, true);
      assert.equal(reloaded.is_active, true);
    });
  });

  // =========================================================================
  // 7. Weekly Logbook Mass-Assignment & Profile Protection
  // =========================================================================
  describe('Weekly logbook mass-assignment protection (POST /api/v1/projects/logbooks/)', () => {
    let student, team, advisor;

    before(async () => {
      student = await createTestUser('student');
      advisor = await createTestUser('advisor');
      team = await ProjectTeam.create({
        team_name: `Logbook Team - ${crypto.randomUUID().slice(0, 6)}`,
        project_title: 'Logbook Test Project',
        assigned_advisor_id: advisor.user.id,
      });
      await TeamMember.create({
        team_id: team.id,
        student_id: student.user.id,
        assigned_role: 'Developer',
      });
    });

    it('forbids submitting a logbook if student has no StudentProfile with 403', async () => {
      const noProfileStudent = await createTestUser('student', { withProfile: false });
      const res = await request('/api/v1/projects/logbooks/', {
        method: 'POST',
        token: noProfileStudent.token,
        body: {
          project_team_id: team.id,
          week_number: 1,
          tasks_executed: 'Trying without profile',
        },
      });
      assert.equal(res.status, 403);
      assert.match(res.body.detail, /student profile not found/i);
    });

    it('forbids submitting a logbook for a team the student is not a member of with 403', async () => {
      const outsider = await createTestUser('student');
      const res = await request('/api/v1/projects/logbooks/', {
        method: 'POST',
        token: outsider.token,
        body: {
          project_team_id: team.id,
          week_number: 1,
          tasks_executed: 'Trying to log work for another team',
        },
      });
      assert.equal(res.status, 403);
      assert.match(res.body.detail, /not a member of the specified project team/i);
    });

    it('neutralizes mass-assignment across all protected logbook fields', async () => {
      const forgedAdvisorId = crypto.randomUUID();
      const maliciousPayload = {
        project_team_id: team.id,
        week_number: 3,
        tasks_planned: 'Build authentication',
        tasks_executed: 'Built secure RBAC and team authorization',
        challenges_faced: 'Handling cross-team isolation',
        // Malicious fields that must be stripped:
        advisor_approved: true,
        status: 'APPROVED',
        advisor_feedback: 'FORGED: Excellent work, highest marks!',
        similarity_score: 0.99,
        is_flagged: true,
        matched_snippet: 'FORGED PLAGIARISM BYPASS',
        academic_advisor_id: forgedAdvisorId,
      };

      const res = await request('/api/v1/projects/logbooks/', {
        method: 'POST',
        token: student.token,
        body: maliciousPayload,
      });

      assert.equal(res.status, 201);
      // Response must NOT contain client-forged approval values
      assert.equal(res.body.advisor_approved, false);
      assert.equal(res.body.advisor_feedback, '');
      assert.notEqual(res.body.academic_advisor_id, forgedAdvisorId);
      assert.equal(res.body.academic_advisor_id, advisor.user.id);

      // Verify in database that the persisted record is completely uncorrupted
      const persisted = await WeeklyLogbook.findByPk(res.body.id);
      assert.equal(persisted.advisor_approved, false);
      assert.equal(persisted.advisor_feedback, '');
      assert.equal(persisted.academic_advisor_id, advisor.user.id);
      assert.equal(persisted.student_id, student.user.id);
      assert.equal(persisted.week_number, 3);
      assert.notEqual(persisted.matched_snippet, 'FORGED PLAGIARISM BYPASS');
      assert.equal(persisted.status, 'SUBMITTED');
    });
  });
});
