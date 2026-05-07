import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  InputBase,
  Box,
  Paper,
  List,
  ListItem,
} from '@material-ui/core';
import SearchIcon from '@material-ui/icons/Search';
import axios from 'axios';

import useStyles from './styles';

const Header = ({ setCoords }) => {
  const classes = useStyles();

  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  // Photon geocoding — free, no key, full CORS support, global coverage
  const fetchSuggestions = async (value) => {
    if (!value) return setSuggestions([]);

    try {
      const res = await axios.get('https://photon.komoot.io/api/', {
        params: {
          q: value,
          limit: 5,
          lang: 'en',
        },
      });

      // Normalize Photon GeoJSON features to same shape as Nominatim results
      const features = res.data?.features || [];
      const normalized = features.map((f) => ({
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        display_name: [
          f.properties.name,
          f.properties.city,
          f.properties.state,
          f.properties.country,
        ]
          .filter(Boolean)
          .join(', '),
      }));

      setSuggestions(normalized);
    } catch (err) {
      console.error('Geocoding error:', err);
      setSuggestions([]);
    }
  };

  const selectPlace = (place) => {
    setCoords({
      lat: Number(place.lat),
      lng: Number(place.lon),
    });

    setSearchQuery(place.display_name);
    setSuggestions([]);
  };

  return (
    <AppBar position="static">
      <Toolbar className={classes.toolbar}>
        <Typography variant="h5" className={classes.title}>Geoshield</Typography>

        <Box display="flex" flexDirection="column" style={{ width: '300px', position: 'relative' }}>
          <Typography variant="h6" className={classes.title}>Explore new places</Typography>

          <div className={classes.search}>
            <div className={classes.searchIcon}>
              <SearchIcon />
            </div>

            <InputBase
              placeholder="Search…"
              classes={{ root: classes.inputRoot, input: classes.inputInput }}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                fetchSuggestions(e.target.value);
              }}
            />
          </div>

          {suggestions.length > 0 && (
            <Paper style={{ position: 'absolute', top: '60px', width: '100%', zIndex: 99 }}>
              <List>
                {suggestions.map((place, i) => (
                  <ListItem button key={i} onClick={() => selectPlace(place)}>
                    {place.display_name}
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
