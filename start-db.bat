@echo off
rem Bat json-server o che do an toan du lieu (khong lam roi luot ghi). Xem tools/start-db.mjs
cd /d "%~dp0"
node tools\start-db.mjs %*
