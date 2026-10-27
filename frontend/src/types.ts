export type ItemType = 'lost' | 'found';
export type ItemStatus = 'open' | 'claimed' | 'resolved';
export type ClaimStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';
export type ContactPreference = 'in_app' | 'email_on_accept' | 'security_desk';
export type StatusFilter = 'active' | 'open' | 'claimed' | 'resolved' | 'all';

export interface Item {
  id: number;
  title: string;
  description: string;
  category: string;
  itemType: ItemType;
  location: string;
  eventDate: string | null;
  contactPreference: ContactPreference;
  status: ItemStatus;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  owner: { displayName: string };
  activeClaims?: number;
  pendingClaims?: number;
}

export interface Claim {
  id: number;
  itemId: number;
  message: string;
  status: ClaimStatus;
  createdAt: string;
  updatedAt: string;
  claimant?: { name: string };
  claimantEmail?: string;
  item?: {
    id: number;
    title: string;
    itemType: ItemType;
    category: string;
    location: string;
    status: ItemStatus;
    isDemo: boolean;
  };
}

export interface User {
  name: string;
  email: string;
  pictureUrl: string | null;
}

export interface Me {
  authConfigured: boolean;
  allowedDomains: string[];
  user: User | null;
  csrfToken: string | null;
}

export interface Meta {
  categories: string[];
  itemTypes: ItemType[];
  contactPreferences: ContactPreference[];
  locations: string[];
  stats: { openLost: number; openFound: number; resolved: number; total: number };
}

export interface ItemList {
  items: Item[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ItemDetail {
  item: Item;
  isOwner: boolean;
  claims: Claim[] | null;
  viewerClaim: Claim | null;
  contact: { preference: ContactPreference; ownerEmail?: string | null } | null;
}

export interface NewItem {
  title: string;
  description: string;
  category: string;
  itemType: ItemType;
  location: string;
  eventDate: string;
  contactPreference: ContactPreference;
}
