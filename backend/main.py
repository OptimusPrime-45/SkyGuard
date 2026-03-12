import os
import math
import joblib
import pandas as pd
import requests
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv

# --- 1. INITIALIZATION ---
load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

app = FastAPI(title="SkyGuard AI - Airspace Intelligence Engine")

# Enable CORS for Frontend Integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 2. SECURITY CONSTANTS (No-Fly Zone) ---
# Example: Parliament House, New Delhi
RESTRICTED_LAT = 28.6172
RESTRICTED_LON = 77.2081
RESTRICTED_RADIUS_NM = 3.0 

# --- 3. LOAD ML MODELS ---
print(" Initializing SkyGuard AI Models...")
try:
    scaler = joblib.load('models/scaler.joblib')
    classifier = joblib.load('models/classifier.joblib')
    anomaly_detector = joblib.load('models/anomaly_detector.joblib')
    print("✅ All Models Loaded (XGBoost + Isolation Forest)")
except Exception as e:
    print(f"❌ Model Load Error: {e}")

# --- 4. PHYSICS & RISK UTILITIES ---

def get_distance_nm(lat1, lon1, lat2, lon2):
    """Haversine formula for distance in Nautical Miles."""
    R = 3440.065 
    dlat, dlon = math.radians(lat2-lat1), math.radians(lon2-lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return 2 * R * math.asin(math.sqrt(a))

def get_trajectory(lat, lon, speed, heading, mins=3):
    """Kinematic Trajectory Prediction (Dead Reckoning)."""
    R = 3440.065
    points = []
    lat_r, lon_r, hdg_r = math.radians(lat), math.radians(lon), math.radians(heading)
    for m in range(1, mins + 1):
        dist = speed * (m / 60.0)
        ang_dist = dist / R
        f_lat = math.asin(math.sin(lat_r)*math.cos(ang_dist) + math.cos(lat_r)*math.sin(ang_dist)*math.cos(hdg_r))
        f_lon = lon_r + math.atan2(math.sin(hdg_r)*math.sin(ang_dist)*math.cos(lat_r), math.cos(ang_dist)-math.sin(lat_r)*math.sin(f_lat))
        points.append({"min": m, "lat": round(math.degrees(f_lat), 6), "lon": round(math.degrees(f_lon), 6)})
    return points

def get_risk_score(alt, speed, dist, is_anom, is_drone):
    """Evaluates threat level (0-100)."""
    score = 10
    if dist < RESTRICTED_RADIUS_NM: score += 50
    elif dist < RESTRICTED_RADIUS_NM * 2: score += 25
    if is_anom: score += 20
    if is_drone and alt < 1500: score += 20
    return min(100, score)

# --- 5. DATA MODELS ---
class CopilotRequest(BaseModel):
    callsign: str
    classification: str
    risk_score: int
    alt: float
    speed: float
    dist_nm: float

# --- 6. API ENDPOINTS ---

@app.get("/api/radar/stream")
async def get_radar(demo: bool = False):
    """The main data firehose for the frontend."""
    url = "https://opensky-network.org/api/states/all?lamin=5.0&lomin=65.0&lamax=38.0&lomax=98.0"
    processed = []
    
    # 1. Guaranteed Demo Injection
    if demo:
        # Rogue Drone Example
        processed.append({
            "flight_id": "d-drone", "callsign": "ROGUE_DRONE",
            "lat": RESTRICTED_LAT + 0.02, "lon": RESTRICTED_LON + 0.02,
            "alt": 450.0, "speed": 32.0, "hdg": 220.0,
            "class": "Drone", "is_anomaly": True, "risk": 98,
            "dist_nm": 1.2, "path": get_trajectory(RESTRICTED_LAT+0.02, RESTRICTED_LON+0.02, 32, 220)
        })
        # Emergency Plunge Example
        processed.append({
            "flight_id": "d-emg", "callsign": "EMG_PLUNGE",
            "lat": 19.076, "lon": 72.877,
            "alt": 12000.0, "speed": 430.0, "hdg": 180.0,
            "class": "Commercial Plane", "is_anomaly": True, "risk": 82,
            "dist_nm": 650.0, "path": get_trajectory(19.076, 72.877, 430, 180)
        })

    # 2. Real-time Data Processing
    try:
        resp = requests.get(url, timeout=5)
        states = resp.json().get('states', []) if resp.status_code == 200 else []
        for s in states:
            if None in [s[5], s[6], s[7], s[9], s[11]]: continue
            
            # Physics match training units (ft, knots, fpm)
            phys = {'altitude': s[7]*3.28, 'velocity': s[9]*1.94, 'heading': s[10] or 0.0, 'vertical_rate': s[11]*196.8}
            
            # AI Inference
            features = pd.DataFrame([phys])
            scaled = scaler.transform(features)
            cls_name = ["Commercial Plane", "Drone", "Bird"][classifier.predict(scaled)[0]]
            is_anom = bool(anomaly_detector.predict(scaled)[0] == -1 or cls_name != "Commercial Plane")
            
            # Scoring & Trajectory
            d_nm = get_distance_nm(s[6], s[5], RESTRICTED_LAT, RESTRICTED_LON)
            risk = get_risk_score(phys['altitude'], phys['velocity'], d_nm, is_anom, cls_name == "Drone")
            
            processed.append({
                "flight_id": s[0], "callsign": s[1].strip() or "UKNOWN",
                "lat": s[6], "lon": s[5], "alt": round(phys['altitude'], 1),
                "speed": round(phys['velocity'], 1), "hdg": round(phys['heading'], 1),
                "class": cls_name, "is_anomaly": is_anom, "risk": risk, "dist_nm": round(d_nm, 2),
                "path": get_trajectory(s[6], s[5], phys['velocity'], phys['heading'])
            })
    except Exception as e:
        print(f"⚠️ OpenSky API error: {e}")

    # 3. Fallback: inject demo flights if real API returned nothing
    if len(processed) == 0 or demo:
        if not demo:  # Only add these when we haven't already injected demo data
            processed.extend([
                {"flight_id": "d-drone", "callsign": "ROGUE_DRONE",
                 "lat": RESTRICTED_LAT + 0.02, "lon": RESTRICTED_LON + 0.02,
                 "alt": 450.0, "speed": 32.0, "hdg": 220.0,
                 "class": "Drone", "is_anomaly": True, "risk": 98,
                 "dist_nm": 1.2, "path": get_trajectory(RESTRICTED_LAT+0.02, RESTRICTED_LON+0.02, 32, 220)},
                {"flight_id": "d-emg", "callsign": "EMG_PLUNGE",
                 "lat": 19.076, "lon": 72.877,
                 "alt": 12000.0, "speed": 430.0, "hdg": 180.0,
                 "class": "Commercial Plane", "is_anomaly": True, "risk": 82,
                 "dist_nm": 650.0, "path": get_trajectory(19.076, 72.877, 430, 180)},
            ])
        # Additional simulated flights for rich visualization
        import random, time
        random.seed(int(time.time()) // 30)  # Changes every 30s for animation
        sim_flights = [
            {"callsign": "AI6732", "lat": 28.55, "lon": 77.10, "alt": 35000, "speed": 480, "hdg": 45, "cls": "Commercial Plane"},
            {"callsign": "SG401",  "lat": 12.97, "lon": 77.59, "alt": 28000, "speed": 420, "hdg": 320, "cls": "Commercial Plane"},
            {"callsign": "UK819",  "lat": 22.31, "lon": 73.17, "alt": 32000, "speed": 460, "hdg": 190, "cls": "Commercial Plane"},
            {"callsign": "IX512",  "lat": 13.20, "lon": 80.17, "alt": 15000, "speed": 350, "hdg": 270, "cls": "Commercial Plane"},
            {"callsign": "UAV_X1", "lat": 28.60, "lon": 77.25, "alt": 800, "speed": 45, "hdg": 135, "cls": "Drone"},
            {"callsign": "BIRD_01","lat": 26.85, "lon": 75.80, "alt": 200, "speed": 18, "hdg": 90, "cls": "Bird"},
            {"callsign": "QR571",  "lat": 25.26, "lon": 55.30, "alt": 38000, "speed": 510, "hdg": 85, "cls": "Commercial Plane"},
            {"callsign": "EK408",  "lat": 15.38, "lon": 73.88, "alt": 29000, "speed": 440, "hdg": 340, "cls": "Commercial Plane"},
        ]
        for i, sf in enumerate(sim_flights):
            jlat = sf["lat"] + random.uniform(-0.05, 0.05)
            jlon = sf["lon"] + random.uniform(-0.05, 0.05)
            d_nm = get_distance_nm(jlat, jlon, RESTRICTED_LAT, RESTRICTED_LON)
            is_drone = sf["cls"] == "Drone"
            is_anom = is_drone or sf["cls"] == "Bird"
            risk = get_risk_score(sf["alt"], sf["speed"], d_nm, is_anom, is_drone)
            processed.append({
                "flight_id": f"sim-{i}", "callsign": sf["callsign"],
                "lat": round(jlat, 6), "lon": round(jlon, 6),
                "alt": float(sf["alt"]), "speed": float(sf["speed"]), "hdg": float(sf["hdg"]),
                "class": sf["cls"], "is_anomaly": is_anom, "risk": risk, "dist_nm": round(d_nm, 2),
                "path": get_trajectory(jlat, jlon, sf["speed"], sf["hdg"])
            })

    return {
        "tracked": len(processed),
        "alerts": sum(1 for f in processed if f["risk"] > 75),
        "flights": processed
    }

@app.get("/api/radar/stats")
async def get_radar_stats():
    """Aggregated stats for the frontend stats bar."""
    radar = await get_radar(demo=False)
    flights = radar["flights"]
    class_counts = {}
    total_risk = 0
    anomaly_count = 0
    for f in flights:
        cls = f.get("class", "Unknown")
        class_counts[cls] = class_counts.get(cls, 0) + 1
        total_risk += f.get("risk", 0)
        if f.get("is_anomaly"):
            anomaly_count += 1
    avg_risk = round(total_risk / len(flights), 1) if flights else 0
    return {
        "tracked": len(flights),
        "alerts": radar["alerts"],
        "anomalies": anomaly_count,
        "avg_risk": avg_risk,
        "class_counts": class_counts,
    }

@app.post("/api/agent/copilot")
async def agent_copilot(data: CopilotRequest):
    """Agentic AI utilizing Llama 3 via Groq."""
    if not client: return {"report": "Intelligence Agent Offline."}
    
    prompt = f"""
    [ROLE] Lead Airspace Security AI
    [DATA] Callsign: {data.callsign}, Type: {data.classification}, Threat Score: {data.risk_score}/100, Dist: {data.dist_nm}NM.
    [METRICS] Alt: {data.alt}ft, Speed: {data.speed}kts.
    [TASK] Provide a 2-sentence tactical summary and a specific counter-measure recommendation.
    """
    try:
        chat = client.chat.completions.create(messages=[{"role": "user", "content": prompt}], model="llama-3.1-8b-instant", temperature=0.1)
        return {"report": chat.choices[0].message.content.strip()}
    except:
        return {"report": "Error connecting to Agentic Brain."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)