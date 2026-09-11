#!/usr/bin/env bash
# =============================================================================
#  SRPanel installer  —  VPN reseller cloud panel (Docker based)
#
#  One-liner (Ubuntu 22.04+ / Debian 12+, run as root):
#    bash <(curl -Ls https://raw.githubusercontent.com/SRNetWork-ai/SR-Panel/main/install.sh)
#
#  Options:
#    -y, --yes           non-interactive (use defaults / generate password)
#    --dir=PATH          install directory            (default: /opt/srpanel)
#    --branch=NAME       git branch                   (default: main)
#    --domain=HOST       panel domain (auto HTTPS)    (default: none -> plain HTTP)
#    --user=NAME         owner username               (default: admin)
#    --pass=SECRET       owner password               (default: generated)
#    --port=N            HTTP port when no domain     (default: 80)
#    --wipe              delete an old SRPanel database volume without asking
#    -h, --help          show this help
#
#  Environment overrides: SRP_REPO SRP_BRANCH SRP_DIR SRP_DOMAIN SRP_ADMIN_USER
#  SRP_ADMIN_PASS SRP_BRAND SRP_TZ SRP_HTTP_PORT
#
#  After installation type  SR  for the management menu.
# =============================================================================
set -Eeuo pipefail

SRP_REPO="${SRP_REPO:-https://github.com/SRNetWork-ai/SR-Panel.git}"
SRP_BRANCH="${SRP_BRANCH:-main}"
SRP_DIR="${SRP_DIR:-/opt/srpanel}"
SRP_DOMAIN="${SRP_DOMAIN:-}"
SRP_ADMIN_USER="${SRP_ADMIN_USER:-}"
SRP_ADMIN_PASS="${SRP_ADMIN_PASS:-}"
SRP_BRAND="${SRP_BRAND:-SRPanel}"
SRP_TZ="${SRP_TZ:-Asia/Tehran}"
SRP_HTTP_PORT="${SRP_HTTP_PORT:-80}"
ASSUME_YES=0
WIPE=0
CREDS_CHANGED=0
LOCAL_MODE=0

# ---------- ui helpers -------------------------------------------------------
if [ -t 1 ]; then
	C0=$'\033[0m'; CB=$'\033[1m'; CDIM=$'\033[2m'; CRED=$'\033[31m'; CGRN=$'\033[32m'; CYEL=$'\033[33m'; CCYN=$'\033[36m'; CMAG=$'\033[35m'
else
	C0=""; CB=""; CDIM=""; CRED=""; CGRN=""; CYEL=""; CCYN=""; CMAG=""
fi
info()  { printf '%s▸%s %s\n' "$CCYN" "$C0" "$*"; }
ok()    { printf '%s✔%s %s\n' "$CGRN" "$C0" "$*"; }
warn()  { printf '%s⚠%s %s\n' "$CYEL" "$C0" "$*" >&2; }
die()   { printf '%s✖ %s%s\n' "$CRED" "$*" "$C0" >&2; exit 1; }
step()  { printf '\n%s%s━━ %s %s\n' "$CB" "$CMAG" "$*" "$C0"; }
trap 'printf "\n%s✖ installer failed at line %s. Run again after fixing the issue above.%s\n" "$CRED" "$LINENO" "$C0" >&2' ERR

# prompts always talk to the terminal, even when the script is piped (curl | bash)
if { : < /dev/tty; } 2>/dev/null && { : >> /dev/tty; } 2>/dev/null; then TTY=/dev/tty; OUT=/dev/tty; else TTY=/dev/stdin; OUT=/dev/stderr; fi

