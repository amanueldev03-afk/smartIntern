# InternLink — Task 1.19 Phase 2A Implementation Report
## Application-Level Authorization and Authentication Hardening

**Project:** InternLink (SmartIntern-ET Backend)  
**Author:** Senior Backend Security Engineer (Google Antigravity)  
**Branch:** `main`  
**Base Commit:** `ac127030b6f9d0735ed587e09b5906aa8121d746`  
**Execution Timestamp:** 2026-11-14T20:25:00+03:00  
**Status:** Completed & Empirically Verified (100% Pass Rate across 71 Integration Tests)

---

## 1. Executive Summary & Objective

In Task 1.19 Phase 1, an exhaustive, read-only security audit of the InternLink backend was conducted (`TASK_1_19_PHASE_1_SECURITY_INVESTIGATION_REPORT.md`). The audit uncovered severe application-level authorization and authentication vulnerabilities across institutional clearance, housing management, collaborative project teams, administrative rosters, student logbooks, and credential recovery/activation workflows.

Phase 2A delivers a surgical, zero-regression remediation of every application-level vulnerability identified, establishing defense-in-depth access controls, strict object-level authorization (BOLA/IDOR mitigation), cryptographic token hardening, and strict payload attribute whitelisting (mass-assignment mitigation).

### Key Hardened Subsystems:
1. **Dean Signature Clearance (`POST /api/v1/logistics/:id/dean-sign/`):** Enforces institutional role authority (`dean`, `dept_dean`, `admin`), departmental boundary checks, atomic row locking, and immutable SHA-256 cryptographic audit trails.
2. **Dormitory Assignment & Key Issuance (`POST /api/v1/logistics/:id/assign-dorm/`, `POST /api/v1/logistics/:id/return-key/`):** Restricted strictly to authorized housing staff (`dorm_admin`, `dorm`, `dorm_staff`, `proctor`, `admin`, `staff`) with state-transition validation.
3. **Project Team Object-Level Access Control (`/api/v1/projects/teams/...`):** Complete elimination of IDOR vulnerabilities. Students, advisors, and administrators are strictly gated via reusable middleware (`verifyTeamAccess` / `requireTeamAccess`), preventing cross-team document inspection, unauthorized messaging, and illegal SRS approval.
4. **Campus Logistics Ownership & Privacy (`/api/v1/logistics/...`):** Student logistics records are isolated strictly to their owner; bulk meal-card registers and dormitory occupancy listings are protected behind semantic administrative guards.
5. **Academic Roster & Confidential Forwarded Letters (`/api/v1/uil/...`, `/api/v1/uil-profiles/...`):** Department-wide Excel roster exports and housing clearance letters are protected with role checks, eliminating data-harvesting risks.
6. **Stateless Anti-Replay Email Verification (`GET /api/auth/verify-email/:uid/:token/`):** Replaced insecure base64 payloads with HMAC-SHA256 JWTs featuring 24-hour expiration and cryptographic state-hash binding (`hash(id + password + is_email_verified + is_active)`), mathematically preventing token replay without requiring database schema mutations.
7. **Weekly Logbook Mass-Assignment Defense (`POST /api/v1/projects/logbooks/`):** Eradicated `...req.body` spreading. Input attributes are strictly whitelisted; `advisor_approved`, `advisor_feedback`, `similarity_score`, `is_flagged`, and `academic_advisor_id` cannot be modified or forged by students.

---

## 2. Threat Model & Vulnerability Analysis (Before vs. After)

| Vulnerability Vector | Severity | Pre-Remediation State (Vulnerable) | Post-Remediation State (Hardened) |
|---|---|---|---|
| **Dean Clearance Forgery** | Critical | Any authenticated user (including student) could sign institutional clearance. No role or department check. | Restricted to `dean`, `dept_dean`, and `admin`. Department boundaries enforced; atomic row locking; SHA-256 signature hash recorded. |
| **Dormitory Reassignment & Key Theft** | High | Any user could reassign room beds or toggle `key_issued` to `true` for arbitrary students. | Restricted strictly to `dorm_admin`, `dorm_staff`, `proctor`, and `admin`. State transitions validated atomically. |
| **Project Team IDOR / BOLA** | High | Team messages, SRS uploads, and SRS approvals accepted arbitrary `teamId` parameters without validating caller membership. | Every route invokes `verifyTeamAccess`: non-members receive 403; unassigned advisors cannot review SRS; listing is scoped per user. |
| **Logistics Record Snooping & Mass Card Dump** | High | Any student could dump all student union meal cards and inspect other students' room numbers and clearance status. | Global meal cards and dorm rosters restricted to student union / dorm staff; `GET /:id/` strictly restricted to owner or privileged staff. |
| **Academic Roster Data Harvesting** | Medium | `/departments/roster-excel/` and forwarded clearance letters lacked role-based authorization. | Gated with `requireRole('admin', 'dean', 'dept_dean', 'uil', 'uil_officer')`. Unauthorized access returns 403. |
| **Email Verification Token Replay & Forgery** | High | Trivial base64-encoded strings without signatures or expiration. Could be forged or replayed indefinitely. | Cryptographic JWT signed with server secret, 24-hour expiration, and dynamic state-hash binding that invalidates tokens immediately upon first use. |
| **Logbook Approval Mass-Assignment** | Critical | `WeeklyLogbook.create({ ...req.body })` allowed students to set `advisor_approved: true` and fake advisor feedback. | Whitelisted payload extraction; `advisor_approved` unconditionally `false`; feedback empty; advisor ID resolved from verified team membership. |

