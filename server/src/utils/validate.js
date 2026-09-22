'use strict';

const { z } = require('zod');
const { badRequest } = require('../errors');

/** The rules match ntfy's constraints (see user/util.go). */
const USERNAME_REGEX = /^[-_.+@a-zA-Z0-9]+$/;
const TOPIC_PATTERN_REGEX = /^[-_*A-Za-z0-9]{1,64}$/;
const TOKEN_REGEX = /^tk_[-_A-Za-z0-9]{29}$/;

const PERMISSIONS = ['read-only', 'write-only', 'read-write', 'deny'];
const ROLES = ['user', 'admin'];

const usernameSchema = z
  .string()
  .trim()
  .min(1, 'Specify a username')
  .max(64, 'Username is too long')
  .regex(USERNAME_REGEX, 'Username may contain only letters, digits, and the symbols - _ . + @')
  .refine((value) => value.toLowerCase() !== 'everyone', 'The name "everyone" is reserved');

const topicPatternSchema = z
  .string()
  .trim()
  .min(1, 'Specify a topic')
  .max(64, 'Topic name is too long')
  .regex(TOPIC_PATTERN_REGEX, 'A topic may contain letters, digits, a hyphen, an underscore, and the * symbol');

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Specify a login').max(128),
  password: z.string().min(1, 'Specify a password').max(256),
});

const createUserSchema = z.object({
  username: usernameSchema,
  role: z.enum(ROLES).default('user'),
});

const passwordField = z
  .string()
  .min(8, 'The password must contain at least 8 characters')
  .max(72, 'The password must contain at most 72 characters');

const ntfyPasswordSchema = z.object({
  password: passwordField.optional().or(z.literal('')),
});

const panelPasswordSchema = z.object({
  password: passwordField.optional().or(z.literal('')),
});

const createAdminSchema = z.object({
  username: usernameSchema,
  password: passwordField.optional().or(z.literal('')),
});

const meNtfyPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'The password must contain at least 8 characters')
      .max(72, 'The password must contain at most 72 characters')
      .optional()
      .or(z.literal('')),
    generate: z.boolean().default(false),
  })
  .refine((data) => data.generate || Boolean(data.newPassword), {
    message: 'Specify a new password or request generation',
    path: ['newPassword'],
  });

const addTokenSchema = z.object({
  label: z.string().trim().max(64).optional().or(z.literal('')),
  expires: z
    .string()
    .trim()
    .max(32)
    .regex(/^[0-9]+[smhdw]$/i, 'The expiration is specified, for example, as 30d')
    .optional()
    .or(z.literal('')),
});

const accessSchema = z.object({
  topic: topicPatternSchema,
  permission: z.enum(PERMISSIONS, { message: 'Invalid permissions value' }),
});

const provisionUserSchema = z.object({
  username: usernameSchema,
  role: z.enum(ROLES).default('user'),
  password: passwordField.optional().or(z.literal('')),
  acls: z.array(accessSchema).max(50).optional().default([]),
});

const upsertUserSchema = z.object({
  role: z.enum(ROLES).default('user'),
  password: passwordField.optional().or(z.literal('')),
  acls: z.array(accessSchema).max(50).optional().default([]),
});

const auditQuerySchema = z.object({
  from: z.string().trim().max(32).optional(),
  to: z.string().trim().max(32).optional(),
  admin: z.string().trim().max(128).optional(),
  action: z.string().trim().max(64).optional(),
  targetUser: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Specify the current password'),
  newPassword: z.string().min(8, 'The new password must contain at least 8 characters').max(256),
});

/**
 * Validates data against a zod schema and returns the result.
 * On error, throws an AppError 400 with a list of problems.
 */
function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    throw badRequest('Invalid request data', 'validation_error', details);
  }
  return result.data;
}

module.exports = {
  USERNAME_REGEX,
  TOPIC_PATTERN_REGEX,
  TOKEN_REGEX,
  PERMISSIONS,
  ROLES,
  usernameSchema,
  topicPatternSchema,
  loginSchema,
  createUserSchema,
  ntfyPasswordSchema,
  meNtfyPasswordSchema,
  createAdminSchema,
  panelPasswordSchema,
  addTokenSchema,
  accessSchema,
  provisionUserSchema,
  upsertUserSchema,
  auditQuerySchema,
  changePasswordSchema,
  validate,
};
