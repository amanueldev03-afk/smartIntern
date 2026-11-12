/** Immutable schema snapshot for the additive runtime-schema migration. Keep in sync via compatibility tests. */
export const runtimeSchemaSnapshot = [
  {
    "model": "CV",
    "table": "student_profiles_cv",
    "timestamps": true,
    "columns": [
      {
        "name": "id",
        "type": "BIGINT",
        "allowNull": false,
        "primaryKey": true,
        "autoIncrement": true
      },
      {
        "name": "student_id",
        "type": "UUID",
        "allowNull": false,
        "references": {
          "model": "accounts_user",
          "key": "id"
        },
        "onDelete": "CASCADE",
        "onUpdate": "CASCADE"
      },
      {
        "name": "file",
        "type": "STRING",
        "allowNull": false
      },
      {
        "name": "processing_status",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "PENDING"
      },
      {
        "name": "processing_error",
        "type": "TEXT",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "extracted_text",
        "type": "TEXT",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "extracted_skills",
        "type": "JSONB",
        "allowNull": true,
        "defaultValue": []
      },
      {
        "name": "extracted_education",
        "type": "JSONB",
        "allowNull": true,
        "defaultValue": []
      },
      {
        "name": "extracted_experience",
        "type": "JSONB",
        "allowNull": true,
        "defaultValue": []
      },
      {
        "name": "extracted_projects",
        "type": "JSONB",
        "allowNull": true,
        "defaultValue": []
      },
      {
        "name": "extracted_certifications",
        "type": "JSONB",
        "allowNull": true,
        "defaultValue": []
      },
      {
        "name": "extracted_languages",
        "type": "JSONB",
        "allowNull": true,
        "defaultValue": []
      },
      {
        "name": "extracted_experience_years",
        "type": "DECIMAL",
        "allowNull": true,
        "precision": 4,
        "scale": 1,
        "defaultValue": 0
      },
      {
        "name": "processed_at",
        "type": "DATE",
        "allowNull": true
      },
      {
        "name": "created_at",
        "type": "DATE",
        "allowNull": false
      },
      {
        "name": "updated_at",
        "type": "DATE",
        "allowNull": false
      }
    ],
    "indexes": []
  },
  {
    "model": "CampusLogistics",
    "table": "logistics_campuslogistics",
    "timestamps": true,
    "columns": [
      {
        "name": "id",
        "type": "UUID",
        "allowNull": false,
        "primaryKey": true,
        "defaultValue": "UUIDV4"
      },
      {
        "name": "student_id",
        "type": "UUID",
        "allowNull": false,
        "references": {
          "model": "accounts_user",
          "key": "id"
        },
        "onDelete": "RESTRICT",
        "onUpdate": "CASCADE"
      },
      {
        "name": "dean_approved",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": false
      },
      {
        "name": "dean_signature_hash",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "dean_signed_by_id",
        "type": "UUID",
        "allowNull": true,
        "references": {
          "model": "accounts_user",
          "key": "id"
        },
        "onDelete": "SET NULL",
        "onUpdate": "CASCADE"
      },
      {
        "name": "dean_signed_at",
        "type": "DATE",
        "allowNull": true
      },
      {
        "name": "meal_card_number",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "meal_card_active",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": false
      },
      {
        "name": "meal_card_issued_at",
        "type": "DATE",
        "allowNull": true
      },
      {
        "name": "meal_card_issued_by_id",
        "type": "UUID",
        "allowNull": true,
        "references": {
          "model": "accounts_user",
          "key": "id"
        },
        "onDelete": "SET NULL",
        "onUpdate": "CASCADE"
      },
      {
        "name": "student_union_signature_hash",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "student_union_qr_code",
        "type": "TEXT",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "dorm_block",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "Block A"
      },
      {
        "name": "dorm_room",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "101"
      },
      {
        "name": "dorm_bed_number",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "Bed 1"
      },
      {
        "name": "dorm_status",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "UNASSIGNED"
      },
      {
        "name": "key_issued",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": false
      },
      {
        "name": "key_issued_at",
        "type": "DATE",
        "allowNull": true
      },
      {
        "name": "key_issued_by_id",
        "type": "UUID",
        "allowNull": true,
        "references": {
          "model": "accounts_user",
          "key": "id"
        },
        "onDelete": "SET NULL",
        "onUpdate": "CASCADE"
      },
      {
        "name": "valid_from",
        "type": "DATEONLY",
        "allowNull": true
      },
      {
        "name": "valid_until",
        "type": "DATEONLY",
        "allowNull": true
      },
      {
        "name": "cleared_at_exit",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": false
      },
      {
        "name": "created_at",
        "type": "DATE",
        "allowNull": false
      },
      {
        "name": "updated_at",
        "type": "DATE",
        "allowNull": false
      }
    ],
    "indexes": []
  },
  {
    "model": "CareerInterest",
    "table": "student_profiles_careerinterest",
    "timestamps": true,
    "columns": [
      {
        "name": "id",
        "type": "BIGINT",
        "allowNull": false,
        "primaryKey": true,
        "autoIncrement": true
      },
      {
        "name": "name",
        "type": "STRING",
        "allowNull": false,
        "unique": true
      },
      {
        "name": "description",
        "type": "TEXT",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "is_active",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": true
      },
      {
        "name": "created_at",
        "type": "DATE",
        "allowNull": false
      },
      {
        "name": "updated_at",
        "type": "DATE",
        "allowNull": false
      }
    ],
    "indexes": []
  },
  {
    "model": "Company",
    "table": "companies_company",
    "timestamps": true,
    "columns": [
      {
        "name": "id",
        "type": "BIGINT",
        "allowNull": false,
        "primaryKey": true,
        "autoIncrement": true
      },
      {
        "name": "name",
        "type": "STRING",
        "allowNull": false
      },
      {
        "name": "website",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "industry",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "Information Technology"
      },
      {
        "name": "country",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "Ethiopia"
      },
      {
        "name": "created_at",
        "type": "DATE",
        "allowNull": false
      },
      {
        "name": "updated_at",
        "type": "DATE",
        "allowNull": false
      }
    ],
    "indexes": []
  },
  {
    "model": "DataSource",
    "table": "data_sources_datasource",
    "timestamps": true,
    "columns": [
      {
        "name": "id",
        "type": "BIGINT",
        "allowNull": false,
        "primaryKey": true,
        "autoIncrement": true
      },
      {
        "name": "name",
        "type": "STRING",
        "allowNull": false
      },
      {
        "name": "base_url",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "type",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "api"
      },
      {
        "name": "description",
        "type": "TEXT",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "is_active",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": true
      },
      {
        "name": "config",
        "type": "JSONB",
        "allowNull": true,
        "defaultValue": {}
      },
      {
        "name": "last_synced_at",
        "type": "DATE",
        "allowNull": true
      },
      {
        "name": "created_at",
        "type": "DATE",
        "allowNull": false
      },
      {
        "name": "updated_at",
        "type": "DATE",
        "allowNull": false
      }
    ],
    "indexes": []
  },
  {
    "model": "Internship",
    "table": "internships_internship",
    "timestamps": true,
    "columns": [
      {
        "name": "id",
        "type": "BIGINT",
        "allowNull": false,
        "primaryKey": true,
        "autoIncrement": true
      },
      {
        "name": "title",
        "type": "STRING",
        "allowNull": false
      },
      {
        "name": "organization_name",
        "type": "STRING",
        "allowNull": false
      },
      {
        "name": "description",
        "type": "TEXT",
        "allowNull": false
      },
      {
        "name": "category",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "Software Engineering"
      },
      {
        "name": "country",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "Ethiopia"
      },
      {
        "name": "city",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "Addis Ababa"
      },
      {
        "name": "location_text",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "internship_type",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "onsite"
      },
      {
        "name": "work_type",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "full_time"
      },
      {
        "name": "work_mode",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "onsite"
      },
      {
        "name": "compensation_type",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "paid"
      },
      {
        "name": "minimum_compensation",
        "type": "DECIMAL",
        "allowNull": true,
        "precision": 12,
        "scale": 2
      },
      {
        "name": "maximum_compensation",
        "type": "DECIMAL",
        "allowNull": true,
        "precision": 12,
        "scale": 2
      },
      {
        "name": "compensation_currency",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "ETB"
      },
      {
        "name": "compensation_period",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "monthly"
      },
      {
        "name": "preferred_skills",
        "type": "JSONB",
        "allowNull": true,
        "defaultValue": []
      },
      {
        "name": "duration_min_weeks",
        "type": "INTEGER",
        "allowNull": true,
        "defaultValue": 8
      },
      {
        "name": "duration_max_weeks",
        "type": "INTEGER",
        "allowNull": true,
        "defaultValue": 16
      },
      {
        "name": "application_url",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "source_id",
        "type": "BIGINT",
        "allowNull": true
      },
      {
        "name": "source_url",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "external_id",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "posted_at",
        "type": "DATE",
        "allowNull": true,
        "defaultValue": "NOW"
      },
      {
        "name": "application_deadline",
        "type": "DATE",
        "allowNull": true
      },
      {
        "name": "is_verified",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": true
      },
      {
        "name": "is_published",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": true
      },
      {
        "name": "needs_review",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": false
      },
      {
        "name": "status",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "active"
      },
      {
        "name": "rejection_reason",
        "type": "TEXT",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "embedding_status",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "ready"
      },
      {
        "name": "content_hash",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "required_education",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "Bachelor"
      },
      {
        "name": "required_experience",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "0-1 years"
      },
      {
        "name": "skills_review",
        "type": "JSONB",
        "allowNull": true,
        "defaultValue": {}
      },
      {
        "name": "url_validation",
        "type": "JSONB",
        "allowNull": true,
        "defaultValue": {}
      },
      {
        "name": "created_at",
        "type": "DATE",
        "allowNull": false
      },
      {
        "name": "updated_at",
        "type": "DATE",
        "allowNull": false
      }
    ],
    "indexes": []
  },
  {
    "model": "InternshipApplication",
    "table": "internships_internshipapplication",
    "timestamps": true,
    "columns": [
      {
        "name": "id",
        "type": "BIGINT",
        "allowNull": false,
        "primaryKey": true,
        "autoIncrement": true
      },
      {
        "name": "student_id",
        "type": "UUID",
        "allowNull": false,
        "references": {
          "model": "accounts_user",
          "key": "id"
        },
        "onDelete": "RESTRICT",
        "onUpdate": "CASCADE"
      },
      {
        "name": "internship_id",
        "type": "BIGINT",
        "allowNull": false,
        "references": {
          "model": "internships_internship",
          "key": "id"
        },
        "onDelete": "RESTRICT",
        "onUpdate": "CASCADE"
      },
      {
        "name": "status",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "applied"
      },
      {
        "name": "notes",
        "type": "TEXT",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "created_at",
        "type": "DATE",
        "allowNull": false
      },
      {
        "name": "updated_at",
        "type": "DATE",
        "allowNull": false
      }
    ],
    "indexes": [
      {
        "fields": [
          "student_id",
          "internship_id"
        ],
        "unique": true,
        "name": "internship_application_unique"
      }
    ]
  },
  {
    "model": "InternshipSkillJoin",
    "table": "internships_internship_required_skills",
    "timestamps": false,
    "columns": [
      {
        "name": "id",
        "type": "BIGINT",
        "allowNull": false,
        "primaryKey": true,
        "autoIncrement": true
      },
      {
        "name": "internship_id",
        "type": "BIGINT",
        "allowNull": false,
        "unique": "internships_internship_required_skills_skill_id_internship_id_unique",
        "references": {
          "model": "internships_internship",
          "key": "id"
        },
        "onDelete": "CASCADE",
        "onUpdate": "CASCADE"
      },
      {
        "name": "skill_id",
        "type": "BIGINT",
        "allowNull": false,
        "unique": "internships_internship_required_skills_skill_id_internship_id_unique",
        "references": {
          "model": "internships_skill",
          "key": "id"
        },
        "onDelete": "CASCADE",
        "onUpdate": "CASCADE"
      }
    ],
    "indexes": [
      {
        "fields": [
          "internship_id",
          "skill_id"
        ],
        "unique": true,
        "name": "internship_skill_unique"
      }
    ]
  },
  {
    "model": "Notification",
    "table": "notifications_notification",
    "timestamps": true,
    "columns": [
      {
        "name": "id",
        "type": "UUID",
        "allowNull": false,
        "primaryKey": true,
        "defaultValue": "UUIDV4"
      },
      {
        "name": "recipient_id",
        "type": "UUID",
        "allowNull": false,
        "references": {
          "model": "accounts_user",
          "key": "id"
        },
        "onDelete": "CASCADE",
        "onUpdate": "CASCADE"
      },
      {
        "name": "actor_id",
        "type": "UUID",
        "allowNull": true,
        "references": {
          "model": "accounts_user",
          "key": "id"
        },
        "onDelete": "SET NULL",
        "onUpdate": "CASCADE"
      },
      {
        "name": "title",
        "type": "STRING",
        "allowNull": false
      },
      {
        "name": "message",
        "type": "TEXT",
        "allowNull": false
      },
      {
        "name": "notification_type",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "INFO"
      },
      {
        "name": "link",
        "type": "STRING",
        "allowNull": true
      },
      {
        "name": "is_read",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": false
      },
      {
        "name": "metadata",
        "type": "JSONB",
        "allowNull": true,
        "defaultValue": {}
      },
      {
        "name": "created_at",
        "type": "DATE",
        "allowNull": false
      }
    ],
    "indexes": []
  },
  {
    "model": "ProjectTeam",
    "table": "projects_projectteam",
    "timestamps": true,
    "columns": [
      {
        "name": "id",
        "type": "UUID",
        "allowNull": false,
        "primaryKey": true,
        "defaultValue": "UUIDV4"
      },
      {
        "name": "team_name",
        "type": "STRING",
        "allowNull": false
      },
      {
        "name": "project_title",
        "type": "STRING",
        "allowNull": false
      },
      {
        "name": "cohort_id",
        "type": "UUID",
        "allowNull": true
      },
      {
        "name": "assigned_advisor_id",
        "type": "UUID",
        "allowNull": true,
        "references": {
          "model": "accounts_user",
          "key": "id"
        },
        "onDelete": "SET NULL",
        "onUpdate": "CASCADE"
      },
      {
        "name": "srs_status",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "DRAFT"
      },
      {
        "name": "srs_document",
        "type": "STRING",
        "allowNull": true
      },
      {
        "name": "srs_feedback",
        "type": "TEXT",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "srs_revision_deadline",
        "type": "DATE",
        "allowNull": true
      },
      {
        "name": "channels_active",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": true
      },
      {
        "name": "created_at",
        "type": "DATE",
        "allowNull": false
      },
      {
        "name": "updated_at",
        "type": "DATE",
        "allowNull": false
      }
    ],
    "indexes": []
  },
  {
    "model": "ProjectTeamMessage",
    "table": "projects_projectteammessage",
    "timestamps": true,
    "columns": [
      {
        "name": "id",
        "type": "UUID",
        "allowNull": false,
        "primaryKey": true,
        "defaultValue": "UUIDV4"
      },
      {
        "name": "team_id",
        "type": "UUID",
        "allowNull": false,
        "references": {
          "model": "projects_projectteam",
          "key": "id"
        },
        "onDelete": "CASCADE",
        "onUpdate": "CASCADE"
      },
      {
        "name": "sender_id",
        "type": "UUID",
        "allowNull": false,
        "references": {
          "model": "accounts_user",
          "key": "id"
        },
        "onDelete": "RESTRICT",
        "onUpdate": "CASCADE"
      },
      {
        "name": "message_type",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "GENERAL"
      },
      {
        "name": "message",
        "type": "TEXT",
        "allowNull": false
      },
      {
        "name": "created_at",
        "type": "DATE",
        "allowNull": false
      },
      {
        "name": "updated_at",
        "type": "DATE",
        "allowNull": false
      }
    ],
    "indexes": []
  },
  {
    "model": "Recommendation",
    "table": "recommendations_recommendation",
    "timestamps": true,
    "columns": [
      {
        "name": "id",
        "type": "BIGINT",
        "allowNull": false,
        "primaryKey": true,
        "autoIncrement": true
      },
      {
        "name": "student_id",
        "type": "UUID",
        "allowNull": false,
        "references": {
          "model": "accounts_user",
          "key": "id"
        },
        "onDelete": "CASCADE",
        "onUpdate": "CASCADE"
      },
      {
        "name": "internship_id",
        "type": "BIGINT",
        "allowNull": false,
        "references": {
          "model": "internships_internship",
          "key": "id"
        },
        "onDelete": "CASCADE",
        "onUpdate": "CASCADE"
      },
      {
        "name": "overall_score",
        "type": "FLOAT",
        "allowNull": true,
        "defaultValue": 0
      },
      {
        "name": "semantic_score",
        "type": "FLOAT",
        "allowNull": true,
        "defaultValue": 0
      },
      {
        "name": "skill_score",
        "type": "FLOAT",
        "allowNull": true,
        "defaultValue": 0
      },
      {
        "name": "preference_score",
        "type": "FLOAT",
        "allowNull": true,
        "defaultValue": 0
      },
      {
        "name": "location_score",
        "type": "FLOAT",
        "allowNull": true,
        "defaultValue": 0
      },
      {
        "name": "salary_score",
        "type": "FLOAT",
        "allowNull": true,
        "defaultValue": 0
      },
      {
        "name": "explanation",
        "type": "JSONB",
        "allowNull": true,
        "defaultValue": []
      },
      {
        "name": "status",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "active"
      },
      {
        "name": "viewed_at",
        "type": "DATE",
        "allowNull": true
      },
      {
        "name": "saved_at",
        "type": "DATE",
        "allowNull": true
      },
      {
        "name": "applied_at",
        "type": "DATE",
        "allowNull": true
      },
      {
        "name": "ignored_at",
        "type": "DATE",
        "allowNull": true
      },
      {
        "name": "created_at",
        "type": "DATE",
        "allowNull": false
      },
      {
        "name": "updated_at",
        "type": "DATE",
        "allowNull": false
      }
    ],
    "indexes": [
      {
        "fields": [
          "student_id",
          "internship_id"
        ],
        "unique": true,
        "name": "recommendation_unique"
      }
    ]
  },
  {
    "model": "SavedInternship",
    "table": "internships_savedinternship",
    "timestamps": true,
    "columns": [
      {
        "name": "id",
        "type": "BIGINT",
        "allowNull": false,
        "primaryKey": true,
        "autoIncrement": true
      },
      {
        "name": "student_id",
        "type": "UUID",
        "allowNull": false,
        "references": {
          "model": "accounts_user",
          "key": "id"
        },
        "onDelete": "CASCADE",
        "onUpdate": "CASCADE"
      },
      {
        "name": "internship_id",
        "type": "BIGINT",
        "allowNull": false,
        "references": {
          "model": "internships_internship",
          "key": "id"
        },
        "onDelete": "CASCADE",
        "onUpdate": "CASCADE"
      },
      {
        "name": "created_at",
        "type": "DATE",
        "allowNull": false
      },
      {
        "name": "updated_at",
        "type": "DATE",
        "allowNull": false
      }
    ],
    "indexes": [
      {
        "fields": [
          "student_id",
          "internship_id"
        ],
        "unique": true,
        "name": "saved_internship_unique"
      }
    ]
  },
  {
    "model": "Skill",
    "table": "internships_skill",
    "timestamps": true,
    "columns": [
      {
        "name": "id",
        "type": "BIGINT",
        "allowNull": false,
        "primaryKey": true,
        "autoIncrement": true
      },
      {
        "name": "name",
        "type": "STRING",
        "allowNull": false,
        "unique": true
      },
      {
        "name": "category",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "General"
      },
      {
        "name": "description",
        "type": "TEXT",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "is_active",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": true
      },
      {
        "name": "created_at",
        "type": "DATE",
        "allowNull": false
      },
      {
        "name": "updated_at",
        "type": "DATE",
        "allowNull": false
      }
    ],
    "indexes": []
  },
  {
    "model": "StudentActivityLog",
    "table": "administration_studentactivitylog",
    "timestamps": true,
    "columns": [
      {
        "name": "id",
        "type": "BIGINT",
        "allowNull": false,
        "primaryKey": true,
        "autoIncrement": true
      },
      {
        "name": "student_id",
        "type": "UUID",
        "allowNull": false
      },
      {
        "name": "action",
        "type": "STRING",
        "allowNull": false
      },
      {
        "name": "details",
        "type": "JSONB",
        "allowNull": true,
        "defaultValue": {}
      },
      {
        "name": "created_at",
        "type": "DATE",
        "allowNull": false
      }
    ],
    "indexes": []
  },
  {
    "model": "StudentInterest",
    "table": "student_profiles_studentinterest",
    "timestamps": true,
    "columns": [
      {
        "name": "id",
        "type": "BIGINT",
        "allowNull": false,
        "primaryKey": true,
        "autoIncrement": true
      },
      {
        "name": "student_id",
        "type": "BIGINT",
        "allowNull": false,
        "unique": "student_profiles_studentinterest_interest_id_student_id_unique",
        "references": {
          "model": "student_profiles_studentprofile",
          "key": "id"
        },
        "onDelete": "CASCADE",
        "onUpdate": "CASCADE"
      },
      {
        "name": "interest_id",
        "type": "BIGINT",
        "allowNull": false,
        "unique": "student_profiles_studentinterest_interest_id_student_id_unique",
        "references": {
          "model": "student_profiles_careerinterest",
          "key": "id"
        },
        "onDelete": "CASCADE",
        "onUpdate": "CASCADE"
      },
      {
        "name": "created_at",
        "type": "DATE",
        "allowNull": false
      },
      {
        "name": "updated_at",
        "type": "DATE",
        "allowNull": false
      }
    ],
    "indexes": [
      {
        "fields": [
          "student_id",
          "interest_id"
        ],
        "unique": true,
        "name": "student_interest_unique"
      }
    ]
  },
  {
    "model": "StudentProfile",
    "table": "student_profiles_studentprofile",
    "timestamps": true,
    "columns": [
      {
        "name": "id",
        "type": "BIGINT",
        "allowNull": false,
        "primaryKey": true,
        "autoIncrement": true
      },
      {
        "name": "user_id",
        "type": "UUID",
        "allowNull": false,
        "unique": true,
        "references": {
          "model": "accounts_user",
          "key": "id"
        },
        "onDelete": "CASCADE",
        "onUpdate": "CASCADE"
      },
      {
        "name": "phone",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "country",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "Ethiopia"
      },
      {
        "name": "city",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "Addis Ababa"
      },
      {
        "name": "date_of_birth",
        "type": "DATEONLY",
        "allowNull": true
      },
      {
        "name": "bio",
        "type": "TEXT",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "education_level",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "Undergraduate"
      },
      {
        "name": "current_year",
        "type": "INTEGER",
        "allowNull": true,
        "defaultValue": 4
      },
      {
        "name": "field_of_study",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "Software Engineering"
      },
      {
        "name": "university",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "Addis Ababa University"
      },
      {
        "name": "student_id_number",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "gpa",
        "type": "FLOAT",
        "allowNull": true
      },
      {
        "name": "experience",
        "type": "TEXT",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "internship_type",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "any"
      },
      {
        "name": "work_type",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "either"
      },
      {
        "name": "compensation_preference",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "either"
      },
      {
        "name": "minimum_compensation",
        "type": "DECIMAL",
        "allowNull": true,
        "precision": 12,
        "scale": 2
      },
      {
        "name": "maximum_compensation",
        "type": "DECIMAL",
        "allowNull": true,
        "precision": 12,
        "scale": 2
      },
      {
        "name": "compensation_currency",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "ETB"
      },
      {
        "name": "preferred_locations",
        "type": "JSONB",
        "allowNull": true,
        "defaultValue": []
      },
      {
        "name": "willing_to_relocate",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": false
      },
      {
        "name": "preferred_industries",
        "type": "JSONB",
        "allowNull": true,
        "defaultValue": []
      },
      {
        "name": "preferred_roles",
        "type": "JSONB",
        "allowNull": true,
        "defaultValue": []
      },
      {
        "name": "internship_duration_min_weeks",
        "type": "INTEGER",
        "allowNull": true
      },
      {
        "name": "internship_duration_max_weeks",
        "type": "INTEGER",
        "allowNull": true
      },
      {
        "name": "availability_start",
        "type": "DATEONLY",
        "allowNull": true
      },
      {
        "name": "availability_end",
        "type": "DATEONLY",
        "allowNull": true
      },
      {
        "name": "availability_immediately",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": false
      },
      {
        "name": "cv",
        "type": "STRING",
        "allowNull": true
      },
      {
        "name": "resume",
        "type": "STRING",
        "allowNull": true
      },
      {
        "name": "resume_parsed",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": false
      },
      {
        "name": "resume_parsed_at",
        "type": "DATE",
        "allowNull": true
      },
      {
        "name": "created_at",
        "type": "DATE",
        "allowNull": false
      },
      {
        "name": "updated_at",
        "type": "DATE",
        "allowNull": false
      }
    ],
    "indexes": [
      {
        "fields": [
          "user_id"
        ],
        "unique": true,
        "name": "student_profile_user_id_unique"
      }
    ]
  },
  {
    "model": "StudentSkill",
    "table": "student_profiles_studentskill",
    "timestamps": true,
    "columns": [
      {
        "name": "id",
        "type": "BIGINT",
        "allowNull": false,
        "primaryKey": true,
        "autoIncrement": true
      },
      {
        "name": "student_id",
        "type": "BIGINT",
        "allowNull": false,
        "unique": "student_profiles_studentskill_skill_id_student_id_unique",
        "references": {
          "model": "student_profiles_studentprofile",
          "key": "id"
        },
        "onDelete": "CASCADE",
        "onUpdate": "CASCADE"
      },
      {
        "name": "skill_id",
        "type": "BIGINT",
        "allowNull": false,
        "unique": "student_profiles_studentskill_skill_id_student_id_unique",
        "references": {
          "model": "internships_skill",
          "key": "id"
        },
        "onDelete": "CASCADE",
        "onUpdate": "CASCADE"
      },
      {
        "name": "proficiency",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "intermediate"
      },
      {
        "name": "source",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "profile"
      },
      {
        "name": "created_at",
        "type": "DATE",
        "allowNull": false
      },
      {
        "name": "updated_at",
        "type": "DATE",
        "allowNull": false
      }
    ],
    "indexes": [
      {
        "fields": [
          "student_id",
          "skill_id"
        ],
        "unique": true,
        "name": "student_skill_unique"
      }
    ]
  },
  {
    "model": "TeamMember",
    "table": "projects_teammember",
    "timestamps": true,
    "columns": [
      {
        "name": "id",
        "type": "UUID",
        "allowNull": false,
        "primaryKey": true,
        "defaultValue": "UUIDV4"
      },
      {
        "name": "team_id",
        "type": "UUID",
        "allowNull": false,
        "references": {
          "model": "projects_projectteam",
          "key": "id"
        },
        "onDelete": "CASCADE",
        "onUpdate": "CASCADE"
      },
      {
        "name": "student_id",
        "type": "UUID",
        "allowNull": false,
        "references": {
          "model": "accounts_user",
          "key": "id"
        },
        "onDelete": "RESTRICT",
        "onUpdate": "CASCADE"
      },
      {
        "name": "is_leader",
        "type": "BOOLEAN",
        "allowNull": false,
        "defaultValue": false
      },
      {
        "name": "assigned_role",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "Full Stack Engineer"
      },
      {
        "name": "created_at",
        "type": "DATE",
        "allowNull": false
      },
      {
        "name": "updated_at",
        "type": "DATE",
        "allowNull": false
      }
    ],
    "indexes": []
  },
  {
    "model": "User",
    "table": "accounts_user",
    "timestamps": true,
    "columns": [
      {
        "name": "id",
        "type": "UUID",
        "allowNull": false,
        "primaryKey": true,
        "defaultValue": "UUIDV4"
      },
      {
        "name": "email",
        "type": "STRING",
        "allowNull": false,
        "unique": true
      },
      {
        "name": "username",
        "type": "STRING",
        "allowNull": true,
        "unique": true
      },
      {
        "name": "password",
        "type": "STRING",
        "allowNull": false
      },
      {
        "name": "first_name",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "last_name",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "role",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": "student"
      },
      {
        "name": "phone_number",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "department",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "university_name",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "staff_id_number",
        "type": "STRING",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "is_approved",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": true
      },
      {
        "name": "is_active",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": true
      },
      {
        "name": "is_email_verified",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": false
      },
      {
        "name": "is_staff",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": false
      },
      {
        "name": "is_superuser",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": false
      },
      {
        "name": "profile_photo",
        "type": "STRING",
        "allowNull": true
      },
      {
        "name": "last_login",
        "type": "DATE",
        "allowNull": true
      },
      {
        "name": "date_joined",
        "type": "DATE",
        "allowNull": true,
        "defaultValue": "NOW"
      },
      {
        "name": "created_at",
        "type": "DATE",
        "allowNull": true,
        "defaultValue": "NOW"
      },
      {
        "name": "updated_at",
        "type": "DATE",
        "allowNull": true,
        "defaultValue": "NOW"
      }
    ],
    "indexes": []
  },
  {
    "model": "WeeklyLogbook",
    "table": "projects_weeklylogbook",
    "timestamps": true,
    "columns": [
      {
        "name": "id",
        "type": "UUID",
        "allowNull": false,
        "primaryKey": true,
        "defaultValue": "UUIDV4"
      },
      {
        "name": "project_team_id",
        "type": "UUID",
        "allowNull": true,
        "references": {
          "model": "projects_projectteam",
          "key": "id"
        },
        "onDelete": "CASCADE",
        "onUpdate": "CASCADE"
      },
      {
        "name": "student_id",
        "type": "UUID",
        "allowNull": false,
        "references": {
          "model": "accounts_user",
          "key": "id"
        },
        "onDelete": "RESTRICT",
        "onUpdate": "CASCADE"
      },
      {
        "name": "academic_advisor_id",
        "type": "UUID",
        "allowNull": true,
        "references": {
          "model": "accounts_user",
          "key": "id"
        },
        "onDelete": "SET NULL",
        "onUpdate": "CASCADE"
      },
      {
        "name": "company_mentor_id",
        "type": "UUID",
        "allowNull": true,
        "references": {
          "model": "accounts_user",
          "key": "id"
        },
        "onDelete": "SET NULL",
        "onUpdate": "CASCADE"
      },
      {
        "name": "week_number",
        "type": "INTEGER",
        "allowNull": false
      },
      {
        "name": "tasks_planned",
        "type": "TEXT",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "tasks_executed",
        "type": "TEXT",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "challenges_faced",
        "type": "TEXT",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "git_commit_urls",
        "type": "JSONB",
        "allowNull": true,
        "defaultValue": []
      },
      {
        "name": "similarity_score",
        "type": "FLOAT",
        "allowNull": true,
        "defaultValue": 0
      },
      {
        "name": "is_flagged",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": false
      },
      {
        "name": "matched_snippet",
        "type": "TEXT",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "advisor_approved",
        "type": "BOOLEAN",
        "allowNull": true,
        "defaultValue": false
      },
      {
        "name": "advisor_feedback",
        "type": "TEXT",
        "allowNull": true,
        "defaultValue": ""
      },
      {
        "name": "submitted_at",
        "type": "DATE",
        "allowNull": true,
        "defaultValue": "NOW"
      },
      {
        "name": "created_at",
        "type": "DATE",
        "allowNull": false
      },
      {
        "name": "updated_at",
        "type": "DATE",
        "allowNull": false
      }
    ],
    "indexes": []
  }
];
