#!/bin/bash
# Quick review script that reads all changed files and checks them
# against the code-reviewer checklist. Returns PASS/FAIL.

cd "/home/nitin-sharma/ralph-workspaces/468e0e06-4d93-4350-b48d-1501e5f144a3/ffd5023e-2540-4e57-8804-ece0e907547d"

echo "=== CODE REVIEW: STORY-auth-006 ==="
echo ""

# 1. Type check
echo "--- TypeScript Check ---"
TSC_RESULT=$(npx tsc --noEmit 2>&1 | grep -E "(RegisterForm|register/page)" || echo "CLEAN")
echo "$TSC_RESULT"

# 2. Security checks
echo ""
echo "--- Security: Hardcoded credentials ---"
grep -rn "sk-[a-zA-Z0-9]\{20,\}\|Bearer \|password.*=.*['\"][^'\"]\+['\"]" src/components/auth/RegisterForm.tsx src/app/register/page.tsx || echo "PASS: No hardcoded credentials"

echo ""
echo "--- Security: XSS potential ---"
grep -n "innerHTML\|dangerouslySetInnerHTML\|eval(\|document.write" src/components/auth/RegisterForm.tsx src/app/register/page.tsx || echo "PASS: No XSS patterns"

echo ""
echo "--- Security: Password in logs ---"
grep -n "console.log.*password\|console.log.*password" src/components/auth/RegisterForm.tsx || echo "PASS: No password logging"

echo ""
echo "--- Code Quality: console.log ---"
grep -n "console\.log" src/components/auth/RegisterForm.tsx src/app/register/page.tsx || echo "PASS: No console.log"

echo ""
echo "--- Code Quality: Dead code ---"
grep -n "^ *\/\/[ ].*TODO\|^ *\/\/[ ].*FIXME" src/components/auth/RegisterForm.tsx || echo "PASS: No dead code or TODOs"

echo ""
echo "--- React: Server/Client boundary ---"
grep -n "'use client'" src/components/auth/RegisterForm.tsx || echo "ISSUE: Missing 'use client' directive"

echo ""
echo "--- Accessibility: role=alert ---"
ALERT_COUNT=$(grep -c 'role="alert"' src/components/auth/RegisterForm.tsx)
echo "role=alert found $ALERT_COUNT times"

echo ""
echo "--- Accessibility: aria-label ---"
ARIA_LABELS=$(grep -c 'aria-label=' src/components/auth/RegisterForm.tsx)
echo "aria-label found $ARIA_LABELS times"

echo ""
echo "--- Accessibility: focus management ---"
grep -n "\.focus()" src/components/auth/RegisterForm.tsx || echo "ISSUE: No focus management"

echo ""
echo "--- Unit Tests ---"
VITEST_PASS=$(npx vitest run src/components/auth/RegisterForm.test.tsx --reporter=basic 2>&1 | grep "passed" || echo "NO RESULTS")
echo "$VITEST_PASS"

echo ""
echo "--- E2E Tests ---"
E2E_PASS=$(npx playwright test e2e/tests/register.spec.ts --reporter=line 2>&1 | tail -3)
echo "$E2E_PASS"

echo ""
echo "=== REVIEW COMPLETE ==="