---

## 3. Implementation Details

### A. Role Middleware Standardization (`backend/src/middleware/auth.js`)
Added semantic, reusable authorization helpers ensuring zero ambiguity across role-protected routes:
```javascript
export const requireAdmin = requireRole('admin');
export const requireStudent = requireRole('student');
export const requireDean = requireRole('dean', 'dept_dean', 'admin');
export const requireDormStaff = requireRole('dorm_admin', 'dorm', 'dorm_staff', 'proctor', 'admin', 'staff');
export const requireStudentUnion = requireRole('student_union', 'union', 'admin', 'staff');
export const requireUIL = requireRole('uil', 'uil_officer', 'admin', 'staff');
export const requireAdvisor = requireRole('advisor', 'admin');
```

### B. Project Team Object-Level Access Control (`backend/src/middleware/teamAuth.js`)
Developed an object-level security engine verifying:
- Non-UUID inputs return 404 rather than triggering database casting syntax faults.
- Caller is verified against `TeamMember.findOne({ where: { team_id, student_id: user.id } })`.
- Caller is verified against `ProjectTeam.assigned_advisor_id === user.id`.
- System administrators and superusers have authorized oversight.
- Optional granular flags: `requireAdvisorOnly`, `requireMemberOnly`, `requireLeaderOnly`.

### C. Dean Institutional Clearance (`backend/src/routes/logistics.js`)
- Gated behind `requireAuth` and `requireDean`.
- Verifies that deans cannot approve records outside their academic department (`student.department === req.user.department`).
- Executes under an atomic transaction with `lock: transaction.LOCK.UPDATE`.
- Computes SHA-256 HMAC signature `hash(record.id + student.id + dean.id + timestamp)`.

### D. Dormitory Operations (`backend/src/routes/logistics.js`)
- `POST /:id/assign-dorm/` and `POST /:id/return-key/` protected with `requireDormStaff`.
- Room assignment and key issuance are serialized under row locks.
- `GET /meal-cards/` protected with `requireStudentUnion`.
- `GET /dorm-rooms/` protected with `requireDormStaff`.
- `GET /:id/` verifies `item.student_id === req.user.id` or elevated staff role.

### E. Secure Stateless Email Verification (`backend/src/services/authService.js` & `backend/src/routes/auth.js`)
Implemented cryptographic state-hash binding:
$$\text{StateHash} = \text{SHA256}(\text{userId} : \text{passwordHash} : \text{is\_email\_verified} : \text{is\_active})[0..16]$$
- Generated token includes `sub`, `email`, `state`, and `exp` (24h).
- Verification decodes the token, fetches the user, and verifies that `user.is_email_verified === false` and `decoded.state === currentState`.
- Once verified, `is_email_verified` becomes `true`, causing any replay attempt to fail state verification with 400.
- Does not expose password hashes in API responses (`POST /admin/approve-staff/:id/` sanitized).

### F. Logbook Mass-Assignment Defense (`backend/src/routes/projects.js`)
- Spread operator `...req.body` completely removed.
- Validates that the submitting student is an active member of the target `project_team_id`.
- Auto-resolves `academic_advisor_id` from the team's assigned advisor.
- Enforces strict defaults:
  - `advisor_approved = false`
  - `advisor_feedback = ''`
  - `similarity_score` & `is_flagged` computed exclusively by `checkLogbookPlagiarism`.

---

## 4. Verification & Testing

### A. Dedicated Test Suite
Created `backend/tests/securityAuthorization.integration.test.js` containing 35 comprehensive end-to-end integration tests using Node.js native test runner (`node:test`) and real HTTP execution against isolated PostgreSQL schemas:

1. **Dean signature authorization (6 tests):**
   - Unauthenticated rejected (401).
   - Student rejected (403).
   - Dorm staff rejected (403).
   - Cross-department dean rejected (403).
   - Authorized dean succeeds and generates SHA-256 hash (200).
   - Admin succeeds across departments (200).
2. **Dorm assignment and key management (4 tests):**
   - Student cannot assign dorm (403).
   - Student cannot return key (403).
   - Dorm staff assigns dorm and issues key (200).
   - Dorm staff returns key (200).
