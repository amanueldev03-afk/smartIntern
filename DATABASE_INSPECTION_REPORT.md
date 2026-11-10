# Database Inspection Report: TeamMember UUID Migration Feasibility

**Date:** 2026-11-05
**Investigation Type:** READ-ONLY Database Schema and Data Inspection
**Project:** InternLink (SmartIntern-ET)

---

## 1. Database Identification

### Database Type and Configuration
- **Database Type:** PostgreSQL (configured in .env)
- **Environment Classification:** Development (NODE_ENV=development in .env)
- **Connection String:** `postgresql://ai_user:ai_password@localhost:5432/ai_internship`
- **Fallback:** SQLite at `backend/db.sqlite3` if DATABASE_URL not set
- **Database Client:** PostgreSQL 18 (running locally via systemd)
- **Connection Status:** PostgreSQL is running and accepting connections on localhost:5432

### Authentication Status
- **CRITICAL LIMITATION:** Unable to authenticate to the database with the configured credentials
- Attempted authentication with `ai_user`/`ai_password` failed with "password authentication failed"
- Cannot use `sudo -u postgres psql` (requires TTY, not available in non-interactive session)
- Docker not available (docker-compose configuration exists but Docker daemon not running)
- No SQLite database file found at expected locations

**Conclusion:** Database is running but **cannot be safely inspected** due to authentication limitations without interactive terminal access.

---

## 2. Actual Schema

### Model Definitions (from backend/src/models/index.js)

#### User Model (`accounts_user`)
- **id:** UUID (PRIMARY KEY, UUIDV4 default)
- **email:** STRING (UNIQUE, NOT NULL)
- **username:** STRING (UNIQUE, nullable)
- Other fields: password, first_name, last_name, role, etc.

#### StudentProfile Model (`student_profiles_studentprofile`)
- **id:** BIGINT (PRIMARY KEY, AUTO_INCREMENT)
- **user_id:** UUID (NOT NULL, references User.id)
- Other fields: phone, country, city, bio, education_level, etc.

#### TeamMember Model (`projects_teammember`)
- **id:** UUID (PRIMARY KEY, UUIDV4 default)
- **team_id:** UUID (NOT NULL, references ProjectTeam.id)
- **student_id:** **BIGINT (currently in committed code)** → **UUID (in uncommitted change)**
- **is_leader:** BOOLEAN (default: false)
- **assigned_role:** STRING (default: 'Full Stack Engineer')

#### StudentSkill Model (`student_profiles_studentskill`)
- **id:** BIGINT (PRIMARY KEY, AUTO_INCREMENT)
- **student_id:** BIGINT (NOT NULL, references StudentProfile.id)
- **skill_id:** BIGINT (NOT NULL, references Skill.id)
- **proficiency:** STRING (default: 'intermediate')

#### StudentInterest Model (`student_profiles_studentinterest`)
- **id:** BIGINT (PRIMARY KEY, AUTO_INCREMENT)
- **student_id:** BIGINT (NOT NULL, references StudentProfile.id)
- **interest_id:** BIGINT (NOT NULL, references CareerInterest.id)

### Association Configuration
```javascript
// Line 630 in models/index.js
TeamMember.belongsTo(User, { foreignKey: 'student_id', as: 'studentUser', constraints: false });
```

**Key Observation:** The Sequelize association defines TeamMember.student_id as belonging to User (UUID), but the actual model definition has it as BIGINT (in committed code). This is a **model-synchronization mismatch**.

### Foreign Key Constraints
- All associations use `constraints: false`
- This means no actual foreign key constraints are enforced in the database
- This is intentional to respect existing database schema (as noted in code comments)

---

## 3. Existing Record Counts

**NOT DETERMINED** - Cannot access database to query record counts.

The following counts could not be verified:
- Total User records
- Total StudentProfile records
- Total TeamMember records
- Total StudentSkill records
- Total StudentInterest records

---

## 4. TeamMember Relationship Evidence

**NOT DETERMINED** - Cannot access database to inspect existing TeamMember records.

The following could not be verified:
- Whether TeamMember table exists
- Whether TeamMember has any records
- Whether existing student_id values reference User.id (UUID) or StudentProfile.id (BIGINT)
- Whether there are orphaned records
- Whether data migration would be required

---

## 5. Migration Feasibility

### Current Code State
- **Committed Code:** TeamMember.student_id = BIGINT
- **Uncommitted Change:** TeamMember.student_id = UUID
- **Association:** TeamMember.belongsTo(User) via student_id
- **Constraints:** All foreign key constraints disabled (`constraints: false`)

### Scenarios (Hypothetical - Cannot Verify Without Database Access)

#### Scenario A: TeamMember has no records
- **Feasibility:** HIGH
- **Required Action:** Simple schema change from BIGINT to UUID
- **Migration Approach:** No data migration needed, only schema synchronization
- **Risk:** LOW

#### Scenario B: TeamMember has records with student_id referencing StudentProfile.id (BIGINT)
- **Feasibility:** MEDIUM
- **Required Action:** Data mapping migration required
- **Migration Approach:**
  1. For each TeamMember, find the StudentProfile where id = TeamMember.student_id
  2. Map to User.id via StudentProfile.user_id
  3. Update TeamMember.student_id to the User UUID
  4. Change column type from BIGINT to UUID
- **Complexity:** Requires careful data mapping and validation
- **Risk:** MEDIUM (orphaned records possible)

