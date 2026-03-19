<!-- BEGIN swamp managed section - DO NOT EDIT -->
# Project

This repository is managed with [swamp](https://github.com/systeminit/swamp).

## Rules

1. **Extension models for service integrations.** When automating AWS, APIs, or any external service, ALWAYS create an extension model in `extensions/models/`. Use the `swamp-extension-model` skill for guidance. The `command/shell` model is ONLY for ad-hoc one-off shell commands, NEVER for wrapping CLI tools or building integrations.
2. **Extend, don't be clever.** Don't work around a missing capability with shell scripts or multi-step hacks. Add a method to the extension model. One method, one purpose.
3. **Use the data model.** Once data exists in a model (via `lookup`, `start`, `sync`, etc.), reference it with CEL expressions. Don't re-fetch data that's already available.
4. **CEL expressions everywhere.** Wire models together with CEL expressions. Always prefer `data.latest("<name>", "<dataName>").attributes.<field>` over the deprecated `model.<name>.resource.<spec>.<instance>.attributes.<field>` pattern.
5. **Verify before destructive operations.** Always `swamp model get <name> --json` and verify resource IDs before running delete/stop/destroy methods.
6. **Extension npm deps are bundled, not lockfile-tracked.** Swamp's bundler inlines all npm packages (except zod) into extension bundles at bundle time. `deno.lock` and `package.json` do NOT cover extension model dependencies — this is by design. Always pin explicit versions in `npm:` import specifiers (e.g., `npm:lodash-es@4.17.21`).

## Skills

**IMPORTANT:** Always load swamp skills, even when in plan mode. The skills provide
essential context for working with this repository.

- `swamp-model` - Work with swamp models (creating, editing, validating)
- `swamp-workflow` - Work with workflows (creating, editing, running)
- `swamp-vault` - Manage secrets and credentials
- `swamp-data` - Manage model data lifecycle
- `swamp-repo` - Repository management
- `swamp-extension-model` - Create custom TypeScript models
- `swamp-extension-driver` - Create custom execution drivers
- `swamp-extension-datastore` - Create custom datastore backends
- `swamp-extension-vault` - Create custom vault providers
- `swamp-issue` - Submit bug reports and feature requests
- `swamp-troubleshooting` - Debug and diagnose swamp issues

## Getting Started

Always start by using the `swamp-model` skill to work with swamp models.

## Commands

Use `swamp --help` to see available commands.
<!-- END swamp managed section -->

## Coding Conventions

- **No inline file content in extension models.** Never embed Dockerfiles, HTML, or app source as string constants in TypeScript. Instead, keep them as separate files and load them at runtime (e.g., `Deno.readTextFile`). This lets users check syntax with proper editor support and tooling.
- **Pin GitHub Actions by full SHA.** Always use the full commit SHA for action references (e.g., `uses: actions/checkout@<full-sha>`) instead of version tags.

## Quality Gates

- **Test coverage required.** Always add tests for new code and changes to extension models.
- **Format before committing.** Run `deno fmt` on all changed files before committing.
- **Smoke test the full model surface.** Before merging PRs or publishing extensions, run all model methods (start, stop, status, etc.) to verify end-to-end behavior.
- **Run checks before pushing.** Always run `swamp workflow run ci-checks --json` before every `git push` to catch issues locally.
- **Check CI after pushing.** Always use `@bixu/github-actions` (`ci-actions` model, `watch` method) to check GitHub Actions CI runs after pushing. When the active PR number changes, update the `pr` field in the `ci-actions` model definition before running watch.

## CI

- GitHub Actions workflow at `.github/workflows/ci.yml` installs swamp and runs the `ci-checks` swamp workflow.
- The `ci-checks` workflow runs `deno fmt --check`, `deno lint`, and `deno test` on `extensions/` via `command/shell` models.
- Integration tests requiring the swamp CLI are gated behind the `SWAMP_INTEGRATION` env var and skipped in CI.
- Run locally: `swamp workflow run ci-checks --json`
- Run with integration tests: `SWAMP_INTEGRATION=1 deno test extensions/ --allow-read --allow-env=SWAMP_INTEGRATION --allow-run=swamp`
