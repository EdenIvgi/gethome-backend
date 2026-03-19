import { useState } from 'react';

const AREAS = [
  'צפון תל אביב',
  'מרכז תל אביב',
  'דרום תל אביב',
  'יפו',
  'מזרח תל אביב',
  'רמת החייל',
];

export default function FilterBar({ onFilter }) {
  const [filters, setFilters] = useState({
    area: '',
    minPrice: '',
    maxPrice: '',
    rooms: '',
    pets: false,
  });

  const update = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onFilter(filters);
  };

  return (
    <form className="filter-bar" onSubmit={handleSubmit}>
      <select value={filters.area} onChange={(e) => update('area', e.target.value)}>
        <option value="">כל האזורים</option>
        {AREAS.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
      <input
        type="number"
        placeholder="מחיר מינימום"
        value={filters.minPrice}
        onChange={(e) => update('minPrice', e.target.value)}
      />
      <input
        type="number"
        placeholder="מחיר מקסימום"
        value={filters.maxPrice}
        onChange={(e) => update('maxPrice', e.target.value)}
      />
      <select value={filters.rooms} onChange={(e) => update('rooms', e.target.value)}>
        <option value="">חדרים</option>
        {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((r) => (
          <option key={r} value={r}>{r} חדרים</option>
        ))}
      </select>
      <label className="pets-label">
        <input
          type="checkbox"
          checked={filters.pets}
          onChange={(e) => update('pets', e.target.checked)}
        />
        חיות מחמד
      </label>
      <button type="submit">חיפוש</button>
    </form>
  );
}
