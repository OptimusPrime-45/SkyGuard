# SkyGuard

SkyGuard is a real-time airspace monitoring and threat detection platform. It combines live aviation data, weather alerts, and machine learning to visualize no-fly zones, warzones, and severe weather hazards on an interactive map.

---

## Technologies Used

### 1. TypeScript (with Vite)
- **Why:** Type safety, modern syntax, and better tooling for large-scale apps.
- **Alternatives:** JavaScript (less safe), Babel+Webpack (slower, more config).
- **Decision:** TypeScript with Vite for fast dev/build and strong typing.

### 2. React (implied by Vite + component structure)
- **Why:** Component-based UI, large ecosystem, easy state management.
- **Alternatives:** Vue, Svelte, Angular.
- **Decision:** React is industry standard, integrates well with mapping libs.

### 3. deck.gl + maplibre-gl
- **Why:** High-performance WebGL map rendering, supports custom layers, open-source.
- **Alternatives:** Mapbox GL JS (license restrictions), Leaflet (not WebGL), Google Maps (proprietary).
- **Decision:** deck.gl for custom overlays, maplibre-gl for open-source Mapbox compatibility.

### 4. FastAPI (Python backend)
- **Why:** Fast, async, easy to write APIs, great for ML model serving.
- **Alternatives:** Flask (less async), Django (heavier), Node.js (JS-only).
- **Decision:** FastAPI is modern, async, and integrates well with Python ML stack.

### 5. Machine Learning (PyTorch, scikit-learn, joblib)
- **Why:** PyTorch for deep learning, scikit-learn for classical ML, joblib for model serialization.
- **Alternatives:** TensorFlow (heavier), ONNX (for cross-platform), pickle (less safe).
- **Decision:** PyTorch and scikit-learn are standard, joblib is safe for model files.

### 6. Circuit Breaker Pattern (JS/TS)
- **Why:** Prevents UI from spamming failed APIs, improves resilience.
- **Alternatives:** Manual retry logic, no circuit breaker (worse UX).
- **Decision:** Circuit breaker is best practice for real-time dashboards.

---

## Web Technologies & APIs

- **Frontend:** TypeScript, React, Vite, deck.gl, maplibre-gl, custom components.
- **Backend:** FastAPI (Python), RESTful APIs, model serving endpoints.
- **APIs:**
  - `/api/bootstrap?keys=weatherAlerts` — returns weather alert data.
  - `/api/airspace-restrictions` — returns no-fly zones, warzones, etc.
  - `/api/live-channels` — live aviation data.
  - `/api/models/*` — ML model endpoints (anomaly detection, classification).
- **Weather Data:** NWS (National Weather Service) API, processed and cached.
- **Aviation Data:** FAA, ICAO, EUROCONTROL, open conflict databases.
- **Map Tiles:** MapLibre-compatible vector tiles, custom styles.

---


## Machine Learning Models

### 1. Anomaly Detector
- **Type:** Unsupervised anomaly detection (Isolation Forest, Autoencoder)
- **Purpose:** Detects unusual flight patterns, airspace violations, or unexpected weather events in real time.
- **Why:** Isolation Forest is robust for tabular anomaly detection; Autoencoders (deep learning) can capture complex, non-linear patterns in flight data. Both are fast and interpretable.
- **Alternatives considered:** One-Class SVM (slower, less scalable), k-NN (memory intensive), classical statistical thresholds (less adaptive).
- **Decision:** Isolation Forest for speed and interpretability; Autoencoder for deep, non-linear anomaly detection.

### 2. Airspace Event Classifier
- **Type:** Supervised classification (Random Forest, Logistic Regression, PyTorch MLP)
- **Purpose:** Classifies airspace events (e.g., warzone, no-fly, weather hazard) based on features from NOTAMs, weather, and live data.
- **Why:** Random Forests are robust to noise and handle mixed data well; Logistic Regression is interpretable; MLP (neural net) can learn more complex boundaries if needed.
- **Alternatives considered:** SVM (less scalable), XGBoost (more complex, less interpretable for ops), Decision Trees (prone to overfit).
- **Decision:** Random Forest for production, MLP for research/complex cases.

