/**
 * Add Performance Indexes
 * 
 * This migration adds indexes to optimize frequently executed queries
 * based on actual query patterns in the application.
 * 
 * Index Design Principles:
 * - Foreign key columns need indexes for JOIN performance
 * - Frequently filtered columns need indexes
 * - Composite indexes for common filter+sort patterns
 * - Partial indexes for selective queries
 */

import sequelize from '../src/config/database.js';
import { migrationQueryInterface } from '../db/migrationQueryInterface.js';

export const up = async ({ transaction } = {}) => {
  console.log('[Migration] Adding performance indexes...');
  
  const queryInterface = migrationQueryInterface(sequelize, transaction);
  
  // -------------------------------------------------------------
  // Internship indexes
  // -------------------------------------------------------------
  
  // Index for active internship listings with ordering
  // Query: WHERE status = 'active' ORDER BY created_at DESC
  await queryInterface.addIndex('internships', ['status', 'created_at'], {
    name: 'internships_status_created_at_idx'
  });
  
  // Index for location filtering
  // Query: WHERE city = 'Addis Ababa'
  await queryInterface.addIndex('internships', ['city'], {
    name: 'internships_city_idx'
  });
  
  // Index for country filtering
  // Query: WHERE country = 'Ethiopia'
  await queryInterface.addIndex('internships', ['country'], {
    name: 'internships_country_idx'
  });
  
  // Index for category filtering
  // Query: WHERE category LIKE '%Software%'
  await queryInterface.addIndex('internships', ['category'], {
    name: 'internships_category_idx'
  });
  
  // Index for internship_type filtering
  // Query: WHERE internship_type = 'remote'
  await queryInterface.addIndex('internships', ['internship_type'], {
    name: 'internships_internship_type_idx'
  });
  
  // Index for work_type filtering
  // Query: WHERE work_type = 'full_time'
  await queryInterface.addIndex('internships', ['work_type'], {
    name: 'internships_work_type_idx'
  });
  
  // Index for compensation_type filtering
  // Query: WHERE compensation_type = 'paid'
  await queryInterface.addIndex('internships', ['compensation_type'], {
    name: 'internships_compensation_type_idx'
  });
  
  // -------------------------------------------------------------
  // SavedInternship indexes
  // -------------------------------------------------------------
  
  // The initial schema uses user_id for the student identity.
  // Query: WHERE user_id = ? ORDER BY created_at DESC
  await queryInterface.addIndex('saved_internships', ['user_id'], {
    name: 'saved_internships_user_id_idx'
  });
  
  // -------------------------------------------------------------
  // InternshipApplication indexes
  // -------------------------------------------------------------
  
  // The initial schema uses user_id for the student identity.
  // Query: WHERE user_id = ?
  await queryInterface.addIndex('internship_applications', ['user_id'], {
    name: 'internship_applications_user_id_idx'
  });
  
  // Index for internship_id foreign key (JOIN performance)
  // Query: WHERE internship_id = ?
  await queryInterface.addIndex('internship_applications', ['internship_id'], {
    name: 'internship_applications_internship_id_idx'
  });
  
  // Composite index for user's applications with status
  // Query: WHERE user_id = ? AND status = 'pending'
  await queryInterface.addIndex('internship_applications', ['user_id', 'status'], {
    name: 'internship_applications_user_id_status_idx'
  });
  
  // -------------------------------------------------------------
  // Recommendation indexes
  // -------------------------------------------------------------
  
  // The initial schema uses user_id for the student identity.
  // Query: WHERE user_id = ?
  await queryInterface.addIndex('recommendations', ['user_id'], {
    name: 'recommendations_user_id_idx'
  });
  
  // Index for internship_id foreign key (JOIN performance)
  // Query: WHERE internship_id = ?
  await queryInterface.addIndex('recommendations', ['internship_id'], {
    name: 'recommendations_internship_id_idx'
  });
  
  // -------------------------------------------------------------
  // Notification indexes
  // -------------------------------------------------------------
  
  // Index for user_id foreign key (JOIN performance)
  // Query: WHERE user_id = ?
  await queryInterface.addIndex('notifications', ['user_id'], {
    name: 'notifications_user_id_idx'
  });
  
  // Composite index for unread notifications
  // Query: WHERE user_id = ? AND is_read = false
  await queryInterface.addIndex('notifications', ['user_id', 'is_read'], {
    name: 'notifications_user_id_is_read_idx'
  });
  
  // -------------------------------------------------------------
  // StudentActivityLog indexes
  // -------------------------------------------------------------
  
  // Index for user_id foreign key (JOIN performance)
  // Query: WHERE user_id = ? ORDER BY created_at DESC
  await queryInterface.addIndex('student_activity_logs', ['user_id'], {
    name: 'student_activity_logs_user_id_idx'
  });
  
  // Index for created_at ordering
  // Query: WHERE user_id = ? ORDER BY created_at DESC LIMIT 10
  await queryInterface.addIndex('student_activity_logs', ['created_at'], {
    name: 'student_activity_logs_created_at_idx'
  });
  
  // -------------------------------------------------------------
  // StudentSkill indexes
  // -------------------------------------------------------------
  
  // Index for student_id foreign key (JOIN performance)
  // Query: WHERE student_id = ?
  await queryInterface.addIndex('student_skills', ['student_id'], {
    name: 'student_skills_student_id_idx'
  });
  
  // -------------------------------------------------------------
  // StudentInterest indexes
  // -------------------------------------------------------------
  
  // Index for student_id foreign key (JOIN performance)
  // Query: WHERE student_id = ?
  await queryInterface.addIndex('student_interests', ['student_id'], {
    name: 'student_interests_student_id_idx'
  });
  
  // -------------------------------------------------------------
  // CV indexes
  // -------------------------------------------------------------
  
  // Index for user_id foreign key (JOIN performance)
  // Query: WHERE user_id = ?
  await queryInterface.addIndex('cvs', ['user_id'], {
    name: 'cvs_user_id_idx'
  });
  
  // -------------------------------------------------------------
  // ProjectTeam indexes
  // -------------------------------------------------------------
  
  // Index for advisor_id foreign key (JOIN performance)
  // Query: WHERE advisor_id = ?
  await queryInterface.addIndex('project_teams', ['advisor_id'], {
    name: 'project_teams_advisor_id_idx'
  });
  
  // Index for status filtering
  // Query: WHERE status = 'active'
  await queryInterface.addIndex('project_teams', ['status'], {
    name: 'project_teams_status_idx'
  });
  
  // -------------------------------------------------------------
  // TeamMember indexes
  // -------------------------------------------------------------
  
  // Index for project_team_id foreign key (JOIN performance)
  // Query: WHERE project_team_id = ?
  await queryInterface.addIndex('team_members', ['project_team_id'], {
    name: 'team_members_project_team_id_idx'
  });
  
  // Index for student_id foreign key (JOIN performance)
  // Query: WHERE student_id = ?
  await queryInterface.addIndex('team_members', ['student_id'], {
    name: 'team_members_student_id_idx'
  });
  
  // -------------------------------------------------------------
  // WeeklyLogbook indexes
  // -------------------------------------------------------------
  
  // Index for project_team_id foreign key (JOIN performance)
  // Query: WHERE project_team_id = ?
  await queryInterface.addIndex('weekly_logbooks', ['project_team_id'], {
    name: 'weekly_logbooks_project_team_id_idx'
  });
  
  // Index for student_id foreign key (JOIN performance)
  // Query: WHERE student_id = ?
  await queryInterface.addIndex('weekly_logbooks', ['student_id'], {
    name: 'weekly_logbooks_student_id_idx'
  });
  
  // Composite index for team logbooks with status
  // Query: WHERE project_team_id = ? AND status = 'submitted'
  await queryInterface.addIndex('weekly_logbooks', ['project_team_id', 'status'], {
    name: 'weekly_logbooks_project_team_id_status_idx'
  });
  
  console.log('[Migration] Performance indexes added successfully.');
};

