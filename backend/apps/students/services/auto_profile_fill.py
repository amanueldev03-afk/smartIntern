"""
Auto-fill student profile from CV extraction data.

When a CV is processed, automatically populate profile fields with extracted data:
- Skills: Match extracted skills to catalogue
- Education: Extract degree, field of study, university
- Experience: Extract work history
- Location: Extract location info
"""

from apps.students.models import StudentProfile, Skill, CareerInterest
from apps.students.services.profile_completion import compute_profile_completion


def auto_fill_profile_from_cv(profile, cv_data):
    """
    Automatically populate profile fields from CV extraction data.
    
    Args:
        profile: StudentProfile instance
        cv_data: Dict with extracted CV data (extracted_skills, extracted_education, etc.)
    
    Returns:
        Dict with updated fields count and status
    """
    updated_fields = []
    
    # 1. Auto-fill skills from CV
    if cv_data.get('extracted_skills'):
        extracted_skill_names = [s.lower() for s in cv_data['extracted_skills']]
        
        # Match to catalogue skills
        catalogue_skills = Skill.objects.filter(is_active=True)
        matched_skills = []
        
        for skill in catalogue_skills:
            if skill.name.lower() in extracted_skill_names:
                matched_skills.append(skill)
        
        if matched_skills:
            profile.skills.set(matched_skills)
            updated_fields.append(f'skills ({len(matched_skills)} matched)')
    
    # 2. Auto-fill education from CV
    if cv_data.get('extracted_education'):
        education = cv_data['extracted_education'][0] if cv_data['extracted_education'] else {}
        
        # Map degree to education_level
        degree = education.get('degree', '').lower()
        if 'phd' in degree or 'doctor' in degree:
            profile.education_level = 'phd'
        elif 'master' in degree or 'm.s' in degree or 'mba' in degree:
            profile.education_level = 'master'
        elif 'bachelor' in degree or 'b.s' in degree or 'ba' in degree:
            profile.education_level = 'bachelor'
        elif 'diploma' in degree:
            profile.education_level = 'diploma'
        
        # Extract field of study
        field_of_study = education.get('field_of_study')
        if field_of_study and not profile.field_of_study:
            profile.field_of_study = field_of_study
            updated_fields.append('field_of_study')
        
        # Extract university
        institution = education.get('institution')
        if institution and not profile.university:
            profile.university = institution
            updated_fields.append('university')
    
    # 3. Auto-fill bio from experience
    if cv_data.get('extracted_experience'):
        experiences = cv_data['extracted_experience']
        if experiences and not profile.bio:
            # Create a brief bio from first experience
            first_exp = experiences[0]
            role = first_exp.get('role', '')
            company = first_exp.get('company', '')
            if role and company:
                profile.bio = f"Experienced {role} at {company}."
                updated_fields.append('bio')
    
    profile.save()
    
    # Check if profile is now 100% complete
    completion = compute_profile_completion(profile)
    
    return {
        'updated_fields': updated_fields,
        'completion_percent': completion['percent'],
        'is_complete': completion['percent'] == 100
    }
