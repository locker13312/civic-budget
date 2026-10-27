#!/usr/bin/env bash
# артефакти запуску для tasks/<завдання>/reports: npm run report -- 02-prototype-db
set -euo pipefail

task="${1:?потрібна назва теки завдання, напр. 02-prototype-db}"
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

strip() { sed -r 's/\x1B\[[0-9;]*m//g'; }

# запущений застосунок: тіла відповідей через curl
start_server() {
  GIT_SHA="$sha" PORT="$port" node src/server.js "$@" >/dev/null 2>&1 &
  server=$!
  trap 'kill $server 2>/dev/null || true' EXIT
  for _ in $(seq 50); do
    curl -sf "http://127.0.0.1:$port/health" >/dev/null && return
    sleep 0.1
  done
  echo "сервер не відповів" >&2
  exit 1
}

stop_server() {
  kill "$server" 2>/dev/null || true
  wait "$server" 2>/dev/null || true
}

# показати запит і відповідь: show GET /path [user] [json]
show() {
  local method=$1 path=$2 user=${3:-} body=${4:-}
  local args=(-s -X "$method" "http://127.0.0.1:$port$path")
  [ -n "$user" ] && args+=(-H "x-user-id: $user")
  [ -n "$body" ] && args+=(-H 'content-type: application/json' -d "$body")
  echo "\$ curl -X $method $path${user:+ (X-User-Id: $user)}${body:+ $body}"
  curl "${args[@]}" -w '\n[%{http_code}]\n' | cut -c1-400
}

# 1. повний конвеєр
{
  header "npm run check" "npm run check"
  npm run --silent check 2>&1
} | strip >"$out/check.txt"

case "$task" in
01-*)
  {
    header "npm run boundaries" "npm run boundaries"
    npm run --silent boundaries 2>&1
  } | strip >"$out/boundaries.txt"
  {
    header "npm run deps" "npm run deps"
    npm run --silent deps 2>&1
    echo "knip: зауважень немає"
  } | strip >"$out/deps.txt"
  {
    header "тести git-хуків" "node --test --test-reporter=spec test/hooks/hooks.test.js"
    node --test --test-reporter=spec test/hooks/hooks.test.js 2>&1
  } | strip >"$out/hooks.txt"

  # брудний коміт у свіжому клоні; клон усередині проєкту, щоб node знайшов
  # node_modules вгору по дереву
  demo=$(mktemp -d "$PWD/.civic-tmp-demo.XXXXXX")
  git clone -q . "$demo/repo"
  {
    header "демо: хук блокує брудний коміт" "scripts/report.sh 01-foundation"
    cd "$demo/repo"
    git config core.hooksPath .githooks
    git config commit.gpgsign false
    printf 'const x=1\nexport default x\n' >src/platform/dirty.js
    echo "\$ git add src/platform/dirty.js && git commit -m dirty"
    git add src/platform/dirty.js
    set +e
    git -c user.name=demo -c user.email=demo@example.com commit -m dirty 2>&1
    echo "код виходу: $?"
    set -e
    git log --oneline -1
    cd - >/dev/null
  } >"$out/hook-demo.txt"
  rm -rf "$demo"

  start_server --static
  {
    header "запущений застосунок" "npm start, потім curl /health і /version"
    show GET /health
    show GET /version
  } >"$out/run.txt"
  stop_server
  ;;

02-*)
  {
    header "API-сценарії на статичних даних і на PostgreSQL" \
      "node --test --test-reporter=spec test/api/*.test.js"
    node --test --test-reporter=spec test/api/*.test.js 2>&1
  } | strip >"$out/api-scenarios.txt"
  {
    header "поведінка на БД: транзакції, збої, логи, N+1" \
      "node --test --test-reporter=spec test/db/*.test.js"
    node --test --test-reporter=spec test/db/*.test.js 2>&1
  } | strip >"$out/db.txt"
  {
    header "межі шарів (R1–R5)" "npm run boundaries && npm run lint"
    npm run --silent boundaries 2>&1
    npm run --silent lint 2>&1 && echo "eslint: порушень немає"
  } | strip >"$out/layers.txt"

  # прототип і БД через той самий API: голос мешканки 9 за проєкт 5 двічі,
  # підсумки мешканкою 3 (403) і адміністратором 1
  for mode in static postgres; do
    if [ "$mode" = static ]; then
      start_server --static
    else
      npm run --silent db:reset >/dev/null
      start_server
    fi
    {
      header "запущений застосунок: $mode" \
        "npm run $([ "$mode" = static ] && echo start:static || echo start), потім curl"
      show GET /ready
      show GET /version
      show GET /cycles/3/projects
      show POST /projects/5/votes 9
      show POST /projects/5/votes 9
      show POST /cycles/4/tally 3
      show POST /cycles/4/tally 1
      show GET /cycles/4/results
    } >"$out/run-$mode.txt"
    stop_server
  done
  ;;
03-*)
  # рівні тестів, покриття з порогами, мутаційне тестування
  for level in unit integration e2e; do
    {
      header "тести: $level" "npm run test:$level"
      npm run --silent "test:$level" 2>&1
    } | strip >"$out/tests-$level.txt"
  done
  {
    header "покриття unit-тестами модуля results (поріг 100%)" "npm run coverage:unit"
    npm run --silent coverage:unit 2>&1 | sed -n '/start of coverage report/,$p'
  } | strip >"$out/coverage-unit.txt"
  {
    header "покриття всіма тестами (поріг гілок 80%)" "npm run coverage"
    npm run --silent coverage 2>&1 | sed -n '/start of coverage report/,$p'
  } | strip >"$out/coverage.txt"
  {
    header "мутаційне тестування (поріг 70%)" "npm run mutation"
    npm run --silent mutation 2>&1 | grep -vE '^\s*$|INFO (ProjectReader|Instrumenter|ConcurrencyTokenProvider|DryRunExecutor|MutationTestExecutor Done)|^Mutant survived|^\[(Survived|NoCoverage)\]' |
      sed -n '/% Mutation score/,$p'
  } | strip >"$out/mutation.txt"
  ;;
esac

echo "звіти записано в $out"
