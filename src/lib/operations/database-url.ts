import { z } from "zod";

export const databaseUrlSchema = z.string().trim().min(1).superRefine(
  (value, context) => {
    try {
      const parsed = new URL(value);
      if (
        !["postgres:", "postgresql:"].includes(parsed.protocol) ||
        !parsed.hostname ||
        !parsed.username ||
        parsed.pathname === "/"
      ) {
        context.addIssue({
          code: "custom",
          message: "DATABASE_URL must be a complete Postgres connection URL",
        });
      }
    } catch {
      context.addIssue({
        code: "custom",
        message: "DATABASE_URL must be a complete Postgres connection URL",
      });
    }
  },
);
