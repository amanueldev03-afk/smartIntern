export const WEIGHTS = {
  semantic: 0.40,
  skills: 0.25,
  preference: 0.20,
  location: 0.10,
  salary: 0.05,
};

export const calculateSkillScore = (studentSkills = [], internshipSkills = [], internship = null) => {
  const student = new Set(studentSkills.map(s => String(s).toLowerCase().trim()).filter(Boolean));
  if (student.size === 0) return 0.1;

  const internshipList = (internshipSkills || []).map(s => String(s).toLowerCase().trim()).filter(Boolean);
  const matched = new Set();

  for (const s of student) {
    if (internshipList.includes(s)) {
      matched.add(s);
    }
  }

  if (internship) {
    const titleCat = `${internship.title || ''} ${internship.category || ''}`.toLowerCase();
    for (const s of student) {
      if (s.length >= 2 && titleCat.includes(s)) {
        matched.add(s);
      }
    }
  }

  if (internshipList.length === 0) {
    return matched.size > 0 ? Math.min(1.0, 0.2 + (matched.size * 0.3)) : 0.1;
  }

  const score = matched.size / internshipList.length;
  return Math.min(1.0, Math.max(0.0, score));
};

export const getMatchedSkills = (studentSkills = [], internshipSkills = [], internship = null) => {
  const sMap = new Map();
  studentSkills.forEach(s => {
    if (s) sMap.set(String(s).toLowerCase().trim(), String(s).trim());
  });

  const iList = (internshipSkills || []).map(s => String(s).toLowerCase().trim()).filter(Boolean);
  const matched = new Set();

  for (const [lowerKey, original] of sMap.entries()) {
    if (iList.includes(lowerKey)) {
      matched.add(original);
    }
  }

  if (internship) {
    const titleCat = `${internship.title || ''} ${internship.category || ''}`.toLowerCase();
    for (const [lowerKey, original] of sMap.entries()) {
      if (lowerKey.length >= 2 && titleCat.includes(lowerKey)) {
        matched.add(original);
      }
    }
  }

  return Array.from(matched);
};

