@echo off
echo ====================================
echo Testing Dialog URL State Changes
echo ====================================
echo.

echo [1/4] TypeScript check...
call npm run check:ts
if %errorlevel% neq 0 (
    echo FAILED: TypeScript errors found
    exit /b 1
)
echo.

echo [2/4] Building frontend...
cd packages\web-frontend
call npm run build
if %errorlevel% neq 0 (
    echo FAILED: Build errors found
    cd ..\..
    exit /b 1
)
cd ..\..
echo.

echo [3/4] Starting dev server...
echo Please manually test:
echo  - Navigate to /tasks
echo  - Click "Create Task" - URL should change to /tasks?action=create
echo  - Close dialog (X or Cancel) - URL should return to /tasks
echo  - Click browser back button - dialog should reopen
echo  - Verify X button stays fixed when scrolling dialog content
echo.
echo Press Ctrl+C to stop the server when testing is complete
call npm run dev:frontend

echo [4/4] Done!
