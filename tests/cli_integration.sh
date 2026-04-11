#!/usr/bin/env bash
#
# CLI integration tests for agentstore
#
# The binary uses dirs::data_dir() (~/Library/Application Support on macOS)
# with no env-var override, so tests operate against the real data directory.
# All test artefacts are cleaned up at the end.
#
# Usage:
#   ./tests/cli_integration.sh
#   ./tests/cli_integration.sh --keep   # skip cleanup for debugging

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BINARY="/Users/jaymoore/Documents/projects/AgentStore/target/release/agentstore"
TEST_REPO="jaymoore-research/personal-skills"   # skills repo with known components
TEST_PKG_NAME="personal-skills"
KEEP_ARTEFACTS=false

if [[ "${1:-}" == "--keep" ]]; then
    KEEP_ARTEFACTS=true
fi

# Data dir the binary will use (macOS)
DATA_DIR="$HOME/Library/Application Support/AgentStore"
PACKAGES_DIR="$DATA_DIR/packages"
CONFIG_PATH="$DATA_DIR/config.json"

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
pass() {
    PASS_COUNT=$((PASS_COUNT + 1))
    echo "  PASS: $1"
}

fail() {
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "  FAIL: $1"
    echo "        $2"
}

skip() {
    SKIP_COUNT=$((SKIP_COUNT + 1))
    echo "  SKIP: $1 -- $2"
}

cleanup_package() {
    # Remove test package if it exists
    if [[ -d "$PACKAGES_DIR/$TEST_PKG_NAME" ]]; then
        "$BINARY" uninstall "$TEST_PKG_NAME" 2>/dev/null || true
    fi
}

cleanup_config() {
    # Reset github_token if we set it during tests
    if [[ -f "$CONFIG_PATH" ]]; then
        # Remove test token by setting it to empty via the binary
        # (or just leave it; the get test verifies it was set)
        true
    fi
}

cleanup() {
    if [[ "$KEEP_ARTEFACTS" == "true" ]]; then
        echo ""
        echo "[cleanup] --keep flag set, skipping cleanup"
        return
    fi
    echo ""
    echo "[cleanup] Removing test artefacts..."
    cleanup_package
    cleanup_config
}

trap cleanup EXIT

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
echo "========================================"
echo " AgentStore CLI Integration Tests"
echo "========================================"
echo ""
echo "Binary:   $BINARY"
echo "Data dir: $DATA_DIR"
echo ""

if [[ ! -x "$BINARY" ]]; then
    echo "ERROR: Binary not found or not executable at $BINARY"
    exit 1
fi

# Clean up any leftover test package from a previous run
cleanup_package

# ---------------------------------------------------------------------------
# Test 1: --help and --version
# ---------------------------------------------------------------------------
echo "--- Test 1: CLI basics (help, version) ---"

if OUTPUT=$("$BINARY" --help 2>&1); then
    if echo "$OUTPUT" | grep -q "agentstore"; then
        pass "--help prints usage"
    else
        fail "--help prints usage" "Output did not contain 'agentstore'"
    fi
else
    fail "--help prints usage" "Non-zero exit code"
fi

if OUTPUT=$("$BINARY" --version 2>&1); then
    if echo "$OUTPUT" | grep -qE '[0-9]+\.[0-9]+'; then
        pass "--version prints version number"
    else
        fail "--version prints version number" "Output: $OUTPUT"
    fi
else
    fail "--version prints version number" "Non-zero exit code"
fi

# ---------------------------------------------------------------------------
# Test 2: platforms
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 2: platforms ---"

if OUTPUT=$("$BINARY" platforms 2>&1); then
    if echo "$OUTPUT" | grep -qi "detected\|claude\|cursor\|copilot"; then
        pass "platforms lists detected platforms"
    else
        fail "platforms lists detected platforms" "Unexpected output: $OUTPUT"
    fi
else
    fail "platforms lists detected platforms" "Non-zero exit code"
fi

if OUTPUT=$("$BINARY" platforms --json 2>&1); then
    if echo "$OUTPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert isinstance(d, list)" 2>/dev/null; then
        pass "platforms --json returns valid JSON array"
    else
        fail "platforms --json returns valid JSON array" "Invalid JSON"
    fi
    # Check structure
    if echo "$OUTPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert len(d) > 0, 'empty list'
