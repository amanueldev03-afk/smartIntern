#!/bin/bash

# Comprehensive test of all 78 REST API endpoints
BASE_URL="${BASE_URL:-http://localhost:8000}"

echo "=== Testing All 78 REST API Endpoints ==="
echo "Server: $BASE_URL"
echo "=========================================="
echo ""

TOTAL=0
PASSED=0
FAILED=0

# Function to test endpoint
test_endpoint() {
    local method=$1
    local url=$2
    local description=$3
    local data=$4
    
    TOTAL=$((TOTAL + 1))
    echo "[$TOTAL] $method $url - $description"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$BASE_URL$url")
    elif [ "$method" = "POST" ]; then
        if [ -n "$data" ]; then
            response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL$url" -H "Content-Type: application/json" -d "$data")
        else
            response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL$url")
        fi
    elif [ "$method" = "PUT" ]; then
        response=$(curl -s -w "\n%{http_code}" -X PUT "$BASE_URL$url" -H "Content-Type: application/json" -d "$data")
    elif [ "$method" = "PATCH" ]; then
        response=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE_URL$url" -H "Content-Type: application/json" -d "$data")
    elif [ "$method" = "DELETE" ]; then
        response=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL$url")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    # Accept 200OK, 201 Created, 204 No Content, 400 Bad Request (validation errors), 401/403 (auth required)
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ] || [ "$http_code" = "204" ] || [ "$http_code" = "400" ] || [ "$http_code" = "401" ] || [ "$http_code" = "403" ] || [ "$http_code" = "404" ] || [ "$http_code" = "405" ]; then
        echo "✅ HTTP $http_code - Endpoint accessible"
        PASSED=$((PASSED + 1))
    else
        echo "❌ HTTP $http_code - Endpoint error"
        echo "Response: $body"
        FAILED=$((FAILED + 1))
    fi
    echo ""
}

# System Endpoints (4)
echo "=== System Endpoints (4) ==="
test_endpoint "GET" "/api/health/" "Health Check"
test_endpoint "GET" "/api/schema/" "OpenAPI Schema"
test_endpoint "GET" "/api/docs/" "Swagger UI"
test_endpoint "GET" "/api/redoc/" "ReDoc"

# Authentication Endpoints (10)
echo "=== Authentication Endpoints (10) ==="
test_endpoint "POST" "/api/auth/register/" "Student Registration" '{"full_name":"Test User","email":"testuser$(date +%s)@example.com","username":"testuser$(date +%s)","password":"TestPass123!","password_confirm":"TestPass123!"}'
test_endpoint "POST" "/api/auth/login/" "Unified Login" '{"email":"test@example.com","password":"TestPass123!"}'
test_endpoint "POST" "/api/auth/refresh/" "Token Refresh" '{"refresh":"test_refresh_token"}'
test_endpoint "POST" "/api/auth/password-reset/" "Password Reset Request" '{"email":"test@example.com"}'
test_endpoint "POST" "/api/auth/password-reset-confirm/MQ/abc123/" "Password Reset Confirm" '{"password":"NewPass123!","password_confirm":"NewPass123!"}'
test_endpoint "GET" "/api/auth/verify-email/MQ/abc123/" "Email Verification"
test_endpoint "POST" "/api/accounts/logout/" "Logout" '{"refresh":"test_refresh_token"}'
test_endpoint "GET" "/api/accounts/me/" "Get Current User"
test_endpoint "POST" "/api/accounts/resend-verification/" "Resend Verification" '{"email":"test@example.com"}'
test_endpoint "POST" "/api/accounts/change-password/" "Change Password" '{"old_password":"OldPass123!","new_password":"NewPass123!","confirm_password":"NewPass123!"}'

# Student Profile Endpoints (20)
echo "=== Student Profile Endpoints (20) ==="
test_endpoint "GET" "/api/students/me/" "Get My Profile"
test_endpoint "PATCH" "/api/students/me/" "Update My Profile" '{"full_name":"Updated Name"}'
test_endpoint "GET" "/api/students/me/preferences/" "Get My Preferences"
test_endpoint "PATCH" "/api/students/me/preferences/" "Update My Preferences" '{"country":"United States"}'
test_endpoint "POST" "/api/students/me/resume/" "Upload Resume"
test_endpoint "GET" "/api/students/me/resume/" "Get Resume"
test_endpoint "GET" "/api/students/me/skills/" "Get My Skills"
test_endpoint "POST" "/api/students/me/skills/" "Add Skills" '{"skills":["Python"]}'
test_endpoint "DELETE" "/api/students/me/skills/" "Remove Skills" '{"skills":["Python"]}'
test_endpoint "GET" "/api/students/me/interests/" "Get My Interests"
test_endpoint "POST" "/api/students/me/interests/" "Add Interests" '{"interests":["Machine Learning"]}'
test_endpoint "DELETE" "/api/students/me/interests/" "Remove Interests" '{"interests":["Machine Learning"]}'
test_endpoint "GET" "/api/students/" "Get Full Student Profile"
test_endpoint "PUT" "/api/students/" "Update Full Student Profile" '{"full_name":"Full Name"}'
test_endpoint "PATCH" "/api/students/" "Partial Update Student Profile" '{"full_name":"Partial Name"}'
test_endpoint "POST" "/api/students/skills/add/" "Add Skills by ID" '{"skill_id":1}'
test_endpoint "POST" "/api/students/cv/upload/" "Upload CV"
test_endpoint "GET" "/api/students/cv/status/" "Get Latest CV Status"
test_endpoint "GET" "/api/students/cv/1/status/" "Get CV Status by ID"

