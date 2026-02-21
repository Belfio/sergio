# Contributing to Sergio AI

Thanks for your interest in contributing! Sergio is a self-hosted Trello + Claude bot, and contributions of all kinds are welcome.

## Getting started

```bash
git clone https://github.com/Belfio/sergio.git
cd sergio
npm install
```

The project uses TypeScript with [tsx](https://github.com/privatenumber/tsx) for direct execution (no build step). Source lives in `src/`.

### Project structure

```
src/
  index.ts          # Entry point — starts polling loops
  config.ts         # Loads .env + sergio.config.json
  trello.ts         # Trello API client
  processor.ts      # Revision pipeline (review cards)
  dev-processor.ts  # Development pipeline (write code, open PRs)
  claude.ts         # Spawns Claude CLI for revision
  claude-dev.ts     # Spawns Claude CLI for development
  template.ts       # Loads prompt templates with variable substitution
  state.ts          # Tracks card attempt counts
  logger.ts         # File + console logger
  setup/            # Interactive setup wizard (npm run setup)
prompts/
  revision.md       # Prompt template for card review
  development.md    # Prompt template for code generation
```

### Running locally

1. Copy the example config: `cp sergio.config.example.json sergio.config.json`
2. Copy the example env: `cp .env.example .env`
3. Fill in your API keys in `.env` and board details in `sergio.config.json` (or run `npm run setup`)
4. Start: `npm start`

## How to contribute

### Reporting bugs

Open a [bug report](https://github.com/Belfio/sergio/issues/new?template=bug_report.yml) with:
- What you expected vs what happened
- Steps to reproduce
- Your Node.js version and OS

### Suggesting features

Open a [feature request](https://github.com/Belfio/sergio/issues/new?template=feature_request.yml) describing the use case and proposed solution.

### Submitting code

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Test locally with `npm start` against a test Trello board
4. Open a pull request against `main`

Keep PRs focused on a single change. If you're planning something large, open an issue first to discuss the approach.

### Code style

- TypeScript, ESM (`"type": "module"` in package.json)
- Imports use `.js` extensions (Node ESM resolution)
- No build step — tsx runs `.ts` files directly
- Keep dependencies minimal — think twice before adding a new package

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
