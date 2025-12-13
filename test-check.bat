@echo off
echo Running tests to check for failures...
npm test -- --reporter=verbose 2>&1 | findstr /I "FAIL"
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================
    echo FAILURES FOUND - See output above
    echo ============================================
) else (
    echo.
    echo ============================================
    echo NO FAILURES DETECTED
    echo ============================================
)
