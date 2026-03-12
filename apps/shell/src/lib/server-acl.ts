/**
 * Server ACL parsing, validation, and serialization helpers.
 *
 * Pure functions for working with the `m.room.server_acl` state event
 * content, as defined in the Matrix specification.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServerAclContent {
  allow: string[];
  deny: string[];
  allow_ip_literals: boolean;
}

export interface ServerAclValidation {
  valid: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_SERVER_ACL: ServerAclContent = {
  allow: ["*"],
  deny: [],
  allow_ip_literals: true,
};

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse raw `m.room.server_acl` event content into a structured object.
 * Fills in defaults for missing fields.
 */
export function parseServerAcl(content: Record<string, unknown> | undefined): ServerAclContent {
  if (!content) return { ...DEFAULT_SERVER_ACL };

  const allow = Array.isArray(content.allow)
    ? (content.allow as unknown[]).filter((v): v is string => typeof v === "string")
    : ["*"];

  const deny = Array.isArray(content.deny)
    ? (content.deny as unknown[]).filter((v): v is string => typeof v === "string")
    : [];

  const allowIpLiterals =
    typeof content.allow_ip_literals === "boolean" ? content.allow_ip_literals : true;

  return { allow, deny, allow_ip_literals: allowIpLiterals };
}

/**
 * Parse a newline-separated text block into an array of server patterns.
 * Strips empty lines and leading/trailing whitespace.
 */
export function parseServerList(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Serialize an array of server patterns into newline-separated text.
 */
export function serializeServerList(servers: string[]): string {
  return servers.join("\n");
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a single server ACL pattern.
 *
 * Valid patterns:
 * - `*` (wildcard — matches all)
 * - `*.example.com` (wildcard subdomain)
 * - `matrix.example.com` (exact match)
 * - Server names: alphanumeric, dots, hyphens, colons (for port), asterisks for wildcard
 *
 * Invalid patterns:
 * - Empty strings
 * - Patterns with spaces
 * - Patterns with `//` or protocol prefixes
 */
export function validateServerPattern(pattern: string): { valid: boolean; error?: string } {
  if (pattern.length === 0) {
    return { valid: false, error: "Pattern cannot be empty" };
  }

  if (/\s/.test(pattern)) {
    return { valid: false, error: "Pattern cannot contain whitespace" };
  }

  if (pattern.includes("://")) {
    return { valid: false, error: "Pattern should not include protocol (e.g., https://)" };
  }

  // Allowed characters: alphanumeric, dots, hyphens, colons, asterisks
  if (!/^[a-zA-Z0-9.*:-]+$/.test(pattern)) {
    return { valid: false, error: "Pattern contains invalid characters" };
  }

  return { valid: true };
}

/**
 * Validate the full server ACL content before saving.
 */
export function validateServerAcl(acl: ServerAclContent): ServerAclValidation {
  const errors: string[] = [];

  // Validate allow list
  for (const pattern of acl.allow) {
    const result = validateServerPattern(pattern);
    if (!result.valid) {
      errors.push(`Allow list: "${pattern}" — ${result.error}`);
    }
  }

  // Validate deny list
  for (const pattern of acl.deny) {
    const result = validateServerPattern(pattern);
    if (!result.valid) {
      errors.push(`Deny list: "${pattern}" — ${result.error}`);
    }
  }

  // Warn if allow list is empty (effectively denies everything)
  if (acl.allow.length === 0) {
    errors.push("Allow list is empty — this will deny all servers");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Build the event content object for `m.room.server_acl`.
 */
export function buildServerAclContent(acl: ServerAclContent): Record<string, unknown> {
  return {
    allow: acl.allow,
    deny: acl.deny,
    allow_ip_literals: acl.allow_ip_literals,
  };
}
