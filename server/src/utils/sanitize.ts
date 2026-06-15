export function sanitizeString(input: unknown, maxLength = 500): string {
  if (typeof input !== 'string') return '';
  return input
    .slice(0, maxLength)
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();
}

export function sanitizeHtml(input: unknown, maxLength = 5000): string {
  if (typeof input !== 'string') return '';
  return input
    .slice(0, maxLength)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .trim();
}

export function sanitizeUsername(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .slice(0, 30)
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase();
}

export function sanitizeEmail(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.slice(0, 254).toLowerCase().trim();
}

