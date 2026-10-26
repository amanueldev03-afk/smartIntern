"""
Django management command to execute a PostgreSQL database backup.

Usage:
    python manage.py backup_database [--no-upload] [--retention-days 30] [--output-dir /tmp/backups]
"""

from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from apps.administration.backup_service import DatabaseBackupService, DatabaseBackupError


class Command(BaseCommand):
    help = "Dumps PostgreSQL database, computes SHA256 checksum, and optionally uploads to S3."

    def add_arguments(self, parser):
        parser.add_argument(
            "--no-upload",
            action="store_true",
            help="Do not upload to S3; retain local dump file.",
        )
        parser.add_argument(
            "--retention-days",
            type=int,
            default=30,
            help="Number of days of daily backups to retain in S3 (default: 30).",
        )
        parser.add_argument(
            "--output-dir",
            type=str,
            default="/tmp/backups",
            help="Local temporary directory for dump files.",
        )

    def handle(self, *args, **options):
        upload = not options["no_upload"]
        retention_days = options["retention_days"]
        output_dir = Path(options["output_dir"])

        self.stdout.write(self.style.NOTICE("==> Starting PostgreSQL Database Backup..."))

        try:
            service = DatabaseBackupService()
            result = service.create_backup(
                output_dir=output_dir,
                upload=upload,
                retention_days=retention_days,
            )

            self.stdout.write(self.style.SUCCESS(f"==> Database Backup Completed Successfully!"))
            self.stdout.write(f"Database:   {result['database']}")
            self.stdout.write(f"Filename:   {result['filename']}")
            self.stdout.write(f"Size:       {result['size_bytes']} bytes ({result['size_bytes']/1024:.2f} KB)")
            self.stdout.write(f"SHA-256:    {result['checksum']}")
            self.stdout.write(f"Dump Time:  {result['dump_duration_seconds']:.2f}s")
            if upload:
                self.stdout.write(f"S3 Bucket:  {result['s3_bucket']}")
                self.stdout.write(f"S3 Key:     {result['s3_key']}")
                self.stdout.write(f"Upload Time:{result['upload_duration_seconds']:.2f}s")
            else:
                self.stdout.write(f"Local File: {result['local_path']}")

        except DatabaseBackupError as err:
            raise CommandError(f"Database backup failed: {err}")