export const calculateCosineSimilarity = (vec1, vec2) => {
  if (!vec1 || !vec2 || !Array.isArray(vec1) || !Array.isArray(vec2) || vec1.length === 0 || vec2.length === 0) {
    return 0.0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(vec1.length, vec2.length);
  for (let i = 0; i < len; i++) {
    dot += vec1[i] * vec2[i];
    normA += vec1[i] * vec1[i];
    normB += vec2[i] * vec2[i];
  }
  if (normA === 0 || normB === 0) return 0.0;
  return Math.max(0.0, Math.min(1.0, dot / (Math.sqrt(normA) * Math.sqrt(normB))));
};

export const calculateSemanticScore = (studentProfile, internship) => {
  // If vector embeddings exist
  if (studentProfile?.embedding && internship?.embedding) {
    return calculateCosineSimilarity(studentProfile.embedding, internship.embedding);
  }

  // Token-based Jaccard similarity fallback
  const studentText = [
    studentProfile?.bio || '',
    studentProfile?.field_of_study || '',
    ...(studentProfile?.preferred_roles || []),
  ].join(' ').toLowerCase();

  const internshipText = [
    internship?.title || '',
    internship?.description || '',
    internship?.category || '',
  ].join(' ').toLowerCase();

  const studentTokens = new Set(studentText.split(/\W+/).filter(w => w.length > 2));
  const internshipTokens = new Set(internshipText.split(/\W+/).filter(w => w.length > 2));

  if (studentTokens.size === 0 || internshipTokens.size === 0) return 0.5;

  let common = 0;
  for (const token of studentTokens) {
    if (internshipTokens.has(token)) common++;
  }

  const jaccard = common / (studentTokens.size + internshipTokens.size - common);
  return Math.min(1.0, Math.max(0.2, jaccard * 3));
};

export const calculateLocationScore = (internship, profile) => {
  if (!profile) return 0.5;
  if (profile.willing_to_relocate) return 1.0;
  if (internship.internship_type === 'remote') return 1.0;

  const profCity = (profile.city || '').toLowerCase().trim();
  const internCity = (internship.city || '').toLowerCase().trim();
  if (profCity && internCity && profCity === internCity) return 1.0;

  const preferredLocs = (profile.preferred_locations || []).map(l => String(l).toLowerCase().trim());
  if (preferredLocs.includes(internCity) || (internship.location_text && preferredLocs.some(l => internship.location_text.toLowerCase().includes(l)))) {
    return 0.75;
  }

  const profCountry = (profile.country || 'Ethiopia').toLowerCase().trim();
  const internCountry = (internship.country || 'Ethiopia').toLowerCase().trim();
  if (profCountry && internCountry && profCountry === internCountry) return 0.5;

  return 0.1;
};

export const calculateWorkModeScore = (internship, profile) => {
  if (!profile) return 0.5;
  const pref = (profile.work_type || 'either').toLowerCase();
  const actual = (internship.work_type || '').toLowerCase();
  if (pref === 'either' || !pref) return 1.0;
  return pref === actual ? 1.0 : 0.2;
};

export const calculateSalaryScore = (internship, profile) => {
  if (!profile) return 0.5;
  const pref = (profile.compensation_preference || 'either').toLowerCase();
  const actual = (internship.compensation_type || 'paid').toLowerCase();
  if (pref === 'either' || !pref) return 1.0;
  if (pref === 'paid' && actual === 'paid') return 1.0;
  if (pref === 'unpaid') return 1.0;
  if (pref === 'paid' && actual === 'stipend') return 0.7;
  return 0.2;
};

export const buildExplanation = (internship, profile, matchedSkills, scores) => {
  const bullets = [];

  if (matchedSkills && matchedSkills.length > 0) {
    const preview = matchedSkills.slice(0, 4).join(', ');
    bullets.push(`Matches ${matchedSkills.length} of your key skills: ${preview}.`);
  } else {
    bullets.push(`Aligns with your chosen specialization in ${internship.category || 'technology'}.`);
  }

  if (internship.internship_type === 'remote') {
    bullets.push('Remote flexibility aligns with your study schedule.');
  } else if (scores.location >= 0.75) {
    bullets.push(`Located in ${internship.city || 'your preferred city'}, matching your location preference.`);
  }

  if (scores.semantic >= 0.7) {
    bullets.push(`Strong curriculum relevance to your ${profile?.field_of_study || 'academic'} track.`);
  }

  if (internship.compensation_type === 'paid') {
    bullets.push('Offers verified financial compensation and structured mentorship.');
  }

  return bullets;
};

export const scoreInternship = (internship, profile, studentSkills = []) => {
  const skillScore = calculateSkillScore(studentSkills, internship.required_skills, internship);
  const semanticScore = calculateSemanticScore(profile, internship);
  const locationScore = calculateLocationScore(internship, profile);
  const workModeScore = calculateWorkModeScore(internship, profile);
  const salaryScore = calculateSalaryScore(internship, profile);

  const preferenceScore = (workModeScore + salaryScore) / 2;

  const rawScore = (
    (WEIGHTS.semantic * semanticScore) +
    (WEIGHTS.skills * skillScore) +
    (WEIGHTS.preference * preferenceScore) +
    (WEIGHTS.location * locationScore) +
    (WEIGHTS.salary * salaryScore)
  );

  const matchScore = Math.min(100, Math.max(10, Math.round(rawScore * 100)));
  const matchedSkills = getMatchedSkills(studentSkills, internship.required_skills, internship);

  const scoreBreakdown = {
    semantic_score: Math.round(semanticScore * 100),
    skill_score: Math.round(skillScore * 100),
    preference_score: Math.round(preferenceScore * 100),
    location_score: Math.round(locationScore * 100),
    salary_score: Math.round(salaryScore * 100),
    weights: {
      semantic: '40%',
      skills: '25%',
      preference: '20%',
      location: '10%',
      salary: '5%',
    }
  };

  const explanation = buildExplanation(internship, profile, matchedSkills, {
    skill: skillScore,
    semantic: semanticScore,
    location: locationScore,
  });

  return {
    internship,
    match_score: matchScore,
    score_breakdown: scoreBreakdown,
    explanation,
    matched_skills: matchedSkills,
  };
};
