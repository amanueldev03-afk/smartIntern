"""
services/urlcheck.py — URL validation for collected listings
(Section 3.10.8, Task 5.9).

Every new/updated listing is checked asynchronously: a HEAD request is
sent to ``source_url`` and ``application_url``, falling back to a GET
request when the server refuses/mishandles HEAD. URLs that return a
non-success status (e.g. 404) or that are unreachable are recorded per
URL. Listings with any invalid URL are flagged ``needs_review=True``
for admin review instead of being auto-published to students.
"""

import requests


# Methods that a server answers with on HEAD but that a GET may still
# satisfy — the fallback kicks in for these.
HEAD_FALLBACK_STATUSES = {403, 405, 501}

DEFAULT_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

# Status codes from external company job sites that indicate the host/URL exists
# but blocked non-browser scraping / requires user login.
VALID_OR_PROTECTED_STATUSES = {200, 201, 202, 204, 301, 302, 303, 307, 308, 401, 403, 405, 429, 503}


def validate_url(url, timeout=10):
    """
    Validate one URL with a HEAD request, falling back to GET.

    Returns a dict:
      url, valid (bool), method (HEAD/GET), status_code, error.
    """
    url = (url or "").strip()

    if not url:
        return {
            "url": url,
            "valid": False,
            "method": None,
            "status_code": None,
            "error": "empty_url",
        }

    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"

    last_error = None

    for method in ("HEAD", "GET"):
        try:
            response = requests.request(
                method,
                url,
                timeout=timeout,
                allow_redirects=True,
                headers=DEFAULT_BROWSER_HEADERS,
            )
            status_code = response.status_code
            try:
                response.close()
            except Exception:
                pass

            # HEAD is frequently blocked (405/403/501); the spec calls
            # for a GET fallback before declaring the link invalid.
            if method == "HEAD" and status_code in HEAD_FALLBACK_STATUSES:
                continue

            # A status code in VALID_OR_PROTECTED_STATUSES or < 400 is valid.
            # 404 Not Found and 410 Gone are explicitly marked invalid.
            is_valid = status_code < 400 or status_code in VALID_OR_PROTECTED_STATUSES
            if status_code in (404, 410):
                is_valid = False

            return {
                "url": url,
                "valid": is_valid,
                "method": method,
                "status_code": status_code,
                "error": None if is_valid else f"HTTP {status_code}",
            }

        except requests.RequestException as exc:
            last_error = str(exc) or exc.__class__.__name__
            continue

    return {
        "url": url,
        "valid": False,
        "method": None,
        "status_code": None,
        "error": last_error or "unreachable",
    }



def validate_listing_urls(application_url, source_url="", timeout=10):
    """
    Validate both links on a listing.

    Returns a dict with per-URL ``checks`` plus an aggregate ``valid``
    flag and the list of ``invalid_urls``. An empty source_url has
    nothing to check and is treated as valid.
    """
    checks = {
        "application_url": validate_url(application_url, timeout=timeout),
    }
    if (source_url or "").strip():
        checks["source_url"] = validate_url(source_url, timeout=timeout)
    else:
        checks["source_url"] = {
            "url": source_url or "",
            "valid": True,
            "method": "skipped",
            "status_code": None,
            "error": None,
        }

    invalid_urls = [
        name
        for name, info in checks.items()
        if not info["valid"]
    ]

    return {
        "checks": checks,
        "valid": not invalid_urls,
        "invalid_urls": invalid_urls,
    }