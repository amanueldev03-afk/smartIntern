"""
Production PostgreSQL Backup and Disaster Recovery Service.

Implements automated, compressed pg_dump exports, SHA-256 integrity hashing,
S3-compatible cloud storage uploads, retention management, and full recovery routines.
"""

from datetime import datetime, timezone, timedelta
import hashlib
import logging
import os
from pathlib import Path
import subprocess
import sys
from typing import Any, Dict, List, Optional
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from django.conf import settings

logger = logging.getLogger(__name__)


class DatabaseBackupError(Exception):
    """Base exception for backup and disaster recovery operations."""
    pass


class DatabaseBackupService:
    """
    Manages PostgreSQL database dumps, verification, cloud storage sync,
    retention policies, and disaster recovery restorations.
    """

    def __init__(
        self,
        db_name: Optional[str] = None,
        db_user: Optional[str] = None,
        db_password: Optional[str] = None,
        db_host: Optional[str] = None,
        db_port: Optional[str] = None,
        s3_bucket: Optional[str] = None,
        s3_prefix: Optional[str] = None,
        s3_endpoint: Optional[str] = None,
        s3_access_key: Optional[str] = None,
        s3_secret_key: Optional[str] = None,
        s3_region: Optional[str] = None,
    ):
        # Database connection parameters
        db_cfg = getattr(settings, "DATABASES", {}).get("default", {})
        self.db_name = db_name or db_cfg.get("NAME") or os.getenv("POSTGRES_DB", "ai_internship")
        self.db_user = db_user or db_cfg.get("USER") or os.getenv("POSTGRES_USER", "ai_user")
        self.db_password = db_password or db_cfg.get("PASSWORD") or os.getenv("POSTGRES_PASSWORD", "")
        self.db_host = db_host or db_cfg.get("HOST") or os.getenv("POSTGRES_HOST", "db")
        self.db_port = str(db_port or db_cfg.get("PORT") or os.getenv("POSTGRES_PORT", "5432"))

        # Cloud storage parameters
        self.s3_bucket = (
            s3_bucket
            or getattr(settings, "BACKUP_S3_BUCKET_NAME", None)
            or getattr(settings, "AWS_STORAGE_BUCKET_NAME", None)
            or os.getenv("BACKUP_S3_BUCKET_NAME")
            or os.getenv("AWS_STORAGE_BUCKET_NAME", "ai-internship-backups")
        )
        self.s3_prefix = s3_prefix or os.getenv("BACKUP_S3_PREFIX", "backups/postgresql/")
        if not self.s3_prefix.endswith("/"):
            self.s3_prefix += "/"

        self.s3_endpoint = s3_endpoint or getattr(settings, "AWS_S3_ENDPOINT_URL", None) or os.getenv("AWS_S3_ENDPOINT_URL")
        self.s3_access_key = s3_access_key or getattr(settings, "AWS_ACCESS_KEY_ID", None) or os.getenv("AWS_ACCESS_KEY_ID")
        self.s3_secret_key = s3_secret_key or getattr(settings, "AWS_SECRET_ACCESS_KEY", None) or os.getenv("AWS_SECRET_ACCESS_KEY")
        self.s3_region = s3_region or getattr(settings, "AWS_S3_REGION_NAME", None) or os.getenv("AWS_S3_REGION_NAME", "us-east-1")

    def _get_s3_client(self):
        """Constructs an authenticated boto3 S3 client."""
        client_kwargs = {
            "region_name": self.s3_region,
        }
        if self.s3_endpoint:
            client_kwargs["endpoint_url"] = self.s3_endpoint
        if self.s3_access_key and self.s3_secret_key:
            client_kwargs["aws_access_key_id"] = self.s3_access_key
            client_kwargs["aws_secret_access_key"] = self.s3_secret_key

        return boto3.client("s3", **client_kwargs)

    @staticmethod
    def compute_sha256(filepath: Path) -> str:
        """Computes the SHA-256 checksum of a file."""
        sha256_hash = hashlib.sha256()
        with open(filepath, "rb") as f:
            for byte_block in iter(lambda: f.read(65536), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    def validate_dump_file(self, filepath: Path) -> bool:
        """Validates that a dump file exists, is non-empty, and can be read by pg_restore."""
        if not filepath.exists() or filepath.stat().st_size == 0:
            raise DatabaseBackupError(f"Backup validation failed: file {filepath} is missing or empty.")

        # Validate structure with pg_restore --list
        cmd = ["pg_restore", "--list", str(filepath)]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode != 0:
            raise DatabaseBackupError(
                f"Backup validation failed: pg_restore --list returned code {res.returncode}. Error: {res.stderr}"
            )
        return True

    def create_backup(
        self,
        output_dir: Path = Path("/tmp/backups"),
        upload: bool = True,
        retention_days: int = 30,
        now: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Executes pg_dump in custom compressed format (-Fc), computes SHA-256,
        verifies dump readability, uploads to S3, and enforces retention.
        """
        now = now or datetime.now(timezone.utc)
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        timestamp_str = now.strftime("%Y-%m-%d-%H%M%S")
        filename = f"{self.db_name}-{timestamp_str}.dump"
        local_dump_path = output_dir / filename
        local_sha_path = output_dir / f"{filename}.sha256"

        logger.info(
            "Starting PostgreSQL backup: target_db=%s, host=%s, port=%s",
            self.db_name,
            self.db_host,
            self.db_port,
        )

        # Build pg_dump command
        env = os.environ.copy()
        if self.db_password:
            env["PGPASSWORD"] = self.db_password

        cmd = [
            "pg_dump",
            "-h", self.db_host,
            "-p", self.db_port,
            "-U", self.db_user,
            "-d", self.db_name,
            "-Fc",  # Custom compressed format
            "-f", str(local_dump_path),
        ]

        t0 = datetime.now(timezone.utc)
        res = subprocess.run(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        t_dump = (datetime.now(timezone.utc) - t0).total_seconds()

        if res.returncode != 0:
            logger.error("PG_DUMP FAILED with exit code %d: %s", res.returncode, res.stderr)
            if local_dump_path.exists():
                local_dump_path.unlink()
            raise DatabaseBackupError(f"PG_DUMP FAILED: {res.stderr.strip()}")

        # Validate dump
        self.validate_dump_file(local_dump_path)
        dump_size = local_dump_path.stat().st_size
        checksum = self.compute_sha256(local_dump_path)

        # Write checksum file
        local_sha_path.write_text(f"{checksum}  {filename}\n")

        logger.info(
            "pg_dump completed: size=%d bytes (%.2f KB), checksum=%s, duration=%.2fs",
            dump_size,
            dump_size / 1024.0,
            checksum,
            t_dump,
        )

        s3_key = None
        s3_sha_key = None
        t_upload = 0.0

        if upload:
            s3_client = self._get_s3_client()
            date_prefix = now.strftime("%Y/%m/%d")
            s3_key = f"{self.s3_prefix}{date_prefix}/{filename}"
            s3_sha_key = f"{s3_key}.sha256"

            logger.info("Uploading backup to S3: bucket=%s, key=%s", self.s3_bucket, s3_key)
            t_u0 = datetime.now(timezone.utc)
            try:
                # Upload dump file
                with open(local_dump_path, "rb") as f:
                    s3_client.put_object(
                        Bucket=self.s3_bucket,
                        Key=s3_key,
                        Body=f,
                        ContentType="application/octet-stream",
                        Metadata={"sha256": checksum, "db": self.db_name},
                    )

                # Upload checksum file
                with open(local_sha_path, "rb") as f:
                    s3_client.put_object(
                        Bucket=self.s3_bucket,
                        Key=s3_sha_key,
                        Body=f,
                        ContentType="text/plain",
                    )

                # Verify object exists in cloud
                head = s3_client.head_object(Bucket=self.s3_bucket, Key=s3_key)
                if head.get("ContentLength") != dump_size:
                    raise DatabaseBackupError(
                        f"Cloud object verification failed: expected {dump_size} bytes, got {head.get('ContentLength')}"
                    )

                t_upload = (datetime.now(timezone.utc) - t_u0).total_seconds()
                logger.info("Cloud upload and verification successful in %.2fs", t_upload)

                # Local cleanup after verified upload
                local_dump_path.unlink(missing_ok=True)
                local_sha_path.unlink(missing_ok=True)
                logger.info("Local temporary files removed.")

                # Enforce retention policy
                self.enforce_retention(s3_client=s3_client, retention_days=retention_days)

            except Exception as e:
                logger.error("S3 UPLOAD FAILED: %s", e)
                raise DatabaseBackupError(f"S3 UPLOAD FAILED: {str(e)}") from e

        return {
            "status": "success",
            "database": self.db_name,
            "filename": filename,
            "local_path": str(local_dump_path) if not upload else None,
            "s3_bucket": self.s3_bucket if upload else None,
            "s3_key": s3_key,
            "size_bytes": dump_size,
            "checksum": checksum,
            "dump_duration_seconds": t_dump,
            "upload_duration_seconds": t_upload,
            "timestamp": now.isoformat(),
        }

    def enforce_retention(self, s3_client=None, retention_days: int = 30) -> int:
        """
        Deletes backups in S3 older than retention_days, ensuring at least one
        backup is preserved.
        """
        if retention_days <= 0:
            return 0

        s3_client = s3_client or self._get_s3_client()
        cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)

        try:
            paginator = s3_client.get_paginator("list_objects_v2")
            pages = paginator.paginate(Bucket=self.s3_bucket, Prefix=self.s3_prefix)

            all_dumps = []
            for page in pages:
                for obj in page.get("Contents", []):
                    key = obj["Key"]
                    if key.endswith(".dump"):
                        all_dumps.append((key, obj["LastModified"]))

            # Sort ascending by modified time
            all_dumps.sort(key=lambda x: x[1])

            # If 1 or 0 dumps exist, preserve them
            if len(all_dumps) <= 1:
                return 0

            deleted_count = 0
            for key, last_modified in all_dumps[:-1]:  # Never delete newest dump
                if last_modified < cutoff:
                    logger.info("Retention: deleting expired backup %s (date=%s)", key, last_modified)
                    s3_client.delete_object(Bucket=self.s3_bucket, Key=key)
                    s3_client.delete_object(Bucket=self.s3_bucket, Key=f"{key}.sha256")
                    deleted_count += 1

            return deleted_count
        except Exception as err:
            logger.warning("Retention cleanup encountered an error: %s", err)
            return 0

    def restore_backup(
        self,
        s3_key: Optional[str] = None,
        local_dump_path: Optional[Path] = None,
        target_db: str = "ai_internship_recovery",
        target_host: Optional[str] = None,
        target_port: Optional[str] = None,
        target_user: Optional[str] = None,
        target_password: Optional[str] = None,
        allow_production_overwrite: bool = False,
    ) -> Dict[str, Any]:
        """
        Downloads a backup from S3 (or uses local dump), verifies it, and restores
        into the isolated target database using pg_restore.
        """
        target_host = target_host or self.db_host
        target_port = str(target_port or self.db_port)
        target_user = target_user or self.db_user
        target_password = target_password or self.db_password

        # Protection: do not restore over current production DB without explicit override
        if target_db == self.db_name and not allow_production_overwrite:
            raise DatabaseBackupError(
                f"SAFETY BLOCK: Target database '{target_db}' is the active production database. "
                "Use a separate recovery database name (e.g. 'ai_internship_recovery') or explicitly allow overwrite."
            )

        temp_download = False
        t0 = datetime.now(timezone.utc)

        if s3_key:
            s3_client = self._get_s3_client()
            local_dump_path = Path("/tmp/backups") / Path(s3_key).name
            local_dump_path.parent.mkdir(parents=True, exist_ok=True)
            temp_download = True

            logger.info("Downloading backup from S3: bucket=%s, key=%s", self.s3_bucket, s3_key)
            with open(local_dump_path, "wb") as f:
                s3_client.download_fileobj(self.s3_bucket, s3_key, f)
            t_download = (datetime.now(timezone.utc) - t0).total_seconds()
            logger.info("Download completed in %.2fs", t_download)
        else:
            t_download = 0.0
            if not local_dump_path or not Path(local_dump_path).exists():
                raise DatabaseBackupError("No valid S3 key or local dump path provided for restore.")
            local_dump_path = Path(local_dump_path)

        # Validate downloaded dump
        self.validate_dump_file(local_dump_path)

        # Ensure target database exists
        env = os.environ.copy()
        if target_password:
            env["PGPASSWORD"] = target_password

        logger.info("Preparing target recovery database '%s' on %s:%s...", target_db, target_host, target_port)
        create_db_cmd = [
            "psql",
            "-h", target_host,
            "-p", target_port,
            "-U", target_user,
            "-d", "postgres",
            "-c", f"CREATE DATABASE \"{target_db}\" TEMPLATE template1;",
        ]
        # Run create database (might already exist, so ignore duplicate error)
        subprocess.run(create_db_cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        # Execute pg_restore
        logger.info("Restoring dump into database '%s'...", target_db)
        restore_cmd = [
            "pg_restore",
            "-h", target_host,
            "-p", target_port,
            "-U", target_user,
            "-d", target_db,
            "--no-owner",
            "--no-privileges",
            str(local_dump_path),
        ]

        t_r0 = datetime.now(timezone.utc)
        res = subprocess.run(restore_cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        t_restore = (datetime.now(timezone.utc) - t_r0).total_seconds()

        # pg_restore exit codes: 0 = success, 1 = success with warnings, >1 = fatal error
        if res.returncode > 1:
            logger.error("RESTORE FAILED with exit code %d: %s", res.returncode, res.stderr)
            if temp_download and local_dump_path.exists():
                local_dump_path.unlink()
            raise DatabaseBackupError(f"RESTORE FAILED: {res.stderr.strip()}")

        # Clean up temporary download file
        if temp_download and local_dump_path.exists():
            local_dump_path.unlink()

        # Query relation count from restored database
        count_cmd = [
            "psql",
            "-h", target_host,
            "-p", target_port,
            "-U", target_user,
            "-d", target_db,
            "-t",
            "-c", "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';",
        ]
        count_res = subprocess.run(count_cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        table_count = int(count_res.stdout.strip()) if count_res.returncode == 0 and count_res.stdout.strip().isdigit() else 0

        logger.info("Restore successful: %d public tables restored into '%s' in %.2fs", table_count, target_db, t_restore)

        return {
            "status": "success",
            "target_database": target_db,
            "tables_restored": table_count,
            "download_duration_seconds": t_download,
            "restore_duration_seconds": t_restore,
            "total_duration_seconds": (datetime.now(timezone.utc) - t0).total_seconds(),
        }
