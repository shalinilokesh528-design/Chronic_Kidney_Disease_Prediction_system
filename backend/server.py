"""FastAPI server for CKD Prediction Platform."""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from auth import router as auth_router, reports_router

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="CKD Prediction API")
api_router = APIRouter(prefix="/api")

# --------- Lazy-load predictor (artifacts must be trained beforehand) ---------
_predictor = None
_predictor_error: str | None = None


def _load_predictor():
    global _predictor, _predictor_error
    if _predictor is not None:
        return _predictor
    try:
        from ml.predict import get_predictor
        _predictor = get_predictor()
        _predictor_error = None
    except Exception as e:  # noqa
        _predictor_error = str(e)
        _predictor = None
    return _predictor


# --------- Schemas ---------
class PredictRequest(BaseModel):
    features: dict[str, Any] = Field(default_factory=dict)
    model: str | None = None


class PredictionRecord(BaseModel):
    id: str
    created_at: str
    model_used: str
    prediction: str
    probability: float
    risk_level: str


# --------- Routes ---------
@api_router.get("/")
async def root():
    return {"service": "CKD Prediction API", "status": "ok"}


@api_router.get("/health")
async def health():
    p = _load_predictor()
    return {
        "status": "ok" if p is not None else "degraded",
        "model_loaded": p is not None,
        "error": _predictor_error,
    }


@api_router.get("/schema")
async def get_schema():
    """Return the feature schema for dynamic form generation."""
    p = _load_predictor()
    if p is None:
        raise HTTPException(500, f"Predictor not loaded: {_predictor_error}")
    md = p.metadata
    return {
        "numerical_features": md["numerical_features"],
        "categorical_features": md["categorical_features"],
        "feature_metadata": md["feature_metadata"],
        "best_model": md["best_model"],
        "available_models": list(p.models.keys()),
    }


@api_router.get("/models/comparison")
async def models_comparison():
    p = _load_predictor()
    if p is None:
        raise HTTPException(500, f"Predictor not loaded: {_predictor_error}")
    md = p.metadata
    return {
        "results": md["results"],
        "roc_curves": md["roc_curves"],
        "best_model": md["best_model"],
        "feature_importance": md["feature_importance"],
        "trained_at": md["trained_at"],
        "dataset": md["dataset"],
    }


@api_router.get("/eda")
async def eda_summary():
    p = _load_predictor()
    if p is None:
        raise HTTPException(500, f"Predictor not loaded: {_predictor_error}")
    return p.metadata["eda"]


@api_router.post("/predict")
async def predict(req: PredictRequest):
    p = _load_predictor()
    if p is None:
        raise HTTPException(500, f"Predictor not loaded: {_predictor_error}")
    try:
        result = p.predict(req.features, model_name=req.model)
    except Exception as e:  # noqa
        raise HTTPException(400, f"Prediction failed: {e}") from e

    # Persist non-PHI summary
    import uuid
    record = {
        "id": str(uuid.uuid4()),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "model_used": result["model_used"],
        "prediction": result["prediction"],
        "probability": result["probability"],
        "risk_level": result["risk_level"],
    }
    await db.predictions.insert_one(record)
    result["record_id"] = record["id"]
    return result


@api_router.get("/predictions/history")
async def predictions_history(limit: int = 25):
    rows = await db.predictions.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"items": rows}


class ShapRequest(BaseModel):
    features: dict[str, Any] = Field(default_factory=dict)
    model: str | None = None


@api_router.post("/explain/shap")
async def explain_shap(req: ShapRequest):
    p = _load_predictor()
    if p is None:
        raise HTTPException(500, f"Predictor not loaded: {_predictor_error}")
    try:
        return p.shap_values(req.features, model_name=req.model)
    except Exception as e:  # noqa
        raise HTTPException(400, f"SHAP failed: {e}") from e


@api_router.post("/batch-predict")
async def batch_predict(file: UploadFile = File(...), model: str | None = Form(None)):
    p = _load_predictor()
    if p is None:
        raise HTTPException(500, f"Predictor not loaded: {_predictor_error}")
    import io
    import pandas as pd
    try:
        raw = await file.read()
        df = pd.read_csv(io.BytesIO(raw))
    except Exception as e:  # noqa
        raise HTTPException(400, f"Could not parse CSV: {e}") from e
    try:
        scored = p.predict_batch(df, model_name=model)
    except Exception as e:  # noqa
        raise HTTPException(400, f"Batch prediction failed: {e}") from e

    import math
    def _clean(rec):
        return {k: (None if isinstance(v, float) and (math.isnan(v) or math.isinf(v)) else v)
                for k, v in rec.items()}
    rows = [_clean(r) for r in scored.head(500).to_dict(orient="records")]
    summary = {
        "n": int(len(scored)),
        "ckd": int((scored["prediction"] == "CKD").sum()),
        "non_ckd": int((scored["prediction"] == "Non-CKD").sum()),
        "risk_counts": {
            "High": int((scored["risk_level"] == "High").sum()),
            "Medium": int((scored["risk_level"] == "Medium").sum()),
            "Low": int((scored["risk_level"] == "Low").sum()),
        },
        "model_used": model or p.best_name,
        "rows": rows,
    }
    return summary


