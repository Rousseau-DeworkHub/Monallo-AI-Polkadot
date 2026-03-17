#!/usr/bin/env bash
# Test Monallo Store proxy: call chat completions with Monallo Base URL + API Key.
# Usage: ./scripts/test-monallo-api.sh
# Or: BASE_URL="http://localhost:3000/api/monallo/v1" API_KEY="ms_live_xxx" MODEL="gpt-5.2" ./scripts/test-monallo-api.sh

BASE_URL="${BASE_URL:-http://192.168.31.97:3000/api/monallo/v1}"
API_KEY="${API_KEY:-ms_live_78r75b446zyupxcbh3di55mgzold5iee}"
MODEL="${MODEL:-gpt-5.2}"

echo "Monallo API test"
echo "  Base URL: $BASE_URL"
echo "  Model:    $MODEL"
echo "  Key:      ${API_KEY:0:20}..."
echo ""

curl -s -X POST "${BASE_URL}/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -d '{
    "model": "'"$MODEL"'",
    "messages": [{"role": "user", "content": "Say this is a test!"}],
    "temperature": 0.7
  }' | jq .

echo ""
echo "Done. Check for 'choices' in the response; X-Monallo-Warning header may appear if balance is low."
