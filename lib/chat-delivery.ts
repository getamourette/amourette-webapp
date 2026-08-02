export type DeliveryState = "pending" | "confirmed" | "failed";

export type ServerMessage = {
  id: string;
  match_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type ChatMessage = ServerMessage & {
  deliveryState: DeliveryState;
  optimistic: boolean;
};

export type StoredMessage = Pick<
  ChatMessage,
  "id" | "match_id" | "sender_id" | "body" | "created_at" | "deliveryState"
>;

export function compareServerOrder(a: ServerMessage, b: ServerMessage) {
  const timestampDifference = Date.parse(a.created_at) - Date.parse(b.created_at);
  return timestampDifference || a.id.localeCompare(b.id);
}

export function confirmedMessage(message: ServerMessage): ChatMessage {
  return { ...message, deliveryState: "confirmed", optimistic: false };
}

export function optimisticMessage(
  id: string,
  matchId: string,
  senderId: string,
  body: string,
  createdAt: string
): ChatMessage {
  return {
    id,
    match_id: matchId,
    sender_id: senderId,
    body,
    created_at: createdAt,
    deliveryState: "pending",
    optimistic: true,
  };
}

// Existing bubbles retain their array slot. This prevents a server timestamp,
// a retry, or a late Realtime event from moving content under the reader.
// Previously unseen server rows are ordered among themselves deterministically.
export function mergeMessages(
  current: ChatMessage[],
  incoming: ServerMessage[]
): ChatMessage[] {
  const next = [...current];
  const positions = new Map(next.map((message, index) => [message.id, index]));
  const unseen: ServerMessage[] = [];

  for (const row of incoming) {
    const position = positions.get(row.id);
    if (position === undefined) {
      unseen.push(row);
      continue;
    }
    next[position] = {
      ...row,
      deliveryState: "confirmed",
      optimistic: next[position].optimistic,
    };
  }

  unseen.sort(compareServerOrder);
  return [...next, ...unseen.map(confirmedMessage)];
}

export function setDeliveryState(
  messages: ChatMessage[],
  id: string,
  deliveryState: DeliveryState
) {
  return messages.map((message) =>
    message.id === id ? { ...message, deliveryState } : message
  );
}

export function failUnconfirmedMessage(messages: ChatMessage[], id: string) {
  return messages.map((message) =>
    message.id === id && message.deliveryState !== "confirmed"
      ? { ...message, deliveryState: "failed" as const }
      : message
  );
}

export function restoreStoredMessages(
  stored: StoredMessage[],
  server: ServerMessage[]
) {
  const serverById = new Map(server.map((message) => [message.id, message]));
  const restored = stored.map<ChatMessage>((message) => ({
    ...message,
    ...(serverById.get(message.id) ?? {}),
    deliveryState: serverById.has(message.id) ? "confirmed" : "failed",
    optimistic: false,
  }));
  const storedIds = new Set(stored.map((message) => message.id));
  return [
    ...server.filter((message) => !storedIds.has(message.id)).map(confirmedMessage),
    ...restored,
  ].sort(compareServerOrder);
}

export function unconfirmedMessages(messages: ChatMessage[]): StoredMessage[] {
  return messages
    .filter((message) => message.deliveryState !== "confirmed")
    .map((message) => ({
      id: message.id,
      match_id: message.match_id,
      sender_id: message.sender_id,
      body: message.body,
      created_at: message.created_at,
      deliveryState: message.deliveryState,
    }));
}