#### Scenario C: Some records cannot be mapped
- **Feasibility:** LOW
- **Required Action:** Manual cleanup or orphaned record handling
- **Migration Approach:**
  1. Identify orphaned TeamMember records
  2. Decide whether to delete or flag them
  3. Notify stakeholders of data loss
- **Risk:** HIGH (potential data loss)

### Migration Tooling
- **Sequelize sync():** Used in server.js (line 293) without options
- **Implication:** `sequelize.sync()` creates tables if they don't exist but does NOT alter existing table structures
- **Database Reset Script:** `backend/scripts/reset_and_register_actors.js` exists and truncates all tables including `projects_teammember`
- **No Migration Framework:** No dedicated migration system (no migrations directory, no Umzug or similar)

---

## 6. Schema Synchronization Findings

### Exact Synchronization Call
```javascript
// backend/server.js, line 293
await sequelize.sync();
```

### Implications
- **No `{ alter: true }` option:** Existing tables will NOT be modified
- **No `{ force: true }` option:** Tables will NOT be dropped and recreated
- **Behavior:** Creates missing tables only; leaves existing tables unchanged
- **Consequence:** Changing TeamMember.student_id from BIGINT to UUID in the model will **NOT** automatically update the database schema

### Why This Matters
The uncommitted change to TeamMember.student_id (BIGINT → UUID) will:
1. Have **no effect** on the actual database schema when the server starts
2. Cause **runtime errors** if the application attempts to insert UUID values into a BIGINT column
3. Create a **model-database mismatch** that could lead to data inconsistency

---

## 7. Risks and Unknowns

### Verified Facts
1. ✅ PostgreSQL is running locally on port 5432
2. ✅ DATABASE_URL is configured for PostgreSQL
3. ✅ User.id is UUID (from model definition)
4. ✅ StudentProfile.id is BIGINT (from model definition)
5. ✅ StudentProfile.user_id is UUID (from model definition)
6. ✅ TeamMember.student_id is BIGINT in committed code, UUID in uncommitted change
7. ✅ All associations use `constraints: false`
8. ✅ Sequelize sync() is called without alter/force options
9. ✅ Database reset script exists and truncates projects_teammember table

### Assumptions (Not Verified)
- ❓ TeamMember table exists in the database
- ❓ TeamMember has any records
- ❓ If TeamMember has records, what student_id values contain
- ❓ Whether existing data would be compatible with UUID change
- ❓ Whether any orphaned records exist

### Critical Unknowns
1. **Database Credentials:** Cannot authenticate with configured credentials
2. **Actual Schema:** Cannot verify if database schema matches model definitions
3. **Existing Data:** Cannot determine if TeamMember has records that need migration
4. **Relationship Integrity:** Cannot verify if student_id values are valid references

---

## 8. Final Decision

### **DATABASE COULD NOT BE SAFELY INSPECTED**

### Evidence Supporting Decision

1. **Authentication Barrier:**
   - PostgreSQL credentials in .env (`ai_user`/`ai_password`) do not authenticate successfully
   - Cannot use `sudo -u postgres psql` without interactive TTY
   - No alternative authentication method available in non-interactive session

2. **No Docker Access:**
   - Docker daemon not running
   - Cannot use docker-compose to access database container
   - Cannot inspect Docker networks or containers

3. **No SQLite Database:**
   - No SQLite database file found at expected locations
   - Cannot use SQLite as fallback for inspection

4. **Critical Information Missing:**
   - Cannot verify if TeamMember table exists
   - Cannot count TeamMember records
   - Cannot inspect student_id data types and values
   - Cannot verify foreign key relationships
   - Cannot determine if migration is needed

### Recommended Next Steps

**Option 1: Manual Database Inspection (Recommended)**
- Developer with interactive terminal access should:
  1. Verify database credentials or use `sudo -u postgres psql`
  2. Connect to the database manually
  3. Run the inspection queries from this report
  4. Provide the results for further analysis

**Option 2: Database Reset (If Development Environment)**
- If this is a development environment and data loss is acceptable:
  1. Run `node backend/scripts/reset_and_register_actors.js`
  2. This will truncate all tables including TeamMember
  3. Apply the UUID change to TeamMember.student_id
  4. The change will be safe since no data exists

**Option 3: Staged Migration Approach**
- If production data exists and cannot be lost:
  1. Create a database backup first
  2. Use a migration framework (e.g., Umzug) to handle the schema change
  3. Implement data mapping logic if TeamMember has records
  4. Test migration in a staging environment first

### Migration Path (Once Database is Accessible)

1. **If TeamMember has no records:**
   - Direct schema change: BIGINT → UUID
   - No data migration needed
   - Can proceed with current uncommitted change

2. **If TeamMember has records:**
   - Must implement data mapping migration
   - Map existing BIGINT student_id values to User UUIDs via StudentProfile.user_id
   - Handle orphaned records appropriately
   - Cannot use simple type casting (BIGINT → UUID is not compatible)

### Safety Note

**DO NOT** commit the current uncommitted change without:
1. Verifying the actual database schema
2. Confirming TeamMember record count
3. Implementing a proper migration if data exists
4. Testing the migration in a safe environment

The current model change (BIGINT → UUID) combined with `sequelize.sync()` (no alter option) will create a silent mismatch between the model and the database, leading to runtime errors and potential data corruption.

---

**Report End**
