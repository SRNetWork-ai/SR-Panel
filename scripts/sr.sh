#!/usr/bin/env bash
# =============================================================================
#  SR — SRPanel management console (installed to /usr/local/bin/SR by install.sh)
#  Usage:  SR            interactive menu
#          SR <command>  see `SR help`
# =============================================================================
set -Eeuo pipefail

CONF=/etc/srpanel.conf
SRP_DIR="${SRP_DIR:-/opt/srpanel}"
SRP_BRANCH="${SRP_BRANCH:-main}"
# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF"
REPO_RAW="https://raw.githubusercontent.com/SRNetWork-ai/SR-Panel"

if [ -t 1 ]; then
	C0=$'\033[0m'; CB=$'\033[1m'; CDIM=$'\033[2m'; CRED=$'\033[31m'; CGRN=$'\033[32m'; CYEL=$'\033[33m'; CCYN=$'\033[36m'; CMAG=$'\033[35m'
else
	C0=""; CB=""; CDIM=""; CRED=""; CGRN=""; CYEL=""; CCYN=""; CMAG=""
fi
info() { printf '%s▸%s %s\n' "$CCYN" "$C0" "$*"; }
ok()   { printf '%s✔%s %s\n' "$CGRN" "$C0" "$*"; }
warn() { printf '%s⚠%s %s\n' "$CYEL" "$C0" "$*" >&2; }
die()  { printf '%s✖ %s%s\n' "$CRED" "$*" "$C0" >&2; exit 1; }

# prompts always talk to the terminal, even when the script is piped (curl | bash)
if { : < /dev/tty; } 2>/dev/null && { : >> /dev/tty; } 2>/dev/null; then TTY=/dev/tty; OUT=/dev/tty; else TTY=/dev/stdin; OUT=/dev/stderr; fi
ask() { local __v="$1" p="$2" d="${3:-}" a=""; if [ -n "$d" ]; then printf '%s%s%s [%s]: ' "$CB" "$p" "$C0" "$d" >> "$OUT"; else printf '%s%s%s: ' "$CB" "$p" "$C0" >> "$OUT"; fi; IFS= read -r a < "$TTY" || true; printf -v "$__v" '%s' "${a:-$d}"; }
ask_secret() { local __v="$1" p="$2" a=""; printf '%s%s%s: ' "$CB" "$p" "$C0" >> "$OUT"; IFS= read -rs a < "$TTY" || true; printf '\n' >> "$OUT"; printf -v "$__v" '%s' "$a"; }
confirm() { local a=""; printf '%s%s%s [y/N]: ' "$CB" "$1" "$C0" >> "$OUT"; IFS= read -r a < "$TTY" || true; case "$a" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac; }
run() { "$@" || warn "command finished with errors"; }
pause() { printf '\n%sPress Enter to continue …%s' "$CDIM" "$C0" >> "$OUT"; IFS= read -r _ < "$TTY" || true; }

[ "$(id -u)" -eq 0 ] || die "run as root:  sudo SR"
[ -f "$SRP_DIR/docker-compose.yml" ] || die "SRPanel not found in $SRP_DIR — install first: bash <(curl -Ls $REPO_RAW/main/install.sh)"
cd "$SRP_DIR"

dc() { docker compose "$@"; }
env_get() { { grep -E "^$1=" .env 2>/dev/null || true; } | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }
env_set() {
	local k="$1" v="$2" esc
	esc=$(printf '%s' "$v" | sed -e 's/[\/&|]/\\&/g')
	if grep -qE "^$k=" .env; then sed -i "s|^$k=.*|$k=$esc|" .env; else printf '%s=%s\n' "$k" "$v" >> .env; fi
}
version() { grep -o '"version": *"[^"]*"' apps/web/package.json 2>/dev/null | head -1 | sed 's/.*: *"//; s/"//' || echo "?"; }
health_json() { dc exec -T web wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null || true; }
cli() { dc run --rm --no-deps -T worker npx tsx apps/worker/src/cli.ts "$@"; }
wait_db() { local i; for i in $(seq 1 30); do dc exec -T db pg_isready -U "$(env_get POSTGRES_USER)" -d "$(env_get POSTGRES_DB)" >/dev/null 2>&1 && return 0; sleep 2; done; return 1; }
wait_web() { local i; info "waiting for the panel …"; for i in $(seq 1 60); do [ -n "$(health_json)" ] && { ok "panel is up"; return 0; }; sleep 3; done; warn "panel not healthy yet — check:  SR logs"; return 1; }
running_count() { { dc ps --status running -q 2>/dev/null || true; } | wc -l | tr -d ' '; }
total_count() { { dc ps -aq 2>/dev/null || true; } | wc -l | tr -d ' '; }