@api_router.post("/batch-predict/download")
async def batch_predict_download(file: UploadFile = File(...), model: str | None = Form(None)):
    p = _load_predictor()
    if p is None:
        raise HTTPException(500, f"Predictor not loaded: {_predictor_error}")
    import io
    import pandas as pd
    raw = await file.read()
    df = pd.read_csv(io.BytesIO(raw))
    scored = p.predict_batch(df, model_name=model)
    buf = io.StringIO()
    scored.to_csv(buf, index=False)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=ckd_predictions.csv"},
    )


@api_router.post("/cohort-compare")
async def cohort_compare(
    file_a: UploadFile = File(...),
    file_b: UploadFile = File(...),
    label_a: str = Form("Cohort A"),
    label_b: str = Form("Cohort B"),
    model: str | None = Form(None),
):
    p = _load_predictor()
    if p is None:
        raise HTTPException(500, f"Predictor not loaded: {_predictor_error}")
    import io, math
    import pandas as pd

    def _summarize(f: UploadFile, label: str):
        raw = f.file.read()
        df = pd.read_csv(io.BytesIO(raw))
        scored = p.predict_batch(df, model_name=model)
        return {
            "label": label,
            "n": int(len(scored)),
            "ckd": int((scored["prediction"] == "CKD").sum()),
            "non_ckd": int((scored["prediction"] == "Non-CKD").sum()),
            "risk_counts": {
                "High":   int((scored["risk_level"] == "High").sum()),
                "Medium": int((scored["risk_level"] == "Medium").sum()),
                "Low":    int((scored["risk_level"] == "Low").sum()),
            },
            "mean_probability": float(scored["ckd_probability"].mean()),
            "median_probability": float(scored["ckd_probability"].median()),
        }

    try:
        a = _summarize(file_a, label_a)
        b = _summarize(file_b, label_b)
    except Exception as e:  # noqa
        raise HTTPException(400, f"Compare failed: {e}") from e

    def _rate(c, key):
        return c[key] / c["n"] if c["n"] else 0.0

    diff = {
        "ckd_rate_a": _rate(a, "ckd"),
        "ckd_rate_b": _rate(b, "ckd"),
        "ckd_rate_delta": _rate(b, "ckd") - _rate(a, "ckd"),
        "mean_prob_delta": b["mean_probability"] - a["mean_probability"],
        "high_risk_share_a": a["risk_counts"]["High"] / a["n"] if a["n"] else 0.0,
        "high_risk_share_b": b["risk_counts"]["High"] / b["n"] if b["n"] else 0.0,
    }
    return {"cohort_a": a, "cohort_b": b, "diff": diff,
            "model_used": model or p.best_name}


class AblationRequest(BaseModel):
    dropped_groups: list[str] = Field(default_factory=list)


@api_router.post("/ablation")
async def ablation(req: AblationRequest):
    try:
        from ml.ablation import run_ablation
        return run_ablation(req.dropped_groups)
    except Exception as e:  # noqa
        raise HTTPException(400, f"Ablation failed: {e}") from e


@api_router.get("/ablation/groups")
async def ablation_groups():
    from ml.ablation import FEATURE_GROUPS
    return {"groups": FEATURE_GROUPS}


@api_router.post("/retrain/start")
async def retrain_start():
    from ml.history import start_retrain
    return {"job_id": start_retrain()}


@api_router.get("/retrain/status/{job_id}")
async def retrain_status(job_id: str):
    from ml.history import job_status
    j = job_status(job_id)
    if j is None:
        raise HTTPException(404, "Job not found")
    return j


@api_router.get("/retrain/jobs")
async def retrain_jobs():
    from ml.history import list_jobs
    return {"jobs": list_jobs()}


@api_router.get("/training-history")
async def training_history():
    from ml.history import list_history
    return {"runs": list_history()}


app.include_router(api_router)
app.include_router(auth_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.state.db = db

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def _startup():
    _load_predictor()
    logger.info("Startup: predictor loaded=%s error=%s", _predictor is not None, _predictor_error)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
