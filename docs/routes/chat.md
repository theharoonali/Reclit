# `/chat`

**Purpose:** a claude.ai-style chat with Reclit AI. UI only for now: replies are a canned fixture.

**Rendering:** static. It reads no live data yet.

## Frontend files

| Path | Kind | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/app/(app)/chat/page.tsx` | RSC | Metadata (`chat` namespace), and a full-height frame around `Chat` (no `PageShell`) |
| `apps/dashboard/src/components/chat/chat.tsx` | client | Container. It holds messages, draft, model and pending in local state, and fakes a reply after `FIXTURE_REPLY_MS`. It switches between the empty layout and the thread layout |
| `apps/dashboard/src/components/chat/chat-greeting.tsx` | client | The empty state: the Reclit AI orb (`AssistantOrb`) centred over the greeting |
| `apps/dashboard/src/components/chat/chat-thread.tsx` | client | The message list and the thinking indicator (the orb, running) |
| `apps/dashboard/src/components/chat/chat-message.tsx` | client | One turn. A user message is a muted bubble on the right; a reply is plain text with its actions |
| `apps/dashboard/src/components/chat/chat-message-actions.tsx` | client | Copy, good/bad (visual only) and retry (latest reply only) |
| `apps/dashboard/src/components/chat/chat-composer.tsx` | client | A growing textarea. It has attach (visual only), the model chip (a fixture list) and send |
| `apps/dashboard/src/lib/chat/types.ts` | lib | `ChatMessage`, `CHAT_MODELS` and `FIXTURE_REPLY_MS` |

Shared pieces used: `@reclit/ui/button`, `@reclit/ui/textarea`, `@reclit/ui/dropdown-menu`, `@reclit/ui/tooltip`. The tokens are `max-w-chat-column`, `max-w-chat-bubble` and `max-h-chat-composer`.

## APIs called

None yet. There is no `chat` router. The integration step replaces the local state in `chat.tsx` and the fixture types in `lib/chat/types.ts`.

## Behaviour

- **Empty:** the greeting and the composer are centred in the column.
- **After the first message:** the thread fills the column, and the composer docks to the bottom of `<main>` with the disclaimer under it.
- **Composer keys:** Enter sends and Shift+Enter adds a new line. Send is disabled while the field is blank or a reply is pending. You can keep typing while a reply is pending.
- **Field height:** the field grows with its text up to `chat-composer`, then scrolls.
- **Retry:** it replaces the latest reply with a new one.
- **Messages:** they are plain text with line breaks kept. No markdown is parsed.
- **Persistence:** none. A reload clears the conversation.
- **Island:** the assistant island is hidden here (`scopeForPath` returns null).

## Reusable pieces

- A real chat API should replace the fixture types with `RouterOutputs`, and should replace `reply()` in `chat.tsx` with a mutation. The view components already take props and callbacks.

## Linked routes

- `/` ([root.md](root.md)) holds the sidebar, whose Chat row links here.
