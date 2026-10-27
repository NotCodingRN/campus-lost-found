import { z } from 'zod';

export const CATEGORIES = [
  'electronics', 'keys', 'wallets_ids', 'bags', 'clothing',
  'books_notes', 'bottles', 'accessories', 'sports', 'other',
];
export const ITEM_TYPES = ['lost', 'found'];
export const CONTACT_PREFERENCES = ['in_app', 'email_on_accept', 'security_desk'];
export const ITEM_STATUSES = ['open', 'claimed', 'resolved'];

const text = (label, min, max) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

const oneOf = (values, message) => z.enum(values, { errorMap: () => ({ message }) });

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must look like YYYY-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, 'Date is not a real calendar date')
  .refine((value) => value >= '2000-01-01', 'Date is too far in the past')
  .refine((value) => {
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    return value <= tomorrow;
  }, 'Date cannot be in the future');

export const itemCreateSchema = z
  .object({
    title: text('Title', 3, 120),
    description: text('Description', 10, 2000),
    category: oneOf(CATEGORIES, 'Choose a valid category'),
    itemType: oneOf(ITEM_TYPES, 'Choose lost or found'),
    location: text('Location', 2, 120),
    eventDate: z
      .union([isoDate, z.literal(''), z.null()])
      .optional()
      .transform((value) => value || null),
    contactPreference: oneOf(CONTACT_PREFERENCES, 'Choose a valid contact preference').default('in_app'),
  })
  .strict();

export const claimCreateSchema = z
  .object({
    message: text('Message', 10, 1000),
  })
  .strict();

const optionalFilter = (schema) =>
  z.preprocess((value) => (value === '' || value === 'all' ? undefined : value), schema.optional());

export const itemListQuerySchema = z.object({
  q: optionalFilter(z.string().trim().max(100, 'Search text is too long')),
  type: optionalFilter(oneOf(ITEM_TYPES, 'Unknown type filter')),
  category: optionalFilter(oneOf(CATEGORIES, 'Unknown category filter')),
  location: optionalFilter(z.string().trim().max(120, 'Location filter is too long')),
  status: z.preprocess(
    (v) => (v === '' || v === undefined ? 'active' : v),
    z.enum(['active', 'open', 'claimed', 'resolved', 'all'], { errorMap: () => ({ message: 'Unknown status filter' }) }),
  ),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});

export const idParamSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export function fieldErrors(zodError) {
  const fields = {};
  for (const issue of zodError.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}