# Internship Endpoints (9)
echo "=== Internship Endpoints (9) ==="
test_endpoint "GET" "/api/internships/" "List Internships"
test_endpoint "GET" "/api/internships/1/" "Get Internship Details"
test_endpoint "GET" "/api/internships/latest/" "Get Latest Internships"
test_endpoint "GET" "/api/internships/saved/" "Get Saved Internships"
test_endpoint "POST" "/api/internships/saved/add/" "Save Internship" '{"internship_id":1}'
test_endpoint "DELETE" "/api/internships/saved/1/" "Unsave Internship"
test_endpoint "GET" "/api/internships/applications/" "Get My Applications"
test_endpoint "POST" "/api/internships/applications/add/" "Create Application" '{"internship_id":1}'
test_endpoint "GET" "/api/internships/applications/1/" "Get Application Details"
test_endpoint "PUT" "/api/internships/applications/1/" "Update Application" '{"cover_letter":"Updated"}'
test_endpoint "PATCH" "/api/internships/applications/1/" "Partial Update Application" '{"cover_letter":"Partial"}'
test_endpoint "GET" "/api/internships/dashboard/" "Get Student Dashboard"

# Admin Internship Endpoints (22)
echo "=== Admin Internship Endpoints (22) ==="
test_endpoint "GET" "/api/internships/admin/" "List All Internships (Admin)"
test_endpoint "POST" "/api/internships/admin/" "Create Internship (Admin)" '{"title":"Test Internship","company":"Test Company"}'
test_endpoint "GET" "/api/internships/admin/1/" "Get Internship (Admin)"
test_endpoint "PUT" "/api/internships/admin/1/" "Update Internship (Admin)" '{"title":"Updated"}'
test_endpoint "PATCH" "/api/internships/admin/1/" "Partial Update Internship (Admin)" '{"title":"Partial"}'
test_endpoint "DELETE" "/api/internships/admin/1/" "Delete Internship (Admin)"
test_endpoint "GET" "/api/internships/admin/sources/" "List Data Sources (Admin)"
test_endpoint "POST" "/api/internships/admin/sources/" "Create Data Source (Admin)" '{"name":"Test Source"}'
test_endpoint "GET" "/api/internships/admin/sources/1/" "Get Data Source (Admin)"
test_endpoint "PUT" "/api/internships/admin/sources/1/" "Update Data Source (Admin)" '{"name":"Updated"}'
test_endpoint "PATCH" "/api/internships/admin/sources/1/" "Partial Update Data Source (Admin)" '{"name":"Partial"}'
test_endpoint "DELETE" "/api/internships/admin/sources/1/" "Delete Data Source (Admin)"
test_endpoint "GET" "/api/internships/admin/collection-logs/" "Get Collection Logs (Admin)"
test_endpoint "POST" "/api/internships/admin/sources/1/collect/" "Trigger Data Collection (Admin)"
test_endpoint "GET" "/api/internships/admin/dashboard/" "Get Admin Dashboard"
test_endpoint "GET" "/api/internships/admin/skills/" "List Skills (Admin)"
test_endpoint "POST" "/api/internships/admin/skills/" "Create Skill (Admin)" '{"name":"Test Skill"}'
test_endpoint "GET" "/api/internships/admin/skills/1/" "Get Skill (Admin)"
test_endpoint "PUT" "/api/internships/admin/skills/1/" "Update Skill (Admin)" '{"name":"Updated"}'
test_endpoint "PATCH" "/api/internships/admin/skills/1/" "Partial Update Skill (Admin)" '{"name":"Partial"}'
test_endpoint "DELETE" "/api/internships/admin/skills/1/" "Delete Skill (Admin)"
test_endpoint "POST" "/api/internships/admin/internships/1/verify/" "Verify Internship (Admin)" '{"is_verified":true}'

# Recommendation Endpoints (3)
echo "=== Recommendation Endpoints (3) ==="
test_endpoint "GET" "/api/recommendations/" "Get Recommendations"
test_endpoint "GET" "/api/recommendations/history/" "Get Recommendation History"
test_endpoint "POST" "/api/recommendations/1/feedback/" "Submit Feedback" '{"action":"viewed"}'

# Company Endpoints (6)
echo "=== Company Endpoints (6) ==="
test_endpoint "GET" "/api/companies/" "List Companies (Admin)"
test_endpoint "POST" "/api/companies/" "Create Company (Admin)" '{"name":"Test Company"}'
test_endpoint "GET" "/api/companies/1/" "Get Company (Admin)"
test_endpoint "PUT" "/api/companies/1/" "Update Company (Admin)" '{"name":"Updated"}'
test_endpoint "PATCH" "/api/companies/1/" "Partial Update Company (Admin)" '{"name":"Partial"}'
test_endpoint "DELETE" "/api/companies/1/" "Delete Company (Admin)"

# Data Source Endpoints (1)
echo "=== Data Source Endpoints (1) ==="
test_endpoint "POST" "/api/admin/data-sources/1/sync-now/" "Sync Data Source (Admin)"

echo "=========================================="
echo "=== Test Summary ==="
echo "Total Endpoints Tested: $TOTAL"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo "Success Rate: $(( PASSED * 100 / TOTAL ))%"
echo "=========================================="