export const down = async ({ transaction } = {}) => {
  console.log('[Migration] Rolling back performance indexes...');
  
  const queryInterface = migrationQueryInterface(sequelize, transaction);
  
  // Rollback in reverse order
  await queryInterface.removeIndex('weekly_logbooks', 'weekly_logbooks_project_team_id_status_idx');
  await queryInterface.removeIndex('weekly_logbooks', 'weekly_logbooks_student_id_idx');
  await queryInterface.removeIndex('weekly_logbooks', 'weekly_logbooks_project_team_id_idx');
  await queryInterface.removeIndex('team_members', 'team_members_student_id_idx');
  await queryInterface.removeIndex('team_members', 'team_members_project_team_id_idx');
  await queryInterface.removeIndex('project_teams', 'project_teams_status_idx');
  await queryInterface.removeIndex('project_teams', 'project_teams_advisor_id_idx');
  await queryInterface.removeIndex('cvs', 'cvs_user_id_idx');
  await queryInterface.removeIndex('student_interests', 'student_interests_student_id_idx');
  await queryInterface.removeIndex('student_skills', 'student_skills_student_id_idx');
  await queryInterface.removeIndex('student_activity_logs', 'student_activity_logs_created_at_idx');
  await queryInterface.removeIndex('student_activity_logs', 'student_activity_logs_user_id_idx');
  await queryInterface.removeIndex('notifications', 'notifications_user_id_is_read_idx');
  await queryInterface.removeIndex('notifications', 'notifications_user_id_idx');
  await queryInterface.removeIndex('recommendations', 'recommendations_internship_id_idx');
  await queryInterface.removeIndex('recommendations', 'recommendations_user_id_idx');
  await queryInterface.removeIndex('internship_applications', 'internship_applications_user_id_status_idx');
  await queryInterface.removeIndex('internship_applications', 'internship_applications_internship_id_idx');
  await queryInterface.removeIndex('internship_applications', 'internship_applications_user_id_idx');
  await queryInterface.removeIndex('saved_internships', 'saved_internships_user_id_idx');
  await queryInterface.removeIndex('internships', 'internships_compensation_type_idx');
  await queryInterface.removeIndex('internships', 'internships_work_type_idx');
  await queryInterface.removeIndex('internships', 'internships_internship_type_idx');
  await queryInterface.removeIndex('internships', 'internships_category_idx');
  await queryInterface.removeIndex('internships', 'internships_country_idx');
  await queryInterface.removeIndex('internships', 'internships_city_idx');
  await queryInterface.removeIndex('internships', 'internships_status_created_at_idx');
  
  console.log('[Migration] Performance indexes rolled back successfully.');
};

export const description = 'Add performance indexes for frequently executed queries';
export const version = '20241110_add_performance_indexes';
