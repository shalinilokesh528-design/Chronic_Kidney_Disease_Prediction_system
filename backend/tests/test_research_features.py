"""Tests for new research features: ablation, cohort compare, retrain, training history."""
import os
import time
import pytest
import requests
from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


# ---------- Ablation ----------
class TestAblationGroups:
    def test_groups_list(self):
        r = requests.get(f"{API}/ablation/groups", timeout=30)
        assert r.status_code == 200
        groups = r.json()["groups"]
        expected = {"Demographics", "Vitals", "Urine Chemistry",
                    "Urinalysis", "Blood Chemistry", "Hematology", "Comorbidities"}
        assert expected.issubset(set(groups.keys()))
        assert len(groups) == 7

    def test_ablation_with_drops(self):
        r = requests.post(f"{API}/ablation",
                          json={"dropped_groups": ["Urinalysis", "Hematology"]},
                          timeout=120)
        assert r.status_code == 200
        data = r.json()
        assert set(data["results"].keys()) >= {
            "Logistic Regression", "Decision Tree", "Random Forest",
            "SVM", "XGBoost", "DNN (MLP)"}
        for name, m in data["results"].items():
            for k in ("accuracy", "recall", "f1", "roc_auc"):
                assert k in m and isinstance(m[k], (int, float))
        # dropped columns not in kept lists
        dropped_cols = set()
        # fetch groups to know cols
        groups = requests.get(f"{API}/ablation/groups").json()["groups"]
        for g in ["Urinalysis", "Hematology"]:
            dropped_cols |= set(groups[g])
        kept = set(data.get("kept_numerical", [])) | set(data.get("kept_categorical", []))
        assert not (kept & dropped_cols)

    def test_ablation_empty_drops(self):
        r = requests.post(f"{API}/ablation", json={"dropped_groups": []}, timeout=120)
        assert r.status_code == 200
        data = r.json()
        assert len(data["results"]) >= 6


# ---------- Cohort Compare ----------
class TestCohortCompare:
    def test_compare(self):
        with open("/app/cohort_a.csv", "rb") as fa, open("/app/cohort_b.csv", "rb") as fb:
            files = {"file_a": ("a.csv", fa, "text/csv"),
                     "file_b": ("b.csv", fb, "text/csv")}
            data = {"label_a": "CKD group", "label_b": "Healthy group"}
            r = requests.post(f"{API}/cohort-compare", files=files, data=data, timeout=120)
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("cohort_a", "cohort_b", "diff"):
            assert k in j
        for side in ("cohort_a", "cohort_b"):
            c = j[side]
            for f in ("n", "ckd", "non_ckd", "risk_counts", "mean_probability"):
                assert f in c
        d = j["diff"]
        for f in ("ckd_rate_a", "ckd_rate_b", "ckd_rate_delta",
                  "mean_prob_delta", "high_risk_share_a", "high_risk_share_b"):
            assert f in d


# ---------- Retrain ----------
class TestRetrain:
    def test_status_invalid_id(self):
        r = requests.get(f"{API}/retrain/status/DEADBEEF-not-a-job", timeout=30)
        assert r.status_code == 404

    def test_jobs_list(self):
        r = requests.get(f"{API}/retrain/jobs", timeout=30)
        assert r.status_code == 200
        assert "jobs" in r.json()

    def test_start_and_status(self):
        r = requests.post(f"{API}/retrain/start", timeout=30)
        assert r.status_code == 200
        job_id = r.json()["job_id"]
        assert isinstance(job_id, str) and len(job_id) >= 8

        # immediate status
        s = requests.get(f"{API}/retrain/status/{job_id}", timeout=30).json()
        assert s["status"] in ("running", "success")
        assert isinstance(s.get("logs", []), list)

        # poll up to 150s
        deadline = time.time() + 150
        final = s
        while time.time() < deadline:
            final = requests.get(f"{API}/retrain/status/{job_id}", timeout=30).json()
            if final["status"] != "running":
                break
            time.sleep(3)
        assert final["status"] == "success", f"Retrain didn't succeed: {final}"
        assert final.get("best_model")


# ---------- Training History ----------
class TestTrainingHistory:
    def test_history(self):
        r = requests.get(f"{API}/training-history", timeout=30)
        assert r.status_code == 200
        runs = r.json()["runs"]
        assert isinstance(runs, list) and len(runs) >= 1
        run = runs[-1]
        for k in ("run_id", "timestamp", "dataset_hash", "best_model", "metrics"):
            assert k in run, f"missing {k}"
        assert len(run["dataset_hash"]) >= 16
        # rows may not equal 400 exactly; assert existence
        assert "dataset_rows" in run
