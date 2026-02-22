

```
  ___  ____  ____   ___  ____  ___                .-""""""-.
 / __)( ___)(  _ \ / __)(_  _)/ _ \             .'           '.
 \__ \ )__)  )   /( (_-. _)(_( (_) )          /    O      O    \
 (___/(____)(__\_)\___/(____)\___/           :       \__/       :
                                             |     ________     |
     _    ___                                 :   /        \   :
    /_\  |_ _|                                \  | ~~~~~~~~ |  /
   / _ \  | |                                  '.\          /.'
  /_/ \_\|___|                                    '-......-'
```
<div align="center">

# 👴🏻 Sergio AI

### Trello AI teammate that reviews Trello cards against product context and your codebase, helps you create a development plan, and opens draft PRs on GitHub.
Developers already have AI PR reviews. Product managers should have the same support with **Sergio**.

[Local Install (macOS)](#local-install-macos) · [Starting from Scratch](#starting-from-scratch) · [Getting Started (Linux)](#getting-started-linux) · [How It Works](#how-it-works) · [Configuration](#configuration) · [Security](#security) · [Roadmap](#roadmap)

</div>


## Support

If you would like me to help you with the installation, please contact me on twitter @belfio or directly pay here: [stripe](https://buy.stripe.com/14AeVddVr0nA0xF5Oi67S00)



## Intro

The Sergio script connects to GitHub, Claude, and Trello. It creates a new **Trello board**, monitors cards in specific lists, and completes two main tasks:
1. **Reviews**: Adds planning comments to cards (then lets you review and iterate)
2. **Implements**: Initiates a draft PR on GitHub

All triggered by moving Trello cards. You stay in the loop at every step.

### How

Sergio is a self-hosted bot that connects your **Trello board** to **Claude AI**. Write a task card, drop it in the right list, and Sergio reviews it — producing an implementation plan, asking clarifying questions, or requesting card improvements — then writes the code, runs your tests, and opens a pull request.

It runs on a single VM, polls your board every 60 seconds, and uses sandboxed Claude CLI sessions to do the actual work. No external SaaS, no vendor lock-in, fully open source.


### Why

You have a team where a Product Manager designs and writes features with limited knowledge about the codebase. The PM can ask Sergio to review the feature and suggest improvements and explain the implementation details to the Product Manager, until ready and clear for the Development team. The Development team can at this point ask Sergio to create a new Draft PR.



## How It Works

Sergio uses a 7-list Trello board as its interface. Cards flow left-to-right through two pipelines.

![Sergio Board](img/board.png)


### Planning pipeline

```mermaid
flowchart LR
    A["📋 TODO"] --> B["🔍 Revision"]
    B --> C["⏳ Reviewing"]
    C --> D["✅ Reviewed"]
    D -- "Add feedback\n& move back" --> B

    style A fill:#f5f5f5,stroke:#999,color:#333
    style B fill:#fff3cd,stroke:#e6a800,color:#333
    style C fill:#cce5ff,stroke:#0066cc,color:#333
    style D fill:#d4edda,stroke:#28a745,color:#333
```

| List | Who | What happens |
|------|-----|-------------|
| **📋 TODO** | You | Write a card describing the task |
| **🔍 Revision** | Sergio | Reads card + codebase, decides how to respond |
| **⏳ Reviewing** | Sergio | Processing state while Claude is working |
| **✅ Reviewed** | You | Review Sergio's response and decide next step |

**Sergio responds with one of three outcomes:**

| Outcome | When | Example |
|---------|------|---------|
| Implementation plan | Card is clear and codebase is understood | Detailed steps referencing actual files and functions |
| Clarifying questions | Card is ambiguous or missing info | "Should sessions auto-extend or have a hard timeout?" |
| Revision requests | Card has contradictions or infeasible requirements | "The card asks for JWT but the codebase uses session tokens" |

The prompt logic lives in `prompts/revision.md`. Sergio always posts its response as a markdown comment on the card.

**Feedback loop:** If the response isn't right, add a comment explaining what to change and move the card back to 🔍 Revision. Sergio re-reads the full card — including all previous comments and your feedback — and responds accordingly.

![Sergio reviewing a card](img/prd-revision.gif)

### Development pipeline

```mermaid
flowchart LR
    E["🛠️ Development"] --> F["⚙️ Developing"]
    F --> G["🚀 Ready for Review"]

    style E fill:#fff3cd,stroke:#e6a800,color:#333
    style F fill:#cce5ff,stroke:#0066cc,color:#333
    style G fill:#d4edda,stroke:#28a745,color:#333
```

| List | Who | What happens |
|------|-----|-------------|
| **🛠️ Development** | You | Move an approved card here to trigger development |
| **⚙️ Developing** | Sergio | Creates worktree, writes code, runs tests |
| **🚀 Ready for Review** | You | PR created — ready for code review |

The bot polls both pipelines concurrently. Planning takes minutes. Development creates a git worktree, runs your dev environment, executes tests, and pushes to GitHub.

**Commit authoring:** Commits made by the development pipeline are authored as `Sergio AI <sergio-ai@noreply>` (or your custom `botName`), so they're easy to distinguish from human commits in GitHub's history. Note that PR authorship is tied to the `GITHUB_TOKEN` owner and cannot be overridden without a dedicated bot account.

![Sergio creating a PR](img/pr-created.gif)



## Starting from Scratch

Don't have a server yet? Here's how to go from zero to a running Sergio instance for under $5/month. 
Once you buy access to Hetzner as per step 1, you can ask your AI to read this repo and start the setup in your local machine.


### 1. Get a cheap VM

Go to [Hetzner Cloud](https://www.hetzner.com/cloud/) (or any VPS provider — DigitalOcean, Vultr, etc.) and create a server:

- **OS:** Ubuntu 24.04
- **Type:** CX22 (2 vCPU, 4 GB RAM) is plenty — Sergio is lightweight, Claude does the heavy lifting via API
- **Location:** Wherever is closest to you
- **SSH key:** Add your public key during creation (recommended over password)

If you don't have an SSH key yet:

```bash
# On your local machine
ssh-keygen -t ed25519 -C "your@email.com"
cat ~/.ssh/id_ed25519.pub
# Copy this output and paste it into Hetzner's SSH key field
```

### 2. SSH into your server

Once the server is created, Hetzner shows you the IP address.

```bash
ssh root@YOUR_SERVER_IP
```


### 3. Initial setup and install Claude

```bash
# Create the sergio user (don't run as root)
adduser sergio
usermod -aG sudo sergio
mkdir -p /home/sergio/.ssh
cp ~/.ssh/authorized_keys /home/sergio/.ssh/
chown -R sergio:sergio /home/sergio/.ssh

# Install Node.js and Git
curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
apt-get install -y nodejs git

# Install Claude CLI
npm install -g @anthropic-ai/claude-code

# Switch to sergio user
su - sergio
```

From here you can run `claude` in the terminal and ask it to do the rest — clone this repo, run the setup wizard, and configure the systemd service. Or continue manually with the [Getting Started](#getting-started-linux) steps below.





## Getting Started (Linux)

### Prerequisites

- A Linux VM (Ubuntu/Debian recommended)
- [Node.js](https://nodejs.org/) >= 18
- A [Trello](https://trello.com) account with [API key and token](https://trello.com/power-ups/admin)
- An [Anthropic API key](https://console.anthropic.com/)
- A [GitHub](https://github.com) personal access token

### Quick start

```bash
# Clone and install
git clone https://github.com/Belfio/sergio.git ~/sergio
cd ~/sergio
npm install

# 2. Run the interactive setup wizard (have your API keys ready)
npm run setup

# 3. Allow claudeuser to access the repo (it runs as a separate user)
chmod o+x ~
chmod -R o+rx ~/sergio

# 4. Start
npm start

```

### What the setup wizard does

- **Checks system dependencies** — Node, Git, [Claude CLI](https://docs.anthropic.com/en/docs/claude-code), [GitHub CLI](https://cli.github.com/) — and offers to install any that are missing
- **Creates a `claudeuser`** system account for sandboxed Claude execution, plus a sudoers rule so `sergio` can run commands as `claudeuser` (see [Security](#security)). You still need to grant `claudeuser` access to the repo directory — see step 3 above.
- **Collects your API keys** — Anthropic, Trello, GitHub
- **Creates a Trello board** with 7 pre-configured workflow lists (or connects to an existing board)
- **Generates config files** — `sergio.config.json` and `.env`
- **Copies prompt templates** — editable Markdown files that control Claude's behavior

### Run as a systemd service (recommended for production)

```bash
sudo cp sergio.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable sergio
sudo systemctl start sergio

# Verify
sudo journalctl -u sergio -f
```



## Configuration

Sergio uses two config files. Secrets live in `.env` (never committed). Everything else lives in `sergio.config.json` (generated by setup).

### sergio.config.json

```jsonc
{
  "botName": "Sergio",           // Name used in Trello lists, logs, branch prefixes
  "baseBranch": "main",          // Base branch for worktrees (default: "main")
  "baseRemote": "origin",        // Git remote name (default: "origin")
  "trello": {
    "boardId": "...",
    "lists": { /* list IDs set automatically by setup */ }
  },
  "github": { "repoUrl": "https://github.com/you/your-repo" },
  "repoDir": "~/your-repo",  // Path to the repo Sergio works on
  "worktreeBaseDir": "~/worktrees",
  "urlAllowList": [              // URLs Claude is allowed to access (see Security)
    "https://github.com",
    "https://docs.google.com",
    "https://www.figma.com"
  ],
  "prompts": {
    "revisionTemplate": "prompts/revision.md",
    "developmentTemplate": "prompts/development.md"
  },
  "pipeline": {
    "devCommand": "",            // Dev server command (e.g. "npx sst dev") — empty = skip
    "devReadyPattern": "",       // Text to watch for in dev server output
    "testCommands": []           // Test commands to run — empty array = skip
  },
  "timeouts": {
    "claudeDevMs": 1200000,      // 20 min — Claude dev session
    "devServerMs": 600000,       // 10 min — dev server startup
    "testMs": 600000             // 10 min — per test command
  },
  "pollIntervalMs": 60000       // 1 min
}
```

> **Works with any repo:** The `pipeline` section is optional. If you don't need a dev server, leave `devCommand` empty. If you don't have tests yet, set `testCommands` to `[]`. Sergio will skip those stages and go straight to commit + PR.

### .env

```
ANTHROPIC_API_KEY=sk-ant-...
TRELLO_API_KEY=...
TRELLO_TOKEN=...
GITHUB_TOKEN=ghp_...
```

### Re-configuring

Run `npm run setup` again at any time. If `sergio.config.json` exists, the wizard asks what to update — Trello board, GitHub, URL allow list, prompts, or MCP config — without recreating everything.

---

## Customizing Prompts

Sergio's Claude behavior is driven by two editable Markdown templates:

| File | Used for |
|------|----------|
| `prompts/revision.md` | Planning — Claude reviews cards and responds with a plan, questions, or revision requests |
| `prompts/development.md` | Development — Claude writes code |

### Placeholders

| Placeholder | Replaced with |
|-------------|---------------|
| `{{botName}}` | Bot name from config |
| `{{cardContent}}` | Full Trello card (description + comments + attachments) |
| `{{urlPolicy}}` | Auto-generated URL restriction policy, or empty string |
| `{{baseBranch}}` | Base branch name from config (default: `main`) |
| `{{baseRemote}}` | Git remote name from config (default: `origin`) |

Add your coding standards, framework conventions, or architectural constraints directly to these templates. Claude will follow them on every task.

---

## MCP Servers (Google Docs, Figma, etc.)

Sergio can pass an MCP configuration to Claude CLI, so Claude can use external tools (for example Google Docs readers, design integrations, and other MCP-compatible services) while processing cards.

Add an optional `mcpServers` block in `sergio.config.json`:

```jsonc
{
  "mcpServers": {
    "google-docs": {
      "command": "npx",
      "args": ["-y", "google-docs-mcp"],
      "env": {
        "GOOGLE_CLIENT_ID": "${GOOGLE_CLIENT_ID}",
        "GOOGLE_CLIENT_SECRET": "${GOOGLE_CLIENT_SECRET}"
      }
    }
  }
}
```

At runtime, Sergio resolves `${VAR}` values from `.env`, writes a temporary MCP config, and launches Claude CLI with `--mcp-config`.

### Google Docs setup

1. Create OAuth credentials in Google Cloud (client ID + client secret).
2. Put those values in `.env`:
   - `GOOGLE_CLIENT_ID=...`
   - `GOOGLE_CLIENT_SECRET=...`
3. Configure a Google Docs MCP server in `mcpServers`.
4. Complete the MCP server's one-time auth flow (it typically stores refresh tokens locally).

### Figma options

- Official desktop MCP integrations usually require a local Figma Desktop app endpoint and are not suitable for headless Linux servers.
- For server deployments, prefer MCP servers backed by the Figma REST API and access tokens.

### Any other MCP server

You can configure any compatible MCP server using either:
- `type: "stdio"` with `command` + `args`
- `type: "http"` with `url`

Keep secrets in `.env` and reference them with `${VAR}` placeholders in `mcpServers.env`.

> Backward compatible: if `mcpServers` is omitted, Sergio behavior is unchanged.

---

## Security

### Two-user architecture

Sergio uses two OS users to separate the bot process from the AI it controls:

| User | Role | Has access to |
|------|------|--------------|
| `sergio` | Runs the Node.js polling loop, owns the code, config, and `.env` secrets | API keys, Trello tokens, sergio.config.json |
| `claudeuser` | Sandboxed account that runs Claude CLI sessions | Only the repo/worktree it's working in |

**Why two users?** Claude CLI runs with `--dangerously-skip-permissions`, which gives it full shell access. By running it as `claudeuser` — a separate OS account with no access to secrets or the Sergio process — a prompt injection or misbehaving session is contained to the worktree. It cannot read your API keys, kill the bot, or modify its own prompts.

The `sergio` user spawns Claude sessions via `sudo -u claudeuser`, which requires a sudoers rule created automatically by `npm run setup`:

```
# /etc/sudoers.d/sergio
sergio ALL=(claudeuser) NOPASSWD:SETENV: ALL
```

This allows `sergio` to run commands as `claudeuser` without a password, while keeping the two accounts fully separate.

**Filesystem access:** `claudeuser` also needs read access to the repo directory so Claude CLI can explore the codebase. The setup wizard creates the user and sudoers rule, but you must grant directory access manually:

```bash
# Let claudeuser traverse into the home dir (execute-only, can't list contents)
chmod o+x ~
# Let claudeuser read the repo
chmod -R o+rx ~/sergio
```

Your `.env` file stays protected because its permissions are `600` (owner-only). Only the repo source code is exposed to `claudeuser`.

### URL allow list

When `urlAllowList` is configured, Sergio enforces it at two levels:

**Prompt-level (always active)** — Every Claude session includes:

```
URL ACCESS POLICY: You are ONLY permitted to access these URLs:
- https://docs.example.com
Do NOT fetch, read, or access any URL not on this list.
```

**Network-level (optional)** — For defense-in-depth:

```bash
sudo bash scripts/setup-firewall.sh
```

Configures `iptables` so `claudeuser` can only reach Trello, GitHub, and your allow-listed hosts. All other outbound traffic is dropped. Combined with the user separation above, this means Claude cannot exfiltrate secrets even if it gains shell access — it has no secrets to read and no network path to send them.

---

## Logs

Sergio writes a human-readable log file at `logs/sergio.log` (configurable via `logsDir` in `sergio.config.json`). All console output — poll activity, card processing, errors — is appended to this file with timestamps and log levels.

```
2026-02-18T14:30:01.123Z [INFO] Sergio starting...
2026-02-18T14:30:01.456Z [INFO] Board ID: abc123
2026-02-18T14:31:01.789Z [INFO] Found 1 new card(s)
2026-02-18T14:31:05.012Z [INFO] Processing card: Add login page (card123)
2026-02-18T14:31:45.345Z [ERROR] Error processing card card456 (Broken task): ...
```

To follow logs in real time:

```bash
tail -f logs/sergio.log
```

When running as a systemd service, logs also go to journald (`journalctl -u sergio -f`). The log file is useful for sharing with teammates or reviewing past activity without SSH access.

### Status dashboard

Run `npm run status` to get a snapshot of Sergio's current state. It shows:

- **Services** — whether the Sergio polling loop is running and how many Claude CLI sessions are active
- **Board** — card count per Trello list with card names, so you see exactly what's queued, in progress, and done
- **Recent Activity** — last 10 lines from `sergio.log`, color-coded by log level

Example output:

```
  SERGIO STATUS  2/19/2026, 4:30:00 PM

── Services ──
  Sergio polling:  active
  Claude sessions: 2 active

── Board ──
    0  📋 TODO
    1  🔍 Sergio Revision          Add dark mode
    0  ⏳ Sergio Reviewing
    2  ✅ Reviewed                  Login page, API caching
    0  🛠️ Sergio Development
    1  ⚙️ Sergio Developing         User settings
    3  🚀 Ready for Review

  Total: 7 card(s) across 7 lists

── Recent Activity ──
  2026-02-19T16:29:01.123Z [INFO] Found 1 new card(s)
  2026-02-19T16:29:05.456Z [INFO] Processing card: Add dark mode (abc123)
```

---

## Project Structure

```
src/
  config.ts            Config loader (sergio.config.json + .env)
  logger.ts            File logging (tees console output to logs/sergio.log)
  status.ts            Terminal dashboard (npm run status)
  index.ts             Entry point with concurrent polling loops
  trello.ts            Trello REST API client
  processor.ts         Planning pipeline (card to Claude to plan to comment)
  dev-processor.ts     Dev pipeline (worktree to Claude to tests to PR)
  claude.ts            Claude CLI runner for planning
  claude-dev.ts        Claude CLI runner for development
  template.ts          Prompt template engine
  list-names.ts        Dynamic list name generator
  state.ts             Planning state persistence
  dev-state.ts         Dev state persistence
  setup/
    index.ts           Setup wizard orchestrator
    prompts.ts         Interactive question flow
    trello-setup.ts    Board and list creation via Trello API

prompts/               Editable prompt templates
scripts/               Firewall and utility scripts
```

---

## FAQ

<details>
<summary><strong>Why Trello?</strong></summary>

Trello is a simple, visual interface that non-technical team members already know. No CLI to learn, no new app to install — just drag a card.
</details>

<details>
<summary><strong>Why Claude CLI instead of the API directly?</strong></summary>

Claude CLI provides full agentic capabilities — reading files, navigating the codebase, running tools — in a sandboxed session. The raw API alone does not give you that.
</details>

<details>
<summary><strong>Can I change the bot name?</strong></summary>

Yes. Set `botName` during setup (or edit `sergio.config.json`) and all list names, log messages, and branch prefixes update automatically.
</details>

<details>
<summary><strong>Can I use an existing Trello board?</strong></summary>

Yes. During setup, choose not to create a new board and provide your board and list IDs manually.
</details>

<details>
<summary><strong>What if Sergio's response isn't right?</strong></summary>

Add a comment to the card explaining what needs to change, then move it back to the task revision list. Sergio re-reads the full card — including all previous comments and your feedback — and responds accordingly. If it asked questions and you answered them, it will incorporate your answers into a plan. If it produced a plan and you gave feedback, it will revise the plan.
</details>

<details>
<summary><strong>Is this production-ready?</strong></summary>

Sergio is used in production by its creators. That said, it is early-stage open source — test in a non-critical environment first and report any issues.
</details>

---

## Local Install (macOS)

Want to run Sergio on your Mac for development or testing? Here's how.

### Prerequisites

Install [Homebrew](https://brew.sh/) if you don't have it, then:

```bash
# Node.js, Git, GitHub CLI
brew install node git gh

# Claude CLI
npm install -g @anthropic-ai/claude-code

# Authenticate the CLIs
gh auth login
claude  # Follow the Anthropic login flow
```

You also need:
- A [Trello API key and token](https://trello.com/power-ups/admin)
- An [Anthropic API key](https://console.anthropic.com/)
- A [GitHub personal access token](https://github.com/settings/tokens) (with `repo` scope)

### Clone and install

```bash
git clone https://github.com/Belfio/sergio.git ~/sergio
cd ~/sergio
npm install
```

### Create the sandbox user

Sergio runs Claude sessions as a separate `claudeuser` account for isolation. On macOS:

```bash
# Create the user (requires admin password)
sudo dscl . -create /Users/claudeuser
sudo dscl . -create /Users/claudeuser UserShell /bin/zsh
sudo dscl . -create /Users/claudeuser UniqueID 599
sudo dscl . -create /Users/claudeuser PrimaryGroupID 20
sudo dscl . -create /Users/claudeuser NFSHomeDirectory /var/empty

# Allow your user to sudo as claudeuser without a password
sudo tee /etc/sudoers.d/sergio <<< "$USER ALL=(claudeuser) NOPASSWD:SETENV: ALL"
sudo chmod 0440 /etc/sudoers.d/sergio

# Verify it works
sudo -u claudeuser whoami   # Should print: claudeuser
```

> **Note:** Pick a UniqueID that isn't already taken. Check with `dscl . -list /Users UniqueID | sort -n -k2`.

### Run setup

```bash
npm run setup
```

The wizard will:
- Check dependencies (Node, Git, Claude CLI, GitHub CLI)
- Collect your API keys and write `.env`
- Create a Trello board with 7 workflow lists (or connect to an existing one)
- Generate `sergio.config.json`

When it asks for `repoDir`, point it to the repo you want Sergio to work on (e.g. `~/Work/my-project`). For `worktreeBaseDir`, use something like `~/sergio-worktrees`.

### Grant claudeuser access

```bash
# Let claudeuser traverse your home and read the target repo
chmod o+x ~
chmod -R o+rx ~/Work/my-project   # use your actual repoDir
```

### Start

```bash
npm start
```

Sergio polls your Trello board every 60 seconds. Press `Ctrl+C` to stop.

### macOS-specific notes

| Topic | Linux | macOS |
|-------|-------|-------|
| **Firewall** | `scripts/setup-firewall.sh` (iptables) | Not available — iptables doesn't exist on macOS. The prompt-level URL policy still applies. For local dev this is usually fine. |
| **Service manager** | systemd (`sergio.service`) | Use `launchd` if you want Sergio to run on boot — see below. |
| **User creation** | `useradd` (handled by setup wizard) | `dscl` (manual, see above) — the setup wizard's `useradd` will fail on macOS. |

### Optional: run as a launchd service

Create `~/Library/LaunchAgents/com.sergio.bot.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.sergio.bot</string>
    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USERNAME/sergio</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/npx</string>
        <string>tsx</string>
        <string>src/index.ts</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/YOUR_USERNAME/sergio/logs/launchd-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USERNAME/sergio/logs/launchd-stderr.log</string>
</dict>
</plist>
```

Then:

```bash
# Replace YOUR_USERNAME in the plist, then:
launchctl load ~/Library/LaunchAgents/com.sergio.bot.plist

# Check status
launchctl list | grep sergio

# Stop
launchctl unload ~/Library/LaunchAgents/com.sergio.bot.plist
```



## Roadmap

Sergio is designed to be modular. Here's what's coming next.

### Multi-engine support

Sergio currently uses Claude CLI as its AI engine. We plan to make this pluggable so you can choose your backend:

- **[OpenCode](https://opencode.ai/)** — open-source CLI with multi-provider support (Anthropic, OpenAI, Google, local models). Drop-in alternative that runs in the same sandboxed `claudeuser` architecture.
- **[Codex](https://github.com/openai/codex)** — OpenAI's coding agent CLI. Same sandbox model: runs as a restricted user, no access to secrets, pipeline handles git operations.

The goal is a `"engine"` field in `sergio.config.json` so you can switch between backends without changing anything else. The two-user security model and prompt templates work regardless of which CLI does the AI work.

### MCP servers for external context

Claude CLI supports [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) servers — sidecar processes that give the AI tools to read external data. This lets Sergio access Google Docs, Figma designs, Notion pages, and more when processing cards.

Planned integrations:
- **Google Docs** — read linked specs and PRDs directly from cards
- **Figma** — access design files referenced in cards (via REST API for headless servers)
- **Notion** — pull context from linked Notion pages
- **Any MCP-compatible server** — the config accepts arbitrary MCP server definitions

Architecture: an `mcpServers` field in `sergio.config.json` with env var references resolved from `.env`. Sergio writes a temp config file, passes it to the CLI via `--mcp-config`, and cleans up after. Secrets stay in `.env`, the security sandbox is preserved, and `claudeuser` never sees credentials directly.

See [MCP.md](MCP.md) for the full implementation plan.

---

## Contributing

Contributions are welcome! Please [open an issue](https://github.com/Belfio/sergio/issues) to discuss what you'd like to change before submitting a PR.

```bash
git clone https://github.com/Belfio/sergio.git
cd sergio
npm install
npm run setup
npm start
```

---

<div align="center">

**[MIT License](LICENSE)**

</div>
