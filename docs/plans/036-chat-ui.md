# 036 — Chat UI

**Status:** implemented
**Scope:** frontend

## Goal

The sidebar's Chat row opens `/chat`, a screen laid out like claude.ai chat. It has a centred greeting and composer when empty, then a thread with user bubbles and plain-text replies, actions under each reply, and a composer docked at the bottom with attach and a model chip. It is UI only, and replies are a fixture.

## Backend (Agent 1)

- None.

## Frontend (Agent 2)

- **Route:** `/chat` is static. The nav row loses `locked: true`.
- **Components:** new files in `components/chat/`: `chat`, `chat-greeting`, `chat-thread`, `chat-message`, `chat-message-actions` and `chat-composer`. Fixture types are in `lib/chat/types.ts`.
- **States:** empty is the greeting, pending is the running orb (`AssistantOrb`), and there is no error state yet because no request can fail.
- **Tokens:** `chat-column`, `chat-bubble` and `chat-composer` in `sizes`.

## Integration (Agent 3)

- Later, a `chat` router replaces `reply()` and the local message state in `chat.tsx`.

## Decisions

- No markdown renderer. Replies are plain text until the API's reply shape is known.
- The app's one corner, `rounded-sm`, is used for the bubble and the composer, instead of claude.ai's larger radius.
- Attach, rating and the model choice are visual only.

---

## Outcome

- **Shipped:** as planned.
- **Not done:** the API, streaming, markdown, history and attachments.
- **Docs updated:** `docs/routes/chat.md` and `docs/routes/index.md`.
