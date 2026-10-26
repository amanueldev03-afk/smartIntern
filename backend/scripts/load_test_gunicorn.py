#!/usr/bin/env python3
"""
Load testing script for Gunicorn + Nginx production deployment.
Tests public and authenticated endpoints across multiple concurrency tiers,
measuring latency (avg, median, p95, p99), throughput (req/s), and error rates.
"""

import concurrent.futures
import json
import statistics
import time
import urllib.error
import urllib.request


def run_benchmark(url, headers=None, total_requests=200, concurrency=25):
    """Executes concurrent HTTP requests against url and collects latency metrics."""
    headers = headers or {}
    latencies = []
    status_codes = {}
    errors = 0
    timeouts = 0

    start_time = time.perf_counter()

    def fetch():
        req = urllib.request.Request(url, headers=headers)
        t0 = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                elapsed = (time.perf_counter() - t0) * 1000  # ms
                return resp.status, elapsed
        except urllib.error.HTTPError as e:
            elapsed = (time.perf_counter() - t0) * 1000
            return e.code, elapsed
        except Exception as e:
            elapsed = (time.perf_counter() - t0) * 1000
            return str(e), elapsed

    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [executor.submit(fetch) for _ in range(total_requests)]
        for f in concurrent.futures.as_completed(futures):
            res, dur = f.result()
            latencies.append(dur)
            if isinstance(res, int):
                status_codes[res] = status_codes.get(res, 0) + 1
            else:
                errors += 1
                if "timed out" in str(res).lower():
                    timeouts += 1

    total_time = time.perf_counter() - start_time
    rps = total_requests / total_time if total_time > 0 else 0

    latencies.sort()
    avg_lat = statistics.mean(latencies) if latencies else 0
    median_lat = statistics.median(latencies) if latencies else 0
    p95_lat = latencies[int(len(latencies) * 0.95)] if latencies else 0
    p99_lat = latencies[int(len(latencies) * 0.99)] if latencies else 0

    http_5xx = sum(count for code, count in status_codes.items() if isinstance(code, int) and 500 <= code <= 599)
    successful = status_codes.get(200, 0)

    result = {
        "url": url,
        "concurrency": concurrency,
        "total_requests": total_requests,
        "successful_requests": successful,
        "failed_requests": total_requests - successful,
        "http_5xx": http_5xx,
        "connection_errors": errors,
        "worker_timeouts": timeouts,
        "total_time_seconds": round(total_time, 3),
        "requests_per_sec": round(rps, 2),
        "avg_response_time_ms": round(avg_lat, 2),
        "median_response_time_ms": round(median_lat, 2),
        "p95_response_time_ms": round(p95_lat, 2),
        "p99_response_time_ms": round(p99_lat, 2),
        "status_code_distribution": status_codes,
    }
    return result


def main():
    print("==================================================")
    print("STARTING GUNICORN PRODUCTION LOAD TESTS")
    print("==================================================")

    # 1. Obtain JWT token for authenticated endpoint
    login_url = "http://localhost:8080/api/auth/login/"
    login_data = json.dumps({
        "email": "loadtest_user@example.com",
        "password": "LoadTestPassword123!"
    }).encode("utf-8")
    req = urllib.request.Request(
        login_url,
        data=login_data,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = json.loads(resp.read().decode("utf-8"))
        token = body["access"]
    print("Obtained JWT access token successfully.")

    # 2. Test Tiers
    tests = [
        # (name, url, headers, total_reqs, concurrency)
        ("Health Check (Smoke)", "http://localhost:8080/api/health/", {}, 100, 10),
        ("Health Check (Medium Concurrency)", "http://localhost:8080/api/health/", {}, 250, 25),
        ("Health Check (High Concurrency)", "http://localhost:8080/api/health/", {}, 500, 50),
        ("Health Check (Peak Concurrency)", "http://localhost:8080/api/health/", {}, 1000, 100),
        ("Authenticated Internships (Low Concurrency)", "http://localhost:8080/api/internships/", {"Authorization": f"Bearer {token}"}, 100, 10),
        ("Authenticated Internships (Medium Concurrency)", "http://localhost:8080/api/internships/", {"Authorization": f"Bearer {token}"}, 250, 25),
        ("Authenticated Internships (High Concurrency)", "http://localhost:8080/api/internships/", {"Authorization": f"Bearer {token}"}, 500, 50),
    ]

    all_results = []
    for test_name, url, hdrs, total_req, conc in tests:
        print(f"\n--- Running: {test_name} (Concurrency: {conc}, Requests: {total_req}) ---")
        res = run_benchmark(url, headers=hdrs, total_requests=total_req, concurrency=conc)
        print(f"  Requests/sec: {res['requests_per_sec']}")
        print(f"  Avg Latency:  {res['avg_response_time_ms']} ms")
        print(f"  P95 Latency:  {res['p95_response_time_ms']} ms")
        print(f"  P99 Latency:  {res['p99_response_time_ms']} ms")
        print(f"  HTTP 200:     {res['successful_requests']}/{res['total_requests']}")
        print(f"  HTTP 5xx:     {res['http_5xx']}")
        print(f"  Timeouts:     {res['worker_timeouts']}")
        all_results.append((test_name, res))

    print("\n==================================================")
    print("ALL LOAD TESTS COMPLETE")
    print("==================================================")
    print(json.dumps(all_results, indent=2))


if __name__ == "__main__":
    main()
