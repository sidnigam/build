---
id: SEED-001
status: dormant
planted: 2026-09-13
planted_during: v1.0 / phase 02-asset-pipeline-sprite-system
trigger_when: Phase 4 (Gameplay Depth) boon/mechanics design, or whenever player alternate-forms/stances are discussed
scope: medium
---

# SEED-001: Abhimanyu masked stance — stealth/regen alt-form with weaker/slower attacks

A separate wearable mask item/toggle that puts Abhimanyu into an alternate combat
stance: more stealth and health/resource regen, but weaker and slower attacks than
the default unmasked form. Likely a toggleable stance or a boon-granted alt-form
rather than a passive cosmetic.

## Why This Matters

- **Build diversity / talked-about builds**: directly serves the project's stated
  Core Value in CLAUDE.md — "every death makes the next run feel different." A
  stance-swap mechanic gives players a build axis (aggressive unmasked vs. stealthy
  masked) that sits alongside boon picks, not duplicating them.
- **Narrative/thematic fit**: Abhimanyu is trapped in the Chakravyuha formation,
  fighting his way up through Yama's realm — a masked alternate identity/posture
  fits that survival-under-siege framing and reinforces the story mechanically
  rather than just cosmetically.

## When to Surface

**Trigger:** Phase 4 (Gameplay Depth) boon/mechanics design, or whenever player
alternate-forms/stances are discussed.

This seed should be presented during `/gsd:new-milestone` (or when Phase 4 is
planned/discussed) when the milestone scope matches any of these conditions:
- Boon pool / build-synergy design work (Phase 4 GAME-0x requirements)
- Any discussion of player alternate forms, stances, or toggleable playstyles
- Combat balance passes that touch player attack speed / regen / stealth systems

## Scope Estimate

**Medium** — a phase or two of work. Needs its own design pass: stance-swap
input/UI, a separate stat block (attack speed/damage down, regen/stealth up),
and — the part that touches the art pipeline — a masked-form animation set
(idle/run/attack at minimum) generated separately from the default unmasked
Abhimanyu atlas. Not a quick add-on; fits inside Phase 4 rather than being
inserted as a decimal phase.

## Breadcrumbs

- `assets/sprites/reference/abhimanyu-reference.png` — the current locked
  Abhimanyu reference (Phase 2 Plan 04). Does NOT depict the mask on the main
  figure by design decision (see `assets/sprites/comfyui-workflow.json` notes) —
  5 generation rounds + 1 inpaint attempt showed mask-presence and full-body
  correct framing consistently traded off against each other in this pipeline.
- A mask-study inset appeared as a byproduct of one of those generation rounds
  (not face-consistent with the main figure — SDXL invented it as a "concept
  sheet" embellishment). That study is a loose visual starting point for what
  the mask item could look like, not a locked asset. It was not kept as a
  separate file; regenerate a dedicated mask-item icon/sprite when this seed
  is picked up.
- `js/data.js` — no `stance`, `stealth`, or `mask` mechanics exist yet in
  player state/combat code as of this planting (verified via grep, 2026-09-13).
  This is fully new scope, not an extension of existing systems.
- Phase 4 (Gameplay Depth) roadmap goal: "players assemble talked-about builds
  from a deep boon pool with named synergies" — this seed's build-diversity
  rationale ties directly to that phase's stated goal.

## Notes

Captured mid-way through Phase 2 (Asset Pipeline + Sprite System) while locking
in the Abhimanyu reference sheet. The mask was originally requested as a visual
element on the hero's default appearance; after repeated generation attempts
showed it fighting the full-body framing, the human (project owner) decided to
drop it from the default look and instead give it a purpose as a distinct
gameplay mechanic — turning discarded art direction into new design scope
rather than losing the idea.
