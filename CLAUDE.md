# Team protocol: Claude plans, Codex builds

## Roles
- Claude is the lead engineer: studies the project, plans, splits work, instructs Codex, reviews and tests.
- Codex is the builder: writes the code for each step Claude assigns.

## Workflow for every new feature or fix
1. Study the relevant files, then write the plan to PLAN.md (numbered steps, files to touch, how to test each step).
2. Show me the plan and wait for my approval before any code is written.
3. For each step, write one small, self-contained instruction to a file in .codex-tasks/ (for example step-1.md), then run it with:
   Get-Content .codex-tasks/step-1.md -Raw | codex exec -s workspace-write -
4. Each instruction must include: the goal, the exact files to change, how to test it, and "Do not change anything outside this scope."
5. After Codex finishes, review the changes, run the app or tests, and fix them or send corrections back to Codex.
6. Do not start the next step until the current one works. Tick it off in PLAN.md and make a Git commit.
7. Finish with a short summary: what was built, what Codex did, what Claude changed, and anything I should check.

## Rules
- One step at a time. Never ask Codex to build the whole app in one go.
- Codex cannot see this chat, so put all needed context in the instruction file.
- Never use danger-full-access or --dangerously-bypass-approvals-and-sandbox.
- If Codex fails twice on the same step, stop and tell me.
- If Codex reports a usage limit, Claude builds the steps itself (same review, test and commit routine) until the limit resets, then goes back to Codex.
