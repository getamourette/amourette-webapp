export type MatchOrderData = {
  id: string;
  createdAt: string;
  latestMessageAt: string | null;
};

function timestamp(value: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function orderMatchesByAttention<T extends MatchOrderData>(
  matches: T[],
  unreadByMatchId: Record<string, number>,
) {
  return [...matches].sort((left, right) => {
    const unreadDifference =
      Number((unreadByMatchId[right.id] ?? 0) > 0) -
      Number((unreadByMatchId[left.id] ?? 0) > 0);
    if (unreadDifference !== 0) return unreadDifference;

    const activityDifference =
      timestamp(right.latestMessageAt) - timestamp(left.latestMessageAt);
    if (activityDifference !== 0) return activityDifference;

    const createdDifference = timestamp(right.createdAt) - timestamp(left.createdAt);
    if (createdDifference !== 0) return createdDifference;

    return left.id.localeCompare(right.id);
  });
}
