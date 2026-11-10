/**
 * Initial Schema Migration
 * Creates all tables with verified model definitions from Tasks 1.10-1.14
 * 
 * This migration should only be run once on a fresh database.
 * It replaces the unsafe sequelize.sync() approach.
 */

import sequelize from '../src/config/database.js';
import {
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
  StudentActivityLog
} from '../src/models/index.js';

export const up = async () => {
  console.log('[Migration] Creating initial schema...');
  
  // Create all tables in the correct order to satisfy foreign key dependencies
  // Order: Independent tables first, then dependent tables
  
  // Independent tables (no foreign keys)
  await User.sync({ force: false });
  await Skill.sync({ force: false });
  await CareerInterest.sync({ force: false });
  await Company.sync({ force: false });
  await DataSource.sync({ force: false });
  
  // Dependent tables
  await StudentProfile.sync({ force: false }); // depends on User
  await CV.sync({ force: false }); // depends on User
  await Internship.sync({ force: false }); // independent for FKs, but depends on Skill for relationships
  await ProjectTeam.sync({ force: false }); // depends on User (advisor)
  
  // Junction tables
  await StudentSkill.sync({ force: false }); // depends on StudentProfile, Skill
  await StudentInterest.sync({ force: false }); // depends on StudentProfile, CareerInterest
  await InternshipSkillJoin.sync({ force: false }); // depends on Internship, Skill
  
  // Dependent on multiple tables
  await SavedInternship.sync({ force: false }); // depends on User, Internship
  await InternshipApplication.sync({ force: false }); // depends on User, Internship
  await Recommendation.sync({ force: false }); // depends on User, Internship
  await TeamMember.sync({ force: false }); // depends on ProjectTeam, User
  await WeeklyLogbook.sync({ force: false }); // depends on ProjectTeam, User
  await ProjectTeamMessage.sync({ force: false }); // depends on ProjectTeam, User
  await CampusLogistics.sync({ force: false }); // depends on User
  await Notification.sync({ force: false }); // depends on User
  await StudentActivityLog.sync({ force: false }); // depends on User
  
  console.log('[Migration] Initial schema created successfully.');
};

export const down = async () => {
  console.log('[Migration] Rolling back initial schema...');
  
  // Drop tables in reverse order to satisfy foreign key dependencies
  await StudentActivityLog.drop();
  await Notification.drop();
  await CampusLogistics.drop();
  await ProjectTeamMessage.drop();
  await WeeklyLogbook.drop();
  await TeamMember.drop();
  await Recommendation.drop();
  await InternshipApplication.drop();
  await SavedInternship.drop();
  await InternshipSkillJoin.drop();
  await StudentInterest.drop();
  await StudentSkill.drop();
  await CV.drop();
  await StudentProfile.drop();
  await ProjectTeam.drop();
  await Internship.drop();
  await DataSource.drop();
  await Company.drop();
  await CareerInterest.drop();
  await Skill.drop();
  await User.drop();
  
  console.log('[Migration] Initial schema rolled back successfully.');
};

export const description = 'Create initial database schema with all 21 models';
export const version = '20241110_initial_schema';
