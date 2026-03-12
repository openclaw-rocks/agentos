import type { MatrixClient } from "matrix-js-sdk";

/**
 * Get the list of user IDs that the current user has ignored.
 */
export function getIgnoredUsers(client: MatrixClient): string[] {
  return client.getIgnoredUsers() ?? [];
}

/**
 * Add a user to the ignore/block list.
 */
export async function ignoreUser(client: MatrixClient, userId: string): Promise<void> {
  const current = getIgnoredUsers(client);
  if (current.includes(userId)) return;
  await client.setIgnoredUsers([...current, userId]);
}

/**
 * Remove a user from the ignore/block list.
 */
export async function unignoreUser(client: MatrixClient, userId: string): Promise<void> {
  const current = getIgnoredUsers(client);
  const filtered = current.filter((id) => id !== userId);
  await client.setIgnoredUsers(filtered);
}

/**
 * Check whether a user is currently on the ignore/block list.
 */
export function isUserIgnored(client: MatrixClient, userId: string): boolean {
  return getIgnoredUsers(client).includes(userId);
}
