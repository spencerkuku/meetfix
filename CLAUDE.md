## Documentation language

`README.md` and `.env.example` are maintained in Traditional Chinese (zh-TW). Any future edits to these two files must keep their prose/comments in zh-TW; domain proper nouns defined in `CONTEXT.md` (e.g. Booking, Room Manager, Repair Ticket, User, Role, Account) stay in English. This does not extend to other docs (`CONTEXT.md`, `docs/adr/`) or source code comments.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (spencerkuku/meetfix), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