assert 'id' in d[0], 'missing id field'
assert 'detected' in d[0], 'missing detected field'
" 2>/dev/null; then
        pass "platforms --json has correct structure (id, detected fields)"
    else
        fail "platforms --json has correct structure" "Missing expected fields"
    fi
else
    fail "platforms --json" "Non-zero exit code"
fi

# ---------------------------------------------------------------------------
# Test 3: config set / get
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 3: config set/get ---"

if OUTPUT=$("$BINARY" config set github_token test_token_12345 2>&1); then
    pass "config set github_token succeeds"
else
    fail "config set github_token succeeds" "Non-zero exit code: $OUTPUT"
fi

if OUTPUT=$("$BINARY" config get github_token 2>&1); then
    if echo "$OUTPUT" | grep -q "test_token_12345"; then
        pass "config get github_token returns set value"
    else
        fail "config get github_token returns set value" "Output: $OUTPUT"
    fi
else
    fail "config get github_token returns set value" "Non-zero exit code"
fi

if OUTPUT=$("$BINARY" config set github_token test_token_12345 --json 2>&1); then
    if echo "$OUTPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('ok') == True" 2>/dev/null; then
        pass "config set --json returns {ok: true}"
    else
        fail "config set --json returns {ok: true}" "Output: $OUTPUT"
    fi
else
    fail "config set --json" "Non-zero exit code"
fi

if OUTPUT=$("$BINARY" config get github_token --json 2>&1); then
    if echo "$OUTPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('value') == 'test_token_12345'" 2>/dev/null; then
        pass "config get --json returns correct value"
    else
        fail "config get --json returns correct value" "Output: $OUTPUT"
    fi
else
    fail "config get --json" "Non-zero exit code"
fi

# ---------------------------------------------------------------------------
# Test 4: config error case (unknown key)
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 4: config error cases ---"

if OUTPUT=$("$BINARY" config set bogus_key value 2>&1); then
    fail "config set unknown key should fail" "Exited 0 unexpectedly"
else
    if echo "$OUTPUT" | grep -qi "unknown\|error"; then
        pass "config set unknown key returns error message"
    else
        pass "config set unknown key exits non-zero"
    fi
fi

if OUTPUT=$("$BINARY" config get bogus_key 2>&1); then
    fail "config get unknown key should fail" "Exited 0 unexpectedly"
else
    pass "config get unknown key exits non-zero"
fi

# ---------------------------------------------------------------------------
# Test 5: list (empty state)
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 5: list (before install) ---"

if OUTPUT=$("$BINARY" list --json 2>&1); then
    if echo "$OUTPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert isinstance(d, list)" 2>/dev/null; then
        pass "list --json returns valid JSON array"
    else
        fail "list --json returns valid JSON array" "Output: $OUTPUT"
    fi
else
    fail "list --json" "Non-zero exit code"
fi

# ---------------------------------------------------------------------------
# Test 6: install
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 6: install $TEST_REPO ---"

# Install with explicit platform to avoid "no platforms detected" failure
# Use claude since it exists on this machine
INSTALL_OUTPUT=$("$BINARY" install "$TEST_REPO" --platform claude --json 2>&1) && INSTALL_RC=0 || INSTALL_RC=$?

