import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon in Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export default function MapView() {
  const [markers, setMarkers] = useState([]);

  useEffect(() => {
    fetch('/api/listings/map/all')
      .then((res) => res.json())
      .then(setMarkers)
      .catch(console.error);
  }, []);

  return (
    <MapContainer center={[32.08, 34.78]} zoom={12} className="map-container">
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      {markers.map((m) => (
        <Marker key={m.id} position={[m.lat, m.lng]}>
          <Popup>
            <strong>₪{m.price?.toLocaleString()}</strong><br />
            {m.rooms} חדרים {m.area && `| ${m.area}`}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
