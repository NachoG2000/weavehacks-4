#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# WeaveHacks 4 — one-command setup.
# Built to run for a teammate who JUST cloned the repo, with zero extra steps:
#   ./start.sh
# Checks toolchain → installs deps → sets up .env → starts Redis →
# runs the Redis + Weave health check → launches the dev pipeline.
# ─────────────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

bold(){ printf "\n\033[1m%s\033[0m\n" "$1"; }
ok(){   printf "  \033[32m✓\033[0m %s\n" "$1"; }
warn(){ printf "  \033[33m!\033[0m %s\n" "$1"; }
err(){  printf "  \033[31m✗\033[0m %s\n" "$1"; }

# ── 1/6  Toolchain ──────────────────────────────────────────────────────────
bold "▸ 1/6  Checking toolchain"
command -v node >/dev/null 2>&1 || { err "node not found — install Node 20+ (https://nodejs.org)"; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || { err "Node $NODE_MAJOR found, need >= 20"; exit 1; }
ok "node $(node --version)"
command -v pnpm >/dev/null 2>&1 || { err "pnpm not found — run: npm i -g pnpm"; exit 1; }
ok "pnpm $(pnpm --version)"

# ── 2/6  Dependencies ─────────────────────────────────────────────────────────
bold "▸ 2/6  Installing dependencies"
pnpm install
ok "dependencies installed"

# ── 3/6  Environment ──────────────────────────────────────────────────────────
bold "▸ 3/6  Environment (.env)"
if [ ! -f .env ]; then cp .env.example .env; ok "created .env from .env.example"; else ok ".env already exists"; fi

upsert(){ # upsert KEY=VALUE into .env
  local key="$1" val="$2" tmp
  if grep -qE "^${key}=" .env; then
    tmp="$(mktemp)"; sed "s|^${key}=.*|${key}=${val}|" .env > "$tmp" && mv "$tmp" .env
  else printf "%s=%s\n" "$key" "$val" >> .env; fi
}
prompt_key(){
  local key="$1" desc="$2" cur
  cur="$(grep -E "^${key}=" .env | head -n1 | cut -d= -f2- || true)"
  if [ -n "${cur}" ]; then ok "${key} set"; return; fi
  warn "${key} is empty — ${desc}"
  if [ -t 0 ]; then
    printf "    enter %s (blank to skip): " "$key"
    read -r val < /dev/tty || val=""
    if [ -n "$val" ]; then upsert "$key" "$val"; ok "${key} set"; else warn "${key} left blank — edit .env later"; fi
  else
    warn "non-interactive shell — set ${key} in .env manually"
  fi
}
prompt_key WANDB_API_KEY "Weave observability + W&B Inference runtime agents (one key, both)"
prompt_key REDIS_URL     "shared agent state + pub/sub"

# ── 4/6  Redis ──────────────────────────────────────────────────────────────
bold "▸ 4/6  Redis"
if docker info >/dev/null 2>&1; then
  if [ -n "$(docker ps -q -f name=weavehacks-redis)" ]; then
    ok "redis container already running"
  elif [ -n "$(docker ps -aq -f name=weavehacks-redis)" ]; then
    docker start weavehacks-redis >/dev/null && ok "started existing redis container"
  else
    docker run -d --name weavehacks-redis -p 6379:6379 redis:7-alpine >/dev/null && ok "redis running on :6379 (docker)"
  fi
else
  warn "docker not available — start Redis yourself and set REDIS_URL in .env"
  warn "  e.g.  brew install redis && redis-server   (or a hosted Redis URL)"
fi

# ── 5/6  Health check ─────────────────────────────────────────────────────────
bold "▸ 5/6  Health check (Redis + Weave hello-world)"
pnpm --filter @weavehacks/api health || warn "health check reported problems — see output above (continuing)"

# ── 6/6  Dev pipeline ─────────────────────────────────────────────────────────
bold "▸ 6/6  Launching dev pipeline"
ok "starting turbo dev (web + api) — Ctrl-C to stop"
pnpm dev
