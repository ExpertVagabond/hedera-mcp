import type { z } from "zod";

/** Tool registration function shared by every tool module (matches house style). */
export type Register = (
  name: string,
  description: string,
  shape: Record<string, z.ZodType>,
  handler: (args: any) => Promise<string>,
) => void;
