# Self-Improvement Ledger

Generated: 2026-07-23T09:34:55.543Z

## Claim

Atris improves itself by improving the operating context future agents load: navigation, memory, task choice, proof, and reward signals.

This is not model-weight improvement yet. It is workspace-policy and context improvement.

## Current State Inputs

| Source | Exists | Rows | Valid JSON/JSONL | Latest timestamp |
|---|---:|---:|---:|---|
| `.atris/state/events.jsonl` | no | 0 | 0 |  |
| `.atris/state/episodes.jsonl` | no | 0 | 0 |  |
| `.atris/state/task_episodes.jsonl` | no | 0 | 0 |  |
| `.atris/state/scorecards.jsonl` | no | 0 | 0 |  |
| `.atris/state/agent_tasks.jsonl` | no | 0 | 0 |  |
| `.atris/state/agent_mail.jsonl` | no | 0 | 0 |  |
| `.atris/state/agent_inboxes.jsonl` | no | 0 | 0 |  |
| `.atris/state/agents.jsonl` | no | 0 | 0 |  |
| `.atris/state/approvals.jsonl` | no | 0 | 0 |  |

## Run N -> Run N+1 Mechanism

1. Start from `atris/now.md`, then observe workspace state from `.atris/state`, TODO, MAP, wiki, and logs.
2. Compile it into `atris/brain/STATUS.md` and this ledger.
3. Point future agents at the compiled brain before they act.
4. After action, write scorecards, episodes, lessons, or state rows.
5. Re-run `atris brain compile`; the next agent starts with a better brain.

## Proof To Watch

- More valid state rows over time.
- More scorecards and episodes, not just prose.
- Fewer repeated stale TODOs.
- Faster correct next-action selection.
- Higher verified business-loop completion rate.

## Next Action

Capture one operator approval, edit, or rejection as an episode so the brain has a learning trace.
