import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const API_BASE = 'http://localhost:8000/api/sponsor/drivers/';

export function DriverList() {
  const [drivers, setDrivers] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(API_BASE)
      .then((res) => res.json())
      .then(setDrivers);
  }, []);

  if (drivers.length === 0) return <p>No drivers assigned yet.</p>;

  return (
    <ul>
      {drivers.map((d) => (
        <li key={d.id} onClick={() => navigate(`/drivers/${d.id}`)}>
          {d.name} — {d.status}
        </li>
      ))}
    </ul>
  );
}

export function DriverDetail() {
  const { driverId } = useParams();
  const [driver, setDriver] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}${driverId}/`)
      .then((res) => res.json())
      .then(setDriver);
  }, [driverId]);

  const approve = () => {
    fetch(`${API_BASE}${driverId}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    })
      .then((res) => res.json())
      .then(setDriver);
  };

  if (!driver) return <p>Loading...</p>;

  return (
    <div>
      <h2>{driver.name}</h2>
      <p>Status: {driver.status}</p>
      {driver.status === 'pending' && (
        <button onClick={approve}>Approve Driver</button>
      )}
    </div>
  );
}