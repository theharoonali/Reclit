import { AI_KEY_ENV } from "../../ai/model";

// The AI key as the contracts toggle it: every variable ai/model.ts reads it
// from, so "no key" really is none (a fallback variable set in apps/api/.env
// would otherwise keep it configured).

/** Saves every AI key variable; the returned function puts them back. */
export function saveAiKeys(): () => void {
  const saved = AI_KEY_ENV.map((name) => [name, process.env[name]] as const);
  return () => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}

/** Sets the AI key to `value`, or removes every variable it could come from. */
export function setAiKey(value: string | undefined): void {
  for (const name of AI_KEY_ENV) delete process.env[name];
  if (value !== undefined) process.env.AI_API_KEY = value;
}
