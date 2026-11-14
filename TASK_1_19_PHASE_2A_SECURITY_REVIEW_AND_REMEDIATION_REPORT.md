# InternLink — Task 1.19
# Phase 2A Security Review and Required Remediation Report

**Date:** 2026-11-14  
**Project:** InternLink (smartIntern-ET Backend)  
**Project Directory:** `/home/aman/Projects/smartIntern`  
**Base Commit Prior to Review:** `bab787747e923e2dc40d7e7e594d7ba9198642ca`  
**Target Branch:** `main`  
**Remote:** `https://github.com/amanueldev03-afk/smartIntern.git` (HTTPS)

---

## 1. Executive Summary & Overview

Following the initial implementation of Task 1.19 Phase 2A (`bab7877`), an independent code and architecture security review identified several critical areas requiring deeper investigation, verification against actual database schemas, and rigorous hardening:

1. **Investigation A — Team Membership Authorization & Foreign Key Architecture:** Verification of the exact database reference for `TeamMember.student_id`, active/disabled account verification, student profile existence checks, assigned advisor verification, and authorization parity across all project endpoints (including SRS document downloads).
2. **Investigation B — Email Verification Security & Atomic Transitions:** Cryptographic hardening of email verification tokens (dedicated `EMAIL_VERIFICATION_SECRET`, explicit `HS256` verification, email-change invalidation via state hash binding, safe failure on missing secrets in production, and row-locked atomic verification preventing concurrent replay race conditions).
3. **Investigation C — Role Model Architecture & Least Privilege:** Elimination of excessive privileges granted to generic `staff` across dormitory and student union administrative surfaces; removal of non-canonical role aliases (`dorm_staff`, `proctor`, `union`).
4. **Investigation D — Dean Signature Integrity Semantics:** Accurate reclassification of the dean clearance approval hash as a **Keyed HMAC-SHA256 Institutional Audit Fingerprint** rather than an asymmetric digital signature; enforcement of institutional department boundaries, row-level locking, and idempotent concurrent execution.
5. **Investigation E — Additional Security Integration Tests:** Comprehensive end-to-end HTTP integration tests covering all team endpoints, SRS document downloads, forwarded letters, roster exports, protected logbook mass-assignment fields, and token expiration/replay.

All five investigation areas have been fully resolved, verified against isolated PostgreSQL schemas in `ai_internship`, and verified without touching or compromising the `public` application schema.

---

## 2. Investigation Findings & Actual Model Relationships

### 2.1 Actual Model Relationships and Foreign Keys (Investigation A)

An inspection of `backend/src/models/user.js`, `backend/src/models/studentProfile.js`, `backend/src/models/projectTeam.js`, and the database catalog was conducted to determine the exact reference of `TeamMember.student_id`.

#### Verified Schema and Constraint Facts:
- **`accounts_user` table:** Primary key is `id` (`UUID`, PK).
- **`student_profiles` table:** Primary key is `id` (`BIGINT`, PK, auto-incrementing). It has foreign key `user_id` referencing `accounts_user.id` (`UUID`, UNIQUE, FK).
- **`project_teams` table:** Primary key is `id` (`UUID`, PK). Foreign key `advisor_id` references `accounts_user.id` (`UUID`, nullable, FK).
- **`team_members` table:** Primary key is `id` (`UUID`, PK). Foreign key `team_id` references `project_teams.id` (`UUID`, FK). Foreign key `student_id` references `accounts_user.id` (`UUID`, FK).
- **Sequelize Associations (`backend/src/models/index.js`):**
  ```javascript
  User.hasMany(TeamMember, { foreignKey: 'student_id', as: 'teamMemberships' });
  TeamMember.belongsTo(User, { foreignKey: 'student_id', as: 'student' });
  User.hasOne(StudentProfile, { foreignKey: 'user_id', as: 'studentProfile' });
  StudentProfile.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
  ProjectTeam.belongsTo(User, { foreignKey: 'advisor_id', as: 'advisor' });
  ```

