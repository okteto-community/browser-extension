#!/usr/bin/env bash
# Upload and publish a packaged extension zip to the Chrome Web Store.
#
# Talks to the Web Store API directly with curl rather than pulling an npm
# publisher into a job that holds the store credentials.
#
# Usage: scripts/publish-webstore.sh <zip>
# Requires: CWS_EXTENSION_ID, CWS_CLIENT_ID, CWS_CLIENT_SECRET,
#           CWS_REFRESH_TOKEN, and optionally PUBLISH_TARGET (default|trustedTesters).

set -euo pipefail

ZIP="${1:?usage: publish-webstore.sh <zip>}"
: "${CWS_EXTENSION_ID:?CWS_EXTENSION_ID is required}"
: "${CWS_CLIENT_ID:?CWS_CLIENT_ID is required}"
: "${CWS_CLIENT_SECRET:?CWS_CLIENT_SECRET is required}"
: "${CWS_REFRESH_TOKEN:?CWS_REFRESH_TOKEN is required}"
PUBLISH_TARGET="${PUBLISH_TARGET:-default}"

if [ ! -f "$ZIP" ]; then
  echo "::error::Package '$ZIP' not found" >&2
  exit 1
fi

json_field() {
  # $1: json, $2: field name. Kept dependency-free (no jq on every runner image).
  FIELD="$2" node -e '
    let raw = "";
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", () => {
      const parsed = JSON.parse(raw);
      const value = parsed[process.env.FIELD];
      process.stdout.write(value === undefined ? "" : String(value));
    });
  ' <<<"$1"
}

echo "Requesting an access token"
TOKEN_RESPONSE="$(curl -sS --fail-with-body \
  -d "client_id=${CWS_CLIENT_ID}" \
  -d "client_secret=${CWS_CLIENT_SECRET}" \
  -d "refresh_token=${CWS_REFRESH_TOKEN}" \
  -d "grant_type=refresh_token" \
  https://oauth2.googleapis.com/token)"
ACCESS_TOKEN="$(json_field "$TOKEN_RESPONSE" access_token)"
if [ -z "$ACCESS_TOKEN" ]; then
  # The response body holds the refresh token error, but also enough of the
  # credential exchange that it should not reach the log.
  echo "::error::Could not exchange the refresh token for an access token" >&2
  exit 1
fi

echo "Uploading ${ZIP} to item ${CWS_EXTENSION_ID}"
UPLOAD_RESPONSE="$(curl -sS --fail-with-body \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "x-goog-api-version: 2" \
  -X PUT -T "$ZIP" \
  "https://www.googleapis.com/upload/chromewebstore/v1.1/items/${CWS_EXTENSION_ID}")"
UPLOAD_STATE="$(json_field "$UPLOAD_RESPONSE" uploadState)"
if [ "$UPLOAD_STATE" != "SUCCESS" ]; then
  echo "::error::Upload failed (uploadState=${UPLOAD_STATE:-unknown}): ${UPLOAD_RESPONSE}" >&2
  exit 1
fi

echo "Publishing to ${PUBLISH_TARGET}"
PUBLISH_RESPONSE="$(curl -sS --fail-with-body \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "x-goog-api-version: 2" \
  -H "Content-Length: 0" \
  -X POST \
  "https://www.googleapis.com/chromewebstore/v1.1/items/${CWS_EXTENSION_ID}/publish?publishTarget=${PUBLISH_TARGET}")"
echo "$PUBLISH_RESPONSE"

# The store returns the item's review state; anything other than the expected
# states means the submission did not make it into review.
case "$PUBLISH_RESPONSE" in
  *ITEM_PENDING_REVIEW* | *OK* | *PUBLISHED* ) ;;
  *)
    echo "::error::Unexpected publish response" >&2
    exit 1
    ;;
esac

echo "Submitted. Google review is asynchronous; check the developer dashboard."
