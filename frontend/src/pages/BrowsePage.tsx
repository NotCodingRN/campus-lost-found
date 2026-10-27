import { Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api';
import { useAuth } from '../auth';
import { EmptyState, ErrorState, ItemTag, SkeletonTags, Spinner } from '../components';
import { CATEGORY_LABELS } from '../labels';
import type { Item, Meta } from '../types';

const PAGE_SIZE = 12;

interface ListState {
  items: Item[];
  total: number;
  page: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

export function BrowsePage() {
  const [params, setParams] = useSearchParams();
  const { me } = useAuth();
  const filters = {
    q: params.get('q') ?? '',
    type: params.get('type') ?? '',
    category: params.get('category') ?? '',
    location: params.get('location') ?? '',
    status: params.get('status') ?? 'active',
  };
  const filterKey = JSON.stringify(filters);
  const hasFilters = Boolean(filters.q || filters.type || filters.category || filters.location || filters.status !== 'active');

  const [meta, setMeta] = useState<Meta | null>(null);
  const [latest, setLatest] = useState<Item[]>([]);
  const [search, setSearch] = useState(filters.q);
  const [list, setList] = useState<ListState>({ items: [], total: 0, page: 1, loading: true, loadingMore: false, error: null });
  const resultsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    api.meta().then(setMeta).catch(() => setMeta(null));
    api.listItems({ pageSize: 3 }).then((r) => setLatest(r.items)).catch(() => setLatest([]));
  }, []);

  useEffect(() => setSearch(filters.q), [filters.q]);

  const load = useCallback(async (page: number) => {
    const current = JSON.parse(filterKey) as typeof filters;
    setList((s) => ({ ...s, loading: page === 1, loadingMore: page > 1, error: null }));
    try {
      const result = await api.listItems({ ...current, page, pageSize: PAGE_SIZE });
      setList((s) => ({
        items: page === 1 ? result.items : [...s.items, ...result.items],
        total: result.total,
        page,
        loading: false,
        loadingMore: false,
        error: null,
      }));
    } catch (error) {
      setList((s) => ({ ...s, loading: false, loadingMore: false, error: error instanceof Error ? error.message : 'Could not load items.' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    void load(1);
  }, [load]);

  const update = (changes: Partial<typeof filters>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (!value || (key === 'status' && value === 'active')) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    update({ q: search.trim() });
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const stats = meta?.stats;

  return (
    <>
      <section className="hero">
        <div className="wrap hero-inner">
          <div className="hero-copy">
            <h1>Lost something on campus? Someone may already have handed it in.</h1>
            <p className="lede">
              Search what people have found, or post what you lost so whoever picks it up knows it is yours.
            </p>
            <form className="hero-search" role="search" onSubmit={submitSearch}>
              <label htmlFor="hero-q" className="visually-hidden">Search lost and found items</label>
              <Search size={20} aria-hidden="true" />
              <input
                id="hero-q"
                type="search"
                placeholder="Try “calculator”, “keys” or “library”"
                value={search}
                maxLength={100}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button type="submit" className="btn btn--primary">Search</button>
            </form>
            {stats && (
              <p className="hero-stats">
                <strong>{stats.openFound}</strong> found {stats.openFound === 1 ? 'item is' : 'items are'} waiting for an owner,{' '}
                <strong>{stats.openLost}</strong> {stats.openLost === 1 ? 'person is' : 'people are'} still looking, and{' '}
                <strong>{stats.resolved}</strong> {stats.resolved === 1 ? 'item has' : 'items have'} gone home.
              </p>
            )}
            <div className="hero-actions">
              <Link className="btn btn--secondary" to="/report?type=lost">I lost something</Link>
              <Link className="btn btn--secondary" to="/report?type=found">I found something</Link>
            </div>
          </div>
          <div className="hero-board" aria-label="Most recent listings">
            <span className="hero-board__rail" aria-hidden="true" />
            {latest.map((item, index) => (
              <ItemTag key={item.id} item={item} style={{ ['--i' as string]: index }} />
            ))}
          </div>
        </div>
      </section>

      {me && !me.authConfigured && (
        <div className="wrap">
          <p className="notice">
            Google sign-in is not configured on this server yet. You can browse and search, but posting and
            claiming need sign-in. The README explains the setup.
          </p>
        </div>
      )}

      <section className="wrap results" ref={resultsRef} aria-labelledby="results-title">
        <div className="results-head">
          <h2 id="results-title">
            {filters.q ? <>Results for “{filters.q}”</> : 'Everything handed in and reported'}
          </h2>
          {!list.loading && !list.error && <p className="results-count">{list.total} {list.total === 1 ? 'item' : 'items'}</p>}
        </div>

        <div className="filters" role="group" aria-label="Filter items">
          <div className="segmented" role="radiogroup" aria-label="Lost or found">
            {[
              ['', 'Everything'],
              ['lost', 'Lost'],
              ['found', 'Found'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={filters.type === value}
                className={`segmented__opt ${filters.type === value ? 'is-on' : ''} ${value ? `segmented__opt--${value}` : ''}`}
                onClick={() => update({ type: value })}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="field field--inline">
            <span>Category</span>
            <select value={filters.category} onChange={(e) => update({ category: e.target.value })}>
              <option value="">Any category</option>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="field field--inline">
            <span>Place</span>
            <select value={filters.location} onChange={(e) => update({ location: e.target.value })}>
              <option value="">Anywhere on campus</option>
              {filters.location && !meta?.locations.includes(filters.location) && (
                <option value={filters.location}>{filters.location}</option>
              )}
              {meta?.locations.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </label>
          <label className="field field--inline">
            <span>Status</span>
            <select value={filters.status} onChange={(e) => update({ status: e.target.value })}>
              <option value="active">Still open</option>
              <option value="open">Waiting for owner</option>
              <option value="claimed">Claim accepted</option>
              <option value="resolved">Returned</option>
              <option value="all">Show everything</option>
            </select>
          </label>
          {hasFilters && (
            <button type="button" className="btn btn--quiet" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
              Clear filters
            </button>
          )}
        </div>

        {list.loading ? (
          <SkeletonTags />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={() => void load(1)} />
        ) : list.items.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'Nothing matches those filters' : 'No listings yet'}
            action={
              <div className="empty__actions">
                {hasFilters && (
                  <button type="button" className="btn btn--secondary" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                    Clear filters
                  </button>
                )}
                <Link className="btn btn--primary" to="/report">Report an item</Link>
              </div>
            }
          >
            {hasFilters
              ? 'Try a wider search, or post what you lost so the finder can reach you.'
              : 'Be the first to post something you lost or found.'}
          </EmptyState>
        ) : (
          <>
            <div className="tag-grid">
              {list.items.map((item) => <ItemTag key={item.id} item={item} />)}
            </div>
            {list.items.length < list.total && (
              <div className="load-more">
                {list.loadingMore ? (
                  <Spinner label="Loading more" />
                ) : (
                  <button type="button" className="btn btn--secondary" onClick={() => void load(list.page + 1)}>
                    Show more items
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
