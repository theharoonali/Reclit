const UNITS = ["B", "KB", "MB", "GB"] as const;

/** `1536` → `"1.5 KB"`. Unit symbols are not copy, so they are not translated. */
export function formatFileSize(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded =
    unit === 0 || value >= 10 ? Math.round(value) : value.toFixed(1);
  return `${rounded} ${UNITS[unit]}`;
}
