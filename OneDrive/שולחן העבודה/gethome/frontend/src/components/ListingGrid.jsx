import { useState, useEffect } from 'react';
import ListingCard from './ListingCard';

export default function ListingGrid({ filters }) {
  const [data, setData] = useState({ listings: [], total: 0, page: 1, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.area) params.set('area', filters.area);
    if (filters.minPrice) params.set('minPrice', filters.minPrice);
    if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
    if (filters.rooms) params.set('rooms', filters.rooms);
    if (filters.pets) params.set('pets', 'true');
    params.set('page', page);

    setLoading(true);
    fetch(`/api/listings?${params}`)
      .then((res) => res.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filters, page]);

  if (loading) return <div className="loading">טוען...</div>;

  return (
    <div>
      <p className="results-count">{data.total} תוצאות</p>
      <div className="listing-grid">
        {data.listings.map((l) => (
          <ListingCard key={l.id} listing={l} />
        ))}
      </div>
      {data.totalPages > 1 && (
        <div className="pagination">
          {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              className={p === page ? 'active' : ''}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
