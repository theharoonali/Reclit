// Shared by the REST controllers. Path params arrive as strings; the zod
// schemas coerce them.

export type Params = Record<string, string>;

/** Body plus route params as one object for `schema.parse`; the path wins. */
export const withParams = (params: Params, body: unknown = {}) => ({
  ...(body as object),
  ...params,
});