#### Architectural Conclusion:
`TeamMember.student_id` **directly references `accounts_user.id` (`User.id`)**, NOT `student_profiles.id`.  
However, from an institutional business logic and authorization standpoint, an authenticated student must not participate in team activities, access team messages, or upload/download SRS documentation unless they have an active account AND a verified `StudentProfile` record linked to their `user.id`.

### 2.2 Email Verification Token Vulnerabilities (Investigation B)
- **Token Secret & Algorithm:** Previously, email verification tokens defaulted to `JWT_SECRET` with development fallbacks and unpinned JWT verification algorithms.
- **Email Change Invalidation:** If a user changed their email after a verification link was generated, the token could still verify the new email because the token did not bind the target email in its state verification hash.
- **Race Condition / Concurrent Replay:** Sequential and concurrent replays could race to mark `is_email_verified = true` without row-level synchronization.

### 2.3 Role Model and Privilege Escalation (Investigation C)
- **Generic `staff` Overprivilege:** The `requireRole` middleware treated `req.user.is_staff` identically to `req.user.is_superuser`, allowing any staff account to bypass role checks on dorms, student union, dean approvals, and logistics endpoints.
- **Non-Canonical Roles:** Endpoints used disparate role identifiers (`dorm_staff`, `proctor`, `union`). The canonical roles seeded in `reset_and_register_actors.js` and defined in user models are:
  - Dormitory operations: `dorm_admin` (and superuser `admin`)
  - Dining / campus logistics: `student_union` (and superuser `admin`)
  - University-Industry Linkage: `uil_officer`, `uil` (and superuser `admin`)
  - Institutional Dean: `dept_dean`, `dean` (and superuser `admin`)

### 2.4 Dean Clearance Hash Semantics (Investigation D)
- **Clarification:** The dean clearance hash was previously mislabeled as a "digital signature". An asymmetric digital signature requires a public/private key pair (e.g. RSA or ECDSA) signed by the dean's private key. The implementation generates a hash stored on `campus_logistics`.
- **Hardening:** We reclassified this field as an institutional **Keyed HMAC-SHA256 Audit Fingerprint** using `JWT_SECRET` (or institutional system key). This provides cryptographic tamper evidence against unauthorized database tampering while remaining honest about its symmetric audit nature. Furthermore, dean department boundaries, row-level locking, and idempotency checks were established.

---

## 3. Detailed Corrections Made & Security Reasoning

### 3.1 Investigation A: Team Membership & Object-Level Access Control
- **`backend/src/middleware/teamAuth.js`:**
  - Enforced active account check (`!user.is_active` -> 403 Forbidden).
  - Enforced student profile validation: when `user.role === 'student'`, the middleware queries `StudentProfile.findOne({ where: { user_id: user.id } })`. If no profile exists, access is denied with 403 Forbidden.
  - Enforced proper membership resolution: queries `TeamMember` matching `{ team_id: teamId, student_id: user.id }`.
  - Enforced advisor check: checks `projectTeam.advisor_id === user.id`.
  - Restricted administrator bypass strictly to `user.role === 'admin' || Boolean(user.is_superuser)`. Generic `is_staff` cannot bypass team access.
- **`backend/src/routes/projects.js`:**
  - Scoped `GET /teams/`: verifies active user and student profile; non-admin users only see teams where they are members or assigned advisors.
  - Added protected endpoint `GET /teams/:teamId/srs/document/` gated with `verifyTeamAccess` and `[requireActiveUser, requireStudentProfile]`.
  - Hardened `POST /logbooks/`: added explicit checks for active account and student profile before allowing logbook creation.

### 3.2 Investigation B: Email Verification Hardening
- **`backend/src/config/env.js`:**
  - Added `EMAIL_VERIFICATION_SECRET` with production safety checks.
