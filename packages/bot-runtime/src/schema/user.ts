import { z } from "zod";

const IdRe = /^[a-z]+_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const UserIdSchema = z
  .string()
  .regex(IdRe, "id must be prefix_uuidv7");

export const ChannelIdentitiesSchema = z.object({
  feishu: z
    .object({ openId: z.string(), tenantKey: z.string().optional() })
    .optional(),
  slack: z
    .object({ userId: z.string(), teamId: z.string() })
    .optional(),
  email: z.string().email().optional(),
});

export const UserSchema = z.object({
  id: UserIdSchema,
  displayName: z.string().min(1),
  channelIdentities: ChannelIdentitiesSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export type User = z.infer<typeof UserSchema>;
