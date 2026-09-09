#!/usr/bin/env bash
# SRPanel one-line installer (Ubuntu/Debian). Usage: bash install.sh
set -euo pipefail
BOLD="\033[1m"; GREEN="\033[32m"; CYAN="\033[36m"; NC="\033[0m"
echo -e "${BOLD}${CYAN}⚡ SRPanel installer${NC}"
if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."; curl -fsSL https://get.docker.com | sh
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose plugin missing. Install it and re-run."; exit 1
fi
cd "$(dirname "$0")"
if [ ! -f .env ]; then
  cp .env.example .env
  SECRET=$(openssl rand -hex 32)
  DBPASS=$(openssl rand -hex 16)
  ADMINPASS=$(openssl rand -base64 12 | tr -d '=+/' | cut -c1-14)
  read -rp "Domain for the panel (leave empty for plain HTTP on port 80): " DOMAIN
  PUBLIC_URL="http://$(curl -fsS4 ifconfig.me || hostname -I | awk '{print $1}')"
  [ -n "$DOMAIN" ] && PUBLIC_URL="https://$DOMAIN"
  sed -i "s|^SRP_SECRET=.*|SRP_SECRET=$SECRET|" .env
  sed -i "s|^SRP_DOMAIN=.*|SRP_DOMAIN=$DOMAIN|" .env
  sed -i "s|^SRP_PUBLIC_URL=.*|SRP_PUBLIC_URL=$PUBLIC_URL|" .env
  sed -i "s|^SRP_OWNER_PASSWORD=.*|SRP_OWNER_PASSWORD=$ADMINPASS|" .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$DBPASS|" .env
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://srpanel:$DBPASS@db:5432/srpanel?schema=public|" .env
  echo -e "${GREEN}.env created${NC}"
fi
docker compose up -d --build
source .env
echo -e "\n${GREEN}${BOLD}✅ SRPanel is up${NC}"
echo -e "URL:      ${CYAN}${SRP_PUBLIC_URL}${NC}"
echo -e "Username: ${CYAN}${SRP_OWNER_USERNAME}${NC}"
echo -e "Password: ${CYAN}${SRP_OWNER_PASSWORD}${NC}"
echo -e "Logs:     docker compose logs -f web worker"
