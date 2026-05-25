# NOAA Signal Explorer

A modern visualization and interpretation layer for NOAA coastal station data.

## Overview

NOAA Signal Explorer fetches real coastal observation data from the NOAA CO-OPS Data Retrieval API, normalizes the response, processes signal trends, and turns raw station data into clear visual summaries and ecological interpretation.

This project is the real-data sibling of Estuary Signal Lab.

## Current MVP

- Station: Providence, RI area / `8454000`
- Signal: `water_temperature`
- Range: last 24 hours
- Output:
  - latest value
  - average
  - trend
  - sample count
  - line chart
  - plain-English ecological insight

## Architecture

```txt
NOAA API
  → NOAA adapter
  → signal processor
  → insight engine
  → Express API
  → React dashboard
Tech Stack

Frontend

React
Vite
Recharts

Backend

Node.js
Express
NOAA CO-OPS API adapter
Run Locally
npm run install:all
npm run dev

Client: http://localhost:5173
Server: http://localhost:4200

API Example
GET /api/signals?station=8454000&product=water_temperature&range=24
Why This Exists

Scientific data is often available but difficult to interpret quickly. This project focuses on the missing layer between raw environmental observations and human understanding.

Future Work
Salinity and water-level support
Multi-station comparison
Narragansett Bay map layer
Estuary health scoring
Reusable NOAA JavaScript client
Documentation examples for scientific developers
Author

Daniel Barletta
