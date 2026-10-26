"""
Production Gunicorn Configuration for AI Internship Platform.

This configuration file is loaded by Gunicorn during startup:
    gunicorn --config gunicorn.conf.py config.wsgi:application
"""

import multiprocessing
import os
import sys

# -----------------------------------------------------------------------------
# Configuration Helpers & Validation
# -----------------------------------------------------------------------------

def _get_positive_int(env_var: str, default: int) -> int:
    val = os.getenv(env_var)
    if val is None or val.strip() == "":
        return default
    try:
        ival = int(val)
        if ival <= 0:
            raise ValueError(f"Environment variable {env_var} must be > 0, got {ival}")
        return ival
    except ValueError as err:
        sys.stderr.write(f"[GUNICORN CONFIG ERROR] {err}\n")
        raise


def _get_non_negative_int(env_var: str, default: int) -> int:
    val = os.getenv(env_var)
    if val is None or val.strip() == "":
        return default
    try:
        ival = int(val)
        if ival < 0:
            raise ValueError(f"Environment variable {env_var} must be >= 0, got {ival}")
        return ival
    except ValueError as err:
        sys.stderr.write(f"[GUNICORN CONFIG ERROR] {err}\n")
        raise


VALID_WORKER_CLASSES = {"sync", "gthread", "gevent", "eventlet", "tornado"}
VALID_LOG_LEVELS = {"debug", "info", "warning", "error", "critical"}


def _get_worker_class() -> str:
    wc = os.getenv("GUNICORN_WORKER_CLASS", "sync").strip().lower()
    if wc not in VALID_WORKER_CLASSES:
        raise ValueError(
            f"Invalid GUNICORN_WORKER_CLASS '{wc}'. Must be one of: {', '.join(sorted(VALID_WORKER_CLASSES))}"
        )
    return wc


def _get_log_level() -> str:
    level = os.getenv("GUNICORN_LOG_LEVEL", os.getenv("LOG_LEVEL", "info")).strip().lower()
    if level not in VALID_LOG_LEVELS:
        raise ValueError(
            f"Invalid GUNICORN_LOG_LEVEL '{level}'. Must be one of: {', '.join(sorted(VALID_LOG_LEVELS))}"
        )
    return level


def _determine_workers() -> int:
    """
    Determines the worker count.
    Prioritizes GUNICORN_WORKERS env var if explicitly set.
    Otherwise, uses baseline 4 workers (which matches (2 * 1.5) + 1 / baseline server capacity),
    or (2 * vCPU) + 1 if dynamically requested.
    """
    env_workers = os.getenv("GUNICORN_WORKERS")
    if env_workers and env_workers.strip():
        return _get_positive_int("GUNICORN_WORKERS", 4)

    # If dynamic calculation is requested
    if os.getenv("GUNICORN_DYNAMIC_WORKERS", "false").lower() in ("true", "1", "yes"):
        cpu_count = multiprocessing.cpu_count() or 1
        return (2 * cpu_count) + 1

    return 4


port = os.getenv("PORT", "8000")
bind = os.getenv("GUNICORN_BIND", f"0.0.0.0:{port}")
backlog = _get_positive_int("GUNICORN_BACKLOG", 2048)

# -----------------------------------------------------------------------------
# Worker Processes
# -----------------------------------------------------------------------------
workers = _determine_workers()
worker_class = _get_worker_class()
threads = _get_positive_int("GUNICORN_THREADS", 1)
timeout = _get_positive_int("GUNICORN_TIMEOUT", 120)
graceful_timeout = _get_positive_int("GUNICORN_GRACEFUL_TIMEOUT", 30)
keepalive = _get_positive_int("GUNICORN_KEEPALIVE", 5)

# Recycle workers after handling requests to prevent memory leaks from ML models
max_requests = _get_positive_int("GUNICORN_MAX_REQUESTS", 1000)
max_requests_jitter = _get_non_negative_int("GUNICORN_MAX_REQUESTS_JITTER", 50)

# Preloading is disabled by default for PyTorch / DB safety across forks
preload_app = os.getenv("GUNICORN_PRELOAD", "false").lower() in ("true", "1", "yes")

# -----------------------------------------------------------------------------
# Security & Reverse Proxy
# -----------------------------------------------------------------------------
# Trust X-Forwarded-* headers from reverse proxy (Nginx)
forwarded_allow_ips = os.getenv("GUNICORN_FORWARDED_ALLOW_IPS", "*")
proxy_protocol = False
proxy_allow_ips = os.getenv("GUNICORN_PROXY_ALLOW_IPS", "*")

# -----------------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------------
accesslog = os.getenv("GUNICORN_ACCESS_LOG", "-")  # stdout
errorlog = os.getenv("GUNICORN_ERROR_LOG", "-")    # stderr
loglevel = _get_log_level()
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)sµs'
capture_output = True

# -----------------------------------------------------------------------------
# Process Naming
# -----------------------------------------------------------------------------
proc_name = "ai_internship_gunicorn"

# -----------------------------------------------------------------------------
# Lifecycle Hooks
# -----------------------------------------------------------------------------
def on_starting(server):
    """Log startup configuration summary."""
    server.log.info(
        "Starting Gunicorn %s (bind=%s, workers=%d, worker_class=%s, timeout=%ds, graceful_timeout=%ds)",
        getattr(server, "version", "production"),
        bind,
        workers,
        worker_class,
        timeout,
        graceful_timeout,
    )


def when_ready(server):
    """Log when master is ready to accept connections."""
    server.log.info("Gunicorn master process is ready to handle connections.")


def worker_int(worker):
    """Log worker termination on interrupt."""
    worker.log.info("Worker received INT/QUIT signal (pid: %s)", worker.pid)


def worker_abort(worker):
    """Log worker abort on timeout or critical error."""
    worker.log.error("Worker received SIGABRT (pid: %s). Possible worker timeout or unhandled signal.", worker.pid)
