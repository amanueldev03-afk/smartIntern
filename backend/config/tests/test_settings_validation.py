"""
Unit tests for production settings validation.
"""

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase
from config.settings.validators import validate_production_settings


class ProductionSettingsValidationTestCase(SimpleTestCase):
    """Test suite verifying fail-fast validation of production configuration."""

    def _get_valid_settings(self):
        return {
            "SECRET_KEY": "k8#9vP!xQ2mZ$7wL@5jN&3rT*1yU(4eB)6vC+8mK~0zX^2qW=4sA",
            "DEBUG": False,
            "ALLOWED_HOSTS": ["example.com", "localhost"],
            "DATABASES": {
                "default": {
                    "ENGINE": "django.db.backends.postgresql",
                    "NAME": "ai_internship",
                    "USER": "ai_user",
                    "PASSWORD": "secure_password",
                    "HOST": "db",
                    "PORT": 5432,
                }
            },
            "CACHES": {
                "default": {
                    "LOCATION": "redis://redis:6379/1",
                }
            },
            "CELERY_BROKER_URL": "redis://redis:6379/0",
            "STORAGE_BACKEND": "filesystem",
            "EMAIL_BACKEND": "django.core.mail.backends.console.EmailBackend",
        }

    def test_valid_production_settings_pass(self):
        settings = self._get_valid_settings()
        # Should not raise any exception
        validate_production_settings(settings)

    def test_missing_secret_key_raises_improperly_configured(self):
        settings = self._get_valid_settings()
        settings["SECRET_KEY"] = ""
        with self.assertRaises(ImproperlyConfigured) as ctx:
            validate_production_settings(settings)
        self.assertIn("SECRET_KEY is required", str(ctx.exception))

    def test_short_secret_key_raises_improperly_configured(self):
        settings = self._get_valid_settings()
        settings["SECRET_KEY"] = "too-short-key"
        with self.assertRaises(ImproperlyConfigured) as ctx:
            validate_production_settings(settings)
        self.assertIn("at least 32 characters", str(ctx.exception))

    def test_insecure_placeholder_secret_key_raises_improperly_configured(self):
        settings = self._get_valid_settings()
        settings["SECRET_KEY"] = "django-insecure-some-random-long-dummy-key-for-test"
        with self.assertRaises(ImproperlyConfigured) as ctx:
            validate_production_settings(settings)
        self.assertIn("insecure placeholder", str(ctx.exception))

    def test_debug_true_raises_improperly_configured(self):
        settings = self._get_valid_settings()
        settings["DEBUG"] = True
        with self.assertRaises(ImproperlyConfigured) as ctx:
            validate_production_settings(settings)
        self.assertIn("DEBUG must be set to False", str(ctx.exception))

    def test_empty_allowed_hosts_raises_improperly_configured(self):
        settings = self._get_valid_settings()
        settings["ALLOWED_HOSTS"] = []
        with self.assertRaises(ImproperlyConfigured) as ctx:
            validate_production_settings(settings)
        self.assertIn("ALLOWED_HOSTS must not be empty", str(ctx.exception))

    def test_missing_database_raises_improperly_configured(self):
        settings = self._get_valid_settings()
        settings["DATABASES"] = {}
        with self.assertRaises(ImproperlyConfigured) as ctx:
            validate_production_settings(settings)
        self.assertIn("DATABASES['default'] is required", str(ctx.exception))

    def test_missing_postgres_user_raises_improperly_configured(self):
        settings = self._get_valid_settings()
        settings["DATABASES"]["default"]["USER"] = ""
        with self.assertRaises(ImproperlyConfigured) as ctx:
            validate_production_settings(settings)
        self.assertIn("Database USER is required", str(ctx.exception))

    def test_missing_redis_cache_location_raises_improperly_configured(self):
        settings = self._get_valid_settings()
        settings["CACHES"]["default"]["LOCATION"] = ""
        with self.assertRaises(ImproperlyConfigured) as ctx:
            validate_production_settings(settings)
        self.assertIn("CACHES['default']['LOCATION']", str(ctx.exception))

    def test_s3_storage_missing_credentials_raises_improperly_configured(self):
        settings = self._get_valid_settings()
        settings["STORAGE_BACKEND"] = "s3"
        settings["AWS_ACCESS_KEY_ID"] = ""
        settings["AWS_SECRET_ACCESS_KEY"] = ""
        settings["AWS_STORAGE_BUCKET_NAME"] = ""
        with self.assertRaises(ImproperlyConfigured) as ctx:
            validate_production_settings(settings)
        self.assertIn("AWS_ACCESS_KEY_ID is required", str(ctx.exception))
        self.assertIn("AWS_SECRET_ACCESS_KEY is required", str(ctx.exception))
        self.assertIn("AWS_STORAGE_BUCKET_NAME is required", str(ctx.exception))

    def test_s3_storage_valid_credentials_passes(self):
        settings = self._get_valid_settings()
        settings["STORAGE_BACKEND"] = "s3"
        settings["AWS_ACCESS_KEY_ID"] = "test-access-key-id"
        settings["AWS_SECRET_ACCESS_KEY"] = "test-secret-access-key"
        settings["AWS_STORAGE_BUCKET_NAME"] = "my-test-bucket"
        validate_production_settings(settings)

    def test_smtp_email_missing_host_raises_improperly_configured(self):
        settings = self._get_valid_settings()
        settings["EMAIL_BACKEND"] = "django.core.mail.backends.smtp.EmailBackend"
        settings["EMAIL_HOST"] = ""
        with self.assertRaises(ImproperlyConfigured) as ctx:
            validate_production_settings(settings)
        self.assertIn("EMAIL_HOST is required", str(ctx.exception))
