# Migration to ensure pgvector extension is enabled on PostgreSQL

from django.db import migrations


def enable_pgvector(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        with schema_editor.connection.cursor() as cursor:
            cursor.execute("CREATE EXTENSION IF NOT EXISTS vector;")


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.RunPython(enable_pgvector, reverse_code=migrations.RunPython.noop),
    ]
