@echo off
rem Bat json-server cho may local: dung DUNG phien ban ghi trong package.json (0.17.4, giong ban tren Render),
rem khong --watch (tranh roi luot ghi), khong tu xoa ban ghi lien quan. Chi tiet: tools/start-db.mjs
cd /d "%~dp0"
if not exist "node_modules\json-server\package.json" (
  echo Lan dau chay: dang cai json-server theo package.json...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo Khong cai duoc. Kiem tra mang roi chay lai, hoac tu chay: npm install
    exit /b 1
  )
)
node tools\start-db.mjs %*