# ---------- commands ---------------------------------------------------------
cmd_status() {
	local h; h="$(health_json)"
	printf '%sSRPanel%s v%s   dir: %s   branch: %s\n' "$CB" "$C0" "$(version)" "$SRP_DIR" "$SRP_BRANCH"
	printf 'URL:    %s\n' "$(env_get SRP_PUBLIC_URL)"
	if [ -n "$h" ]; then printf 'Health: %s%s%s\n' "$CGRN" "$h" "$C0"; else printf 'Health: %sno response from web container%s\n' "$CRED" "$C0"; fi
	printf '\n'; dc ps 2>/dev/null || true
}
cmd_start()   { dc up -d --remove-orphans; wait_web || true; }
cmd_stop()    { dc stop; ok "stopped"; }
cmd_restart() { dc restart; wait_web || true; }
cmd_logs()    { dc logs -f --tail 200 "$@"; }
cmd_rebuild() { dc up -d --build --force-recreate --remove-orphans; wait_web || true; }
cmd_update() {
	if [ -d .git ]; then
		info "fetching latest source (origin/$SRP_BRANCH) …"
		git fetch -q --depth 1 origin "$SRP_BRANCH" && git reset -q --hard "origin/$SRP_BRANCH" && ok "source at $(git rev-parse --short HEAD)" || warn "git update failed — rebuilding current files"
	else
		warn "$SRP_DIR is not a git checkout — skipping source update"
	fi
	if [ -f scripts/sr.sh ]; then install -m 755 scripts/sr.sh /usr/local/bin/SR; ln -sf /usr/local/bin/SR /usr/local/bin/sr; ln -sf /usr/local/bin/SR /usr/local/bin/srpanel; fi
	info "rebuilding images …"
	dc up -d --build --remove-orphans
	docker image prune -f >/dev/null 2>&1 || true
	wait_web || true
	ok "update finished — v$(version)"
}
cmd_creds() {
	printf '%sPanel URL:%s %s\n' "$CB" "$C0" "$(env_get SRP_PUBLIC_URL)"
	printf '%sUsername: %s %s\n' "$CB" "$C0" "$(env_get SRP_OWNER_USERNAME)"
	printf '%sPassword: %s %s\n' "$CB" "$C0" "$(env_get SRP_OWNER_PASSWORD)"
	printf '%s(initial password from .env — if it was changed inside the panel use:  SR passwd)%s\n' "$CDIM" "$C0"
}
cmd_passwd() {
	local u p p2
	u="${1:-}"; [ -n "$u" ] || ask u "Username" "$(env_get SRP_OWNER_USERNAME)"
	u=$(printf '%s' "$u" | tr 'A-Z' 'a-z')
	p="${2:-}"
	if [ -z "$p" ]; then
		while :; do
			ask_secret p "New password (min 8, Enter = generate)"
			[ -z "$p" ] && break
			[[ "$p" =~ ^[A-Za-z0-9@%+=:,./^*!?~_-]{8,}$ ]] || { warn "min 8 chars; allowed: letters, digits and @ % + = : , . / ^ * ! ? ~ _ -"; continue; }
			ask_secret p2 "Repeat password"; [ "$p" = "$p2" ] && break; warn "passwords do not match"
		done
	fi
	[ -n "$p" ] || p=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-16)
	dc up -d db >/dev/null 2>&1 || true
	wait_db || die "database is not reachable"
	info "applying …"
	cli reset-password "$u" "$p" || die "reset failed (see message above)"
	if [ "$u" = "$(env_get SRP_OWNER_USERNAME)" ] || [ -z "$(env_get SRP_OWNER_USERNAME)" ]; then env_set SRP_OWNER_USERNAME "$u"; env_set SRP_OWNER_PASSWORD "$p"; fi
	printf '\n%sUsername:%s %s\n%sPassword:%s %s\n' "$CB" "$C0" "$u" "$CB" "$C0" "$p"
}
cmd_2fa_off() { local u="${1:-}"; [ -n "$u" ] || ask u "Username" "$(env_get SRP_OWNER_USERNAME)"; wait_db || die "database is not reachable"; cli disable-2fa "$(printf '%s' "$u" | tr 'A-Z' 'a-z')"; }
cmd_unlock()  { local u="${1:-}"; [ -n "$u" ] || ask u "Username" ""; wait_db || die "database is not reachable"; cli unlock "$(printf '%s' "$u" | tr 'A-Z' 'a-z')"; }
cmd_admins()  { wait_db || die "database is not reachable"; cli admins; }
cmd_domain() {
	local d="${1:-}" url
	printf 'Current domain: %s\n' "$(env_get SRP_DOMAIN)"
	[ -n "$d" ] || ask d "New domain (empty = HTTP only via IP)" ""
	if [ -n "$d" ]; then
		[[ "$d" =~ ^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] || die "invalid domain"
		url="https://$d"; env_set SRP_HTTP_PORT 80
	else
		local ip; ip=$(curl -fsS4 --max-time 8 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
		url="http://$ip"; if [ "$(env_get SRP_HTTP_PORT)" != 80 ]; then url="$url:$(env_get SRP_HTTP_PORT)"; fi
	fi
	env_set SRP_DOMAIN "$d"; env_set SRP_PUBLIC_URL "$url"
	dc up -d --force-recreate caddy web worker >/dev/null
	ok "domain set to '${d:-<none>}' — URL: $url"
	[ -z "$d" ] || info "make sure DNS A record of $d points to this server; Caddy will fetch the TLS certificate automatically."
}
cmd_port() {
	local p="${1:-}"
	[ -n "$p" ] || ask p "HTTP port" "$(env_get SRP_HTTP_PORT)"
	[[ "$p" =~ ^[0-9]{2,5}$ ]] || die "invalid port"
	env_set SRP_HTTP_PORT "$p"
	if [ -z "$(env_get SRP_DOMAIN)" ]; then
		local ip url; ip=$(curl -fsS4 --max-time 8 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}'); url="http://$ip"; if [ "$p" != 80 ]; then url="$url:$p"; fi; env_set SRP_PUBLIC_URL "$url"
	fi
	dc up -d --force-recreate caddy web worker >/dev/null
	ok "HTTP port is now $p — URL: $(env_get SRP_PUBLIC_URL)"
}
cmd_backup() {
	mkdir -p backups
	local f="backups/srpanel-$(date +%Y%m%d-%H%M%S).sql.gz"
	wait_db || die "database is not reachable"
	dc exec -T db pg_dump -U "$(env_get POSTGRES_USER)" -d "$(env_get POSTGRES_DB)" | gzip > "$f"
	ok "database dumped to $SRP_DIR/$f ($(du -h "$f" | cut -f1))"
	info "panel-made backups (with uploads) live in the srp_backups volume:  docker compose cp web:/app/backups ./backups/export"
}
cmd_restore() {
	local f="${1:-}"
	[ -n "$f" ] || { ls -1 backups/*.sql.gz 2>/dev/null || true; ask f "Backup file (.sql or .sql.gz)" ""; }
	[ -f "$f" ] || die "file not found: $f"
	warn "this REPLACES the whole database with $f"
	confirm "Continue?" || { echo "cancelled"; return 0; }
	local U D; U="$(env_get POSTGRES_USER)"; D="$(env_get POSTGRES_DB)"
	dc stop web worker >/dev/null
	wait_db || die "database is not reachable"
	dc exec -T db psql -q -U "$U" -d "$D" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >/dev/null
	case "$f" in *.gz) gunzip -c "$f" | dc exec -T db psql -q -U "$U" -d "$D" >/dev/null ;; *) dc exec -T db psql -q -U "$U" -d "$D" < "$f" >/dev/null ;; esac
	dc start web worker >/dev/null
	wait_web || true
	ok "restore finished"
}
cmd_shell()   { dc exec web sh; }
cmd_bbr() {
	printf 'net.core.default_qdisc=fq\nnet.ipv4.tcp_congestion_control=bbr\n' > /etc/sysctl.d/99-srpanel-bbr.conf
	sysctl --system >/dev/null 2>&1 || sysctl -p /etc/sysctl.d/99-srpanel-bbr.conf >/dev/null
	ok "BBR: $(sysctl -n net.ipv4.tcp_congestion_control)"
}
cmd_cleanup() { docker system prune -f; ok "docker cleanup done"; }
cmd_uninstall() {
	warn "this removes SRPanel containers from this server"
	confirm "Uninstall SRPanel?" || { echo "cancelled"; return 0; }
	if confirm "Also DELETE all data (database, backups, uploads, certificates)?"; then dc down -v --remove-orphans; else dc down --remove-orphans; fi
	rm -f /usr/local/bin/SR /usr/local/bin/sr /usr/local/bin/srpanel /etc/srpanel.conf
	if confirm "Delete the source directory $SRP_DIR?"; then cd / && rm -rf "$SRP_DIR"; fi
	ok "SRPanel uninstalled"
}
cmd_doctor() {
	local p holder issues=0 r t
	r=$(running_count); t=$(total_count)
	printf '\n%s⚡ SRPanel doctor%s\n' "$CB" "$C0"
	printf '  %-14s %s\n' "directory" "$SRP_DIR"
	printf '  %-14s v%s\n' "version" "$(version)"
	printf '  %-14s %s/%s running\n' "containers" "$r" "$t"
	if [ "$t" -eq 0 ] || [ "$r" != "$t" ]; then warn "not every container is running — see:  SR logs"; issues=$((issues+1)); fi
	for p in "$(env_get SRP_HTTP_PORT)" "$(env_get SRP_HTTPS_PORT)"; do
		[ -n "$p" ] || continue
		if ss -ltnH "sport = :$p" 2>/dev/null | grep -q .; then
			holder="$(docker ps --filter "publish=$p" 2>/dev/null | awk 'NR>1 {print $NF}' | tr '\n' ' ')"
			[ -n "${holder// /}" ] || holder="$(ss -ltnpH "sport = :$p" 2>/dev/null | head -1 | awk -F'"' '{print $2}')"
			holder="${holder% }"
			printf '  %-14s listening (%s)\n' "port $p" "${holder:-unknown}"
			case "$holder" in *srpanel*) ;; *) warn "port $p belongs to another service — move the panel with:  SR port <free port>"; issues=$((issues+1)) ;; esac
		else
			printf '  %-14s nothing is listening\n' "port $p"
			issues=$((issues+1))
		fi
	done
	if [ -n "$(health_json)" ]; then printf '  %-14s ok\n' "health"; else printf '  %-14s no answer\n' "health"; issues=$((issues+1)); fi
	printf '  %-14s %s\n' "disk free" "$(df -h "$SRP_DIR" 2>/dev/null | awk 'NR==2 {print $4}')"
	printf '  %-14s %s\n' "memory free" "$(free -h 2>/dev/null | awk 'NR==2 {print $7}')"
	printf '  %-14s %s\n' "panel url" "$(env_get SRP_PUBLIC_URL)"
	if [ "$issues" -eq 0 ]; then ok "everything looks healthy"; else warn "$issues problem(s) found — try:  SR rebuild   or   SR logs web"; fi
}
cmd_help() {
	cat <<EOF
${CB}SR${C0} — SRPanel management console  (v$(version), $SRP_DIR)

  SR                     interactive menu
  SR status              containers + health
  SR doctor              diagnose ports, health, disk
  SR start|stop|restart  control services
  SR logs [web|worker|db|caddy]
  SR update              pull latest source, rebuild, restart
  SR rebuild             force rebuild of the images
  SR creds               show panel URL and owner login
  SR passwd [user] [pass] reset an admin password (creates the owner if none)
  SR admins              list admin accounts
  SR 2fa-off [user]      disable two-factor auth for an account
  SR unlock [user]       re-activate a disabled account
  SR domain [host]       set/remove the panel domain (auto HTTPS)
  SR port [n]            change the HTTP port (no-domain mode)
  SR backup              dump the database to $SRP_DIR/backups/
  SR restore <file>      restore a .sql/.sql.gz dump
  SR bbr                 enable TCP BBR
  SR cleanup             docker system prune
  SR shell               shell inside the web container
  SR uninstall           remove SRPanel
EOF
}

# ---------- menu -------------------------------------------------------------
menu() {
	while :; do
		clear 2>/dev/null || true
		printf '%s%s⚡ SRPanel%s %sv%s · management console%s\n' "$CB" "$CMAG" "$C0" "$CDIM" "$(version)" "$C0"
		printf '%s────────────────────────────────────────────────────────%s\n' "$CDIM" "$C0"
		local r t; r=$(running_count); t=$(total_count)
		if [ "$t" -gt 0 ] && [ "$r" = "$t" ]; then printf ' Status: %s● running%s (%s/%s)   ' "$CGRN" "$C0" "$r" "$t"; elif [ "$r" -gt 0 ]; then printf ' Status: %s● partial%s (%s/%s)   ' "$CYEL" "$C0" "$r" "$t"; else printf ' Status: %s● stopped%s   ' "$CRED" "$C0"; fi
		printf 'URL: %s\n' "$(env_get SRP_PUBLIC_URL)"
		printf '%s────────────────────────────────────────────────────────%s\n' "$CDIM" "$C0"
		cat <<EOF
  1) Status & health          9) Change domain (auto HTTPS)
  2) Start                   10) Change HTTP port
  3) Stop                    11) Reset admin password
  4) Restart                 12) Disable 2FA for an admin
  5) Logs: web               13) Backup database now
  6) Logs: worker            14) Restore database
  7) Update to latest        15) Enable BBR
  8) Rebuild images          16) Docker cleanup

  c) Credentials   d) Doctor   a) List admins   s) Shell   u) Uninstall   0) Exit
EOF
		local c; ask c "Select" ""
		printf '\n'
		case "$c" in
			1) run cmd_status ;; 2) run cmd_start ;; 3) run cmd_stop ;; 4) run cmd_restart ;;
			5) run cmd_logs web ;; 6) run cmd_logs worker ;; 7) run cmd_update ;; 8) run cmd_rebuild ;;
			9) run cmd_domain ;; 10) run cmd_port ;; 11) run cmd_passwd ;; 12) run cmd_2fa_off ;;
			13) run cmd_backup ;; 14) run cmd_restore ;; 15) run cmd_bbr ;; 16) run cmd_cleanup ;;
			c|C) run cmd_creds ;; d|D) run cmd_doctor ;; a|A) run cmd_admins ;; s|S) run cmd_shell ;; u|U) run cmd_uninstall; exit 0 ;;
			0|q|Q|"") exit 0 ;;
			*) warn "unknown option" ;;
		esac
		pause
	done
}

cmd="${1:-menu}"; shift || true
case "$cmd" in
	menu) menu ;;
	status|st) cmd_status ;;
	doctor|diagnose|check) cmd_doctor ;;
	start|up) cmd_start ;;
	stop|down) cmd_stop ;;
	restart) cmd_restart ;;
	logs|log) cmd_logs "$@" ;;
	update|upgrade) cmd_update ;;
	rebuild) cmd_rebuild ;;
	creds|login|info) cmd_creds ;;
	passwd|password|reset-password) cmd_passwd "$@" ;;
	admins) cmd_admins ;;
	2fa-off|disable-2fa) cmd_2fa_off "$@" ;;
	unlock) cmd_unlock "$@" ;;
	domain) cmd_domain "$@" ;;
	port) cmd_port "$@" ;;
	backup) cmd_backup ;;
	restore) cmd_restore "$@" ;;
	shell|sh) cmd_shell ;;
	bbr) cmd_bbr ;;
	cleanup|prune) cmd_cleanup ;;
	uninstall|remove) cmd_uninstall ;;
	version|-v|--version) echo "SRPanel v$(version)" ;;
	help|-h|--help) cmd_help ;;
	*) warn "unknown command: $cmd"; cmd_help; exit 2 ;;
esac
