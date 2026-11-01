"""Backend tests for Emergent Auth + Reports + regression on public endpoints."""
import os
import io
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://kidney-disease-ai-1.preview.emergentagent.com"

TOKEN_A = "test_session_nephro_1"
TOKEN_B = "test_session_nephro_2"

def H(tok):
    return {"Authorization": f"Bearer {tok}"}

# ---------------- Auth ----------------
class TestAuth:
    def test_me_unauthenticated(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401
        assert "Not authenticated" in r.text or r.json().get("detail") == "Not authenticated"

    def test_me_bearer_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=H(TOKEN_A))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user_id"] == "test-user-nephro-1"
        assert data["email"] == "nephro-test@example.com"
        assert "name" in data

    def test_me_invalid_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=H("bogus_token_xyz"))
        assert r.status_code == 401


# ---------------- Reports protection ----------------
class TestReportsAuth:
    def test_list_unauth(self):
        r = requests.get(f"{BASE_URL}/api/reports")
        assert r.status_code == 401

    def test_create_unauth(self):
        r = requests.post(f"{BASE_URL}/api/reports", json={"patient_name": "x"})
        assert r.status_code == 401


# ---------------- Reports CRUD ----------------
_report_id = {"id": None}

class TestReportsCRUD:
    def test_create_report(self):
        payload = {
            "patient_name": "John Doe",
            "patient_id": "P-101",
            "notes": "Follow up in 2 weeks",
            "input": {"age": 62, "bp": 90},
            "result": {
                "prediction": "CKD",
                "probability": 0.94,
                "probability_percent": 94.0,
                "risk_level": "High",
                "model_used": "Random Forest",
            },
        }
        r = requests.post(f"{BASE_URL}/api/reports", json=payload, headers=H(TOKEN_A))
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert "report_id" in data
        assert data["user_id"] == "test-user-nephro-1"
        assert data["patient_name"] == "John Doe"
        assert data["patient_id"] == "P-101"
        assert "created_at" in data
        _report_id["id"] = data["report_id"]

    def test_list_reports(self):
        r = requests.get(f"{BASE_URL}/api/reports", headers=H(TOKEN_A))
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(x["report_id"] == _report_id["id"] for x in items)

    def test_get_report(self):
        rid = _report_id["id"]
        r = requests.get(f"{BASE_URL}/api/reports/{rid}", headers=H(TOKEN_A))
        assert r.status_code == 200
        assert r.json()["report_id"] == rid

    def test_patch_notes(self):
        rid = _report_id["id"]
        r = requests.patch(f"{BASE_URL}/api/reports/{rid}/notes", json={"notes": "Updated notes"}, headers=H(TOKEN_A))
        assert r.status_code == 200
        assert r.json().get("ok") is True
        # verify
        r2 = requests.get(f"{BASE_URL}/api/reports/{rid}", headers=H(TOKEN_A))
        assert r2.json()["notes"] == "Updated notes"

    def test_cross_user_isolation(self):
        r = requests.get(f"{BASE_URL}/api/reports", headers=H(TOKEN_B))
        assert r.status_code == 200
        items = r.json()["items"]
        assert all(x["user_id"] == "test-user-nephro-2" for x in items)
        assert not any(x["report_id"] == _report_id["id"] for x in items)

    def test_delete_report(self):
        rid = _report_id["id"]
        r = requests.delete(f"{BASE_URL}/api/reports/{rid}", headers=H(TOKEN_A))
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/reports/{rid}", headers=H(TOKEN_A))
        assert r2.status_code == 404


# ---------------- Logout ----------------
class TestLogout:
    def test_logout_clears_session(self):
        # Seed a fresh session so we don't blow up other tests
        import pymongo, datetime
        mongo = pymongo.MongoClient("mongodb://localhost:27017")
        db = mongo["test_database"]
        db.users.update_one({"user_id": "test-user-nephro-3"},
                             {"$set": {"user_id":"test-user-nephro-3","email":"n3@example.com","name":"N3"}}, upsert=True)
        db.user_sessions.delete_many({"session_token":"test_session_nephro_3"})
        db.user_sessions.insert_one({
            "user_id":"test-user-nephro-3",
            "session_token":"test_session_nephro_3",
            "expires_at": datetime.datetime.utcnow() + datetime.timedelta(days=7),
            "created_at": datetime.datetime.utcnow(),
        })
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=H("test_session_nephro_3"))
        assert r.status_code == 200
        r2 = requests.post(f"{BASE_URL}/api/auth/logout", headers=H("test_session_nephro_3"))
        assert r2.status_code == 200
        r3 = requests.get(f"{BASE_URL}/api/auth/me", headers=H("test_session_nephro_3"))
        assert r3.status_code == 401


# ---------------- Regression: public endpoints ----------------
class TestRegression:
    def test_health(self):
        r = requests.get(f"{BASE_URL}/api/health")
        assert r.status_code == 200

    def test_models_comparison(self):
        r = requests.get(f"{BASE_URL}/api/models/comparison")
        assert r.status_code == 200
        assert "results" in r.json()

    def test_eda(self):
        r = requests.get(f"{BASE_URL}/api/eda")
        assert r.status_code == 200

    def test_schema(self):
        r = requests.get(f"{BASE_URL}/api/schema")
        assert r.status_code == 200

    def test_predict(self):
        r = requests.get(f"{BASE_URL}/api/schema")
        md = r.json()
        # Build minimal features from metadata sample defaults
        feats = {}
        for k, meta in md["feature_metadata"].items():
            if "default" in meta:
                feats[k] = meta["default"]
            elif "options" in meta:
                feats[k] = meta["options"][0]
            elif "min" in meta:
                feats[k] = meta["min"]
        r2 = requests.post(f"{BASE_URL}/api/predict", json={"features": feats})
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert "prediction" in d and "probability" in d

    def test_ablation_groups(self):
        r = requests.get(f"{BASE_URL}/api/ablation/groups")
        assert r.status_code == 200

    def test_training_history(self):
        r = requests.get(f"{BASE_URL}/api/training-history")
        assert r.status_code == 200
