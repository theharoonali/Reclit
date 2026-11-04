# 046 — Cube face shades and steady tempo

**Status:** implemented
**Scope:** frontend

## Goal

The assistant cube shows one gray on every sticker of a face, plays at a steady tempo, and the onboarding canvas has no "Reclit AI" label under it.

## Backend (Agent 1)

- None.

## Frontend (Agent 2)

- **`assistant-orb.tsx`:** shade by face (six grays), not by sticker. One animation frame scheduled at a time; elapsed time is read from the clock, so a second callback cannot add to it.
- **`onboarding-ai-panel.tsx`:** hero is the canvas only. Remove `onboarding.orbCaption`.
- No new tokens.

## Integration (Agent 3)

- None. The orb is local canvas drawing.

## Decisions

- A face's gray stays on its stickers while layers turn, so a solved face is one shade and a scramble mixes them.
- Tempo stays the existing idle / listening / running rates. The bug is extra frames compounding that rate, not the rates themselves.

## Risks / open questions

- A face looks mixed while a scramble is in progress. That is the solve animation; the pause returns each face to one shade.

---

## Outcome

- **Shipped:** `assistant-orb.tsx` paints one gray per face (`FACE_SHADE`) and keeps a single animation frame whose time is read from the clock. `onboarding-ai-panel.tsx` no longer renders a label under the canvas; `onboarding.orbCaption` is gone.
- **Deviated:** none.
- **Not done:** none.
- **Docs updated:** `docs/routes/root.md`, `docs/routes/onboarding.md`.
