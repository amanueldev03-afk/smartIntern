from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('student_profiles', '0021_cv_extracted_experience_years'),
    ]

    operations = [
        migrations.AddField(
            model_name='cv',
            name='extracted_languages',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text=(
                    "Spoken languages extracted from the CV as a list of "
                    "{name, proficiency} objects. Populated by the CV analysis pipeline."
                ),
            ),
        ),
    ]