@echo off
title MonkaMemory - Local Backend
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22 or newer is required. Install Node.js and retry.
  pause
  exit /b 1
)
node scripts\start-local.mjs
if errorlevel 1 pause
