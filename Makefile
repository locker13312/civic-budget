# make-цілі лише викликають npm-скрипти з package.json: людина, git-хуки і CI
# запускають одне й те саме (adr/0004)

NPM := npm run --silent
TASK ?= 01-foundation

.PHONY: setup fmt fmt-check lint boundaries types deps docs smoke test build \
	check pre-commit run report clean

setup:
	npm ci

fmt fmt-check lint boundaries types deps docs smoke test build:
	$(NPM) $@

pre-commit: fmt-check lint boundaries smoke

check: fmt-check lint boundaries types deps docs test build

run:
	GIT_SHA=$$(git rev-parse --short=12 HEAD) node src/server.js

report:
	scripts/report.sh $(TASK)

clean:
	rm -rf dist coverage