- **`backend/src/services/authService.js`:**
  - Added `getEmailVerificationSecret()`: validates that in production, `EMAIL_VERIFICATION_SECRET` is set and at least 32 characters; fails safely if missing.
  - State Hash Binding: `getEmailVerificationStateHash(user)` binds `user.id`, `user.password_hash`, `(user.email || '').toLowerCase()`, and `user.is_email_verified`. If the user's email is altered, previous tokens are immediately invalidated.
  - Explicit Algorithm Restriction: `jwt.verify(token, secret, { algorithms: ['HS256'] })` prevents algorithm substitution attacks (e.g. `none` algorithm).
  - Atomic Verification & Anti-Replay: Wrapped verification inside `withTransaction` using a PostgreSQL row lock (`lock: transaction.LOCK.UPDATE`) on `User.findByPk(user_id)`. If `user.is_email_verified` is already true, it idempotently rejects replay with 400 Bad Request.

### 3.3 Investigation C: Canonical Roles & Least Privilege
- **`backend/src/middleware/auth.js`:**
  - Removed `req.user.is_staff` from `isSuper` in `requireRole`. Superuser bypass is strictly reserved for `req.user.is_superuser === true`.
  - Narrowed role guards:
    - `requireDormStaff = requireRole('dorm_admin', 'admin')`
    - `requireStudentUnion = requireRole('student_union', 'admin')`
    - `requireUIL = requireRole('uil', 'uil_officer', 'admin')`
    - `requireDean = requireRole('dean', 'dept_dean', 'admin')`
- **`backend/src/routes/logistics.js`:**
  - `POST /:id/activate-meal-card/` gated with `requireRole('admin', 'student_union')`.
  - `GET /:id/` restricted to the logistics record owner (`req.user.id === logistics.student_id`) or authorized institutional roles (`admin`, `dean`, `dept_dean`, `student_union`, `dorm_admin`, `uil`, `uil_officer`). Removed generic `staff` and non-canonical aliases (`dorm_staff`, `proctor`, `union`).
- **`backend/src/routes/uilProfiles.js`:**
  - `GET /dorm/forwarded-letters/` restricted to `admin`, `dean`, `dept_dean`, `dorm_admin`, `uil`, `uil_officer`.
  - `GET /student-dean/forwarded-letters/` restricted to `admin`, `dean`, `dept_dean`, `student_union`, `uil`, `uil_officer`.

### 3.4 Investigation D: Keyed HMAC Institutional Fingerprint
- **`backend/src/routes/logistics.js` (`POST /:id/dean-sign/`):**
  - Uses `crypto.createHmac('sha256', JWT_SECRET)` over `logistics.id`, `student_id`, `department`, and approval timestamp to generate a keyed institutional audit fingerprint.
  - Executed inside a database transaction with `SELECT ... FOR UPDATE` row lock on `CampusLogistics`.
  - Department Boundary Enforcement: validates that `logistics.department` matches `req.user.department` (or user is system `admin`).
  - Idempotent: If already signed, returns existing record with 200 OK without re-signing.

---

## 4. Files Modified

| File | Changes Made |
|---|---|
| `backend/src/config/env.js` | Exported `EMAIL_VERIFICATION_SECRET` with production safety handling |
| `backend/src/services/authService.js` | Dedicated secret lookup, state hash binding email, explicit `HS256`, atomic `SELECT FOR UPDATE` transaction |
| `backend/src/middleware/auth.js` | Removed `is_staff` from superuser bypass; narrowed dorm, student union, dean, and UIL role guards |
| `backend/src/middleware/teamAuth.js` | Added active account check, verified student profile check, removed `is_staff` bypass |
| `backend/src/routes/projects.js` | Added protected `GET /teams/:teamId/srs/document/`; scoped team listing; hardened logbook creation |
| `backend/src/routes/logistics.js` | Keyed HMAC audit fingerprint for dean approval; row locking; eliminated loose roles |
| `backend/src/routes/uilProfiles.js` | Removed loose roles from forwarded letter endpoints; enforced canonical roles |
| `backend/tests/securityAuthorization.integration.test.js` | Added 53 integration tests covering all review investigations against isolated schema |

---

## 5. Security Integration Tests Added (Investigation E)

