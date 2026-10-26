"""
Django management command to restore a PostgreSQL database backup.

Usage:
    python manage.py restore_database --backup-key <key> --target-db ai_internship_recovery
    python manage.py restore_database --local-file /path/to/dump --target-db ai_internship_recovery
"""

from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from apps.administration.backup_service import DatabaseBackupService, DatabaseBackupError


class Command(BaseCommand):
    help = "Restores a PostgreSQL database dump from S3 or a local file into a target database."

    def add_arguments(self, parser):
        parser.add_argument(
            "--backup-key",
            type=str,
            help="S3 object key of the database dump to restore.",
        )
        parser.add_argument(
            "--local-file",
            type=str,
            help="Path to local database dump file.",
        )
        parser.add_argument(
            "--target-db",
            type=str,
            default="ai_internship_recovery",
            help="Target database name (default: ai_internship_recovery).",
        )
        parser.add_argument(
            "--target-host",
            type=str,
            help="Target database host.",
        )
        parser.add_argument(
            "--target-port",
            type=str,
            help="Target database port.",
        )
        parser.add_argument(
            "--allow-production-overwrite",
            action="store_true",
            help="Explicitly permit restoring over active production database.",
        )

    def handle(self, *args, **options):
        backup_key = options.get("backup_key")
        local_file = options.get("local_file")
        target_db = options.get("target_db")
        target_host = options.get("target_host")
        target_port = options.get("target_port")
        allow_overwrite = options.get("allow_production_overwrite", False)

        if not backup_key and not local_file:
            raise CommandError("Either --backup-key or --local-file must be provided.")

        self.stdout.write(self.style.NOTICE(f"==> Restoring database to '{target_db}'..."))

        try:
            service = DatabaseBackupService()
            result = service.restore_backup(
                s3_key=backup_key,
                local_dump_path=Path(local_file) if local_file else None,
                target_db=target_db,
                target_host=target_host,
                target_port=target_port,
                allow_production_overwrite=allow_overwrite,
            )

            self.stdout.write(self.style.SUCCESS("==> Database Restored Successfully!"))
            self.stdout.write(f"Target Database:  {result['target_database']}")
            self.stdout.write(f"Tables Restored:  {result['tables_restored']}")
            self.stdout.write(f"Download Time:    {result['download_duration_seconds']:.2f}s")
            self.stdout.write(f"Restore Time:     {result['restore_duration_seconds']:.2f}s")
            self.stdout.write(f"Total Time:       {result['total_duration_seconds']:.2f}s")

        except DatabaseBackupError as err:
            raise CommandError(f"Database restore failed: {err}")
