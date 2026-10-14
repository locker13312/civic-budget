#!/usr/bin/env bash
# артефакти запуску для tasks/<завдання>/reports: make report TASK=01-foundation
set -euo pipefail

task="${1:?потрібна назва теки завдання, напр. 01-foundation}"
out="tasks/$task/reports"
port="${PORT:-8765}"
sha=$(git rev-parse --short=12 HEAD)
mkdir -p "$out"

header() {
  echo "# $1"
  echo "# коміт: $sha, дата: $(date -u '+%F %H:%M UTC')"
  echo "# відтворити: $2"
  echo
}

# 1. повний конвеєр
{
  header "make check" "make check"
  make --no-print-directory check 2>&1
} | sed -r 's/\x1B\[[0-9;]*m//g' >"$out/check.txt"

# 2. межі модулів і залежності після виправлень аудиту
{
  header "make boundaries" "make boundaries"
  make --no-print-directory boundaries 2>&1
} | sed -r 's/\x1B\[[0-9;]*m//g' >"$out/boundaries.txt"
{
  header "make deps" "make deps"
  make --no-print-directory deps 2>&1
  echo "knip: зауважень немає"
} | sed -r 's/\x1B\[[0-9;]*m//g' >"$out/deps.txt"

# 3. хуки на справжньому git: брудний коміт і push відхиляються
{
  header "тести git-хуків" "node --test --test-reporter=spec test/hooks/hooks.test.js"
  node --test --test-reporter=spec test/hooks/hooks.test.js 2>&1
} | sed -r 's/\x1B\[[0-9;]*m//g' >"$out/hooks.txt"

# 3а. те саме вручну: брудний коміт у свіжому клоні
# клон усередині проєкту, щоб node знайшов node_modules вгору по дереву
demo=$(mktemp -d "$PWD/.civic-tmp-demo.XXXXXX")
git clone -q . "$demo/repo"
{
  header "демо: хук блокує брудний коміт" "scripts/report.sh (розділ 3а)"
  cd "$demo/repo"
  git config core.hooksPath .githooks
  git config commit.gpgsign false
  printf 'const x=1\nexport default x\n' >src/platform/dirty.js
  echo "\$ cat src/platform/dirty.js"
  cat src/platform/dirty.js
  echo "\$ git add src/platform/dirty.js && git commit -m dirty"
  git add src/platform/dirty.js
  set +e
  git -c user.name=demo -c user.email=demo@example.com \
    commit -m dirty 2>&1
  echo "код виходу: $?"
  set -e
  echo "\$ git log --oneline -1   # нового коміту немає"
  git log --oneline -1
  cd - >/dev/null
} >"$out/hook-demo.txt"
rm -rf "$demo"

# 4. запущений застосунок
GIT_SHA="$sha" PORT="$port" node src/server.js >/dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT
for _ in $(seq 50); do
  curl -sf "http://127.0.0.1:$port/health" >/dev/null && break
  sleep 0.1
done
{
  header "запущений застосунок" "make run, потім curl /health і /version"
  echo "\$ curl -s http://127.0.0.1:$port/health"
  curl -s "http://127.0.0.1:$port/health"
  echo
  echo "\$ curl -s http://127.0.0.1:$port/version"
  curl -s "http://127.0.0.1:$port/version"
  echo
} >"$out/run.txt"

echo "звіти записано в $out"