# ask VAR "prompt" "default"
ask() {
	local __var="$1" prompt="$2" def="${3:-}" ans=""
	if [ "$ASSUME_YES" = 1 ]; then printf -v "$__var" '%s' "$def"; return; fi
	if [ -n "$def" ]; then
		printf '%s%s%s [%s]: ' "$CB" "$prompt" "$C0" "$def" >> "$OUT"
	else
		printf '%s%s%s: ' "$CB" "$prompt" "$C0" >> "$OUT"
	fi
	IFS= read -r ans < "$TTY" || true
	printf -v "$__var" '%s' "${ans:-$def}"
}
# ask_secret VAR "prompt"
ask_secret() {
	local __var="$1" prompt="$2" ans=""
	if [ "$ASSUME_YES" = 1 ]; then printf -v "$__var" ''; return; fi
	printf '%s%s%s: ' "$CB" "$prompt" "$C0" >> "$OUT"
	IFS= read -rs ans < "$TTY" || true
	printf '\n' >> "$OUT"
	printf -v "$__var" '%s' "$ans"
}
# confirm "question" default(Y|N)
confirm() {
	local q="$1" def="${2:-Y}" ans=""
	if [ "$ASSUME_YES" = 1 ]; then [ "$def" = Y ]; return; fi
	if [ "$def" = Y ]; then printf '%s%s%s [Y/n]: ' "$CB" "$q" "$C0" >> "$OUT"; else printf '%s%s%s [y/N]: ' "$CB" "$q" "$C0" >> "$OUT"; fi
	IFS= read -r ans < "$TTY" || true
	ans="${ans:-$def}"
	case "$ans" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}
gen_pass()   { openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-16; }
valid_pass() { [[ "$1" =~ ^[A-Za-z0-9@%+=:,./^*!?~_-]{8,}$ ]]; }
valid_user() { [[ "$1" =~ ^[a-zA-Z0-9_.-]{3,32}$ ]]; }
valid_host() { [[ "$1" =~ ^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; }

usage() {
	cat <<'EOF'
SRPanel installer

  bash <(curl -Ls https://raw.githubusercontent.com/SRNetWork-ai/SR-Panel/main/install.sh) [options]

Options:
  -y, --yes        non-interactive (defaults + generated password)
  --dir=PATH       install directory (default /opt/srpanel)
  --branch=NAME    git branch (default main)
  --domain=HOST    panel domain with automatic HTTPS (default: none, HTTP via IP)
  --user=NAME      owner username (default admin)
  --pass=SECRET    owner password (default: generated)
  --port=N         HTTP port when no domain is used (default 80)
  --wipe           delete an old SRPanel database volume without asking
  -h, --help       this help
EOF
}

# ---------- args -------------------------------------------------------------
for arg in "$@"; do
	case "$arg" in
		-y|--yes) ASSUME_YES=1 ;;
		--wipe) WIPE=1 ;;
		--dir=*) SRP_DIR="${arg#*=}" ;;
		--branch=*) SRP_BRANCH="${arg#*=}" ;;
		--domain=*) SRP_DOMAIN="${arg#*=}" ;;
		--user=*) SRP_ADMIN_USER="${arg#*=}" ;;
		--pass=*) SRP_ADMIN_PASS="${arg#*=}" ;;
		--port=*) SRP_HTTP_PORT="${arg#*=}" ;;
		-h|--help) usage; exit 0 ;;
		*) die "unknown option: $arg (use --help)" ;;
	esac
done

