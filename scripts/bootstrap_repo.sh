#!/usr/bin/env bash
set -euo pipefail

# init repo
git init
git branch -m main
git add .
git commit -m "feat: initial PraiaFinder skeleton (backend FastAPI + frontend Next.js + data)"

echo
echo ">> Repo inicializado. Agora cria um repositório no GitHub e corre:"
echo "git remote add origin git@github.com:<TEU_UTILIZADOR>/praiafinder.git"
echo "git push -u origin main"
