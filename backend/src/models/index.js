import { DataTypes, Op } from 'sequelize';
import sequelize from '../config/database.js';

// -------------------------------------------------------------
// User Model (accounts_user)
// -------------------------------------------------------------
export const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  username: { type: DataTypes.STRING, unique: true, allowNull: true },
  password: { type: DataTypes.STRING, allowNull: false },
  first_name: { type: DataTypes.STRING, defaultValue: '' },
  last_name: { type: DataTypes.STRING, defaultValue: '' },
  role: { type: DataTypes.STRING, defaultValue: 'student' },
  phone_number: { type: DataTypes.STRING, defaultValue: '' },
  department: { type: DataTypes.STRING, defaultValue: '' },
  university_name: { type: DataTypes.STRING, defaultValue: '' },
  staff_id_number: { type: DataTypes.STRING, defaultValue: '' },
  is_approved: { type: DataTypes.BOOLEAN, defaultValue: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  is_email_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
  is_staff: { type: DataTypes.BOOLEAN, defaultValue: false },
  is_superuser: { type: DataTypes.BOOLEAN, defaultValue: false },
  profile_photo: { type: DataTypes.STRING, allowNull: true },
  last_login: { type: DataTypes.DATE, allowNull: true },
  date_joined: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  tableName: 'accounts_user',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

User.prototype.getFullName = function() {
  const parts = [this.first_name, this.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : (this.username || this.email);
};

// -------------------------------------------------------------
// StudentProfile Model (student_profiles_studentprofile)
// -------------------------------------------------------------
export const StudentProfile = sequelize.define('StudentProfile', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  phone: { type: DataTypes.STRING, defaultValue: '' },
  country: { type: DataTypes.STRING, defaultValue: 'Ethiopia' },
  city: { type: DataTypes.STRING, defaultValue: 'Addis Ababa' },
  date_of_birth: { type: DataTypes.DATEONLY, allowNull: true },
  bio: { type: DataTypes.TEXT, defaultValue: '' },
  education_level: { type: DataTypes.STRING, defaultValue: 'Undergraduate' },
  current_year: { type: DataTypes.STRING, defaultValue: '4' },
  field_of_study: { type: DataTypes.STRING, defaultValue: 'Software Engineering' },
  university: { type: DataTypes.STRING, defaultValue: 'Addis Ababa University' },
  student_id_number: { type: DataTypes.STRING, defaultValue: '' },
  gpa: { type: DataTypes.FLOAT, allowNull: true },
  experience: { type: DataTypes.TEXT, defaultValue: '' },
  internship_type: { type: DataTypes.STRING, defaultValue: 'any' },
  work_type: { type: DataTypes.STRING, defaultValue: 'either' },
  compensation_preference: { type: DataTypes.STRING, defaultValue: 'either' },
  minimum_compensation: { type: DataTypes.FLOAT, allowNull: true },
  maximum_compensation: { type: DataTypes.FLOAT, allowNull: true },
  compensation_currency: { type: DataTypes.STRING, defaultValue: 'ETB' },
  preferred_locations: { 
    type: DataTypes.JSONB, 
    defaultValue: [],
    get() {
      const val = this.getDataValue('preferred_locations');
      if (!val) return [];
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch { return []; }
      }
      return val;
    }
  },
  willing_to_relocate: { type: DataTypes.BOOLEAN, defaultValue: false },
  preferred_industries: { 
    type: DataTypes.JSONB, 
    defaultValue: [],
    get() {
      const val = this.getDataValue('preferred_industries');
      if (!val) return [];
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch { return []; }
      }
      return val;
    }
  },
  preferred_roles: { 
    type: DataTypes.JSONB, 
    defaultValue: [],
    get() {
      const val = this.getDataValue('preferred_roles');
      if (!val) return [];
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch { return []; }
      }
      return val;
    }
  },
  internship_duration_min_weeks: { type: DataTypes.INTEGER, allowNull: true },
  internship_duration_max_weeks: { type: DataTypes.INTEGER, allowNull: true },
  availability_start: { type: DataTypes.DATEONLY, allowNull: true },
  availability_end: { type: DataTypes.DATEONLY, allowNull: true },
  availability_immediately: { type: DataTypes.BOOLEAN, defaultValue: false },
  cv: { type: DataTypes.STRING, allowNull: true },
  resume: { type: DataTypes.STRING, allowNull: true },
  resume_parsed: { type: DataTypes.BOOLEAN, defaultValue: false },
  resume_parsed_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'student_profiles_studentprofile',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

