#!/usr/bin/env bash
# =============================================================================
#  sr-agent — SRPanel host update agent
#  Runs on the host as root (systemd unit: srpanel-agent.service) and executes
#  the jobs the panel asks for through $SRP_DIR/state/update/request.json, so
#  SRPanel can check for and install updates from its own web UI — nobody has
#  to open an SSH session.
#  Manage it with:  SR agent install | status | logs | restart | uninstall
# =============================================================================
set -Eeuo pipefail

CONF=/etc/srpanel.conf
SRP_DIR="${SRP_DIR:-/opt/srpanel}"
SRP_BRANCH="${SRP_BRANCH:-main}"
# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF"

AGENT_VERSION="1.0.0"
STATE="$SRP_DIR/state"
UPD="$STATE/update"
REQ="$UPD/request.json"
ACTIVE="$UPD/request.active.json"
STATUS="$UPD/status.json"
LATEST="$UPD/latest.json"
LOG="$UPD/update.log"
LOCK="$UPD/.agent.lock"
POLL="${SRP_AGENT_POLL:-3}"
MAX_LOG_LINES=1200

JOB_ID=""; JOB_START=""; JOB_END=""
FROM_C=""; TO_C=""; FROM_V=""; TO_V=""
AGENT_RESTART=0

now()   { date -u +%Y-%m-%dT%H:%M:%SZ; }
stamp() { date +%H:%M:%S; }
esc()   { printf '%s' "${1:-}" | tr -d '\r\n' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\t/ /g'; }
version() { grep -o '"version": *"[^"]*"' "$SRP_DIR/apps/web/package.json" 2>/dev/null | head -1 | sed 's/.*: *"//; s/"//' || true; }
gitc()  { git -C "$SRP_DIR" "$@"; }
have_git() { [ -d "$SRP_DIR/.git" ]; }

mkstate() {
	mkdir -p "$UPD"
	chmod 777 "$STATE" "$UPD" 2>/dev/null || true
	[ -f "$LOG" ] || : > "$LOG"
	chmod 666 "$LOG" 2>/dev/null || true
}

log() { printf '[%s] %s\n' "$(stamp)" "$*" >> "$LOG"; }
step_log() { log ""; log "── $*"; }
trim_log() {
	local n
	n=$(wc -l < "$LOG" 2>/dev/null || echo 0)
	if [ "${n:-0}" -gt $((MAX_LOG_LINES * 3)) ]; then
		tail -n "$MAX_LOG_LINES" "$LOG" > "$LOG.tmp" 2>/dev/null && mv -f "$LOG.tmp" "$LOG"
		chmod 666 "$LOG" 2>/dev/null || true
	fi
}

write_json() { # file json
	printf '%s\n' "$2" > "$1.tmp" && mv -f "$1.tmp" "$1"
	chmod 666 "$1" 2>/dev/null || true
}

write_status() { # state step [error]
	local st="$1" sp="${2:-}" er="${3:-}" ej="null"
	[ -n "$er" ] && ej="\"$(esc "$er")\""
	write_json "$STATUS" "{\"id\":\"$(esc "$JOB_ID")\",\"state\":\"$st\",\"step\":\"$(esc "$sp")\",\"at\":\"$(now)\",\"startedAt\":\"$JOB_START\",\"finishedAt\":\"$JOB_END\",\"fromCommit\":\"$FROM_C\",\"toCommit\":\"$TO_C\",\"fromVersion\":\"$(esc "$FROM_V")\",\"toVersion\":\"$(esc "$TO_V")\",\"agentVersion\":\"$AGENT_VERSION\",\"error\":$ej}"
}

heartbeat() {
	local c; c=$(gitc rev-parse --short HEAD 2>/dev/null || echo "")
	write_json "$STATE/agent.json" "{\"agentVersion\":\"$AGENT_VERSION\",\"pid\":$$,\"at\":\"$(now)\",\"dir\":\"$(esc "$SRP_DIR")\",\"branch\":\"$(esc "$SRP_BRANCH")\",\"commit\":\"$c\",\"version\":\"$(esc "$(version)")\",\"poll\":$POLL}"
}

jget() { # key file — minimal JSON string reader
	{ grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$2" 2>/dev/null || true; } | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//'
}

dc() { ( cd "$SRP_DIR" && docker compose --progress plain "$@" ); }
health() { ( cd "$SRP_DIR" && docker compose exec -T web wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null ) || true; }
remote_version() { gitc show "origin/$SRP_BRANCH:apps/web/package.json" 2>/dev/null | grep -o '"version": *"[^"]*"' | head -1 | sed 's/.*: *"//; s/"//'; }

do_check() {
	local behind rc rv subj err="" ej="null"
	mkstate
	log "checking origin/$SRP_BRANCH for updates …"
	have_git || err="$SRP_DIR is not a git checkout — in-panel updates need the installer layout"
	if [ -z "$err" ]; then
		gitc fetch -q --depth 50 origin "$SRP_BRANCH" >> "$LOG" 2>&1 || err="git fetch failed — this server cannot reach GitHub right now"
	fi
	rc=$(gitc rev-parse --short "origin/$SRP_BRANCH" 2>/dev/null || echo "")
	behind=$(gitc rev-list --count "HEAD..origin/$SRP_BRANCH" 2>/dev/null || echo 0)
	subj=$(gitc log -1 --pretty=%s "origin/$SRP_BRANCH" 2>/dev/null || echo "")
	rv=$(remote_version)
	[ -n "$err" ] && ej="\"$(esc "$err")\""
	write_json "$LATEST" "{\"checkedAt\":\"$(now)\",\"localCommit\":\"$(gitc rev-parse --short HEAD 2>/dev/null || echo "")\",\"localVersion\":\"$(esc "$(version)")\",\"remoteCommit\":\"$rc\",\"remoteVersion\":\"$(esc "$rv")\",\"behind\":${behind:-0},\"subject\":\"$(esc "$subj")\",\"error\":$ej}"
	if [ -n "$err" ]; then log "✖ $err"; else log "✔ latest ${rc:-?} (v${rv:-?}) — behind by ${behind:-0} commit(s)"; fi
	trim_log
}

install_helpers() {
	if [ -f "$SRP_DIR/scripts/sr.sh" ]; then
		install -m 755 "$SRP_DIR/scripts/sr.sh" /usr/local/bin/SR 2>/dev/null || true
		ln -sf /usr/local/bin/SR /usr/local/bin/sr 2>/dev/null || true
		ln -sf /usr/local/bin/SR /usr/local/bin/srpanel 2>/dev/null || true
	fi
	if [ -f "$SRP_DIR/scripts/sr-agent.sh" ] && ! cmp -s "$SRP_DIR/scripts/sr-agent.sh" /usr/local/bin/sr-agent; then
		install -m 755 "$SRP_DIR/scripts/sr-agent.sh" /usr/local/bin/sr-agent 2>/dev/null && AGENT_RESTART=1 || true
		log "agent itself was updated — it restarts once this job is done"
	fi
}

do_update() {
	local i h=""
	mkstate
	JOB_START="$(now)"; JOB_END=""; TO_C=""; TO_V=""
	: > "$LOG"; chmod 666 "$LOG" 2>/dev/null || true
	FROM_C=$(gitc rev-parse --short HEAD 2>/dev/null || echo "")
	FROM_V=$(version)
	log "SRPanel update started — agent v$AGENT_VERSION"
	log "dir: $SRP_DIR   branch: $SRP_BRANCH   current: v${FROM_V:-?} (${FROM_C:-no-git})"
	write_status running preflight
	if ! command -v docker >/dev/null 2>&1; then
		JOB_END="$(now)"; log "✖ docker is not installed on this host"
		write_status failed preflight "docker is not available on the server"; return 1
	fi
	log "disk free: $(df -h "$SRP_DIR" 2>/dev/null | awk 'NR==2 {print $4}')   memory free: $(free -h 2>/dev/null | awk 'NR==2 {print $7}')"

	step_log "1/5  fetching the new source"
	write_status running source
	if have_git; then
		if gitc fetch -q --depth 50 origin "$SRP_BRANCH" >> "$LOG" 2>&1 && gitc reset -q --hard "origin/$SRP_BRANCH" >> "$LOG" 2>&1; then
			TO_C=$(gitc rev-parse --short HEAD); log "source is now at $TO_C"
		else
			JOB_END="$(now)"; log "✖ could not download the new source"
			write_status failed source "git fetch/reset failed — check the server internet access"; trim_log; return 1
		fi
	else
		log "not a git checkout — rebuilding the current files"
	fi
	TO_V=$(version)

	step_log "2/5  refreshing the SR helper commands"
	install_helpers

	step_log "3/5  building the images (this usually takes 2–6 minutes)"
	write_status running build
	if ! dc up -d --build --remove-orphans >> "$LOG" 2>&1; then
		log "✖ build failed — rolling back to ${FROM_C:-the previous state}"
		write_status running rollback
		if have_git && [ -n "$FROM_C" ]; then
			gitc reset -q --hard "$FROM_C" >> "$LOG" 2>&1 || true
			dc up -d --build --remove-orphans >> "$LOG" 2>&1 || true
			install_helpers
		fi
		TO_C=$(gitc rev-parse --short HEAD 2>/dev/null || echo ""); TO_V=$(version)
		JOB_END="$(now)"
		write_status failed build "the build failed and the panel was rolled back — read the log below"; trim_log; return 1
	fi

	step_log "4/5  removing old images"
	docker image prune -f >> "$LOG" 2>&1 || true

	step_log "5/5  waiting for the panel to answer"
	write_status running health
	for i in $(seq 1 60); do
		h="$(health)"; [ -n "$h" ] && break
		sleep 3
	done
	JOB_END="$(now)"
	if [ -n "$h" ]; then
		log "✔ health: $h"
		log "✔ update finished — v${TO_V:-?} (${TO_C:-current})"
		write_status success done
	else
		log "⚠ containers are up but /api/health did not answer yet"
		write_status failed health "the panel did not answer after the rebuild — try: SR logs web"
	fi
	trim_log
}

handle_request() {
	local action id
	action=$(jget action "$ACTIVE"); id=$(jget id "$ACTIVE")
	JOB_ID="${id:-job_$(date +%s)}"
	case "${action:-}" in
		check)
			JOB_START="$(now)"; JOB_END=""; write_status checking check
			do_check || true
			JOB_END="$(now)"; write_status idle check
			;;
		update|upgrade)
			do_update || true
			;;
		*) log "ignoring unknown request: ${action:-<empty>}" ;;
	esac
	rm -f "$ACTIVE" 2>/dev/null || true
	if [ "$AGENT_RESTART" = 1 ] && [ -x /usr/local/bin/sr-agent ]; then
		log "agent is restarting into its new version"
		exec bash /usr/local/bin/sr-agent watch
	fi
}

