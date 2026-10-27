// Shapes database rows into API responses. Private emails are never included here;
// routes add contact details only for the parties of an accepted claim.

export function shortName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || 'Student';
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export function serializeItem(row) {
  return {
    id: Number(row.id),
    title: row.title,
    description: row.description,
    category: row.category,
    itemType: row.item_type,
    location: row.location,
    eventDate: row.event_date,
    contactPreference: row.contact_preference,
    status: row.status,
    isDemo: row.is_demo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    owner: { displayName: row.owner_is_demo ? 'Demo listing' : shortName(row.owner_name) },
    activeClaims: row.active_claims ?? undefined,
    pendingClaims: row.pending_claims ?? undefined,
  };
}

export function serializeClaim(row, { includeItem = false } = {}) {
  const claim = {
    id: Number(row.id),
    itemId: Number(row.item_id),
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.claimant_name !== undefined) claim.claimant = { name: row.claimant_name };
  if (includeItem) {
    claim.item = {
      id: Number(row.item_id),
      title: row.item_title,
      itemType: row.item_type,
      category: row.item_category,
      location: row.item_location,
      status: row.item_status,
      isDemo: row.item_is_demo,
    };
  }
  return claim;
}

export const ITEM_SELECT = `
  SELECT i.*, u.name AS owner_name, u.is_demo AS owner_is_demo,
         (SELECT count(*)::int FROM claims c
           WHERE c.item_id = i.id AND c.status IN ('pending', 'accepted')) AS active_claims
    FROM items i
    JOIN users u ON u.id = i.owner_id`;
