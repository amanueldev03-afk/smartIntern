"""
Unit tests for production Gunicorn configuration (gunicorn.conf.py).
"""

import importlib.util
import os
import unittest
from unittest.mock import patch


def _load_gunicorn_conf(env_overrides=None):
    """Dynamically loads backend/gunicorn.conf.py with given env overrides."""
    conf_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "gunicorn.conf.py")
    )
    with patch.dict(os.environ, env_overrides or {}, clear=False):
        spec = importlib.util.spec_from_file_location("gunicorn_conf_test", conf_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod


class GunicornConfigTestCase(unittest.TestCase):
    """Tests for gunicorn.conf.py."""

    def test_default_configuration_values(self):
        """Test default values without specific Gunicorn overrides."""
        clean_env = {
            "GUNICORN_WORKERS": "",
            "GUNICORN_DYNAMIC_WORKERS": "false",
            "GUNICORN_BIND": "0.0.0.0:8000",
            "GUNICORN_WORKER_CLASS": "sync",
            "GUNICORN_TIMEOUT": "120",
        }
        mod = _load_gunicorn_conf(clean_env)
        self.assertEqual(mod.bind, "0.0.0.0:8000")
        self.assertEqual(mod.workers, 4)
        self.assertEqual(mod.worker_class, "sync")
        self.assertEqual(mod.timeout, 120)
        self.assertEqual(mod.graceful_timeout, 30)
        self.assertEqual(mod.keepalive, 5)
        self.assertEqual(mod.max_requests, 1000)
        self.assertEqual(mod.max_requests_jitter, 50)
        self.assertEqual(mod.accesslog, "-")
        self.assertEqual(mod.errorlog, "-")
        self.assertTrue(mod.capture_output)

    def test_custom_environment_overrides(self):
        """Test custom environment variables are properly picked up."""
        custom_env = {
            "GUNICORN_BIND": "127.0.0.1:9000",
            "GUNICORN_WORKERS": "6",
            "GUNICORN_WORKER_CLASS": "gthread",
            "GUNICORN_TIMEOUT": "180",
            "GUNICORN_GRACEFUL_TIMEOUT": "45",
            "GUNICORN_KEEPALIVE": "10",
            "GUNICORN_MAX_REQUESTS": "2000",
            "GUNICORN_MAX_REQUESTS_JITTER": "100",
            "GUNICORN_LOG_LEVEL": "debug",
        }
        mod = _load_gunicorn_conf(custom_env)
        self.assertEqual(mod.bind, "127.0.0.1:9000")
        self.assertEqual(mod.workers, 6)
        self.assertEqual(mod.worker_class, "gthread")
        self.assertEqual(mod.timeout, 180)
        self.assertEqual(mod.graceful_timeout, 45)
        self.assertEqual(mod.keepalive, 10)
        self.assertEqual(mod.max_requests, 2000)
        self.assertEqual(mod.max_requests_jitter, 100)
        self.assertEqual(mod.loglevel, "debug")

    def test_invalid_worker_count_raises_error(self):
        """Negative or zero worker count must fail fast."""
        with self.assertRaises(ValueError):
            _load_gunicorn_conf({"GUNICORN_WORKERS": "0"})
        with self.assertRaises(ValueError):
            _load_gunicorn_conf({"GUNICORN_WORKERS": "-3"})
        with self.assertRaises(ValueError):
            _load_gunicorn_conf({"GUNICORN_WORKERS": "abc"})

    def test_invalid_timeout_raises_error(self):
        """Negative or zero timeout must fail fast."""
        with self.assertRaises(ValueError):
            _load_gunicorn_conf({"GUNICORN_TIMEOUT": "0"})
        with self.assertRaises(ValueError):
            _load_gunicorn_conf({"GUNICORN_TIMEOUT": "-10"})

    def test_invalid_worker_class_raises_error(self):
        """Unsupported worker class must fail fast."""
        with self.assertRaises(ValueError):
            _load_gunicorn_conf({"GUNICORN_WORKER_CLASS": "unsupported_class"})

    def test_invalid_log_level_raises_error(self):
        """Invalid log level must fail fast."""
        with self.assertRaises(ValueError):
            _load_gunicorn_conf({"GUNICORN_LOG_LEVEL": "superverbose"})
