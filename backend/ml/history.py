"""Training run history + async retrain manager."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parent.parent
HISTORY_FILE = BACKEND_DIR / "artifacts" / "metadata" / "training_history.json"
DATA_PATH = BACKEND_DIR / "data" / "raw" / "ckd.csv"


def _load_history() -> list[dict]:
    if HISTORY_FILE.exists():
        try:
            return json.loads(HISTORY_FILE.read_text())
        except Exception:  # noqa
            return []
    return []


def _save_history(rows: list[dict]) -> None:
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    HISTORY_FILE.write_text(json.dumps(rows, indent=2, default=str))


def _dataset_hash() -> str:
    if not DATA_PATH.exists():
        return ""
    h = hashlib.sha256()
    with open(DATA_PATH, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def record_run(metadata: dict[str, Any]) -> None:
    rows = _load_history()
    rows.append({
        "run_id": uuid.uuid4().hex[:12],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "dataset_hash": _dataset_hash(),
        "dataset_rows": metadata.get("dataset", {}).get("rows"),
        "best_model": metadata.get("best_model"),
        "metrics": {k: {"accuracy": v.get("accuracy"),
                        "roc_auc": v.get("roc_auc"),
                        "f1": v.get("f1"),
                        "recall": v.get("recall")}
                    for k, v in metadata.get("results", {}).items()},
    })
    _save_history(rows[-50:])


def list_history() -> list[dict]:
    return _load_history()


# --------- Async retrain manager ---------
_JOBS: dict[str, dict] = {}


def start_retrain() -> str:
    job_id = uuid.uuid4().hex[:12]
    _JOBS[job_id] = {
        "job_id": job_id,
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "ended_at": None,
        "logs": ["[start] Kicking off training pipeline…"],
        "best_model": None,
        "error": None,
    }
    t = threading.Thread(target=_run_job, args=(job_id,), daemon=True)
    t.start()
    return job_id


def _run_job(job_id: str) -> None:
    job = _JOBS[job_id]
    try:
        job["logs"].append("[data] Loading UCI CKD dataset from data/raw/ckd.csv")
        proc = subprocess.Popen(
            [sys.executable, "-u", "-m", "ml.pipeline"],
            cwd=str(BACKEND_DIR),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
        )
        for line in proc.stdout:  # type: ignore
            job["logs"].append(line.rstrip())
        proc.wait(timeout=300)
        if proc.returncode != 0:
            raise RuntimeError(f"pipeline exited with code {proc.returncode}")

        # Reload metadata to capture best model
        meta_path = BACKEND_DIR / "artifacts" / "metadata" / "model_metadata.json"
        if meta_path.exists():
            meta = json.loads(meta_path.read_text())
            job["best_model"] = meta.get("best_model")
            record_run(meta)
            job["logs"].append(f"[history] Recorded run · best={meta.get('best_model')}")
        job["status"] = "success"
    except Exception as e:  # noqa
        job["status"] = "failed"
        job["error"] = str(e)
        job["logs"].append(f"[error] {e}")
    finally:
        job["ended_at"] = datetime.now(timezone.utc).isoformat()
        # Reset the cached predictor so the API picks up new artifacts
        try:
            import ml.predict as mp
            mp._predictor = None
        except Exception:  # noqa
            pass


def job_status(job_id: str) -> dict | None:
    return _JOBS.get(job_id)


def list_jobs() -> list[dict]:
    return list(_JOBS.values())