take_request() {
	[ -f "$REQ" ] || return 1
	mv -f "$REQ" "$ACTIVE" 2>/dev/null || return 1
	return 0
}

cmd_watch() {
	mkstate
	exec 9>"$LOCK" || true
	if command -v flock >/dev/null 2>&1; then
		flock -n 9 || { echo "another sr-agent is already watching" >&2; exit 0; }
	fi
	log "agent v$AGENT_VERSION is watching $UPD (every ${POLL}s)"
	while :; do
		heartbeat
		if take_request; then handle_request; fi
		sleep "$POLL"
	done
}

cmd_once() {
	mkstate; heartbeat
	if take_request; then handle_request; fi
}

cmd_status() {
	printf 'sr-agent v%s   dir: %s   branch: %s\n' "$AGENT_VERSION" "$SRP_DIR" "$SRP_BRANCH"
	if command -v systemctl >/dev/null 2>&1; then printf 'service:   %s\n' "$(systemctl is-active srpanel-agent 2>/dev/null || echo unknown)"; fi
	[ -f "$STATE/agent.json" ] && { printf 'heartbeat: '; cat "$STATE/agent.json"; }
	[ -f "$STATUS" ]          && { printf 'last job:  '; cat "$STATUS"; }
	[ -f "$LATEST" ]          && { printf 'latest:    '; cat "$LATEST"; }
	return 0
}

[ "$(id -u)" -eq 0 ] || { echo "sr-agent must run as root" >&2; exit 1; }

case "${1:-watch}" in
	watch|daemon) cmd_watch ;;
	run-once|once|tick) cmd_once ;;
	check) mkstate; JOB_ID="cli_$(date +%s)"; do_check ;;
	update|upgrade) mkstate; JOB_ID="cli_$(date +%s)"; do_update ;;
	status) cmd_status ;;
	version|-v|--version) echo "sr-agent v$AGENT_VERSION" ;;
	*) echo "usage: sr-agent [watch|run-once|check|update|status]" >&2; exit 2 ;;
esac
