import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export const DEGREE_KEYWORDS = [
  'Bachelor of Science', 'Bachelor of Arts', 'Bachelor of Engineering', 'Bachelor of Technology',
  'Bachelor', 'B.Sc.', 'B.Sc', 'BSc', 'B.S.', 'B.E.', 'B.Tech',
  'Master of Science', 'Master of Arts', 'Master', 'M.Sc.', 'MSc', 'M.S.', 'M.Tech',
  'Ph.D.', 'PhD', 'Doctor of Philosophy', 'Diploma', 'Postgraduate Diploma'
];

export const FIELD_OF_STUDY_KEYWORDS = [
  'Software Engineering', 'Computer Science', 'Information Technology', 'Information Systems',
  'Computer Engineering', 'Electrical and Computer Engineering', 'Electrical Engineering',
  'Data Science', 'Artificial Intelligence', 'Cybersecurity', 'Network Engineering',
  'Civil Engineering', 'Mechanical Engineering', 'Biomedical Engineering'
];

export const ETHIOPIAN_UNIVERSITIES = [
  'Addis Ababa University', 'Addis Ababa Science and Technology University', 'AASTU',
  'Adama Science and Technology University', 'ASTU', 'Hawassa University', 'Bahir Dar University',
  'Jimma University', 'Mekelle University', 'University of Gondar', 'Gondar University',
  'Arba Minch University', 'Haramaya University', 'Dilla University', 'Wollo University',
  'Dire Dawa University', 'Debre Berhan University', 'Debre Markos University', 'Wolkite University',
  'Ambo University', 'Wachemo University', 'Kotebe Metropolitan University', "St. Mary's University",
  'Unity University', 'HilCoE School of Computer Science and Technology', 'HilCoE'
];

export const COMMON_SKILLS = [
  'Python', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'Express', 'Django', 'FastAPI',
  'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes', 'Git', 'GitHub',
  'Linux', 'AWS', 'Azure', 'GCP', 'HTML', 'CSS', 'Tailwind', 'Bootstrap', 'GraphQL', 'REST API',
  'Machine Learning', 'Deep Learning', 'PyTorch', 'TensorFlow', 'Java', 'C++', 'C#', 'Go', 'Rust'
];

export const validateResumeFile = (filePath, originalName = '') => {
  if (!fs.existsSync(filePath)) {
    throw new Error('File does not exist.');
  }

  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    throw new Error('Uploaded file is empty.');
  }
  if (stats.size > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds 5MB limit. Uploaded size: ${(stats.size / (1024 * 1024)).toFixed(2)}MB.`);
  }

  const ext = path.extname(originalName || filePath).toLowerCase();
  if (ext !== '.pdf' && ext !== '.docx') {
    throw new Error(`Unsupported file format. Only PDF (.pdf) and DOCX (.docx) documents are accepted.`);
  }

  // Sniff magic bytes
  const buffer = fs.readFileSync(filePath);
  if (ext === '.pdf') {
    const head = buffer.subarray(0, 1024).toString('binary');
    if (!head.includes('%PDF')) {
      throw new Error('Invalid PDF file content.');
    }
  } else if (ext === '.docx') {
    const head = buffer.subarray(0, 4).toString('binary');
    if (!head.startsWith('PK\x03\x04')) {
      throw new Error('Invalid DOCX file structure.');
    }
  }
};

export const extractTextFromFile = async (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const buffer = fs.readFileSync(filePath);

  if (ext === '.pdf') {
    const data = await pdfParse(buffer);
    return data.text || '';
  } else if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }
  return '';
};

export const extractCVData = (rawText) => {
  const text = rawText || '';

  // 1. Email extraction
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
  const emailMatch = text.match(emailRegex);
  const email = emailMatch ? emailMatch[1] : null;

  // 2. Phone extraction (international or Ethiopian)
  const phoneRegex = /(\+?251\s?[0-9]{2}\s?[0-9]{3}\s?[0-9]{4}|09[0-9]{8}|\+?[0-9]{10,14})/;
  const phoneMatch = text.match(phoneRegex);
  const phone = phoneMatch ? phoneMatch[1].replace(/\s+/g, '') : null;

  // 3. Degree keyword match
  let degree = null;
  for (const kw of DEGREE_KEYWORDS) {
    const regex = new RegExp(`\\b${kw.replace('.', '\\.')}\\b`, 'i');
    if (regex.test(text)) {
      degree = kw;
      break;
    }
  }

  // 4. Field of study match
  let fieldOfStudy = null;
  for (const field of FIELD_OF_STUDY_KEYWORDS) {
    const regex = new RegExp(`\\b${field}\\b`, 'i');
    if (regex.test(text)) {
      fieldOfStudy = field;
      break;
    }
  }

  // 5. University match
  let university = null;
  for (const uni of ETHIOPIAN_UNIVERSITIES) {
    const regex = new RegExp(`\\b${uni}\\b`, 'i');
    if (regex.test(text)) {
      university = uni;
      break;
    }
  }

  // 6. Skills extraction
  const lowerText = text.toLowerCase();
  const extractedSkills = [];
  for (const skill of COMMON_SKILLS) {
    const regex = new RegExp(`\\b${skill.toLowerCase().replace('.', '\\.')}\\b`, 'i');
    if (regex.test(lowerText)) {
      extractedSkills.push(skill);
    }
  }

  return {
    email,
    phone,
    degree,
    field_of_study: fieldOfStudy,
    university,
    extracted_skills: extractedSkills,
    extracted_education: university || degree ? [{
      institution: university || 'Higher Education Institution',
      degree: degree || 'Bachelor of Science',
      field_of_study: fieldOfStudy || 'Computer Science & Engineering',
    }] : [],
    extracted_experience: [],
    extracted_projects: [],
    extracted_certifications: [],
    extracted_languages: [{ name: 'English', proficiency: 'Fluent' }, { name: 'Amharic', proficiency: 'Native' }],
    has_cv: true,
    processing_status: 'COMPLETED',
  };
};
