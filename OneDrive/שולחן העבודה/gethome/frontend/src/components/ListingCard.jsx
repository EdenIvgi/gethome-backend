export default function ListingCard({ listing }) {
  const tags = [];
  if (listing.pets_allowed) tags.push('🐾 חיות');
  if (listing.parking) tags.push('🚗 חניה');
  if (listing.balcony) tags.push('🌿 מרפסת');

  const sourceBadge = listing.source === 'facebook' ? '📘 FB' : '🏠 יד2';

  return (
    <div className="listing-card">
      <div className="card-header">
        <span className="price">₪{listing.price?.toLocaleString()}</span>
        <span className="source-badge">{sourceBadge}</span>
      </div>
      <div className="card-body">
        <p><strong>{listing.rooms}</strong> חדרים {listing.area && `| ${listing.area}`}</p>
        {listing.neighborhood && <p className="neighborhood">{listing.neighborhood}</p>}
        {listing.area_sqm && <p>{listing.area_sqm} מ"ר</p>}
      </div>
      {tags.length > 0 && (
        <div className="tags">
          {tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
        </div>
      )}
      {listing.url && (
        <a href={listing.url} target="_blank" rel="noopener noreferrer" className="listing-link">
          צפה במודעה
        </a>
      )}
    </div>
  );
}
