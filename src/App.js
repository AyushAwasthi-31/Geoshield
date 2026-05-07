import React, { useState, useEffect } from 'react';
import { CssBaseline, Grid } from '@material-ui/core';

import { getPlacesData, getWeatherData } from './api/travelAdvisorAPI';
import Header from './components/Header/Header';
import List from './components/List/List';
import Map from './components/Map/Map';

const App = () => {
  const [type, setType] = useState('restaurants');
  const [rating, setRating] = useState('');

  const [coords, setCoords] = useState({ lat: 20.5937, lng: 78.9629 });
  const [bounds, setBounds] = useState(null);

  const [weatherData, setWeatherData] = useState(null);
  const [filteredPlaces, setFilteredPlaces] = useState([]);
  const [places, setPlaces] = useState([]);

  const [childClicked, setChildClicked] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // ── Set user location on mount ──────────────────────────────────────────────
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude } }) => {
        setCoords({ lat: latitude, lng: longitude });
      },
      () => console.log('Location denied, using default India center.')
    );
  }, []);

  // ── Filter places by rating whenever rating or places change ─────────────────
  useEffect(() => {
    if (rating === '') {
      setFilteredPlaces([]); // '' → show all (unfiltered)
    } else {
      const filtered = places.filter((p) => Number(p.rating) >= Number(rating));
      setFilteredPlaces(filtered);
    }
  }, [rating, places]);

  // ── Fetch places + weather whenever bounds or type change ────────────────────
  useEffect(() => {
    if (!bounds) return;

    setIsLoading(true);
    setPlaces([]);
    setFilteredPlaces([]);

    getWeatherData(coords.lat, coords.lng).then((data) => setWeatherData(data));

    getPlacesData(type, bounds.sw, bounds.ne).then((data) => {
      setPlaces(Array.isArray(data) ? data.filter((p) => p.name) : []);
      setRating('');
      setIsLoading(false);
    });
  }, [bounds, type]);

  // ── When header search moves coords, trigger a fresh fetch ───────────────────
  // We do this by calculating fresh bounds around the new coord after a tiny delay
  // (the map "moveend" fires and sets bounds itself; this is a fallback in case
  //  the map hasn't moved yet when bounds are already set to a stale value)
  const handleCoordsChange = (newCoords) => {
    setCoords(newCoords);
    // ±0.1° (~11 km) bounding box so data loads immediately after search
    const delta = 0.1;
    setBounds({
      ne: { lat: newCoords.lat + delta, lng: newCoords.lng + delta },
      sw: { lat: newCoords.lat - delta, lng: newCoords.lng - delta },
    });
  };

  return (
    <>
      <CssBaseline />
      <Header setCoords={handleCoordsChange} />

      <Grid container spacing={3} style={{ width: '100%' }}>
        <Grid item xs={12} md={4}>
          <List
            isLoading={isLoading}
            childClicked={childClicked}
            places={filteredPlaces.length ? filteredPlaces : places}
            type={type}
            setType={setType}
            rating={rating}
            setRating={setRating}
          />
        </Grid>

        <Grid item xs={12} md={8}>
          <Map
            coords={coords}
            setCoords={setCoords}
            setBounds={setBounds}
            places={filteredPlaces.length ? filteredPlaces : places}
            setChildClicked={setChildClicked}
            weatherData={weatherData}
          />
        </Grid>
      </Grid>
    </>
  );
};

export default App;