// -------------------------------------------------------------
// Skill Model (internships_skill)
// -------------------------------------------------------------
export const Skill = sequelize.define('Skill', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  category: { type: DataTypes.STRING, defaultValue: 'General' },
  description: { type: DataTypes.TEXT, defaultValue: '' },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
}, {
  tableName: 'internships_skill',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

// -------------------------------------------------------------
// StudentSkill Join Model (student_profiles_studentskill)
// -------------------------------------------------------------
export const StudentSkill = sequelize.define('StudentSkill', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  student_id: { type: DataTypes.BIGINT, allowNull: false },
  skill_id: { type: DataTypes.BIGINT, allowNull: false },
  proficiency: { type: DataTypes.STRING, defaultValue: 'intermediate' },
  source: { type: DataTypes.STRING, defaultValue: 'profile' },
}, {
  tableName: 'student_profiles_studentskill',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

// -------------------------------------------------------------
// CareerInterest Model (student_profiles_careerinterest)
// -------------------------------------------------------------
export const CareerInterest = sequelize.define('CareerInterest', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  description: { type: DataTypes.TEXT, defaultValue: '' },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
}, {
  tableName: 'student_profiles_careerinterest',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

// -------------------------------------------------------------
// StudentInterest Join Model (student_profiles_studentinterest)
// -------------------------------------------------------------
export const StudentInterest = sequelize.define('StudentInterest', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  student_id: { type: DataTypes.BIGINT, allowNull: false },
  interest_id: { type: DataTypes.BIGINT, allowNull: false },
}, {
  tableName: 'student_profiles_studentinterest',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

// -------------------------------------------------------------
// CV Model (student_profiles_cv)
// -------------------------------------------------------------
export const CV = sequelize.define('CV', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  student_id: { type: DataTypes.UUID, allowNull: false },
  file: { type: DataTypes.STRING, allowNull: false },
  processing_status: { type: DataTypes.STRING, defaultValue: 'PENDING' },
  processing_error: { type: DataTypes.TEXT, defaultValue: '' },
  extracted_text: { type: DataTypes.TEXT, defaultValue: '' },
  extracted_skills: { type: DataTypes.JSONB, defaultValue: [] },
  extracted_education: { type: DataTypes.JSONB, defaultValue: [] },
  extracted_experience: { type: DataTypes.JSONB, defaultValue: [] },
  extracted_projects: { type: DataTypes.JSONB, defaultValue: [] },
  extracted_certifications: { type: DataTypes.JSONB, defaultValue: [] },
  extracted_languages: { type: DataTypes.JSONB, defaultValue: [] },
  extracted_experience_years: { type: DataTypes.FLOAT, defaultValue: 0 },
  processed_at: { type: DataTypes.DATE, allowNull: true },
  uploaded_at: {
    type: DataTypes.VIRTUAL,
    get() { return this.created_at; }
  },
  extracted_data: {
    type: DataTypes.VIRTUAL,
    get() {
      return {
        extracted_skills: this.extracted_skills || [],
        extracted_education: this.extracted_education || [],
        extracted_experience: this.extracted_experience || [],
        extracted_projects: this.extracted_projects || [],
        extracted_certifications: this.extracted_certifications || [],
        extracted_languages: this.extracted_languages || [],
        extracted_experience_years: this.extracted_experience_years || 0,
      };
    }
  },
}, {
  tableName: 'student_profiles_cv',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

// -------------------------------------------------------------
// Internship Model (internships_internship)
// -------------------------------------------------------------
export const Internship = sequelize.define('Internship', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  title: { type: DataTypes.STRING, allowNull: false },
  organization_name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  category: { type: DataTypes.STRING, defaultValue: 'Software Engineering' },
  country: { type: DataTypes.STRING, defaultValue: 'Ethiopia' },
  city: { type: DataTypes.STRING, defaultValue: 'Addis Ababa' },
  location_text: { type: DataTypes.STRING, defaultValue: '' },
  internship_type: { type: DataTypes.STRING, defaultValue: 'onsite' },
  work_type: { type: DataTypes.STRING, defaultValue: 'full_time' },
  work_mode: { type: DataTypes.STRING, defaultValue: 'onsite' },
  compensation_type: { type: DataTypes.STRING, defaultValue: 'paid' },
  minimum_compensation: { type: DataTypes.FLOAT, allowNull: true },
  maximum_compensation: { type: DataTypes.FLOAT, allowNull: true },
  compensation_currency: { type: DataTypes.STRING, defaultValue: 'ETB' },
  compensation_period: { type: DataTypes.STRING, defaultValue: 'monthly' },
  preferred_skills: { type: DataTypes.JSONB, defaultValue: [] },
  duration_min_weeks: { type: DataTypes.INTEGER, defaultValue: 8 },
  duration_max_weeks: { type: DataTypes.INTEGER, defaultValue: 16 },
  application_url: { type: DataTypes.STRING, defaultValue: '' },
  source_id: { type: DataTypes.BIGINT, allowNull: true },
  source_url: { type: DataTypes.STRING, defaultValue: '' },
  external_id: { type: DataTypes.STRING, defaultValue: '' },
  posted_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  application_deadline: { type: DataTypes.DATE, allowNull: true },
  is_verified: { type: DataTypes.BOOLEAN, defaultValue: true },
  is_published: { type: DataTypes.BOOLEAN, defaultValue: true },
  needs_review: { type: DataTypes.BOOLEAN, defaultValue: false },
  status: { type: DataTypes.STRING, defaultValue: 'active' },
  rejection_reason: { type: DataTypes.TEXT, defaultValue: '' },
  embedding_status: { type: DataTypes.STRING, defaultValue: 'ready' },
  content_hash: { type: DataTypes.STRING, defaultValue: '' },
  required_education: { type: DataTypes.STRING, defaultValue: 'Bachelor' },
  required_experience: { type: DataTypes.STRING, defaultValue: '0-1 years' },
  skills_review: { type: DataTypes.JSONB, defaultValue: {} },
  url_validation: { type: DataTypes.JSONB, defaultValue: {} },
  is_expired: {
    type: DataTypes.VIRTUAL,
    get() {
      if (this.application_deadline) {
        return new Date(this.application_deadline) <= new Date();
      }
      return false;
    }
  },
  required_skills: {
    type: DataTypes.VIRTUAL,
    get() {
      if (this.skills && Array.isArray(this.skills)) {
        return this.skills.map(s => s.name);
      }
      const p = this.preferred_skills;
      if (Array.isArray(p)) return p;
      if (typeof p === 'string') {
        try { return JSON.parse(p); } catch { return []; }
      }
      return [];
    }
  }
}, {
  tableName: 'internships_internship',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

// -------------------------------------------------------------
// InternshipSkillJoin (internships_internship_required_skills)
// -------------------------------------------------------------
export const InternshipSkillJoin = sequelize.define('InternshipSkillJoin', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  internship_id: { type: DataTypes.BIGINT, allowNull: false },
  skill_id: { type: DataTypes.BIGINT, allowNull: false },
}, {
  tableName: 'internships_internship_required_skills',
  timestamps: false,
});

// -------------------------------------------------------------
// SavedInternship Model (internships_savedinternship)
// -------------------------------------------------------------
export const SavedInternship = sequelize.define('SavedInternship', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  student_id: { type: DataTypes.UUID, allowNull: false },
  internship_id: { type: DataTypes.BIGINT, allowNull: false },
}, {
  tableName: 'internships_savedinternship',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

// -------------------------------------------------------------
// InternshipApplication Model (internships_internshipapplication)
// -------------------------------------------------------------
export const InternshipApplication = sequelize.define('InternshipApplication', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  student_id: { type: DataTypes.UUID, allowNull: false },
  internship_id: { type: DataTypes.BIGINT, allowNull: false },
  status: { type: DataTypes.STRING, defaultValue: 'applied' },
  notes: { type: DataTypes.TEXT, defaultValue: '' },
}, {
  tableName: 'internships_internshipapplication',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

// -------------------------------------------------------------
// Recommendation Model (recommendations_recommendation)
// -------------------------------------------------------------
export const Recommendation = sequelize.define('Recommendation', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  student_id: { type: DataTypes.UUID, allowNull: false },
  internship_id: { type: DataTypes.BIGINT, allowNull: false },
  overall_score: { type: DataTypes.FLOAT, defaultValue: 0 },
  semantic_score: { type: DataTypes.FLOAT, defaultValue: 0 },
  skill_score: { type: DataTypes.FLOAT, defaultValue: 0 },
  preference_score: { type: DataTypes.FLOAT, defaultValue: 0 },
  location_score: { type: DataTypes.FLOAT, defaultValue: 0 },
  salary_score: { type: DataTypes.FLOAT, defaultValue: 0 },
  explanation: { type: DataTypes.JSONB, defaultValue: [] },
  status: { type: DataTypes.STRING, defaultValue: 'active' },
  viewed_at: { type: DataTypes.DATE, allowNull: true },
  saved_at: { type: DataTypes.DATE, allowNull: true },
  applied_at: { type: DataTypes.DATE, allowNull: true },
  ignored_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'recommendations_recommendation',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

// -------------------------------------------------------------
// ProjectTeam Model (projects_projectteam)
// -------------------------------------------------------------
export const ProjectTeam = sequelize.define('ProjectTeam', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  team_name: { type: DataTypes.STRING, allowNull: false },
  project_title: { type: DataTypes.STRING, allowNull: false },
  cohort_id: { type: DataTypes.UUID, allowNull: true },
  assigned_advisor_id: { type: DataTypes.UUID, allowNull: true },
  srs_status: { type: DataTypes.STRING, defaultValue: 'DRAFT' },
  srs_document: { type: DataTypes.STRING, allowNull: true },
  srs_feedback: { type: DataTypes.TEXT, defaultValue: '' },
  srs_revision_deadline: { type: DataTypes.DATE, allowNull: true },
  channels_active: { type: DataTypes.BOOLEAN, defaultValue: true },
}, {
  tableName: 'projects_projectteam',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

// -------------------------------------------------------------
// TeamMember Model (projects_teammember)
// -------------------------------------------------------------
export const TeamMember = sequelize.define('TeamMember', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  team_id: { type: DataTypes.UUID, allowNull: false },
  student_id: { type: DataTypes.BIGINT, allowNull: false },
  is_leader: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
  assigned_role: { type: DataTypes.STRING, defaultValue: 'Full Stack Engineer' },
  primary_stack: {
    type: DataTypes.VIRTUAL,
    get() { return 'React / Node.js'; }
  },
}, {
  tableName: 'projects_teammember',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

// -------------------------------------------------------------
// WeeklyLogbook Model (projects_weeklylogbook)
// -------------------------------------------------------------
export const WeeklyLogbook = sequelize.define('WeeklyLogbook', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  project_team_id: { type: DataTypes.UUID, allowNull: true },
  team_id: {
    type: DataTypes.VIRTUAL,
    get() { return this.project_team_id || this.getDataValue('project_team_id'); },
    set(val) { this.setDataValue('project_team_id', val); }
  },
  student_id: { type: DataTypes.UUID, allowNull: false },
  academic_advisor_id: { type: DataTypes.UUID, allowNull: true },
  company_mentor_id: { type: DataTypes.UUID, allowNull: true },
  week_number: { type: DataTypes.INTEGER, allowNull: false },
  tasks_planned: { type: DataTypes.TEXT, defaultValue: '' },
  tasks_executed: { type: DataTypes.TEXT, defaultValue: '' },
  challenges_faced: { type: DataTypes.TEXT, defaultValue: '' },
  git_commit_urls: { type: DataTypes.JSONB, defaultValue: [] },
  similarity_score: { type: DataTypes.FLOAT, defaultValue: 0.0 },
  is_flagged: { type: DataTypes.BOOLEAN, defaultValue: false },
  matched_snippet: { type: DataTypes.TEXT, defaultValue: '' },
  advisor_approved: { type: DataTypes.BOOLEAN, defaultValue: false },
  advisor_feedback: { type: DataTypes.TEXT, defaultValue: '' },
  submitted_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  content: {
    type: DataTypes.VIRTUAL,
    get() { return this.tasks_executed || this.getDataValue('tasks_executed') || ''; },
    set(val) { this.setDataValue('tasks_executed', val); }
  },
  tasks_completed: {
    type: DataTypes.VIRTUAL,
    get() { return this.tasks_executed || this.getDataValue('tasks_executed') || ''; },
    set(val) { this.setDataValue('tasks_executed', val); }
  },
  blockers: {
    type: DataTypes.VIRTUAL,
    get() { return this.challenges_faced || this.getDataValue('challenges_faced') || ''; },
    set(val) { this.setDataValue('challenges_faced', val); }
  },
  status: {
    type: DataTypes.VIRTUAL,
    get() { return this.advisor_approved ? 'APPROVED' : 'SUBMITTED'; },
    set(val) {
      if (val === 'APPROVED') this.setDataValue('advisor_approved', true);
    }
  },
}, {
  tableName: 'projects_weeklylogbook',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

// -------------------------------------------------------------
// ProjectTeamMessage Model (projects_projectteammessage)
// -------------------------------------------------------------
export const ProjectTeamMessage = sequelize.define('ProjectTeamMessage', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  team_id: { type: DataTypes.UUID, allowNull: false },
  sender_id: { type: DataTypes.UUID, allowNull: false },
  message_type: { type: DataTypes.STRING, defaultValue: 'GENERAL' },
  message: { type: DataTypes.TEXT, allowNull: false },
  content: {
    type: DataTypes.VIRTUAL,
    get() { return this.message; },
    set(val) { this.setDataValue('message', val); }
  }
}, {
  tableName: 'projects_projectteammessage',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

// -------------------------------------------------------------
// CampusLogistics Model (logistics_campuslogistics)
// -------------------------------------------------------------
export const CampusLogistics = sequelize.define('CampusLogistics', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  student_id: { type: DataTypes.UUID, allowNull: false },
  dean_approved: { type: DataTypes.BOOLEAN, defaultValue: false },
  dean_signature_hash: { type: DataTypes.STRING, defaultValue: '' },
  dean_signed_by_id: { type: DataTypes.UUID, allowNull: true },
  dean_signed_at: { type: DataTypes.DATE, allowNull: true },
  meal_card_number: { type: DataTypes.STRING, defaultValue: '' },
  meal_card_active: { type: DataTypes.BOOLEAN, defaultValue: false },
  meal_card_issued_at: { type: DataTypes.DATE, allowNull: true },
  meal_card_issued_by_id: { type: DataTypes.UUID, allowNull: true },
  student_union_signature_hash: { type: DataTypes.STRING, defaultValue: '' },
  student_union_qr_code: { type: DataTypes.TEXT, defaultValue: '' },
  dorm_block: { type: DataTypes.STRING, defaultValue: 'Block A' },
  dorm_room: { type: DataTypes.STRING, defaultValue: '101' },
  dorm_bed_number: { type: DataTypes.STRING, defaultValue: 'Bed 1' },
  dorm_status: { type: DataTypes.STRING, defaultValue: 'UNASSIGNED' },
  key_issued: { type: DataTypes.BOOLEAN, defaultValue: false },
  key_issued_at: { type: DataTypes.DATE, allowNull: true },
  key_issued_by_id: { type: DataTypes.UUID, allowNull: true },
  valid_from: { type: DataTypes.DATEONLY, allowNull: true },
  valid_until: { type: DataTypes.DATEONLY, allowNull: true },
  cleared_at_exit: { type: DataTypes.BOOLEAN, defaultValue: false },
}, {
  tableName: 'logistics_campuslogistics',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

// -------------------------------------------------------------
// Notification Model (notifications_notification)
// -------------------------------------------------------------
export const Notification = sequelize.define('Notification', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  recipient_id: { type: DataTypes.UUID, allowNull: false },
  actor_id: { type: DataTypes.UUID, allowNull: true },
  title: { type: DataTypes.STRING, allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: false },
  notification_type: { type: DataTypes.STRING, defaultValue: 'INFO' },
  link: { type: DataTypes.STRING, allowNull: true },
  is_read: { type: DataTypes.BOOLEAN, defaultValue: false },
  metadata: { type: DataTypes.JSONB, defaultValue: {} },
}, {
  tableName: 'notifications_notification',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

// -------------------------------------------------------------
// Company Model (companies_company)
// -------------------------------------------------------------
export const Company = sequelize.define('Company', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  website: { type: DataTypes.STRING, defaultValue: '' },
  industry: { type: DataTypes.STRING, defaultValue: 'Information Technology' },
  country: { type: DataTypes.STRING, defaultValue: 'Ethiopia' },
  description: { type: DataTypes.VIRTUAL, get() { return ''; } },
  city: { type: DataTypes.VIRTUAL, get() { return 'Addis Ababa'; } },
  is_verified: { type: DataTypes.VIRTUAL, get() { return true; } },
}, {
  tableName: 'companies_company',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

// -------------------------------------------------------------
// DataSource Model (data_sources_datasource)
// -------------------------------------------------------------
export const DataSource = sequelize.define('DataSource', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  base_url: { type: DataTypes.STRING, defaultValue: '' },
  type: { type: DataTypes.STRING, defaultValue: 'api' },
  description: { type: DataTypes.TEXT, defaultValue: '' },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  config: { type: DataTypes.JSONB, defaultValue: {} },
  last_synced_at: { type: DataTypes.DATE, allowNull: true },
  url: {
    type: DataTypes.VIRTUAL,
    get() { return this.base_url; },
    set(val) { this.setDataValue('base_url', val); }
  },
  adapter_type: {
    type: DataTypes.VIRTUAL,
    get() { return this.type; },
    set(val) { this.setDataValue('type', val); }
  },
  status: {
    type: DataTypes.VIRTUAL,
    get() { return this.is_active ? 'healthy' : 'inactive'; }
  },
  last_sync_at: {
    type: DataTypes.VIRTUAL,
    get() { return this.last_synced_at; },
    set(val) { this.setDataValue('last_synced_at', val); }
  }
}, {
  tableName: 'data_sources_datasource',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

// -------------------------------------------------------------
// StudentActivityLog Model (administration_studentactivitylog)
// -------------------------------------------------------------
export const StudentActivityLog = sequelize.define('StudentActivityLog', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  student_id: { type: DataTypes.UUID, allowNull: false },
  action: { type: DataTypes.STRING, allowNull: false },
  details: { type: DataTypes.JSONB, defaultValue: {} },
}, {
  tableName: 'administration_studentactivitylog',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

// -------------------------------------------------------------
// Associations (Constraints false to respect existing DB)
// -------------------------------------------------------------
User.hasOne(StudentProfile, { foreignKey: 'user_id', as: 'profile', constraints: false });
StudentProfile.belongsTo(User, { foreignKey: 'user_id', as: 'user', constraints: false });

User.hasMany(CV, { foreignKey: 'student_id', as: 'cvs', constraints: false });
CV.belongsTo(User, { foreignKey: 'student_id', as: 'student', constraints: false });

StudentProfile.belongsToMany(Skill, { through: StudentSkill, foreignKey: 'student_id', otherKey: 'skill_id', as: 'skills', constraints: false });
Skill.belongsToMany(StudentProfile, { through: StudentSkill, foreignKey: 'skill_id', otherKey: 'student_id', as: 'students', constraints: false });

StudentProfile.belongsToMany(CareerInterest, { through: StudentInterest, foreignKey: 'student_id', otherKey: 'interest_id', as: 'interests', constraints: false });
CareerInterest.belongsToMany(StudentProfile, { through: StudentInterest, foreignKey: 'interest_id', otherKey: 'student_id', as: 'students', constraints: false });

Internship.belongsToMany(Skill, { through: InternshipSkillJoin, foreignKey: 'internship_id', otherKey: 'skill_id', as: 'skills', constraints: false });
Skill.belongsToMany(Internship, { through: InternshipSkillJoin, foreignKey: 'skill_id', otherKey: 'internship_id', as: 'internships', constraints: false });

SavedInternship.belongsTo(Internship, { foreignKey: 'internship_id', as: 'internship', constraints: false });
SavedInternship.belongsTo(User, { foreignKey: 'student_id', as: 'user', constraints: false });

InternshipApplication.belongsTo(Internship, { foreignKey: 'internship_id', as: 'internship', constraints: false });
InternshipApplication.belongsTo(User, { foreignKey: 'student_id', as: 'user', constraints: false });

Recommendation.belongsTo(Internship, { foreignKey: 'internship_id', as: 'internship', constraints: false });
Recommendation.belongsTo(User, { foreignKey: 'student_id', as: 'user', constraints: false });

ProjectTeam.hasMany(TeamMember, { foreignKey: 'team_id', as: 'members', constraints: false });
TeamMember.belongsTo(ProjectTeam, { foreignKey: 'team_id', as: 'team', constraints: false });
TeamMember.belongsTo(User, { foreignKey: 'student_id', as: 'studentUser', constraints: false });

ProjectTeam.belongsTo(User, { foreignKey: 'assigned_advisor_id', as: 'advisor', constraints: false });
ProjectTeam.hasMany(ProjectTeamMessage, { foreignKey: 'team_id', as: 'messages', constraints: false });
ProjectTeamMessage.belongsTo(User, { foreignKey: 'sender_id', as: 'sender', constraints: false });

ProjectTeam.hasMany(WeeklyLogbook, { foreignKey: 'project_team_id', as: 'logbooks', constraints: false });
WeeklyLogbook.belongsTo(ProjectTeam, { foreignKey: 'project_team_id', as: 'team', constraints: false });
WeeklyLogbook.belongsTo(User, { foreignKey: 'student_id', as: 'student', constraints: false });

CampusLogistics.belongsTo(User, { foreignKey: 'student_id', as: 'student', constraints: false });
Notification.belongsTo(User, { foreignKey: 'recipient_id', as: 'user', constraints: false });

export default {
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
  StudentActivityLog,
};