### 3. Weather Hazard Model
- **Type:** Rule-based + ML (ensemble of thresholds, logistic regression)
- **Purpose:** Flags severe weather polygons (e.g., SIGMET, AIRMET) and assigns severity for map display.
- **Why:** Weather data is often categorical or threshold-based; ML can help calibrate severity and filter false positives.
- **Alternatives considered:** Deep learning (overkill for structured weather alerts), pure rules (less adaptive).
- **Decision:** Hybrid: rules for initial filter, ML for severity scoring.

### 4. Data Preprocessing & Feature Engineering
- **Tools:** scikit-learn pipelines, custom Python scripts
- **Why:** Ensures consistent feature scaling, encoding, and missing value handling for all models.

### 5. Model Serialization
- **Tools:** joblib (for scikit-learn), PyTorch `.pt`/`.ckpt` files
- **Why:** Fast, safe, and portable for production deployment.

### Datasets Used for Model Training
- **Anomaly Detection:** Historical flight tracks, ADS-B, open airspace violation datasets.
- **Classifier:** Labeled airspace events, NOTAMs, weather hazard reports.
- **Weather Models:** NWS, SIGMET, AIRMET, global weather alert datasets.
- **Sources:** FAA, ICAO, EUROCONTROL, SafeAirspace, ACLED, open weather feeds.

---

## Workflow & Flowchart

### High-Level Workflow

1. **User opens SkyGuard web app**
2. **Frontend loads map and UI**
3. **App fetches:**
   - Airspace restrictions (no-fly, warzones, etc.)
   - Live aviation data
   - Weather alerts (NWS, SIGMET, AIRMET)
4. **Backend serves data:**
   - Aggregates from APIs and local ML models
   - Runs anomaly detection/classification
   - Returns GeoJSON and alert data
5. **Frontend renders:**
   - Map layers (airspace, weather, flights)
   - Weather alert polygons (special color for severe)
   - Real-time overlays and status
6. **User toggles layers, interacts with map**
7. **Circuit breaker ensures UI stays responsive if APIs fail**
8. **UI updates in real time as new data arrives**

### Flowchart

```plaintext
+-------------------+
|   User loads app  |
+-------------------+
          |
          v
+-------------------+
|  Frontend (React) |
+-------------------+
          |
          v
+-------------------+         +-------------------+
|  Fetch airspace   |<------->|   Backend (API)   |
|  & weather data   |         | (FastAPI + ML)    |
+-------------------+         +-------------------+
          |                           |
          v                           v
+-------------------+         +-------------------+
|  Render map with  |         |  Aggregate data   |
|  deck.gl/maplibre |         |  Run ML models    |
+-------------------+         +-------------------+
          |                           |
          +-------------+-------------+
                        |
                        v
              +-------------------+
              |  User interacts   |
              |  (toggle layers,  |
              |   view alerts)    |
              +-------------------+
                        |
                        v
              +-------------------+
              |  Circuit breaker  |
              |  handles errors   |
              +-------------------+
```

---

## Project Structure

- `src/` — Frontend TypeScript/React code
- `backend/` — FastAPI Python backend, ML models
- `public/` — Static assets, map styles, images
- `models/`, `newModels/` — Trained ML model files
- `scripts/` — Data ingestion, seeding, validation scripts
- `tests/` — Unit and integration tests

---

## Getting Started

```bash
# Install dependencies
npm install

# Start frontend (Vite dev server)
npm run dev

# Start backend (Python FastAPI)
cd backend
python main.py
```

---

## Contributing

Pull requests welcome! Please add tests for new features and follow the code style.

---

If you need a diagram image or more details on any section, let me know!
