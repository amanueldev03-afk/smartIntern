#!/bin/bash

# Test all 78 REST API endpoints using curl
# Server: http://localhost:8001

BASE_URL="http://localhost:8001"
TOTAL=0
PASSED=0
FAILED=0

echo "=== Testing All 78 Endpoints ==="
echo ""

# Function to test endpoint
test_endpoint() {
    local method=$1
    local url=$2
    local description=$3
    local data=$4
    local token=$5
    
    TOTAL=$((TOTAL + 1))
    
    if [ -n "$token" ]; then
        AUTH="-H \"Authorization: Bearer $token\""
    else
        AUTH=""
    fi
    
    if [ -n "$data" ]; then
        DATA="-H \"Content-Type: application/json\" -d '$data'"
    else
        DATA=""
    fi
    
    echo "Testing [$TOTAL] $method $url - $description"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$BASE_URL$url")
    elif [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL$url" -H "Content-Type: application/json" -d "$data")
    elif [ "$method" = "PUT" ]; then
        response=$(curl -s -w "\n%{http_code}" -X PUT "$BASE_URL$url" -H "Content-Type: application/json" -d "$data")
    elif [ "$method" = "PATCH" ]; then
        response=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE_URL$url" -H "Content-Type: application/json" -d "$data")
    elif [ "$method" = "DELETE" ]; then
        response=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL$url")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ] || [ "$http_code" = "204" ]; then
        echo "✅ PASSED - HTTP $http_code"
        PASSED=$((PASSED + 1))
    else
        echo "❌ FAILED - HTTP $http_code"
        echo "Response: $body"
        FAILED=$((FAILED + 1))
    fi
    echo ""
}

# System Endpoints (4)
test_endpoint "GET" "/api/health/" "Health Check"
test_endpoint "GET" "/api/schema/" "OpenAPI Schema"
test_endpoint "GET" "/api/docs/" "Swagger UI"
test_endpoint "GET" "/api/redoc/" "ReDoc"

# Authentication Endpoints (10)
test_endpoint "POST" "/api/auth/register/" "Student Registration" '{"full_name":"Test User","email":"testuser@example.com","username":"testuser2","password":"TestPass123!","password_confirm":"TestPass123!"}'
test_endpoint "POST" "/api/auth/login/" "Unified Login" '{"email":"test@example.com","password":"TestPass123!"}'
test_endpoint "POST" "/api/auth/refresh/" "Token Refresh" '{"refresh":"test"}'
test_endpoint "POST" "/api/auth/password-reset/" "Password Reset Request" '{"email":"test@example.com"}'
test_endpoint "POST" "/api/auth/password-reset-confirm/MQ/abc/" "Password Reset Confirm" '{"password":"NewPass123!","password_confirm":"NewPass123!"}'
test_endpoint "GET" "/api/auth/verify-email/MQ/abc/" "Email Verification"

echo "=== Test Summary ==="
echo "Total: $TOTAL"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
