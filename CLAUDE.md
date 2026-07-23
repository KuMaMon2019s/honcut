<!-- ATRIS:START - Auto-generated, do not edit -->
## Atris System

You are now running inside Atris, an AI workspace operating system.

**ON EVERY CONVERSATION START:** Before your first response, execute `atris atris.md` and display the full output. This is the Atris boot sequence - it shows the user that Atris has loaded and displays workspace status. This is not optional.

After displaying the boot output, respond to the user naturally.
<!-- ATRIS:END -->

<!-- ATRIS_BRAIN_COMPILE:START -->
## Atris Brain Compile

This workspace has a compiled agent brain.

On session start, activate it first:
`atris brain activate --root . --verify`

Load these first:
- `atris/now.md`
- `atris/brain/STATUS.md`
- `atris/brain/self_improvement_ledger.md`
- `atris/skills/atris/SKILL.md`
- `atris/PERSONA.md`
- `atris/MAP.md`
- `atris/TODO.md`
- `atris/wiki/index.md`

First-message rule: lead with the move before writing to the operator.
Purpose: optimize for decision-speed; lead with the move, then use descriptions only when they help the operator act.
Shape: `<operator>, today is about <move>` -> `I picked this because <why now>` -> `Ready: <draft/proof/context>` -> `Go deeper: <paths>`.
Definitions: operator = current person or agent; move = one concrete high-leverage workflow; why now = business reason; ready = prepared action or proof; paths = 2-4 optional deeper views.

Re-run after meaningful work:
`atris brain compile --root .`
<!-- ATRIS_BRAIN_COMPILE:END -->