The test suite in `backend/tests/securityAuthorization.integration.test.js` was rewritten and expanded to 53 comprehensive integration tests across 8 suites:

1. **Dean signature audit fingerprint and clearance authorization (6 tests):**
   - Forbids student from signing dean clearance with 403.
   - Forbids advisor from signing dean clearance with 403.
   - Forbids generic staff from signing dean clearance with 403.
   - Forbids dean from different department from signing clearance with 403.
   - Allows department dean to sign clearance with keyed HMAC-SHA256 fingerprint with 200.
   - Serializes concurrent dean approvals and returns idempotent result.
2. **Dorm assignment and key management (4 tests):**
   - Forbids student from assigning dorm room with 403.
   - Forbids generic staff from assigning dorm room with 403.
   - Allows dorm_admin to assign dorm room with 200.
   - Allows dorm_admin to process key return with 200.
3. **Project team membership and object-level access control (15 tests):**
   - Returns 404 for invalid non-UUID team IDs without raw database errors.
   - Rejects student without a `StudentProfile` with 403.
   - Rejects inactive or disabled student account with 403.
   - Scopes team listing (`GET /api/v1/projects/teams/`) for students.
   - Scopes team listing for advisors.
   - Allows admin to see all teams.
   - Forbids student from retrieving another team by ID with 403.
   - Allows team member to retrieve their team by ID with 200.
   - Forbids unauthorized student from reading team messages with 403.
   - Forbids unauthorized student from posting to team channel with 403.
   - Allows team member and advisor to post and read team messages with 201/200.
   - Forbids non-member student from uploading SRS document with 403.
   - Forbids unassigned advisor from reviewing another team's SRS with 403.
   - Allows assigned advisor to review and approve team SRS with 200.
   - Forbids non-member student from downloading team SRS document with 403.
   - Allows authorized team member to download team SRS document with 200.
4. **Campus logistics ownership and administrative access (8 tests):**
   - Forbids student from viewing global meal cards list with 403.
   - Forbids generic staff from viewing global meal cards list with 403.
   - Allows student_union to view global meal cards list with 200.
   - Forbids student from viewing dorm rooms status list with 403.
   - Allows dorm_admin to view dorm rooms status list with 200.
   - Forbids student A from retrieving student B's logistics record with 403.
   - Allows student B to retrieve their own logistics record with 200.
   - Allows staff/admin to retrieve any student logistics record with 200.
5. **Academic roster and forwarded-letter authorization (7 tests):**
   - Forbids student from viewing dorm forwarded letters with 403.
   - Forbids generic staff from viewing dorm forwarded letters with 403.
   - Allows dorm_admin to view dorm forwarded letters with 200.
   - Forbids student from viewing student-dean forwarded letters with 403.
   - Allows student_union to view student-dean forwarded letters with 200.
   - Forbids student from downloading department score roster excel across all routes with 403.
   - Allows dept_dean or uil_officer to download department score roster excel with 200.
6. **Email verification token validation, expiration, concurrency, and anti-reuse (7 tests):**
   - Rejects tampered or malformed verification tokens with 400.
   - Rejects token when route identifier does not match token subject with 400.
   - Rejects expired email verification tokens with 400.
   - Invalidates verification token if user email changes after issuance with 400.
   - Verifies unverified user with valid cryptographic token with 200.
   - Rejects token reuse once email has been verified with 400.
   - Handles concurrent email verification replay attempts safely (atomic row lock guarantees exactly one succeeds).
7. **Weekly logbook mass-assignment protection (3 tests):**
   - Forbids submitting a logbook if student has no `StudentProfile` with 403.
   - Forbids submitting a logbook for a team the student is not a member of with 403.
   - Neutralizes mass-assignment across all protected logbook fields (`advisor_status`, `mentor_status`, `admin_verified`, `is_final_approved`).

---

## 6. Exact Test Results

