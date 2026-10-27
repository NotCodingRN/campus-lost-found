#!/usr/bin/env bash
# Prints the lab evidence for one section, terminal style ("$ command" then its output).
# Usage (project root on the server):  bash deploy/collect-evidence.sh <section>
# Sections: env build compose network persistence-before persistence-after monitor
# Secret values from .env are never printed.
set -uo pipefail
PORT="$(grep -E '^APP_PORT=' .env | cut -d= -f2)"
DBU="$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2)"
DBN="$(grep -E '^POSTGRES_DB=' .env | cut -d= -f2)"

run() {
  echo "ubuntu@campus-lf:~/campus-lost-found\$ $*"
  bash -c "$*" 2>&1
  echo
}
sql() { sudo docker compose exec -T db psql -U "$DBU" -d "$DBN" -c "$1"; }
export -f sql; export DBU DBN

case "${1:-}" in
  env)
    run "sudo docker --version"
    run "sudo docker compose version"
    run "sudo docker run --rm hello-world"
    run "sudo docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}' | grep -E 'REPOSITORY|campus-lf|postgres|nginx|node|hello-world'"
    ;;
  build)
    run "find . -maxdepth 3 -not -path '*/node_modules*' -not -path './.git*' -not -name '*.tgz' | sort"
    run "cat backend/Dockerfile"
    run "cat frontend/Dockerfile"
    ;;
  compose)
    run "sudo docker compose config --quiet && echo 'Compose file is valid'"
    run "sed -E '/^(POSTGRES_PASSWORD|SESSION_SECRET|GOOGLE_CLIENT_SECRET|GOOGLE_CLIENT_ID)=/ s/=.+/=********  (hidden)/' .env | grep -v '^#' | grep -v '^\$'"
    run "sudo docker compose ps"
    run "curl -s http://localhost:${PORT}/api/health; echo"
    ;;
  network)
    run "sudo docker network ls --filter name=campus-lost-found"
    run "sudo docker network inspect campus-lost-found_frontend-backend --format 'Network {{.Name}}  internal={{.Internal}}{{range .Containers}}{{println}}  {{.Name}}  {{.IPv4Address}}{{end}}'"
    run "sudo docker network inspect campus-lost-found_backend-database --format 'Network {{.Name}}  internal={{.Internal}}{{range .Containers}}{{println}}  {{.Name}}  {{.IPv4Address}}{{end}}'"
    run "sudo docker compose exec frontend getent hosts backend"
    run "sudo docker compose exec frontend getent hosts db || echo 'frontend cannot resolve db'"
    run "sudo docker compose exec frontend ping -c 1 backend"
    run "sudo docker compose exec frontend ping -c 1 db"
    run "sudo docker compose exec frontend nc -zv -w 3 db 5432"
    run "sudo docker compose exec backend getent hosts db"
    run "curl -s --max-time 3 localhost:5432; echo \"exit code: \$?\""
    run "curl -s --max-time 3 localhost:3000; echo \"exit code: \$?\""
    run "sudo ss -tlnp | grep -E 'LISTEN' | awk '{print \$4}' | sort -u"
    run "sudo docker compose exec backend node -e \"fetch('https://accounts.google.com/.well-known/openid-configuration').then(r=>console.log('backend -> Google HTTPS status', r.status)).catch(e=>console.log('failed', e.message))\""
    run "sudo docker compose exec db sh -c 'wget -q -T 5 -O /dev/null https://example.com && echo reachable || echo \"db cannot reach the internet (internal network)\"'"
    ;;
  persistence-before)
    run "sudo docker volume inspect campus-lost-found_pgdata --format 'Volume {{.Name}}  driver={{.Driver}}  mountpoint={{.Mountpoint}}'"
    run "sql \"SELECT u.name AS owner, i.id, i.title, i.item_type, i.status FROM items i JOIN users u ON u.id = i.owner_id ORDER BY i.id;\""
    run "sql \"SELECT c.id, i.title AS item, u.name AS claimant, c.status FROM claims c JOIN items i ON i.id = c.item_id JOIN users u ON u.id = c.claimant_id ORDER BY c.id;\""
    run "sql \"SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM items) AS items, (SELECT count(*) FROM claims) AS claims, (SELECT count(*) FROM user_sessions) AS sessions;\""
    run "sudo docker compose down"
    run "sudo docker compose ps -a"
    run "sudo docker volume ls --filter name=campus-lost-found"
    ;;
  persistence-after)
    run "sudo docker compose up -d 2>&1 | grep -E 'Started|Healthy|Created'"
    run "sudo docker compose ps"
    run "sql \"SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM items) AS items, (SELECT count(*) FROM claims) AS claims, (SELECT count(*) FROM user_sessions) AS sessions;\""
    run "sql \"SELECT u.name AS owner, i.id, i.title, i.item_type, i.status FROM items i JOIN users u ON u.id = i.owner_id WHERE NOT i.is_demo ORDER BY i.id;\""
    ;;
  monitor)
    run "sudo docker compose ps"
    run "sudo docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'"
    run "sudo docker compose logs --tail=12 frontend"
    run "sudo docker compose logs --tail=15 backend"
    run "sudo docker compose logs --tail=10 db"
    ;;
  *)
    echo "unknown section" >&2; exit 1 ;;
esac