banner() {
	printf '%s%s' "$CB" "$CMAG"
	cat <<'EOF'
   _____ ____  ____                  _
  / ___// __ \/ __ \____ _____  ___| |
  \__ \/ /_/ / /_/ / __ `/ __ \/ _ \ |
 ___/ / _, _/ ____/ /_/ / / / /  __/ |
/____/_/ |_/_/    \__,_/_/ /_/\___/_|
EOF
	printf '%s  VPN Reseller Cloud Panel — installer%s\n\n' "$CDIM" "$C0"
}

# ---------- 1. system --------------------------------------------------------
need_root() { [ "$(id -u)" -eq 0 ] || die "please run as root (sudo -i)"; }

detect_os() {
	OS_ID=unknown
	if [ -r /etc/os-release ]; then . /etc/os-release; OS_ID="${ID:-unknown}"; fi
	case "$OS_ID" in
		ubuntu|debian) ok "OS: ${PRETTY_NAME:-$OS_ID}" ;;
		*) warn "untested OS ($OS_ID). Continuing anyway — Ubuntu 22.04+ / Debian 12+ recommended." ;;
	esac
	command -v systemctl >/dev/null 2>&1 || warn "systemd not found — docker service management may not work"
}

install_deps() {
	local pkgs=()
	for c in curl git openssl; do command -v "$c" >/dev/null 2>&1 || pkgs+=("$c"); done
	command -v ss >/dev/null 2>&1 || pkgs+=(iproute2)
	if [ "${#pkgs[@]}" -gt 0 ] && command -v apt-get >/dev/null 2>&1; then
		info "installing packages: ${pkgs[*]}"
		export DEBIAN_FRONTEND=noninteractive
		apt-get update -qq >/dev/null
		apt-get install -y -qq ca-certificates "${pkgs[@]}" >/dev/null
	fi
	ok "base tools ready (curl, git, openssl)"
}

install_docker() {
	if ! command -v docker >/dev/null 2>&1; then
		info "installing Docker (get.docker.com) …"
		curl -fsSL https://get.docker.com | sh >/dev/null
	fi
	systemctl enable --now docker >/dev/null 2>&1 || true
	if ! docker compose version >/dev/null 2>&1; then
		info "installing docker compose plugin …"
		apt-get install -y -qq docker-compose-plugin >/dev/null 2>&1 || die "docker compose plugin is missing — install Docker from get.docker.com"
	fi
	docker info >/dev/null 2>&1 || die "docker daemon is not running"
	ok "Docker $(docker --version | sed 's/Docker version //; s/,.*//') / compose $(docker compose version --short 2>/dev/null || echo ok)"
}

ensure_swap() {
	local mem swap
	mem=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 4096)
	swap=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
	if [ "$mem" -lt 2500 ] && [ "$swap" -lt 512 ]; then
		warn "only ${mem}MB RAM and no swap — the build may run out of memory"
		if confirm "Create a 2GB swap file (/swapfile)?" Y; then
			if [ ! -f /swapfile ]; then
				fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
				chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
				grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
			fi
			ok "swap enabled"
		fi
	fi
}

# ---------- 2. source --------------------------------------------------------
fetch_source() {
	local here
	here="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" 2>/dev/null && pwd || echo /)"
	if [ -f "$here/docker-compose.yml" ] && [ -d "$here/apps/web" ]; then
		SRP_DIR="$here"; LOCAL_MODE=1
		ok "using local checkout: $SRP_DIR"
		if [ -d "$SRP_DIR/.git" ]; then
			git -C "$SRP_DIR" pull --ff-only -q 2>/dev/null && ok "repository updated" || warn "could not fast-forward the repository (local changes?) — continuing with current files"
		fi
	elif [ -d "$SRP_DIR/.git" ]; then
		info "updating existing installation in $SRP_DIR …"
		git -C "$SRP_DIR" fetch -q --depth 1 origin "$SRP_BRANCH"
		git -C "$SRP_DIR" reset -q --hard "origin/$SRP_BRANCH"
		ok "source updated ($(git -C "$SRP_DIR" rev-parse --short HEAD))"
	else
		if [ -e "$SRP_DIR" ] && [ -n "$(ls -A "$SRP_DIR" 2>/dev/null)" ]; then
			die "$SRP_DIR exists and is not a git checkout — remove it or use --dir="
		fi
		info "cloning $SRP_REPO ($SRP_BRANCH) → $SRP_DIR"
		git clone -q --depth 1 -b "$SRP_BRANCH" "$SRP_REPO" "$SRP_DIR"
		ok "source ready ($(git -C "$SRP_DIR" rev-parse --short HEAD))"
	fi
	cd "$SRP_DIR"
	mkdir -p backups
}

# find an older install (other directory) that already runs the srpanel compose project
find_old_install() {
	local ids id wd
	ids=$(docker ps -aq --filter label=com.docker.compose.project=srpanel 2>/dev/null || true)
	for id in $ids; do
		wd=$( { docker inspect "$id" 2>/dev/null | grep -o '"com.docker.compose.project.working_dir": *"[^"]*"' || true; } | head -1 | sed 's/.*: *"//; s/"$//')
		if [ -n "$wd" ] && [ "$wd" != "$SRP_DIR" ]; then echo "$wd"; return; fi
	done
}

migrate_or_wipe() {
	[ -f .env ] && return 0
	local old
	old="$(find_old_install)"
	if [ -n "$old" ] && [ -f "$old/.env" ]; then
		warn "found an older SRPanel installation in $old"
		if confirm "Re-use its configuration & database (recommended)?" Y; then
			cp "$old/.env" .env && chmod 600 .env
			ok "configuration migrated from $old"
			info "stopping old containers …"; (cd "$old" && docker compose down --remove-orphans >/dev/null 2>&1) || docker compose -p srpanel down --remove-orphans >/dev/null 2>&1 || true
			return 0
		fi
	fi
	if docker volume inspect srpanel_srp_pgdata >/dev/null 2>&1; then
		warn "an old SRPanel database volume exists (srpanel_srp_pgdata) but no configuration was found for it"
		if [ "$WIPE" = 1 ] || confirm "Delete old SRPanel containers and data volumes for a clean install?" N; then
			docker compose -p srpanel down -v --remove-orphans >/dev/null 2>&1 || true
			for v in srpanel_srp_pgdata srpanel_srp_backups srpanel_srp_uploads srpanel_srp_caddy_data srpanel_srp_caddy_config; do docker volume rm -f "$v" >/dev/null 2>&1 || true; done
			ok "old data removed"
		else
			die "cannot continue: a new database password would not match the old volume. Re-run with --wipe or restore the old .env"
		fi
	fi
}

# ---------- 3. configuration -------------------------------------------------
env_get() { { grep -E "^$1=" .env 2>/dev/null || true; } | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }

public_ip() {
	local ip
	ip=$(curl -fsS4 --max-time 8 https://ifconfig.me 2>/dev/null || curl -fsS4 --max-time 8 https://api.ipify.org 2>/dev/null || true)
	[ -n "$ip" ] || ip=$(hostname -I 2>/dev/null | awk '{print $1}')
	echo "${ip:-127.0.0.1}"
}

configure() {
	local reconfigure=1 secret dbpass dbuser dbname
	if [ -f .env ]; then
		ok "existing configuration found (.env)"
		if confirm "Keep the current configuration (domain / admin / password)?" Y; then reconfigure=0; fi
	fi
	# never rotate secrets that are tied to existing data
	secret="$(env_get SRP_SECRET)"; [ -n "$secret" ] && [ "$secret" != "change-me-please-use-openssl-rand-hex-32" ] || secret="$(openssl rand -hex 32)"
	dbpass="$(env_get POSTGRES_PASSWORD)"; [ -n "$dbpass" ] && [ "$dbpass" != "change-me-db" ] || dbpass="$(openssl rand -hex 16)"
	dbuser="$(env_get POSTGRES_USER)"; dbuser="${dbuser:-srpanel}"
	dbname="$(env_get POSTGRES_DB)"; dbname="${dbname:-srpanel}"
	SRP_HTTPS_PORT="$(env_get SRP_HTTPS_PORT)"; SRP_HTTPS_PORT="${SRP_HTTPS_PORT:-443}"

	if [ "$reconfigure" = 0 ]; then
		SRP_DOMAIN="$(env_get SRP_DOMAIN)"
		SRP_ADMIN_USER="$(env_get SRP_OWNER_USERNAME)"
		SRP_ADMIN_PASS="$(env_get SRP_OWNER_PASSWORD)"
		SRP_BRAND="$(env_get SRP_BRAND_NAME)"
		SRP_TZ="$(env_get SRP_TZ)"; SRP_TZ="${SRP_TZ:-Asia/Tehran}"
		SRP_HTTP_PORT="$(env_get SRP_HTTP_PORT)"; SRP_HTTP_PORT="${SRP_HTTP_PORT:-80}"
		grep -q '^SRP_HTTP_PORT=' .env || printf 'SRP_HTTP_PORT=%s\nSRP_HTTPS_PORT=%s\n' "$SRP_HTTP_PORT" "$SRP_HTTPS_PORT" >> .env
		return 0
	fi

	printf '\n%sAnswer a few questions (Enter = default).%s\n\n' "$CDIM" "$C0"
	# domain
	local d="$SRP_DOMAIN"
	if [ -z "$d" ]; then ask d "Panel domain (must point to this server; leave empty for HTTP-only via IP)" ""; fi
	while [ -n "$d" ] && ! valid_host "$d"; do warn "invalid domain"; ask d "Panel domain" ""; done
	SRP_DOMAIN="$d"
	# port (only without domain)
	if [ -z "$SRP_DOMAIN" ]; then
		ask SRP_HTTP_PORT "HTTP port" "${SRP_HTTP_PORT:-80}"
		[[ "$SRP_HTTP_PORT" =~ ^[0-9]{2,5}$ ]] || SRP_HTTP_PORT=80
	else
		SRP_HTTP_PORT=80
	fi
	# admin user
	local u="${SRP_ADMIN_USER:-}"
	[ -n "$u" ] || ask u "Owner (super-admin) username" "admin"
	while ! valid_user "$u"; do warn "3-32 chars: letters, digits, . _ -"; ask u "Owner username" "admin"; done
	SRP_ADMIN_USER="$(printf '%s' "$u" | tr 'A-Z' 'a-z')"
	# admin password
	local p="${SRP_ADMIN_PASS:-}" p2=""
	if [ -z "$p" ] && [ "$ASSUME_YES" != 1 ]; then
		while :; do
			ask_secret p "Owner password (min 8 chars, Enter = generate a strong one)"
			if [ -z "$p" ]; then break; fi
			if ! valid_pass "$p"; then warn "min 8 chars; allowed: letters, digits and @ % + = : , . / ^ * ! ? ~ _ -"; continue; fi
			ask_secret p2 "Repeat password"
			[ "$p" = "$p2" ] && break
			warn "passwords do not match"
		done
	fi
	if [ -z "$p" ]; then p="$(gen_pass)"; info "generated owner password"; fi
	valid_pass "$p" || die "password contains unsupported characters"
	SRP_ADMIN_PASS="$p"
	CREDS_CHANGED=1
	# brand + tz
	ask SRP_BRAND "Brand name" "${SRP_BRAND:-SRPanel}"
	ask SRP_TZ "Timezone" "${SRP_TZ:-Asia/Tehran}"

	local url
	if [ -n "$SRP_DOMAIN" ]; then url="https://$SRP_DOMAIN"; else url="http://$(public_ip)"; if [ "$SRP_HTTP_PORT" != 80 ]; then url="$url:$SRP_HTTP_PORT"; fi; fi

	local keep_trongrid; keep_trongrid="$(env_get SRP_TRONGRID_KEY)"
	local keep_sync; keep_sync="$(env_get SRP_SYNC_INTERVAL_SEC)"; keep_sync="${keep_sync:-60}"
	[ -f .env ] && cp .env ".env.bak.$(date +%Y%m%d-%H%M%S)"
	umask 077
	cat > .env <<EOF
# ---------- SRPanel (generated by install.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)) ----------
SRP_PUBLIC_URL=$url
SRP_DOMAIN=$SRP_DOMAIN
SRP_HTTP_PORT=$SRP_HTTP_PORT
SRP_HTTPS_PORT=$SRP_HTTPS_PORT
SRP_SECRET=$secret
SRP_OWNER_USERNAME=$SRP_ADMIN_USER
SRP_OWNER_PASSWORD=$SRP_ADMIN_PASS
SRP_BRAND_NAME="$SRP_BRAND"
SRP_SYNC_INTERVAL_SEC=$keep_sync

# ---------- Database ----------
POSTGRES_USER=$dbuser
POSTGRES_PASSWORD=$dbpass
POSTGRES_DB=$dbname
DATABASE_URL=postgresql://$dbuser:$dbpass@db:5432/$dbname?schema=public

# ---------- Runtime ----------
SRP_TZ=$SRP_TZ
SRP_BACKUP_DIR=/app/backups
SRP_UPLOAD_DIR=/app/uploads
SRP_TRONGRID_KEY=$keep_trongrid
EOF
	chmod 600 .env
	umask 022
	ok "configuration written to $SRP_DIR/.env"
}

# ---------- 4. fonts (binary assets are not stored in git) ------------------
fetch_fonts() {
	local dir="$SRP_DIR/apps/web/public/fonts" f url got=0 miss=0
	mkdir -p "$dir"
	for f in Vazirmatn-Regular Vazirmatn-Medium Vazirmatn-SemiBold Vazirmatn-Bold; do
		if [ -s "$dir/$f.woff2" ] && [ "$(head -c 4 "$dir/$f.woff2")" = "wOF2" ]; then continue; fi
		for url in \
			"https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@master/fonts/webfonts/$f.woff2" \
			"https://raw.githubusercontent.com/rastikerdar/vazirmatn/master/fonts/webfonts/$f.woff2" \
			"https://cdn.jsdelivr.net/npm/vazirmatn@33.003/fonts/webfonts/$f.woff2"; do
			if curl -fsSL --max-time 25 -o "$dir/$f.woff2.tmp" "$url" 2>/dev/null && [ "$(head -c 4 "$dir/$f.woff2.tmp")" = "wOF2" ]; then
				mv "$dir/$f.woff2.tmp" "$dir/$f.woff2"; got=$((got+1)); break
			fi
			rm -f "$dir/$f.woff2.tmp"
		done
		[ -s "$dir/$f.woff2" ] || miss=$((miss+1))
	done
	if [ "$miss" -gt 0 ]; then warn "$miss font file(s) could not be downloaded — the panel falls back to system fonts"; else ok "Vazirmatn fonts ready"; fi
}

# ---------- 5. network -------------------------------------------------------
env_set() {
	local k="$1" v="$2"
	if grep -qE "^$k=" .env 2>/dev/null; then
		sed -i "s|^$k=.*|$k=$v|" .env
	else
		printf '%s=%s\n' "$k" "$v" >> .env
	fi
	chmod 600 .env 2>/dev/null || true
}

port_busy() { ss -ltnH "sport = :$1" 2>/dev/null | grep -q .; }

port_is_ours() {
	local out
	out="$(docker ps --filter "publish=$1" --filter "label=com.docker.compose.project=srpanel" -q 2>/dev/null || true)"
	[ -n "$out" ]
}

port_holder() {
	local names proc
	names="$(docker ps --filter "publish=$1" 2>/dev/null | awk 'NR>1 {print $NF}' | tr '\n' ' ' || true)"
	if [ -n "${names// /}" ]; then printf 'container %s' "${names% }"; return 0; fi
	proc="$(ss -ltnpH "sport = :$1" 2>/dev/null | head -1 | awk -F'"' '{print $2}' || true)"
	if [ -n "$proc" ]; then printf '%s' "$proc"; return 0; fi
	printf 'another program'
}

free_port() {
	local p
	for p in "$@"; do port_busy "$p" || { printf '%s' "$p"; return 0; }; done
	for p in $(seq 18080 18120); do port_busy "$p" || { printf '%s' "$p"; return 0; }; done
	printf '%s' "$1"
}

set_http_port() {
	SRP_HTTP_PORT="$1"
	env_set SRP_HTTP_PORT "$SRP_HTTP_PORT"
	if [ -z "$SRP_DOMAIN" ]; then
		local u="http://$(public_ip)"
		[ "$SRP_HTTP_PORT" = 80 ] || u="$u:$SRP_HTTP_PORT"
		env_set SRP_PUBLIC_URL "$u"
	fi
}

set_https_port() { SRP_HTTPS_PORT="$1"; env_set SRP_HTTPS_PORT "$SRP_HTTPS_PORT"; }

check_ports() {
	SRP_HTTPS_PORT="${SRP_HTTPS_PORT:-443}"
	local alt
	if port_busy "$SRP_HTTP_PORT" && ! port_is_ours "$SRP_HTTP_PORT"; then
		alt="$(free_port 8080 8880 8000)"
		warn "port $SRP_HTTP_PORT is already used by $(port_holder "$SRP_HTTP_PORT")"
		if [ "$ASSUME_YES" = 1 ] || confirm "Run the panel on port $alt instead?" Y; then
			set_http_port "$alt"; ok "panel HTTP port changed to $alt"
		else
			warn "keeping port $SRP_HTTP_PORT — free it first, otherwise the web proxy cannot start"
		fi
	fi
	if port_busy "$SRP_HTTPS_PORT" && ! port_is_ours "$SRP_HTTPS_PORT"; then
		alt="$(free_port 8443 9443 10443)"
		if [ -z "$SRP_DOMAIN" ]; then
			info "port $SRP_HTTPS_PORT is used by $(port_holder "$SRP_HTTPS_PORT") — moving the panel HTTPS bind to $alt (unused without a domain)"
			set_https_port "$alt"
		else
			warn "port $SRP_HTTPS_PORT is used by $(port_holder "$SRP_HTTPS_PORT") — automatic TLS needs it"
			if [ "$ASSUME_YES" = 1 ] || confirm "Bind the panel to HTTPS port $alt instead?" N; then
				set_https_port "$alt"; ok "panel HTTPS port changed to $alt"
			else
				warn "stop the other service on port $SRP_HTTPS_PORT, then run:  SR start"
			fi
		fi
	fi
	if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; then
		ufw allow "$SRP_HTTP_PORT/tcp" >/dev/null 2>&1 || true
		[ -z "$SRP_DOMAIN" ] || ufw allow "$SRP_HTTPS_PORT/tcp" >/dev/null 2>&1 || true
		ok "ufw: opened port $SRP_HTTP_PORT${SRP_DOMAIN:+ and $SRP_HTTPS_PORT}"
	fi
}

# ---------- 6. build & run ---------------------------------------------------
BUILD_OK=0

build_and_start() {
	local log busy rc=0
	log="$(mktemp)"
	info "building images and starting services — this takes 3-8 minutes on first install …"
	docker compose up -d --build --remove-orphans 2>&1 | tee "$log" || rc=1
	if [ "$rc" -ne 0 ]; then
		busy="$(sed -n 's/.*Bind for [0-9.]*:\([0-9]*\) failed.*/\1/p' "$log" | head -1)"
		if [ -n "$busy" ]; then
			warn "port $busy is already allocated to $(port_holder "$busy") — remapping and retrying once …"
			if [ "$busy" = "$SRP_HTTPS_PORT" ]; then set_https_port "$(free_port 8443 9443 10443)"
			elif [ "$busy" = "$SRP_HTTP_PORT" ]; then set_http_port "$(free_port 8080 8880 8000)"
			fi
			rc=0
			docker compose up -d --remove-orphans 2>&1 | tail -n 15 || rc=1
		fi
	fi
	rm -f "$log"
	if [ "$rc" -eq 0 ]; then
		BUILD_OK=1; ok "containers started"
	else
		BUILD_OK=0; warn "some services did not start — files are installed, diagnose with:  SR doctor"
	fi
}

wait_ready() {
	local i
	info "waiting for the panel to become healthy …"
	for i in $(seq 1 60); do
		if docker compose exec -T web wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then ok "panel is up"; return 0; fi
		sleep 3
	done
	warn "the panel did not answer within 3 minutes. Recent logs:"
	docker compose logs --tail 40 web || true
	return 1
}

apply_credentials() {
	[ "$CREDS_CHANGED" = 1 ] || return 0
	info "applying owner credentials …"
	if docker compose run --rm --no-deps -T worker npx tsx apps/worker/src/cli.ts reset-password "$SRP_ADMIN_USER" "$SRP_ADMIN_PASS" >/dev/null 2>&1; then
		ok "owner account ready: $SRP_ADMIN_USER"
	else
		warn "could not apply credentials automatically — run:  SR passwd"
	fi
}

# ---------- 7. CLI -----------------------------------------------------------
install_cli() {
	if [ -f "$SRP_DIR/scripts/sr.sh" ]; then
		install -m 755 "$SRP_DIR/scripts/sr.sh" /usr/local/bin/SR
		ln -sf /usr/local/bin/SR /usr/local/bin/sr
		ln -sf /usr/local/bin/SR /usr/local/bin/srpanel
		printf 'SRP_DIR=%s\nSRP_BRANCH=%s\n' "$SRP_DIR" "$SRP_BRANCH" > /etc/srpanel.conf
		ok "management command installed:  SR  (aliases: sr, srpanel)"
	else
		warn "scripts/sr.sh not found — management CLI skipped"
	fi
}

summary() {
	local url col ttl
	url="$(env_get SRP_PUBLIC_URL)"
	if [ "$BUILD_OK" = 1 ]; then col="$CGRN"; ttl="SRPanel is installed"; else col="$CYEL"; ttl="SRPanel is installed — services need attention"; fi
	printf '\n%s%s════════════════════════════════════════════════════════════%s\n' "$CB" "$col" "$C0"
	printf '%s  %s %s\n' "$CB" "$ttl" "$C0"
	printf '%s════════════════════════════════════════════════════════════%s\n' "$col" "$C0"
	printf '  %-14s %s%s%s\n' "Panel URL:" "$CB" "$url" "$C0"
	printf '  %-14s %s%s%s\n' "Username:" "$CB" "$(env_get SRP_OWNER_USERNAME)" "$C0"
	printf '  %-14s %s%s%s\n' "Password:" "$CB" "$(env_get SRP_OWNER_PASSWORD)" "$C0"
	printf '  %-14s %s\n' "Install dir:" "$SRP_DIR"
	printf '  %-14s %s\n' "Manage:" "type  SR  (menu)   ·   SR creds   ·   SR doctor   ·   SR logs"
	if [ "$BUILD_OK" != 1 ]; then
		printf '\n  %sNot running yet:%s diagnose with  %sSR doctor%s  and rebuild with  %sSR rebuild%s\n' "$CYEL" "$C0" "$CB" "$C0" "$CB" "$C0"
	elif [ -n "$SRP_DOMAIN" ]; then
		printf '\n  %sTLS:%s Caddy requests a Let'"'"'s Encrypt certificate automatically once DNS for %s points here (ports 80/443 open).\n' "$CDIM" "$C0" "$SRP_DOMAIN"
	fi
	printf '\n  %sCredentials are stored in %s/.env (chmod 600). Change the password after first login.%s\n' "$CDIM" "$SRP_DIR" "$C0"
	printf '%s════════════════════════════════════════════════════════════%s\n\n' "$col" "$C0"
}

# ---------- main -------------------------------------------------------------
main() {
	banner
	need_root
	step "1/6  System check";        detect_os; install_deps; install_docker; ensure_swap
	step "2/6  Source code";         fetch_source; migrate_or_wipe
	step "3/6  Configuration";       configure
	step "4/6  Management command";  install_cli
	step "5/6  Assets & network";    fetch_fonts; check_ports
	step "6/6  Build & start";       build_and_start
	if [ "$BUILD_OK" = 1 ]; then wait_ready || true; apply_credentials; fi
	summary
}

main "$@"
