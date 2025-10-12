#Requires -Version 5
$ErrorActionPreference = "Stop"

git init
git branch -m main
git add .
git commit -m "feat: initial PraiaFinder skeleton (backend FastAPI + frontend Next.js + data)"

Write-Host ""
Write-Host ">> Repo inicializado. Agora cria um repositório no GitHub e corre:" -ForegroundColor Green
Write-Host "git remote add origin git@github.com:<TEU_UTILIZADOR>/praiafinder.git"
Write-Host "git push -u origin main"
