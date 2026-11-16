"""SIMULATED sign-in. Not real authentication.

Purpose: the decision log must record who decided, and that name must be decided by the
server, not typed into a form by whoever calls the API. Here a person picks one of a few
fixed demo users and gets a random token. The server keeps token -> user in memory and
reads the name from there. Real login (passwords or single sign-on, httpOnly cookies,
roles) is a later step. Sessions are lost when the backend restarts.

The token is sent as `Authorization: Bearer <token>`. That avoids cross-site cookie
problems between localhost:3000 and 127.0.0.1:8000, and a page on another origin cannot
read it because CORS allows only the frontend origin. Never log tokens.
"""

import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict

router = APIRouter()


class User(BaseModel):
    id: str
    name: str


# Fictional demo users. The "(demo)" in the name is kept in the decision log on purpose.
DEMO_USERS = [
    User(id="demo-pm", name="Test PM (demo)"),
    User(id="demo-reviewer", name="Test Reviewer (demo)"),
]


class SignInIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: str


class SignInOut(BaseModel):
    token: str
    user: User


def _token_from(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


def current_user(request: Request) -> User:
    token = _token_from(request)
    user = request.app.state.sessions.get(token) if token else None
    if user is None:
        raise HTTPException(401, "Sign in to record a decision.")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


@router.get("/session/users")
def list_demo_users() -> list[User]:
    return DEMO_USERS


@router.post("/session")
def sign_in(body: SignInIn, request: Request) -> SignInOut:
    user = next((u for u in DEMO_USERS if u.id == body.user_id), None)
    if user is None:
        raise HTTPException(404, "That demo user was not found.")
    token = secrets.token_urlsafe(32)
    request.app.state.sessions[token] = user
    return SignInOut(token=token, user=user)


@router.get("/session/me")
def me(user: CurrentUser) -> User:
    return user


@router.delete("/session", status_code=204)
def sign_out(request: Request) -> None:
    token = _token_from(request)
    if token:
        request.app.state.sessions.pop(token, None)
