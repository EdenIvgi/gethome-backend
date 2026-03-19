import { useState } from 'react';
import FilterBar from './components/FilterBar';
import ListingGrid from './components/ListingGrid';
import MapView from './components/MapView';
import './App.css';

export default function App() {
  const [filters, setFilters] = useState({});
  const [view, setView] = useState('grid');

  return (
    <div className="app" dir="rtl">
      <header>
        <h1>GetHome</h1>
        <p>מצא את הדירה המושלמת</p>
      </header>
      <FilterBar onFilter={setFilters} />
      <div className="view-toggle">
        <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')}>
          רשימה
        </button>
        <button className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}>
          מפה
        </button>
      </div>
      {view === 'grid' ? <ListingGrid filters={filters} /> : <MapView />}
    </div>
  );
}
