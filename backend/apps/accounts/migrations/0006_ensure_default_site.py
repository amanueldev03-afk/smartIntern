from django.db import migrations


def create_default_site(apps, schema_editor):
    Site = apps.get_model("sites", "Site")
    Site.objects.get_or_create(
        id=1,
        defaults={
            "domain": "onrender.com",
            "name": "AI Internship Platform",
        },
    )


def reverse_default_site(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_user_profile_photo"),
        ("sites", "0002_alter_domain_unique"),
    ]

    operations = [
        migrations.RunPython(create_default_site, reverse_default_site),
    ]
