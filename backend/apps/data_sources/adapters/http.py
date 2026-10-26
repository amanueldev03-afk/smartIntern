"""
Shared HTTP fetching for per-source adapters (Task 5.2 contract).

Re-implements the rate-limit-aware fetch described in Section 2.8 so
every adapter (API, RSS, career-site) retries transient failures
(network errors, ``429``, ``5xx``) with exponential backoff while
honouring ``Retry-After`` and a configurable minimum request interval.
"""

import time

import requests


class HTTPFetcher:
    """
    Fetch URLs while respecting rate limits.

    The ``config`` dictionary (usually the ``DataSource.config``) may
    override::

        {
            "headers": {"Authorization": "..."},
            "params": {"category": "software-dev"},
            "timeout_seconds": 15,
            "max_retries": 3,                 # additional attempts
            "backoff_base_seconds": 1.0,      # exponential base
            "min_request_interval": 0.5,      # pacing between calls
        }
    """

    MAX_RETRIES = 3
    BACKOFF_BASE_SECONDS = 1.0
    DEFAULT_TIMEOUT_SECONDS = 15

    def __init__(self, config=None):
        self.config = config or {}
        self._last_request_at = None

    def get(self, url):
        """
        GET ``url`` with retry/backoff and return the ``Response``.

        Raises:
            requests.RequestException: When the request ultimately
                fails (non-transient status, or retries exhausted).
        """
        max_retries = int(
            self.config.get("max_retries", self.MAX_RETRIES)
        )
        backoff_base = float(
            self.config.get(
                "backoff_base_seconds",
                self.BACKOFF_BASE_SECONDS,
            )
        )
        timeout = self.config.get(
            "timeout_seconds",
            self.DEFAULT_TIMEOUT_SECONDS,
        )
        min_interval = float(
            self.config.get("min_request_interval", 0)
        )

        for attempt in range(max_retries + 1):
            self._throttle(min_interval)

            try:
                response = requests.get(
                    url,
                    headers=self.config.get("headers") or {},
                    params=self.config.get("params") or {},
                    timeout=timeout,
                )
            except requests.RequestException as exc:
                if attempt >= max_retries:
                    raise
                time.sleep(backoff_base * (2 ** attempt))
                continue

            if (
                response.status_code == 429
                or response.status_code >= 500
            ):
                if attempt >= max_retries:
                    response.raise_for_status()
                time.sleep(
                    self._retry_delay(response, backoff_base, attempt)
                )
                continue

            response.raise_for_status()
            return response

        raise requests.RequestException(
            f"GET {url} failed after {max_retries + 1} attempts."
        )

    def _retry_delay(self, response, backoff_base, attempt):
        """
        Backoff seconds for one retry, honouring ``Retry-After`` when
        the server sends it (falling back to exponential backoff).
        """
        retry_after = response.headers.get("Retry-After")

        if retry_after:
            try:
                return float(retry_after)
            except (TypeError, ValueError):
                # HTTP-date form — fall through to exponential backoff.
                pass

        return backoff_base * (2 ** attempt)

    def _throttle(self, min_interval):
        """
        Pause between requests so the caller never exceeds the
        configured minimum request interval.
        """
        if self._last_request_at is None:
            self._last_request_at = time.monotonic()
            return

        elapsed = time.monotonic() - self._last_request_at

        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)

        self._last_request_at = time.monotonic()