import type { MatrixClient, Room, MatrixEvent } from "matrix-js-sdk";
import React, { useMemo } from "react";

interface ReceiptUser {
  userId: string;
  displayName: string;
}

interface ReadReceiptsProps {
  room: Room;
  event: MatrixEvent;
  client: MatrixClient;
  /** Maximum number of avatar circles to display before showing "+N" */
  maxVisible?: number;
}

/**
 * Displays a small row of overlapping avatar circles showing which users
 * have read up to a given event. Shows at most `maxVisible` avatars with a
 * "+N" overflow indicator for the rest.
 *
 * Reads receipts from the room state via `room.getReceiptsForEvent(event)`.
 */
export const ReadReceipts = React.memo(function ReadReceipts({
  room,
  event,
  client,
  maxVisible = 5,
}: ReadReceiptsProps) {
  const myUserId = client.getUserId();

  const readers = useMemo((): ReceiptUser[] => {
    const receipts = room.getReceiptsForEvent(event);
    if (!receipts || receipts.length === 0) return [];

    const users: ReceiptUser[] = [];
    for (const receipt of receipts) {
      // Exclude the current user's own receipt and the sender
      if (receipt.userId === myUserId) continue;
      if (receipt.userId === event.getSender()) continue;

      const member = room.getMember(receipt.userId);
      users.push({
        userId: receipt.userId,
        displayName: member?.name ?? receipt.userId,
      });
    }

    return users;
  }, [room, event, myUserId]);

  if (readers.length === 0) return null;

  const visible = readers.slice(0, maxVisible);
  const overflowCount = readers.length - visible.length;

  return (
    <div className="flex items-center mt-1 -space-x-1">
      {visible.map((user) => {
        const initial = user.displayName.replace(/^[@]/, "").charAt(0).toUpperCase();
        return (
          <div
            key={user.userId}
            className="w-4 h-4 rounded-full bg-surface-3 border border-surface-0 flex items-center justify-center"
            title={user.displayName}
          >
            <span className="text-[8px] font-medium text-secondary">{initial}</span>
          </div>
        );
      })}
      {overflowCount > 0 && (
        <div
          className="w-4 h-4 rounded-full bg-surface-3 border border-surface-0 flex items-center justify-center"
          title={`${overflowCount} more`}
        >
          <span className="text-[7px] font-medium text-muted">+{overflowCount}</span>
        </div>
      )}
    </div>
  );
});
