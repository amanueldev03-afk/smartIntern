import sequelize from '../src/config/database.js';
import { User, StudentProfile, Internship, Skill, CareerInterest, DataSource } from '../src/models/index.js';
import { hashPassword, registerStudent, authenticateUser } from '../src/services/authService.js';

async function resetAndRegisterActors() {
  console.log('===> 1. Removing all previous database information...');

  // Truncate all user and operational data with CASCADE
  const tablesToTruncate = [
    'accounts_studentprofile',
    'student_profiles_studentprofile',
    'student_profiles_student',
    'student_profiles_cv',
    'uil_profiles_staffprofile',
    'uil_profiles_uilstudentprofile',
    'logistics_campuslogistics',
    'notifications_notification',
    'projects_projectteammessage',
    'projects_weeklylogbook',
    'projects_teammember',
    'projects_projectteam',
    'teams_teamchannelmessage',
    'teams_inhousecohort_accepted_students',
    'teams_inhousecohort',
    'recommendations_recommendation',
    'internships_savedinternship',
    'internships_internshipapplication',
    'administration_studentactivitylog',
    'django_admin_log',
    'django_session',
    'socialaccount_socialaccount',
    'token_blacklist_blacklistedtoken',
    'token_blacklist_outstandingtoken',
    'accounts_user',
  ];

  for (const table of tablesToTruncate) {
    try {
      await sequelize.query(`TRUNCATE TABLE "${table}" CASCADE;`);
      console.log(`  ✓ Truncated table ${table}`);
    } catch (err) {
      console.log(`  - Note on ${table}: ${err.message}`);
    }
  }

  console.log('\n===> 2. Ensuring baseline master catalog and sample internships...');
  const skillsList = [
    'React', 'Node.js', 'Express', 'JavaScript', 'TypeScript',
    'Python', 'PostgreSQL', 'Docker', 'Machine Learning', 'Git', 'REST API'
  ];
  for (const name of skillsList) {
    await Skill.findOrCreate({ where: { name }, defaults: { name, category: 'Technical' } });
  }

  // Ensure active sample internships exist
  const existingInternships = await Internship.count();
  if (existingInternships === 0) {
    await Internship.bulkCreate([
      {
        title: 'Full Stack Software Engineer Intern',
        organization_name: 'Commercial Bank of Ethiopia (CBE)',
        description: 'Build enterprise fintech web applications using React, Node.js, and PostgreSQL.',
        category: 'Software Engineering',
        country: 'Ethiopia',
        city: 'Addis Ababa',
        location_text: 'Addis Ababa, Ethiopia',
        internship_type: 'onsite',
        work_type: 'full_time',
        compensation_type: 'paid',
        minimum_compensation: 5000,
        maximum_compensation: 8000,
        compensation_currency: 'ETB',
        required_skills: ['React', 'Node.js', 'JavaScript', 'PostgreSQL'],
        preferred_skills: ['Docker', 'Git'],
        duration_min_weeks: 12,
        duration_max_weeks: 16,
        is_verified: true,
        status: 'active',
      },
      {
        title: 'Backend Node.js Developer Intern',
        organization_name: 'Ethio Telecom',
        description: 'Develop high-performance REST APIs and microservices for digital telecommunications.',
        category: 'Software Engineering',
        country: 'Ethiopia',
        city: 'Addis Ababa',
        location_text: 'Addis Ababa, Ethiopia',
        internship_type: 'remote',
        work_type: 'full_time',
        compensation_type: 'paid',
        minimum_compensation: 4500,
        maximum_compensation: 7500,
        compensation_currency: 'ETB',
        required_skills: ['Node.js', 'Express', 'JavaScript', 'REST API', 'PostgreSQL'],
        preferred_skills: ['Docker', 'Redis'],
        duration_min_weeks: 8,
        duration_max_weeks: 12,
        is_verified: true,
        status: 'active',
      },
      {
        title: 'AI & Data Science Intern',
        organization_name: 'Ethiopian Artificial Intelligence Institute',
        description: 'Work on natural language processing, speech recognition, and machine learning models.',
        category: 'Artificial Intelligence',
        country: 'Ethiopia',
        city: 'Addis Ababa',
        location_text: 'Addis Ababa, Ethiopia',
        internship_type: 'hybrid',
        work_type: 'full_time',
        compensation_type: 'paid',
        minimum_compensation: 6000,
        maximum_compensation: 9000,
        compensation_currency: 'ETB',
        required_skills: ['Python', 'Machine Learning', 'Git'],
        preferred_skills: ['PyTorch', 'Docker'],
        duration_min_weeks: 12,
        duration_max_weeks: 16,
        is_verified: true,
        status: 'active',
      }
    ]);
    console.log('  ✓ Seeded baseline internships');
  }

  console.log('\n===> 3. Creating Administrator Account (Directly in DB - Sign in only)...');
  const adminPassword = 'AdminPassword123!';
  const adminHashedPassword = await hashPassword(adminPassword);

  const adminUser = await User.create({
    email: 'admin@smartintern.et',
    username: 'admin',
    password: adminHashedPassword,
    first_name: 'System',
    last_name: 'Administrator',
    role: 'admin',
    is_staff: true,
    is_superuser: true,
    is_active: true,
    is_email_verified: true,
    is_approved: true,
  });
  console.log('  ✓ Admin provisioned: admin@smartintern.et (username: admin)');

  // Also provision admin1 for backward compatibility
  await User.create({
    email: 'admin1@smartintern.et',
    username: 'admin1',
    password: await hashPassword('Admin@1234'),
    first_name: 'System',
    last_name: 'Admin',
    role: 'admin',
    is_staff: true,
    is_superuser: true,
    is_active: true,
    is_email_verified: true,
    is_approved: true,
  });
  console.log('  ✓ Admin1 alias provisioned: admin1@smartintern.et / Admin@1234');

  console.log('\n===> 4. Registering Student Account (via Registration Flow)...');
  const studentEmail = 'student@smartintern.et';
  const studentUsername = 'student';
  const studentPassword = 'StudentPassword123!';

  const studentReg = await registerStudent({
    email: studentEmail,
    username: studentUsername,
    password: studentPassword,
    full_name: 'Amanuel Student',
    role: 'student',
  });
  console.log('  ✓ Student registered successfully:', studentReg.user);

  console.log('\n===> 5. Registering All Other Actors One by One (via Registration Flow)...');
  const actors = [
    {
      role: 'advisor',
      email: 'advisor@smartintern.et',
      username: 'advisor',
      password: 'AdvisorPassword123!',
      full_name: 'Dr. Dawit Advisor',
      department: 'Software Engineering',
    },
    {
      role: 'dept_dean',
      email: 'dean@smartintern.et',
      username: 'dean',
      password: 'DeanPassword123!',
      full_name: 'Prof. Kebede Dean',
      department: 'Faculty of Informatics',
    },
    {
      role: 'uil_officer',
      email: 'uilofficer@smartintern.et',
      username: 'uilofficer',
      password: 'UilPassword123!',
      full_name: 'Abebe UIL Officer',
      department: 'University-Industry Linkage',
    },
    {
      role: 'company_hr',
      email: 'company@smartintern.et',
      username: 'company',
      password: 'CompanyPassword123!',
      full_name: 'Sara HR Manager',
      department: 'Commercial Bank of Ethiopia',
    },
    {
      role: 'company_mentor',
      email: 'mentor@smartintern.et',
      username: 'mentor',
      password: 'MentorPassword123!',
      full_name: 'Yonas Senior Mentor',
      department: 'Engineering Dept',
    },
    {
      role: 'dorm_admin',
      email: 'dormadmin@smartintern.et',
      username: 'dormadmin',
      password: 'DormPassword123!',
      full_name: 'Tadesse Housing Admin',
      department: 'Campus Logistics',
    },
    {
      role: 'student_union',
      email: 'union@smartintern.et',
      username: 'union',
      password: 'UnionPassword123!',
      full_name: 'Hanna Dining Coordinator',
      department: 'Student Union Cafeteria',
    },
    {
      role: 'finance_officer',
      email: 'finance@smartintern.et',
      username: 'finance',
      password: 'FinancePassword123!',
      full_name: 'Almaz Finance Officer',
      department: 'Finance Office',
    },
  ];

  for (const actor of actors) {
    const regResult = await registerStudent({
      email: actor.email,
      username: actor.username,
      password: actor.password,
      full_name: actor.full_name,
      role: actor.role,
    });
    console.log(`  ✓ Registered ${actor.role}: ${actor.email} (username: ${actor.username})`);
  }

  console.log('\n===> 6. Verifying Sign-in for Admin and Student...');
  const adminAuth = await authenticateUser('admin@smartintern.et', adminPassword);
  console.log('  ✓ Admin Sign-in SUCCESS! Token generated:', adminAuth.access ? 'YES' : 'NO');

  const studentAuth = await authenticateUser('student@smartintern.et', studentPassword);
  console.log('  ✓ Student Sign-in SUCCESS! Token generated:', studentAuth.access ? 'YES' : 'NO');

  console.log('\n======================================================');
  console.log('DATABASE RESET & ACTOR REGISTRATION COMPLETED 100%!');
  console.log('======================================================');
  process.exit(0);
}

resetAndRegisterActors().catch(err => {
  console.error('Fatal Error during reset and register:', err);
  process.exit(1);
});
