export const computeProfileCompletion = async (profile, skillsCount = 0, interestsCount = 0) => {
  if (!profile) {
    return {
      percent: 0,
      sections: {
        personal: false,
        education: false,
        skills: false,
        interests: false,
        preferences: false,
        resume: false,
      }
    };
  }

  const truthy = (val) => {
    if (val === null || val === undefined) return false;
    if (typeof val === 'string') return val.trim().length > 0;
    if (Array.isArray(val)) return val.length > 0;
    return Boolean(val);
  };

  const personal = Boolean(
    truthy(profile.phone) ||
    truthy(profile.country) ||
    truthy(profile.city) ||
    truthy(profile.date_of_birth) ||
    truthy(profile.bio)
  );

  const education = Boolean(
    truthy(profile.education_level) ||
    truthy(profile.current_year) ||
    truthy(profile.field_of_study) ||
    truthy(profile.university)
  );

  let preferences = false;
  if (profile.work_type && profile.work_type !== 'either') preferences = true;
  if (profile.internship_type && profile.internship_type !== 'any') preferences = true;
  if (profile.compensation_preference && profile.compensation_preference !== 'either') preferences = true;
  if (truthy(profile.availability_start) || truthy(profile.availability_end)) preferences = true;
  if (truthy(profile.preferred_locations)) preferences = true;
  if (profile.willing_to_relocate) preferences = true;
  if (profile.minimum_compensation !== null || profile.maximum_compensation !== null) preferences = true;

  const hasSkills = skillsCount > 0;
  const hasInterests = interestsCount > 0;
  const hasResume = Boolean(profile.resume || profile.cv);

  const sections = {
    personal,
    education,
    skills: hasSkills,
    interests: hasInterests,
    preferences,
    resume: hasResume,
  };

  const filledCount = Object.values(sections).filter(Boolean).length;
  const percent = Math.round((filledCount * 100) / 6);

  return { percent, sections };
};
