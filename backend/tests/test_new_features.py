"""Backend tests for CKD new features: SHAP, batch predict, batch download."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://kidney-disease-ai-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Sample CKD-ish feature payload
CKD_FEATURES = {
    "age": 48.0, "bp": 80.0, "sg": 1.02, "al": 1.0, "su": 0.0,
    "rbc": "normal", "pc": "normal", "pcc": "notpresent", "ba": "notpresent",
    "bgr": 121.0, "bu": 36.0, "sc": 1.2, "sod": 137.0, "pot": 4.5,
    "hemo": 15.4, "pcv": 44.0, "wc": 7800.0, "rc": 5.2,
    "htn": "yes", "dm": "yes", "cad": "no", "appet": "good", "pe": "no", "ane": "no",
}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


def test_health(s):
    r = s.get(f"{API}/health")
    assert r.status_code == 200
    assert r.json().get("model_loaded") is True


def test_shap_default_model(s):
    r = s.post(f"{API}/explain/shap", json={"features": CKD_FEATURES})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "model_used" in data
    assert "base_value" in data
    assert isinstance(data["items"], list)
    assert len(data["items"]) == 12, f"expected 12 items, got {len(data['items'])}"
    for it in data["items"]:
        assert "feature" in it and "value" in it and "shap" in it


def test_shap_svm_fallback(s):
    r = s.post(f"{API}/explain/shap", json={"features": CKD_FEATURES, "model": "SVM"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("used_fallback") is True
    assert data.get("model_used") == "Random Forest"


def test_batch_predict(s):
    with open("/app/test_batch.csv", "rb") as f:
        r = s.post(f"{API}/batch-predict", files={"file": ("test_batch.csv", f, "text/csv")})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["n"] >= 1
    assert "ckd" in data and "non_ckd" in data
    assert set(data["risk_counts"].keys()) == {"High", "Medium", "Low"}
    assert "model_used" in data
    assert len(data["rows"]) == data["n"]
    row = data["rows"][0]
    for k in ("ckd_probability", "ckd_probability_percent", "prediction", "risk_level"):
        assert k in row, f"missing {k} in row"


def test_batch_predict_download(s):
    with open("/app/test_batch.csv", "rb") as f:
        r = s.post(f"{API}/batch-predict/download", files={"file": ("test_batch.csv", f, "text/csv")})
    assert r.status_code == 200, r.text
    assert "text/csv" in r.headers.get("content-type", "")
    assert "ckd_predictions.csv" in r.headers.get("content-disposition", "")
    assert "ckd_probability" in r.text