3. **Project team object-level access control (11 tests):**
   - Team listing scoped for students (only member teams returned).
   - Team listing scoped for advisors (only assigned teams returned).
   - Team listing shows all for admins.
   - Non-member student forbidden from retrieving team by ID (403).
   - Team member retrieves team by ID (200).
   - Non-member student forbidden from reading messages (403).
   - Non-member student forbidden from posting messages (403).
   - Member and advisor post and read messages (201 / 200).
   - Non-member student forbidden from uploading SRS (403).
   - Unassigned advisor forbidden from reviewing SRS (403).
   - Assigned advisor reviews and approves SRS (200).
4. **Campus logistics ownership & privacy (5 tests):**
   - Student forbidden from viewing meal cards list (403).
   - Student forbidden from viewing dorm rooms list (403).
   - Student A forbidden from retrieving Student B logistics record (403).
   - Student B retrieves own logistics record (200).
   - Staff/admin retrieves any student logistics record (200).
5. **Academic roster & forwarded letters (4 tests):**
   - Student forbidden from viewing dorm forwarded letters (403).
   - Student forbidden from viewing student-dean letters (403).
   - Student forbidden from downloading department score Excel roster (403).
   - Dean/admin downloads Excel roster (200).
6. **Email verification token security (3 tests):**
   - Tampered token rejected (400).
   - Valid cryptographic token verifies email and activates user (200).
   - Token replay / reuse rejected (400).
7. **Weekly logbook mass-assignment protection (2 tests):**
   - Submitting for unauthorized team rejected (403).
   - Submitting forged `advisor_approved: true`, `advisor_feedback`, or advisor ID is sanitized and ignored (201, verified uncorrupted in database).

### B. Empirical Test Run Results
Integrated into `scripts/run_task_1_18_postgres_tests.js`. Test execution across isolated schemas:
```text
▶ Task 1.18 PostgreSQL transaction integration
  ✔ 8 passed (567ms)
▶ Task 1.18 PostgreSQL migration integration
  ✔ 4 passed (10316ms)
▶ Task 1.18 PostgreSQL migration-to-runtime-model compatibility
  ✔ 14 passed (35551ms)
▶ Task 1.18 PostgreSQL business workflow integration
  ✔ 4 passed (1136ms)
▶ Task 1.18 HTTP transaction integration
  ✔ 6 passed (3509ms)
▶ Task 1.19 Phase 2A security authorization integration
  ✔ 35 passed (5110ms)
TOTAL: 71 passed, 0 failed across all integration suites.
```

Unit test run (`npm test`):
```text
▶ Task 1.17: Database Indexing and Query Performance Tests (19 passed)
▶ Task 1.16: Migration Validation and Hardening Tests (21 passed)
▶ Task 1.18 transaction utilities (3 passed)
TOTAL: 43 passed, 0 failed.
```

---

## 5. Database Safety Compliance

- **Database:** `ai_internship` exclusively utilized. No other database created.
- **Public Schema Protection:** `public` schema was untouched. All integration tests ran inside ephemeral schemas (`task_1_18_test_[a-f0-9]{32}`) that were automatically created, verified, and dropped via `CASCADE`.
- **Zero Schema Mutations:** No manual column or table modifications were performed against application tables.
- **Untracked File Preservation:** Historical reports `TASK_1_18_FINAL_CODE_AUDIT_REPORT.md` and `TASK_1_19_PHASE_1_SECURITY_INVESTIGATION_REPORT.md` were preserved intact.

---

## 6. Files Changed in Phase 2A

| File | Change Description |
|---|---|
| `backend/src/middleware/auth.js` | Added semantic role shortcuts (`requireDean`, `requireDormStaff`, `requireStudentUnion`, etc.) |
| `backend/src/middleware/teamAuth.js` | *New file*: Reusable object-level team authorization (`verifyTeamAccess`, `requireTeamAccess`) |
| `backend/src/services/authService.js` | Added constant-time comparison, stateless token generation/verification with state-hash binding |
| `backend/src/routes/auth.js` | Hardened `/verify-email/`, `/resend-verification/`, and stripped password hashes from staff approval response |
| `backend/src/routes/logistics.js` | Protected dean sign, dorm assignment, key return, meal cards, dorm rooms, and individual record access |
| `backend/src/routes/projects.js` | Enforced team authorization on messages, SRS upload/review, scoped listings, and logbook mass-assignment protection |
| `backend/src/routes/uilProfiles.js` | Protected dorm letters, student-dean letters, and Excel roster downloads |
| `backend/tests/securityAuthorization.integration.test.js` | *New file*: 35 integration tests covering all Phase 2A authorization gates |
| `backend/scripts/run_task_1_18_postgres_tests.js` | Added `securityAuthorization.integration.test.js` to PostgreSQL runner |
| `TASK_1_19_PHASE_2A_IMPLEMENTATION_REPORT.md` | *New file*: Comprehensive implementation report |

---

## 7. Next Steps (Roadmap Transition)

With Phase 2A successfully completed, the project is ready for **Phase 2B: SQL Injection Remediation & Query Security Hardening** (reviewing Sequelize dynamic queries, bind parameters, raw SQL fragments, and search/sort sanitization).
