# Generated migration for VectorField conversion

from django.db import migrations, models
import pgvector.django


class Migration(migrations.Migration):

    dependencies = [
        ('student_profiles', '0007_alter_studentprofile_embedding'),
        ('internships', '0009_alter_internship_embedding'),  # Ensure vector extension is created first
    ]

    operations = [
        # First, drop the JSONField column
        migrations.RemoveField(
            model_name='studentprofile',
            name='embedding',
        ),
        # Then, add the VectorField column
        migrations.AddField(
            model_name='studentprofile',
            name='embedding',
            field=pgvector.django.VectorField(dimensions=1536, null=True, blank=True),
        ),
    ]
