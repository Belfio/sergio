#!/usr/bin/env bash
set -euo pipefail

# Network-level URL allow list enforcement for claudeuser
# Reads sergio.config.json and restricts outbound access

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/../sergio.config.json"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "Error: sergio.config.json not found. Run 'npm run setup' first."
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Error: This script must be run as root (sudo)."
  exit 1
fi

echo "Setting up firewall rules for claudeuser..."

# Flush existing rules for claudeuser
iptables -F OUTPUT 2>/dev/null || true

# Always allow localhost
iptables -A OUTPUT -m owner --uid-owner claudeuser -d 127.0.0.0/8 -j ACCEPT

# Allow DNS (needed to resolve hostnames)
iptables -A OUTPUT -m owner --uid-owner claudeuser -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -m owner --uid-owner claudeuser -p tcp --dport 53 -j ACCEPT

# Allow Trello API
for ip in $(dig +short api.trello.com); do
  iptables -A OUTPUT -m owner --uid-owner claudeuser -d "$ip" -p tcp --dport 443 -j ACCEPT
done

# Allow GitHub
for host in api.github.com github.com; do
  for ip in $(dig +short "$host"); do
    iptables -A OUTPUT -m owner --uid-owner claudeuser -d "$ip" -p tcp --dport 443 -j ACCEPT
  done
done

# Allow URLs from the allow list
URLS=$(python3 -c "
import json, sys
try:
    with open('$CONFIG_FILE') as f:
        data = json.load(f)
    for url in data.get('urlAllowList', []):
        # Extract hostname from URL
        host = url.split('://')[1].split('/')[0] if '://' in url else url.split('/')[0]
        print(host)
except Exception as e:
    print(f'Error reading config: {e}', file=sys.stderr)
    sys.exit(1)
" 2>/dev/null || true)

for host in $URLS; do
  echo "  Allowing: $host"
  for ip in $(dig +short "$host" 2>/dev/null); do
    # Skip non-IP responses (CNAME records etc)
    if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      iptables -A OUTPUT -m owner --uid-owner claudeuser -d "$ip" -p tcp --dport 443 -j ACCEPT
      iptables -A OUTPUT -m owner --uid-owner claudeuser -d "$ip" -p tcp --dport 80 -j ACCEPT
    fi
  done
done

# Drop everything else from claudeuser
iptables -A OUTPUT -m owner --uid-owner claudeuser -j DROP

echo "Firewall rules applied. claudeuser can only reach allowed hosts."
echo ""
echo "To verify: sudo iptables -L OUTPUT -v -n"
echo "To remove: sudo iptables -F OUTPUT"