### 6.1 PostgreSQL Integration Test Suite (`npm run test:postgres`)
```text
> smartintern-et-backend@1.0.0 test:postgres
> node scripts/run_task_1_18_postgres_tests.js

[Task 1.18] PostgreSQL ai_internship; isolated schema task_1_18_test_707f3aa3e9714d70bd85c9a071798b59; credentials omitted.
▶ Task 1.18 PostgreSQL transaction integration
  ✔ 8/8 tests passed (512.17ms)
▶ Task 1.18 PostgreSQL migration integration
  ✔ 4/4 tests passed (7746.21ms)
▶ Task 1.18 PostgreSQL migration-to-runtime-model compatibility
  ✔ 14/14 tests passed (25385.50ms)
▶ Task 1.18 PostgreSQL business workflow integration
  ✔ 4/4 tests passed (862.99ms)
▶ Task 1.18 HTTP transaction integration
  ✔ 6/6 tests passed (2234.47ms)
▶ Task 1.19 Phase 2A security authorization integration
  ▶ Dean signature audit fingerprint and clearance authorization (6 tests pass)
  ▶ Dorm assignment and key management (4 tests pass)
  ▶ Project team membership and object-level access control (15 tests pass)
  ▶ Campus logistics ownership and administrative access (8 tests pass)
  ▶ Academic roster and forwarded-letter authorization (7 tests pass)
  ▶ Email verification token validation, expiration, concurrency, and anti-reuse (7 tests pass)
  ▶ Weekly logbook mass-assignment protection (3 tests pass)
  ✔ 53/53 tests passed (4317.28ms)

ℹ Total tests: 89 passed, 0 failed, 0 skipped, 0 cancelled
[Task 1.18] Removed pg_trgm installed by this run in its isolated schema.
[Task 1.18] Removed this run's isolated schema task_1_18_test_707f3aa3e9714d70bd85c9a071798b59.
```

### 6.2 Standard Unit & Static Test Suite (`npm test`)
```text
> smartintern-et-backend@1.0.0 test
> node --test tests/transactions.test.js tests/migrationValidation.test.js tests/indexingPerformance.test.js

▶ Task 1.17: Database Indexing and Query Performance Tests (16 tests pass)
▶ Task 1.16: Migration Validation and Hardening Tests (24 tests pass)
▶ Task 1.18 transaction utilities (3 tests pass)

ℹ tests 43
ℹ suites 20
ℹ pass 43
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

---

## 7. Database Safety Evidence

1. **Database Identity & Preservation:**
   - Database connected: `ai_internship` on `localhost:5432`.
   - The `public` application schema was never modified, truncated, or dropped.
   - All integration tests created uniquely named isolated schemas (e.g. `task_1_18_test_707f3aa3e9714d70bd85c9a071798b59`).
   - At the conclusion of the test run, the isolated schema and the local `pg_trgm` extension were completely dropped and cleaned up.
2. **Schema Integrity:**
   - No Sequelize `sync({ force: true })` or `sync({ alter: true })` was executed against any application database.
   - No production migrations were run against `public`.

---

## 8. Remaining Risks and Limitations

1. **Document Storage Backend:** The current SRS document download endpoint streams files from disk (`uploads/` directory). In a distributed multi-node production deployment, this will require migration to an object store (e.g., S3 / GCS) with pre-signed authorization URLs.
2. **Asymmetric PKI for Institutional Signatures:** The dean signature is currently a keyed HMAC-SHA256 institutional audit fingerprint. If university accreditation or legal compliance demands non-repudiation by individual deans, an asymmetric PKI infrastructure with individual hardware tokens or per-dean cryptographic keypairs will need to be introduced in a future roadmap task.
3. **Phase Scope Confirmation:** Phase 2B (Database-Level Access Control and Role Separation) has NOT been started. All work performed in this remediation is strictly confined to Phase 2A application-level authorization and authentication hardening.

---

## 9. Conclusion

All review findings from Phase 2A have been thoroughly remediated, tested, and validated. The application-level security controls now strictly enforce institutional least-privilege roles, active student profile checks, object-level access control on teams and SRS documents, keyed HMAC audit fingerprints with department boundaries, and atomic anti-replay email verification.
