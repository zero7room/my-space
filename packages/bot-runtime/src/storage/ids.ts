import { uuidv7 } from "uuidv7";

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type IdPrefix =
  | "rt"
  | "th"
  | "tk"
  | "pl"
  | "rv"
  | "u"
  | "msg"
  | "ev"
  | "job"
  | "policy"
  | "bd"
  | "exec"
  | "guard";

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${uuidv7()}`;
}

export function isValidId(id: string, prefix: IdPrefix): boolean {
  if (!id.startsWith(`${prefix}_`)) return false;
  const uuid = id.slice(prefix.length + 1);
  return UUID_V7_RE.test(uuid);
}
