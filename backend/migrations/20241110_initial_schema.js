/**
 * Initial Schema Migration (Explicit Schema Definitions)
 * Creates all tables with explicit schema definitions for reproducibility
 * 
 * This migration defines schema explicitly using queryInterface methods
 * rather than relying on sequelize.sync() to ensure reproducibility across
 * different code versions.
 * 
 * Schema matches verified model architecture from Tasks 1.10-1.14:
 * - User.id: UUID
 * - StudentProfile.id: BIGINT
 * - StudentProfile.user_id: UUID (unique)
 * - Monetary fields: DECIMAL(12, 2)
 * - CV.extracted_experience_years: DECIMAL(4, 1)
 * - StudentProfile.current_year: INTEGER
 */

import sequelize from '../src/config/database.js';

export const up = async () => {
  console.log('[Migration] Creating initial schema with explicit definitions...');
  
  const queryInterface = sequelize.getQueryInterface();
  
  // 1. Independent tables (no foreign keys)
  
  // Users table - authentication identity
  await queryInterface.createTable('users', {
    id: {
      type: sequelize.Sequelize.UUID,
      defaultValue: sequelize.Sequelize.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    email: {
      type: sequelize.Sequelize.STRING(255),
      allowNull: false,
      unique: true
    },
    username: {
      type: sequelize.Sequelize.STRING(100),
      allowNull: false,
      unique: true
    },
    password: {
      type: sequelize.Sequelize.TEXT,
      allowNull: false
    },
    first_name: {
      type: sequelize.Sequelize.STRING(100),
      allowNull: true
    },
    last_name: {
      type: sequelize.Sequelize.STRING(100),
      allowNull: true
    },
    role: {
      type: sequelize.Sequelize.ENUM('student', 'employer', 'admin', 'supervisor'),
      defaultValue: 'student',
      allowNull: false
    },
    is_staff: {
      type: sequelize.Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    is_superuser: {
      type: sequelize.Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    is_active: {
      type: sequelize.Sequelize.BOOLEAN,
      defaultValue: true,
      allowNull: false
    },
    is_email_verified: {
      type: sequelize.Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    is_approved: {
      type: sequelize.Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    profile_picture: {
      type: sequelize.Sequelize.STRING(500),
      allowNull: true
    },
    phone_number: {
      type: sequelize.Sequelize.STRING(20),
      allowNull: true
    },
    last_login: {
      type: sequelize.Sequelize.DATE,
      allowNull: true
    },
    created_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    },
    updated_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    }
  });
  
  // Skills table
  await queryInterface.createTable('skills', {
    id: {
      type: sequelize.Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    name: {
      type: sequelize.Sequelize.STRING(100),
      allowNull: false,
      unique: true
    },
    category: {
      type: sequelize.Sequelize.STRING(50),
      allowNull: true
    },
    created_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    },
    updated_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    }
  });
  
  // Career interests table
  await queryInterface.createTable('career_interests', {
    id: {
      type: sequelize.Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    name: {
      type: sequelize.Sequelize.STRING(100),
      allowNull: false,
      unique: true
    },
    description: {
      type: sequelize.Sequelize.TEXT,
      allowNull: true
    },
    created_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    },
    updated_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    }
  });
  
  // Companies table
  await queryInterface.createTable('companies', {
    id: {
      type: sequelize.Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    name: {
      type: sequelize.Sequelize.STRING(255),
      allowNull: false
    },
    website: {
      type: sequelize.Sequelize.STRING(500),
      allowNull: true
    },
    industry: {
      type: sequelize.Sequelize.STRING(100),
      allowNull: true
    },
    description: {
      type: sequelize.Sequelize.TEXT,
      allowNull: true
    },
    logo_url: {
      type: sequelize.Sequelize.STRING(500),
      allowNull: true
    },
    created_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    },
    updated_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    }
  });
  
  // Data sources table
  await queryInterface.createTable('data_sources', {
    id: {
      type: sequelize.Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    name: {
      type: sequelize.Sequelize.STRING(255),
      allowNull: false,
      unique: true
    },
    base_url: {
      type: sequelize.Sequelize.STRING(500),
      allowNull: true
    },
    type: {
      type: sequelize.Sequelize.ENUM('api', 'scrape', 'manual'),
      allowNull: true
    },
    description: {
      type: sequelize.Sequelize.TEXT,
      allowNull: true
    },
    is_active: {
      type: sequelize.Sequelize.BOOLEAN,
      defaultValue: true,
      allowNull: false
    },
    config: {
      type: sequelize.Sequelize.JSONB,
      allowNull: true,
      defaultValue: {}
    },
    created_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    },
    updated_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    }
  });
  
  // 2. Dependent tables
  
  // Student profiles table - academic profile identity
  await queryInterface.createTable('student_profiles', {
    id: {
      type: sequelize.Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    user_id: {
      type: sequelize.Sequelize.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    university: {
      type: sequelize.Sequelize.STRING(255),
      allowNull: true
    },
    department: {
      type: sequelize.Sequelize.STRING(255),
      allowNull: true
    },
    current_year: {
      type: sequelize.Sequelize.INTEGER,
      defaultValue: 4,
      allowNull: false
    },
    gpa: {
      type: sequelize.Sequelize.FLOAT,
      allowNull: true
    },
    minimum_compensation: {
      type: sequelize.Sequelize.DECIMAL(12, 2),
      allowNull: true
    },
    maximum_compensation: {
      type: sequelize.Sequelize.DECIMAL(12, 2),
      allowNull: true
    },
    preferred_location: {
      type: sequelize.Sequelize.STRING(255),
      allowNull: true
    },
    bio: {
      type: sequelize.Sequelize.TEXT,
      allowNull: true
    },
    linkedin_url: {
      type: sequelize.Sequelize.STRING(500),
      allowNull: true
    },
    github_url: {
      type: sequelize.Sequelize.STRING(500),
      allowNull: true
    },
    portfolio_url: {
      type: sequelize.Sequelize.STRING(500),
      allowNull: true
    },
    created_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    },
    updated_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    }
  });
  
  // CVs table
  await queryInterface.createTable('cvs', {
    id: {
      type: sequelize.Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    user_id: {
      type: sequelize.Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    file_path: {
      type: sequelize.Sequelize.STRING(500),
      allowNull: true
    },
    file_name: {
      type: sequelize.Sequelize.STRING(255),
      allowNull: true
    },
    file_size: {
      type: sequelize.Sequelize.INTEGER,
      allowNull: true
    },
    extracted_text: {
      type: sequelize.Sequelize.TEXT,
      allowNull: true
    },
    extracted_experience_years: {
      type: sequelize.Sequelize.DECIMAL(4, 1),
      defaultValue: 0,
      allowNull: false
    },
    extracted_skills: {
      type: sequelize.Sequelize.JSONB,
      allowNull: true,
      defaultValue: []
    },
    parsed_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: true
    },
    created_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    },
    updated_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    }
  });
  
  // Internships table
  await queryInterface.createTable('internships', {
    id: {
      type: sequelize.Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    title: {
      type: sequelize.Sequelize.STRING(255),
      allowNull: false
    },
    organization_name: {
      type: sequelize.Sequelize.STRING(255),
      allowNull: true
    },
    company_id: {
      type: sequelize.Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'companies',
        key: 'id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    },
    description: {
      type: sequelize.Sequelize.TEXT,
      allowNull: true
    },
    category: {
      type: sequelize.Sequelize.STRING(100),
      allowNull: true
    },
    country: {
      type: sequelize.Sequelize.STRING(100),
      allowNull: true
    },
    city: {
      type: sequelize.Sequelize.STRING(100),
      allowNull: true
    },
    internship_type: {
      type: sequelize.Sequelize.ENUM('onsite', 'remote', 'hybrid'),
      allowNull: true
    },
    work_type: {
      type: sequelize.Sequelize.ENUM('full_time', 'part_time'),
      allowNull: true
    },
    compensation_type: {
      type: sequelize.Sequelize.ENUM('paid', 'unpaid', 'stipend'),
      allowNull: true
    },
    minimum_compensation: {
      type: sequelize.Sequelize.DECIMAL(12, 2),
      allowNull: true
    },
    maximum_compensation: {
      type: sequelize.Sequelize.DECIMAL(12, 2),
      allowNull: true
    },
    compensation_currency: {
      type: sequelize.Sequelize.STRING(10),
      allowNull: true
    },
    preferred_skills: {
      type: sequelize.Sequelize.JSONB,
      allowNull: true,
      defaultValue: []
    },
    required_skills: {
      type: sequelize.Sequelize.JSONB,
      allowNull: true,
      defaultValue: []
    },
    duration_min_weeks: {
      type: sequelize.Sequelize.INTEGER,
      allowNull: true
    },
    duration_max_weeks: {
      type: sequelize.Sequelize.INTEGER,
      allowNull: true
    },
    application_deadline: {
      type: sequelize.Sequelize.DATE,
      allowNull: true
    },
    is_verified: {
      type: sequelize.Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    status: {
      type: sequelize.Sequelize.ENUM('active', 'closed', 'draft'),
      defaultValue: 'active',
      allowNull: false
    },
    external_url: {
      type: sequelize.Sequelize.STRING(500),
      allowNull: true
    },
    created_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    },
    updated_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    }
  });
  
  // Project teams table
  await queryInterface.createTable('project_teams', {
    id: {
      type: sequelize.Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    name: {
      type: sequelize.Sequelize.STRING(255),
      allowNull: false
    },
    description: {
      type: sequelize.Sequelize.TEXT,
      allowNull: true
    },
    advisor_id: {
      type: sequelize.Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    },
    cohort_id: {
      type: sequelize.Sequelize.UUID,
      allowNull: true
    },
    start_date: {
      type: sequelize.Sequelize.DATE,
      allowNull: true
    },
    end_date: {
      type: sequelize.Sequelize.DATE,
      allowNull: true
    },
    status: {
      type: sequelize.Sequelize.ENUM('active', 'completed', 'archived'),
      defaultValue: 'active',
      allowNull: false
    },
    created_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    },
    updated_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    }
  });
  
  // 3. Junction tables (many-to-many relationships)
  
  // Student-skill junction table
  await queryInterface.createTable('student_skills', {
    id: {
      type: sequelize.Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    student_id: {
      type: sequelize.Sequelize.BIGINT,
      allowNull: false,
      references: {
        model: 'student_profiles',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    skill_id: {
      type: sequelize.Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'skills',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    proficiency_level: {
      type: sequelize.Sequelize.ENUM('beginner', 'intermediate', 'advanced', 'expert'),
      defaultValue: 'intermediate',
      allowNull: false
    },
    created_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    }
  });
  
  // Add composite unique constraint
  await queryInterface.addConstraint('student_skills', {
    type: 'unique',
    fields: ['student_id', 'skill_id'],
    name: 'student_skills_student_id_skill_id_unique'
  });
  
  // Student-interest junction table
  await queryInterface.createTable('student_interests', {
    id: {
      type: sequelize.Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    student_id: {
      type: sequelize.Sequelize.BIGINT,
      allowNull: false,
      references: {
        model: 'student_profiles',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    interest_id: {
      type: sequelize.Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'career_interests',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    created_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    }
  });
  
  // Add composite unique constraint
  await queryInterface.addConstraint('student_interests', {
    type: 'unique',
    fields: ['student_id', 'interest_id'],
    name: 'student_interests_student_id_interest_id_unique'
  });
  
  // Internship-skill junction table
  await queryInterface.createTable('internship_skill_joins', {
    id: {
      type: sequelize.Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    internship_id: {
      type: sequelize.Sequelize.BIGINT,
      allowNull: false,
      references: {
        model: 'internships',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    skill_id: {
      type: sequelize.Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'skills',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    created_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    }
  });
  
  // Add composite unique constraint
  await queryInterface.addConstraint('internship_skill_joins', {
    type: 'unique',
    fields: ['internship_id', 'skill_id'],
    name: 'internship_skill_joins_internship_id_skill_id_unique'
  });
  
  // 4. Complex dependent tables
  
  // Saved internships table
  await queryInterface.createTable('saved_internships', {
    id: {
      type: sequelize.Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    user_id: {
      type: sequelize.Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    internship_id: {
      type: sequelize.Sequelize.BIGINT,
      allowNull: false,
      references: {
        model: 'internships',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    notes: {
      type: sequelize.Sequelize.TEXT,
      allowNull: true
    },
    created_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    }
  });
  
  // Add composite unique constraint
  await queryInterface.addConstraint('saved_internships', {
    type: 'unique',
    fields: ['user_id', 'internship_id'],
    name: 'saved_internships_user_id_internship_id_unique'
  });
  
  // Internship applications table
  await queryInterface.createTable('internship_applications', {
    id: {
      type: sequelize.Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    user_id: {
      type: sequelize.Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    internship_id: {
      type: sequelize.Sequelize.BIGINT,
      allowNull: false,
      references: {
        model: 'internships',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    cover_letter: {
      type: sequelize.Sequelize.TEXT,
      allowNull: true
    },
    status: {
      type: sequelize.Sequelize.ENUM('pending', 'reviewed', 'accepted', 'rejected', 'withdrawn'),
      defaultValue: 'pending',
      allowNull: false
    },
    applied_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    },
    reviewed_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: true
    },
    created_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    },
    updated_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    }
  });
  
  // Add composite unique constraint
  await queryInterface.addConstraint('internship_applications', {
    type: 'unique',
    fields: ['user_id', 'internship_id'],
    name: 'internship_applications_user_id_internship_id_unique'
  });
  
  // Recommendations table
  await queryInterface.createTable('recommendations', {
    id: {
      type: sequelize.Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    user_id: {
      type: sequelize.Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    internship_id: {
      type: sequelize.Sequelize.BIGINT,
      allowNull: false,
      references: {
        model: 'internships',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    overall_score: {
      type: sequelize.Sequelize.FLOAT,
      allowNull: true
    },
    semantic_score: {
      type: sequelize.Sequelize.FLOAT,
      allowNull: true
    },
    skill_score: {
      type: sequelize.Sequelize.FLOAT,
      allowNull: true
    },
    preference_score: {
      type: sequelize.Sequelize.FLOAT,
      allowNull: true
    },
    location_score: {
      type: sequelize.Sequelize.FLOAT,
      allowNull: true
    },
    salary_score: {
      type: sequelize.Sequelize.FLOAT,
      allowNull: true
    },
    explanation: {
      type: sequelize.Sequelize.TEXT,
      allowNull: true
    },
    created_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    }
  });
  
  // Team members table
  await queryInterface.createTable('team_members', {
    id: {
      type: sequelize.Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    project_team_id: {
      type: sequelize.Sequelize.BIGINT,
      allowNull: false,
      references: {
        model: 'project_teams',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    student_id: {
      type: sequelize.Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    role: {
      type: sequelize.Sequelize.ENUM('member', 'lead'),
      defaultValue: 'member',
      allowNull: false
    },
    joined_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    },
    created_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    }
  });
  
  // Weekly logbooks table
  await queryInterface.createTable('weekly_logbooks', {
    id: {
      type: sequelize.Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    project_team_id: {
      type: sequelize.Sequelize.BIGINT,
      allowNull: false,
      references: {
        model: 'project_teams',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    student_id: {
      type: sequelize.Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    week_number: {
      type: sequelize.Sequelize.INTEGER,
      allowNull: false
    },
    week_start_date: {
      type: sequelize.Sequelize.DATE,
      allowNull: false
    },
    activities: {
      type: sequelize.Sequelize.TEXT,
      allowNull: true
    },
    challenges: {
      type: sequelize.Sequelize.TEXT,
      allowNull: true
    },
    achievements: {
      type: sequelize.Sequelize.TEXT,
      allowNull: true
    },
    similarity_score: {
      type: sequelize.Sequelize.FLOAT,
      allowNull: true
    },
    status: {
      type: sequelize.Sequelize.ENUM('draft', 'submitted', 'reviewed', 'approved'),
      defaultValue: 'draft',
      allowNull: false
    },
    submitted_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: true
    },
    created_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    },
    updated_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    }
  });
  
  // Project team messages table
  await queryInterface.createTable('project_team_messages', {
    id: {
      type: sequelize.Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    project_team_id: {
      type: sequelize.Sequelize.BIGINT,
      allowNull: false,
      references: {
        model: 'project_teams',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    sender_id: {
      type: sequelize.Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    message: {
      type: sequelize.Sequelize.TEXT,
      allowNull: false
    },
    created_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    }
  });
  
  // Campus logistics table
  await queryInterface.createTable('campus_logistics', {
    id: {
      type: sequelize.Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    user_id: {
      type: sequelize.Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    type: {
      type: sequelize.Sequelize.ENUM('equipment', 'room', 'transport', 'other'),
      allowNull: false
    },
    title: {
      type: sequelize.Sequelize.STRING(255),
      allowNull: false
    },
    description: {
      type: sequelize.Sequelize.TEXT,
      allowNull: true
    },
    requested_date: {
      type: sequelize.Sequelize.DATE,
      allowNull: true
    },
    status: {
      type: sequelize.Sequelize.ENUM('pending', 'approved', 'rejected', 'completed'),
      defaultValue: 'pending',
      allowNull: false
    },
    created_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    },
    updated_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    }
  });
  
  // Notifications table
  await queryInterface.createTable('notifications', {
    id: {
      type: sequelize.Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    user_id: {
      type: sequelize.Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    type: {
      type: sequelize.Sequelize.ENUM('application', 'recommendation', 'system', 'message'),
      allowNull: false
    },
    title: {
      type: sequelize.Sequelize.STRING(255),
      allowNull: false
    },
    message: {
      type: sequelize.Sequelize.TEXT,
      allowNull: true
    },
    is_read: {
      type: sequelize.Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    action_url: {
      type: sequelize.Sequelize.STRING(500),
      allowNull: true
    },
    created_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    }
  });
  
  // Student activity logs table
  await queryInterface.createTable('student_activity_logs', {
    id: {
      type: sequelize.Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    user_id: {
      type: sequelize.Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    action: {
      type: sequelize.Sequelize.STRING(100),
      allowNull: false
    },
    description: {
      type: sequelize.Sequelize.TEXT,
      allowNull: true
    },
    metadata: {
      type: sequelize.Sequelize.JSONB,
      allowNull: true,
      defaultValue: {}
    },
    ip_address: {
      type: sequelize.Sequelize.STRING(45),
      allowNull: true
    },
    user_agent: {
      type: sequelize.Sequelize.STRING(500),
      allowNull: true
    },
    created_at: {
      type: sequelize.Sequelize.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.NOW
    }
  });
  
  console.log('[Migration] Initial schema created successfully with explicit definitions.');
};

export const down = async () => {
  console.log('[Migration] Rolling back initial schema...');
  
  const queryInterface = sequelize.getQueryInterface();
  
  // Drop tables in reverse order to satisfy foreign key dependencies
  await queryInterface.dropTable('student_activity_logs');
  await queryInterface.dropTable('notifications');
  await queryInterface.dropTable('campus_logistics');
  await queryInterface.dropTable('project_team_messages');
  await queryInterface.dropTable('weekly_logbooks');
  await queryInterface.dropTable('team_members');
  await queryInterface.dropTable('recommendations');
  await queryInterface.dropTable('internship_applications');
  await queryInterface.dropTable('saved_internships');
  await queryInterface.dropTable('internship_skill_joins');
  await queryInterface.dropTable('student_interests');
  await queryInterface.dropTable('student_skills');
  await queryInterface.dropTable('cvs');
  await queryInterface.dropTable('student_profiles');
  await queryInterface.dropTable('project_teams');
  await queryInterface.dropTable('internships');
  await queryInterface.dropTable('data_sources');
  await queryInterface.dropTable('companies');
  await queryInterface.dropTable('career_interests');
  await queryInterface.dropTable('skills');
  await queryInterface.dropTable('users');
  
  console.log('[Migration] Initial schema rolled back successfully.');
};

export const description = 'Create initial database schema with explicit definitions (reproducible)';
export const version = '20241110_initial_schema';
