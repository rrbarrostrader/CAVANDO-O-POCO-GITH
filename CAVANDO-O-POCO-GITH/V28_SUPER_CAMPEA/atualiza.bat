@echo off
set /p mensagem=Digite a mensagem do commit: 

git add .
git commit -m "%mensagem%"
git push

echo.
echo Processo concluido!
pause