export type ReadableMessage = {
  match_id: string;
  sender_id: string;
  created_at: string;
};

export function chatReadMarkerKey(matchId: string) {
  return `amourette-chat-read:${matchId}`;
}

export function legacyChatReadMarkerKey(matchId: string) {
  return `paramour-chat-read:${matchId}`;
}

export function latestMessageTimestamp(messages: Pick<ReadableMessage, "created_at">[]) {
  return messages.reduce<string | null>((latest, message) => {
    if (!latest || Date.parse(message.created_at) > Date.parse(latest)) return message.created_at;
    return latest;
  }, null);
}

export function countUnreadByMatch(
  messages: ReadableMessage[],
  myId: string,
  readMarkers: Record<string, string>,
) {
  return messages.reduce<Record<string, number>>((counts, message) => {
    if (message.sender_id === myId) return counts;
    const marker = readMarkers[message.match_id] ?? "1970-01-01T00:00:00.000Z";
    if (Date.parse(message.created_at) <= Date.parse(marker)) return counts;
    counts[message.match_id] = (counts[message.match_id] ?? 0) + 1;
    return counts;
  }, {});
}
