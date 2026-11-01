"""Emergent Google Auth helpers + reports storage endpoints."""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Cookie, Header, HTTPException, Request, Response
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

router = APIRouter(prefix="/auth")

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


class SessionRequest(BaseModel):
    session_id: str


class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: str | None = None


async def _get_session_token(session_token_cookie: str | None,
                             authorization: str | None) -> str | None:
    if session_token_cookie:
        return session_token_cookie
    if authorization and authorization.startswith("Bearer "):
        return authorization.split(" ", 1)[1]
    return None


async def get_current_user(
    request: Request,
    session_token: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    """FastAPI dependency: return the authenticated user dict or raise 401."""
    db: AsyncIOMotorDatabase = request.app.state.db
    tok = await _get_session_token(session_token, authorization)
    if not tok:
        raise HTTPException(401, "Not authenticated")

    sess = await db.user_sessions.find_one({"session_token": tok}, {"_id": 0})
    if not sess:
        raise HTTPException(401, "Invalid session")

    exp = sess["expires_at"]
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(401, "Session expired")

    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


def _cookie_kwargs():
    return dict(
        httponly=True, secure=True, samesite="none", path="/",
        max_age=7 * 24 * 60 * 60,
    )


@router.post("/session")
async def create_session(payload: SessionRequest, request: Request, response: Response):
    """Exchange an Emergent session_id for a persistent session_token."""
    db: AsyncIOMotorDatabase = request.app.state.db
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": payload.session_id})
        if r.status_code != 200:
            raise HTTPException(401, f"Emergent session lookup failed: {r.status_code}")
        data = r.json()

    email: str = data["email"]
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {
            "name": data.get("name", existing.get("name", "")),
            "picture": data.get("picture", existing.get("picture")),
            "last_login": datetime.now(timezone.utc),
        }})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name", ""),
            "picture": data.get("picture"),
            "created_at": datetime.now(timezone.utc),
            "last_login": datetime.now(timezone.utc),
        })

    session_token = data["session_token"]
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc),
    })
    response.set_cookie("session_token", session_token, **_cookie_kwargs())
    return {
        "user_id": user_id,
        "email": email,
        "name": data.get("name", ""),
        "picture": data.get("picture"),
    }


@router.get("/me")
async def me(request: Request,
             session_token: str | None = Cookie(default=None),
             authorization: str | None = Header(default=None)):
    user = await get_current_user(request, session_token, authorization)
    return UserOut(**user)


@router.post("/logout")
async def logout(request: Request, response: Response,
                 session_token: str | None = Cookie(default=None),
                 authorization: str | None = Header(default=None)):
    db: AsyncIOMotorDatabase = request.app.state.db
    tok = await _get_session_token(session_token, authorization)
    if tok:
        await db.user_sessions.delete_many({"session_token": tok})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ============ Reports ============

reports_router = APIRouter(prefix="/reports")


class ReportIn(BaseModel):
    patient_name: str | None = None
    patient_id: str | None = None
    notes: str | None = None
    input: dict[str, Any] = Field(default_factory=dict)
    result: dict[str, Any] = Field(default_factory=dict)
    shap: dict[str, Any] | None = None


class NotesUpdate(BaseModel):
    notes: str


@reports_router.get("")
async def list_reports(request: Request,
                       session_token: str | None = Cookie(default=None),
                       authorization: str | None = Header(default=None)):
    user = await get_current_user(request, session_token, authorization)
    db: AsyncIOMotorDatabase = request.app.state.db
    rows = await db.reports.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"items": rows}


@reports_router.post("")
async def create_report(payload: ReportIn, request: Request,
                        session_token: str | None = Cookie(default=None),
                        authorization: str | None = Header(default=None)):
    user = await get_current_user(request, session_token, authorization)
    db: AsyncIOMotorDatabase = request.app.state.db
    doc = {
        "report_id": f"rep_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "patient_name": payload.patient_name,
        "patient_id": payload.patient_id,
        "notes": payload.notes,
        "input": payload.input,
        "result": payload.result,
        "shap": payload.shap,
        "created_at": datetime.now(timezone.utc),
    }
    await db.reports.insert_one(doc)
    doc.pop("_id", None)
    return doc


@reports_router.get("/{report_id}")
async def get_report(report_id: str, request: Request,
                     session_token: str | None = Cookie(default=None),
                     authorization: str | None = Header(default=None)):
    user = await get_current_user(request, session_token, authorization)
    db: AsyncIOMotorDatabase = request.app.state.db
    row = await db.reports.find_one({"report_id": report_id, "user_id": user["user_id"]}, {"_id": 0})
    if not row:
        raise HTTPException(404, "Report not found")
    return row


@reports_router.patch("/{report_id}/notes")
async def update_notes(report_id: str, payload: NotesUpdate, request: Request,
                       session_token: str | None = Cookie(default=None),
                       authorization: str | None = Header(default=None)):
    user = await get_current_user(request, session_token, authorization)
    db: AsyncIOMotorDatabase = request.app.state.db
    res = await db.reports.update_one(
        {"report_id": report_id, "user_id": user["user_id"]},
        {"$set": {"notes": payload.notes, "notes_updated_at": datetime.now(timezone.utc)}},
    )
    if not res.matched_count:
        raise HTTPException(404, "Report not found")
    return {"ok": True}


@reports_router.delete("/{report_id}")
async def delete_report(report_id: str, request: Request,
                        session_token: str | None = Cookie(default=None),
                        authorization: str | None = Header(default=None)):
    user = await get_current_user(request, session_token, authorization)
    db: AsyncIOMotorDatabase = request.app.state.db
    res = await db.reports.delete_one({"report_id": report_id, "user_id": user["user_id"]})
    if not res.deleted_count:
        raise HTTPException(404, "Report not found")
    return {"ok": True}
