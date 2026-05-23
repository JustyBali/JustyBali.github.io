import os
import datetime
import sqlite3
from typing import Optional, List
from fastapi import FastAPI, Header, HTTPException, Depends, status
from pydantic import BaseModel

app = FastAPI(title="Juru Client API", version="1.0.0")

# Helper to read api_key from config.yaml
def read_api_key(client_id: str) -> Optional[str]:
    config_path = os.path.join("clients", client_id, "config.yaml")
    if not os.path.exists(config_path):
        return None
    try:
        with open(config_path, "r") as f:
            for line in f:
                line = line.strip()
                if line.startswith("api_key:"):
                    parts = line.split(":", 1)
                    if len(parts) > 1:
                        val = parts[1].strip()
                        # Strip single/double quotes
                        if val.startswith("'") and val.endswith("'"):
                            val = val[1:-1]
                        elif val.startswith('"') and val.endswith('"'):
                            val = val[1:-1]
                        return val
    except Exception as e:
        print(f"Error reading config.yaml for key: {e}")
    return None

# Helper to update config.yaml
def update_config_file(client_id: str, confidence_threshold: float, working_hours: str):
    config_path = os.path.join("clients", client_id, "config.yaml")
    if not os.path.exists(config_path):
        raise FileNotFoundError("config.yaml not found for this client")
    
    lines = []
    with open(config_path, "r") as f:
        lines = f.readlines()
        
    updated_conf = False
    updated_hours = False
    
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("confidence_threshold:"):
            lines[i] = f"confidence_threshold: {confidence_threshold}\n"
            updated_conf = True
        elif stripped.startswith("working_hours:"):
            lines[i] = f"working_hours: '{working_hours}'\n"
            updated_hours = True
            
    if not updated_conf:
        lines.append(f"confidence_threshold: {confidence_threshold}\n")
    if not updated_hours:
        lines.append(f"working_hours: '{working_hours}'\n")
        
    with open(config_path, "w") as f:
        f.writelines(lines)

# DB Connection helper
def get_db_connection(client_id: str):
    db_path = os.path.join("clients", client_id, "juru.db")
    # Ensure client directory exists
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

# Authentication Dependency
def verify_api_key(client_id: str, x_api_key: Optional[str] = Header(None)):
    api_key = read_api_key(client_id)
    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="API Key not configured for this client."
        )
    if x_api_key != api_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Invalid API Key."
        )

# Pydantic Schemas
class FaqSchema(BaseModel):
    question: str
    answer: str

class ConfigSchema(BaseModel):
    confidence_threshold: float
    working_hours: str

# HEALTH ENDPOINT (No Auth)
@app.get("/health")
def health():
    return {
        "status": "ok",
        "timestamp": datetime.datetime.utcnow().isoformat()
    }

# GET ALL FAQS
@app.get("/clients/{client_id}/faqs", dependencies=[Depends(verify_api_key)])
def get_faqs(client_id: str):
    try:
        conn = get_db_connection(client_id)
        # Ensure faqs table exists with same schema as Node
        conn.execute("""
          CREATE TABLE IF NOT EXISTS faqs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        """)
        cursor = conn.cursor()
        cursor.execute("SELECT id, question, answer FROM faqs WHERE client_id = ?", (client_id,))
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# CREATE FAQ
@app.post("/clients/{client_id}/faqs", dependencies=[Depends(verify_api_key)])
def create_faq(client_id: str, faq: FaqSchema):
    try:
        conn = get_db_connection(client_id)
        conn.execute("""
          CREATE TABLE IF NOT EXISTS faqs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        """)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO faqs (client_id, question, answer) VALUES (?, ?, ?)",
            (client_id, faq.question, faq.answer)
        )
        conn.commit()
        faq_id = cursor.lastrowid
        conn.close()
        return {
            "id": faq_id,
            "question": faq.question,
            "answer": faq.answer
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# UPDATE FAQ
@app.put("/clients/{client_id}/faqs/{faq_id}", dependencies=[Depends(verify_api_key)])
def update_faq(client_id: str, faq_id: int, faq: FaqSchema):
    try:
        conn = get_db_connection(client_id)
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE faqs SET question = ?, answer = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND client_id = ?",
            (faq.question, faq.answer, faq_id, client_id)
        )
        conn.commit()
        conn.close()
        return {
            "id": faq_id,
            "question": faq.question,
            "answer": faq.answer
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# DELETE FAQ
@app.delete("/clients/{client_id}/faqs/{faq_id}", dependencies=[Depends(verify_api_key)])
def delete_faq(client_id: str, faq_id: int):
    try:
        conn = get_db_connection(client_id)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM faqs WHERE id = ? AND client_id = ?", (faq_id, client_id))
        conn.commit()
        conn.close()
        return {"deleted": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# GET CONVERSATIONS (Last 50)
@app.get("/clients/{client_id}/conversations", dependencies=[Depends(verify_api_key)])
def get_conversations(client_id: str):
    try:
        conn = get_db_connection(client_id)
        conn.execute("""
          CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT NOT NULL,
            customer_jid TEXT NOT NULL,
            customer_message TEXT,
            ai_response TEXT,
            confidence REAL,
            escalated INTEGER DEFAULT 0,
            language TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        """)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM conversations WHERE client_id = ? ORDER BY created_at DESC LIMIT 50",
            (client_id,)
        )
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# GET STATS
@app.get("/clients/{client_id}/stats", dependencies=[Depends(verify_api_key)])
def get_stats(client_id: str):
    try:
        conn = get_db_connection(client_id)
        
        # Ensure tables exist
        conn.execute("""
          CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT NOT NULL,
            customer_jid TEXT NOT NULL,
            customer_message TEXT,
            ai_response TEXT,
            confidence REAL,
            escalated INTEGER DEFAULT 0,
            language TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        """)
        conn.execute("CREATE TABLE IF NOT EXISTS faqs (id INTEGER PRIMARY KEY AUTOINCREMENT, question TEXT UNIQUE, answer TEXT)")
        
        cursor = conn.cursor()
        
        # Count today's conversations
        cursor.execute(
            "SELECT COUNT(*) FROM conversations WHERE client_id = ? AND date(created_at) = date('now')",
            (client_id,)
        )
        today_volume = cursor.fetchone()[0]
        
        # Count total and escalated for escalation rate calculation
        cursor.execute(
            "SELECT COUNT(*) FROM conversations WHERE client_id = ?",
            (client_id,)
        )
        total = cursor.fetchone()[0]
        
        cursor.execute(
            "SELECT COUNT(*) FROM conversations WHERE client_id = ? AND escalated = 1",
            (client_id,)
        )
        escalated = cursor.fetchone()[0]
        
        escalation_rate = float(escalated) / total if total > 0 else 0.0
        
        # Fetch top FAQs
        cursor.execute("SELECT question FROM faqs LIMIT 5")
        top_faqs = [r["question"] for r in cursor.fetchall()]
        
        conn.close()
        return {
            "today_volume": today_volume,
            "escalation_rate": escalation_rate,
            "top_faqs": top_faqs
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# UPDATE CONFIG
@app.post("/clients/{client_id}/config", dependencies=[Depends(verify_api_key)])
def update_config(client_id: str, payload: ConfigSchema):
    try:
        update_config_file(client_id, payload.confidence_threshold, payload.working_hours)
        return {"updated": True}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
