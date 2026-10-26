from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('student_profiles', '0022_cv_extracted_languages'),
    ]

    operations = [
        migrations.AddField(
            model_name="studentprofile",
            name="availability_immediately",
            field=models.BooleanField(
                default=False,
                help_text="True if the student is available for an internship immediately.",
            ),
        ),
    ]