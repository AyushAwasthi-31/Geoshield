import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { Paper, Typography, useMediaQuery } from '@material-ui/core';
import Rating from '@material-ui/lab/Rating';

import 'maplibre-gl/dist/maplibre-gl.css';
import useStyles from './styles';

// Use OpenStreetMap raster tiles via a MapLibre-compatible style definition
const MAP_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

const Map = ({ coords, places, setCoords, setBounds, setChildClicked, weatherData }) => {
  const mapRef = useRef(null);
  const map = useRef(null);
  const classes = useStyles();
  const matches = useMediaQuery('(min-width:600px)');

  // Initialize map
  useEffect(() => {
    map.current = new maplibregl.Map({
      container: mapRef.current,
      style: MAP_STYLE,
      center: [coords.lng, coords.lat],
      zoom: 13,
    });

    map.current.on('moveend', () => {
      const c = map.current.getCenter();
      const b = map.current.getBounds();

      setCoords({ lat: c.lat, lng: c.lng });
      setBounds({
        ne: { lat: b.getNorthEast().lat, lng: b.getNorthEast().lng },
        sw: { lat: b.getSouthWest().lat, lng: b.getSouthWest().lng },
      });
    });

    return () => map.current.remove();
  }, []);

  // Render markers
  useEffect(() => {
    if (!map.current) return;

    document.querySelectorAll('.custom-marker').forEach((el) => el.remove());

    places?.forEach((place, i) => {
      if (!place.latitude || !place.longitude) return;

      const el = document.createElement('div');
      el.className = 'custom-marker';
      el.style.cursor = 'pointer';

      el.onclick = () => setChildClicked(i);

      el.innerHTML = matches
        ? `
        <div style="width:140px;background:white;border-radius:6px;overflow:hidden;">
          <img src="${place.photo ? place.photo.images.large.url : 'https://www.foodserviceandhospitality.com/wp-content/uploads/2016/09/Restaurant-Placeholder-001.jpg'}" style="width:100%;height:80px;object-fit:cover;"/>
          <div style="padding:6px;font-size:12px;">
            <strong>${place.name}</strong>
            <br/>⭐ ${place.rating || '0'}
          </div>
        </div>
      `
        : `<span style="font-size:32px;">📍</span>`;

      new maplibregl.Marker(el)
        .setLngLat([place.longitude, place.latitude])
        .addTo(map.current);
    });

    // Weather marker
    if (weatherData?.current_weather) {
      const el = document.createElement('div');
      el.className = 'custom-marker';
      el.innerHTML = `
        <div style="background:white;padding:4px 8px;border-radius:4px;">
          🌤 ${weatherData.current_weather.temperature}°C
          <br/>💨 ${weatherData.current_weather.windspeed} km/h
        </div>
      `;

      new maplibregl.Marker(el)
        .setLngLat([coords.lng, coords.lat])
        .addTo(map.current);
    }
  }, [places, weatherData, coords, matches]);

  return <div ref={mapRef} className={classes.mapContainer} />;
};

export default Map;