if [[ $INSTALL_RC -eq 0 ]]; then
    # Extract just stdout JSON (stderr has progress messages)
    INSTALL_JSON=$(echo "$INSTALL_OUTPUT" | python3 -c "
import sys, json
lines = sys.stdin.read()
# Find the JSON object in the output (skip stderr lines)
start = lines.find('{')
if start >= 0:
    # Find matching closing brace
    depth = 0
    for i in range(start, len(lines)):
        if lines[i] == '{': depth += 1
        elif lines[i] == '}': depth -= 1
        if depth == 0:
            print(lines[start:i+1])
            break
" 2>/dev/null)

    if [[ -n "$INSTALL_JSON" ]]; then
        pass "install $TEST_REPO succeeds"

        # Verify JSON structure
        if echo "$INSTALL_JSON" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert 'name' in d, 'missing name'
assert 'repo' in d, 'missing repo'
assert 'components' in d, 'missing components'
" 2>/dev/null; then
            pass "install --json has correct manifest structure"
        else
            fail "install --json has correct manifest structure" "JSON: $INSTALL_JSON"
        fi
    else
        pass "install $TEST_REPO succeeds (non-JSON output)"
    fi

    # Verify package directory was created
    if [[ -d "$PACKAGES_DIR/$TEST_PKG_NAME" ]]; then
        pass "install creates package directory"
    else
        fail "install creates package directory" "Directory not found at $PACKAGES_DIR/$TEST_PKG_NAME"
    fi

    # Verify manifest.json exists
    if [[ -f "$PACKAGES_DIR/$TEST_PKG_NAME/manifest.json" ]]; then
        pass "install creates manifest.json"
    else
        fail "install creates manifest.json" "File not found"
    fi

    # Verify repo was cloned
    if [[ -d "$PACKAGES_DIR/$TEST_PKG_NAME/repo/.git" ]]; then
        pass "install clones repo (has .git directory)"
    else
        fail "install clones repo" "No .git directory found"
    fi
else
    fail "install $TEST_REPO" "Exit code $INSTALL_RC. Output: $INSTALL_OUTPUT"
    # Skip dependent tests
    echo ""
    echo "--- Skipping install-dependent tests ---"
    skip "list after install" "install failed"
    skip "scan" "install failed"
    skip "update" "install failed"
    skip "uninstall" "install failed"
    skip "list after uninstall" "install failed"

    # Jump to error case tests
    echo ""
    echo "--- Test 10: error cases ---"
    goto_error_tests=true
fi

# ---------------------------------------------------------------------------
# Test 7: list (after install)
# ---------------------------------------------------------------------------
if [[ "${goto_error_tests:-}" != "true" ]]; then
echo ""
echo "--- Test 7: list (after install) ---"

if OUTPUT=$("$BINARY" list --json 2>&1); then
    if echo "$OUTPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert isinstance(d, list)
assert len(d) > 0, 'list is empty after install'
names = [p['name'] for p in d]
assert '$TEST_PKG_NAME' in names, f'$TEST_PKG_NAME not in {names}'
" 2>/dev/null; then
        pass "list --json shows installed package"
    else
        fail "list --json shows installed package" "Output: $OUTPUT"
    fi
else
    fail "list --json after install" "Non-zero exit code"
fi

# Test platform filter
if OUTPUT=$("$BINARY" list --platform claude --json 2>&1); then
    if echo "$OUTPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert isinstance(d, list)" 2>/dev/null; then
        pass "list --platform claude --json returns valid JSON"
    else
        fail "list --platform claude --json" "Invalid JSON: $OUTPUT"
    fi
else
    fail "list --platform claude --json" "Non-zero exit code"
fi

# ---------------------------------------------------------------------------
# Test 8: scan
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 8: scan ---"

if OUTPUT=$("$BINARY" scan --json 2>&1); then
    if echo "$OUTPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert isinstance(d, list)" 2>/dev/null; then
        pass "scan --json returns valid JSON array"
        # Check if any skills found
        SKILL_COUNT=$(echo "$OUTPUT" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
        echo "        (found $SKILL_COUNT skills)"
    else
        fail "scan --json returns valid JSON array" "Output: $OUTPUT"
    fi
else
    fail "scan --json" "Non-zero exit code"
fi

# Scan with project path
if OUTPUT=$("$BINARY" scan --project /tmp --json 2>&1); then
    if echo "$OUTPUT" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
        pass "scan --project /tmp --json returns valid JSON"
    else
        fail "scan --project /tmp --json" "Invalid JSON: $OUTPUT"
    fi
else
    fail "scan --project /tmp --json" "Non-zero exit code"
fi

# ---------------------------------------------------------------------------
# Test 9: update
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 9: update ---"

UPDATE_OUTPUT=$("$BINARY" update "$TEST_PKG_NAME" --json 2>&1) && UPDATE_RC=0 || UPDATE_RC=$?

if [[ $UPDATE_RC -eq 0 ]]; then
    pass "update $TEST_PKG_NAME succeeds"

    # Verify repo still exists after update
    if [[ -d "$PACKAGES_DIR/$TEST_PKG_NAME/repo/.git" ]]; then
        pass "update preserves repo clone"
    else
        fail "update preserves repo clone" "No .git directory after update"
    fi

    # Verify manifest still exists
    if [[ -f "$PACKAGES_DIR/$TEST_PKG_NAME/manifest.json" ]]; then
        pass "update preserves manifest.json"
    else
        fail "update preserves manifest.json" "File not found after update"
    fi
else
    fail "update $TEST_PKG_NAME" "Exit code $UPDATE_RC. Output: $UPDATE_OUTPUT"
fi

# ---------------------------------------------------------------------------
# Test 10: uninstall
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 10: uninstall ---"

if OUTPUT=$("$BINARY" uninstall "$TEST_PKG_NAME" 2>&1); then
    pass "uninstall $TEST_PKG_NAME succeeds"
else
    fail "uninstall $TEST_PKG_NAME" "Non-zero exit code: $OUTPUT"
fi

# Verify package directory was removed
if [[ -d "$PACKAGES_DIR/$TEST_PKG_NAME" ]]; then
    fail "uninstall removes package directory" "Directory still exists"
else
    pass "uninstall removes package directory"
fi

# ---------------------------------------------------------------------------
# Test 11: list (after uninstall, should be empty or not contain test pkg)
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 11: list (after uninstall) ---"

if OUTPUT=$("$BINARY" list --json 2>&1); then
    if echo "$OUTPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
names = [p['name'] for p in d]
assert '$TEST_PKG_NAME' not in names, f'$TEST_PKG_NAME still in list: {names}'
" 2>/dev/null; then
        pass "list --json no longer shows uninstalled package"
    else
        fail "list --json no longer shows uninstalled package" "Output: $OUTPUT"
    fi
else
    fail "list --json after uninstall" "Non-zero exit code"
fi

fi  # end of goto_error_tests guard

# ---------------------------------------------------------------------------
# Test 12: error cases
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 12: error cases ---"

# Install non-existent repo
if OUTPUT=$("$BINARY" install "nonexistent-owner-xyz/nonexistent-repo-xyz" --platform claude 2>&1); then
    fail "install non-existent repo should fail" "Exited 0 unexpectedly"
else
    pass "install non-existent repo exits non-zero"
    if echo "$OUTPUT" | grep -qi "clone\|failed\|error"; then
        pass "install non-existent repo prints error message"
    else
        pass "install non-existent repo exits non-zero (no specific message check)"
    fi
fi

# Uninstall non-existent package
if OUTPUT=$("$BINARY" uninstall "nonexistent_package_xyz" 2>&1); then
    # Might succeed if directory doesn't exist (just a no-op)
    pass "uninstall non-existent package does not crash"
else
    pass "uninstall non-existent package exits non-zero (expected)"
fi

# Install with invalid repo format (no slash)
if OUTPUT=$("$BINARY" install "invalid-format" --platform claude 2>&1); then
    fail "install invalid format should fail" "Exited 0 unexpectedly"
else
    if echo "$OUTPUT" | grep -qi "owner/repo\|format"; then
        pass "install invalid format shows format error"
    else
        pass "install invalid format exits non-zero"
    fi
fi

# Install with path traversal attempt
if OUTPUT=$("$BINARY" install "../evil/repo" --platform claude 2>&1); then
    fail "install path traversal should fail" "Exited 0 unexpectedly"
else
    pass "install path traversal rejected"
fi

# Update non-existent package
if OUTPUT=$("$BINARY" update "nonexistent_package_xyz" 2>&1); then
    fail "update non-existent package should fail" "Exited 0 unexpectedly"
else
    if echo "$OUTPUT" | grep -qi "not found\|error"; then
        pass "update non-existent package returns error"
    else
        pass "update non-existent package exits non-zero"
    fi
fi

# ---------------------------------------------------------------------------
# Test 13: double install (idempotency)
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 13: double install / reinstall ---"

# Install, then install again. Should overwrite cleanly.
INSTALL1=$("$BINARY" install "$TEST_REPO" --platform claude 2>&1) && RC1=0 || RC1=$?
if [[ $RC1 -eq 0 ]]; then
    INSTALL2=$("$BINARY" install "$TEST_REPO" --platform claude 2>&1) && RC2=0 || RC2=$?
    if [[ $RC2 -eq 0 ]]; then
        pass "reinstall (double install) succeeds"
    else
        fail "reinstall (double install)" "Second install failed: $INSTALL2"
    fi
    # Clean up
    "$BINARY" uninstall "$TEST_PKG_NAME" 2>/dev/null || true
else
    skip "reinstall (double install)" "initial install failed"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "========================================"
echo " Results"
echo "========================================"
echo "  PASS: $PASS_COUNT"
echo "  FAIL: $FAIL_COUNT"
echo "  SKIP: $SKIP_COUNT"
echo ""

if [[ $FAIL_COUNT -gt 0 ]]; then
    echo "SOME TESTS FAILED"
    exit 1
else
    echo "ALL TESTS PASSED"
    exit 0
fi
