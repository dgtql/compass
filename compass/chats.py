"""Chat persistence — tasks, sessions, messages per analyst (or 'master').

The PM groups research conversations into *tasks*; each task contains
one or more chat *sessions*; each session is a list of messages. This
module persists them so navigating away from an analyst's chat tab
doesn't blow away in-flight work.

Storage: one JSON file at ``data/chats.json``, keyed by ``owner_key``
(an analyst slug like ``maria-chen``, or the literal ``master``).
Schema::

    {
      "as_of": "2026-05-13T...",
      "owners": {
        "maria-chen": {
          "tasks": [
            {"id": "t-...", "ownerKey": "maria-chen", "title": "...",
             "status": "active|paused|done", "createdAt": "...",
             "updatedAt": "...", "coverageTicker": "NVDA"?}
          ],
          "sessions": [
            {"id": "s-...", "ownerKey": "...", "taskId": "...",
             "title": "...", "lastMessageAt": "...", "preview": "...",
             "messages": [
               {"id": "m-...", "role": "pm|master", "text": "...", "ts": "..."}
             ]}
          ]
        }
      }
    }
"""

from __future__ import annotations

import json
import os
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


VALID_STATUSES: tuple[str, ...] = ("active", "paused", "done")
VALID_ROLES: tuple[str, ...] = ("pm", "master")


def chats_path() -> Path:
    base = Path(os.environ.get("COMPASS_DATA_DIR", "data")).resolve()
    return base / "chats.json"


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class Message:
    id: str
    role: str          # 'pm' | 'master'
    text: str
    ts: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Message":
        return cls(
            id=str(data.get("id", _new_id("m"))),
            role=str(data.get("role", "pm")),
            text=str(data.get("text", "")),
            ts=str(data.get("ts", _now_iso())),
        )


@dataclass
class Session:
    id: str
    ownerKey: str
    taskId: str
    title: str
    lastMessageAt: str
    preview: str
    messages: list[Message] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        return d

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Session":
        msgs = [Message.from_dict(m) for m in data.get("messages", [])]
        return cls(
            id=str(data["id"]),
            ownerKey=str(data["ownerKey"]),
            taskId=str(data["taskId"]),
            title=str(data.get("title", "New session")),
            lastMessageAt=str(data.get("lastMessageAt", _now_iso())),
            preview=str(data.get("preview", "")),
            messages=msgs,
        )


@dataclass
class Task:
    id: str
    ownerKey: str
    title: str
    status: str = "active"
    createdAt: str = ""
    updatedAt: str = ""
    coverageTicker: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Task":
        keep = set(cls.__dataclass_fields__)
        return cls(**{k: v for k, v in data.items() if k in keep})


@dataclass
class OwnerChats:
    tasks: list[Task] = field(default_factory=list)
    sessions: list[Session] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "tasks":    [t.to_dict() for t in self.tasks],
            "sessions": [s.to_dict() for s in self.sessions],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "OwnerChats":
        return cls(
            tasks=[Task.from_dict(t) for t in data.get("tasks", [])],
            sessions=[Session.from_dict(s) for s in data.get("sessions", [])],
        )


@dataclass
class ChatStore:
    as_of: str
    owners: dict[str, OwnerChats] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "as_of":  self.as_of,
            "owners": {k: v.to_dict() for k, v in self.owners.items()},
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ChatStore":
        return cls(
            as_of=str(data.get("as_of", _now_iso())),
            owners={k: OwnerChats.from_dict(v) for k, v in (data.get("owners") or {}).items()},
        )

    def for_owner(self, owner_key: str) -> OwnerChats:
        owner = self.owners.setdefault(owner_key, OwnerChats())
        return owner


# ---------------------------------------------------------------------------
# I/O
# ---------------------------------------------------------------------------


def load_chats(*, path: Path | None = None) -> ChatStore:
    p = path or chats_path()
    if not p.exists():
        return ChatStore(as_of=_now_iso(), owners={})
    return ChatStore.from_dict(json.loads(p.read_text(encoding="utf-8")))


def save_chats(store: ChatStore, *, path: Path | None = None) -> Path:
    p = path or chats_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    store.as_of = _now_iso()
    p.write_text(
        json.dumps(store.to_dict(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return p


# ---------------------------------------------------------------------------
# Mutations
# ---------------------------------------------------------------------------


def list_for_owner(owner_key: str, *, path: Path | None = None) -> OwnerChats:
    return load_chats(path=path).for_owner(owner_key)


def create_task(
    owner_key: str,
    *,
    title: str,
    coverage_ticker: str | None = None,
    path: Path | None = None,
) -> Task:
    title = (title or "New task").strip() or "New task"
    store = load_chats(path=path)
    owner = store.for_owner(owner_key)
    now = _now_iso()
    task = Task(
        id=_new_id("t"),
        ownerKey=owner_key,
        title=title,
        status="active",
        createdAt=now,
        updatedAt=now,
        coverageTicker=coverage_ticker,
    )
    owner.tasks.insert(0, task)
    save_chats(store, path=path)
    return task


def update_task(
    owner_key: str,
    task_id: str,
    *,
    title: str | None = None,
    status: str | None = None,
    coverage_ticker: str | None = None,
    path: Path | None = None,
) -> Task:
    store = load_chats(path=path)
    owner = store.for_owner(owner_key)
    t = next((x for x in owner.tasks if x.id == task_id), None)
    if t is None:
        raise ValueError(f"task not found: {task_id}")
    if title is not None:
        t.title = title.strip() or t.title
    if status is not None:
        if status not in VALID_STATUSES:
            raise ValueError(f"status must be one of {VALID_STATUSES}, got {status!r}")
        t.status = status
    if coverage_ticker is not None:
        t.coverageTicker = coverage_ticker.upper() or None
    t.updatedAt = _now_iso()
    save_chats(store, path=path)
    return t


def delete_task(
    owner_key: str,
    task_id: str,
    *,
    path: Path | None = None,
) -> OwnerChats:
    """Delete a task and cascade — also removes its child sessions."""
    store = load_chats(path=path)
    owner = store.for_owner(owner_key)
    owner.tasks = [t for t in owner.tasks if t.id != task_id]
    owner.sessions = [s for s in owner.sessions if s.taskId != task_id]
    save_chats(store, path=path)
    return owner


def create_session(
    owner_key: str,
    task_id: str,
    *,
    title: str = "New session",
    path: Path | None = None,
) -> Session:
    store = load_chats(path=path)
    owner = store.for_owner(owner_key)
    if not any(t.id == task_id for t in owner.tasks):
        raise ValueError(f"task not found: {task_id}")
    now = _now_iso()
    session = Session(
        id=_new_id("s"),
        ownerKey=owner_key,
        taskId=task_id,
        title=(title or "New session").strip() or "New session",
        lastMessageAt=now,
        preview="",
        messages=[],
    )
    owner.sessions.insert(0, session)
    save_chats(store, path=path)
    return session


def append_message(
    owner_key: str,
    session_id: str,
    *,
    role: str,
    text: str,
    path: Path | None = None,
) -> Session:
    """Append one message to a session. Also bumps lastMessageAt + preview.

    On a 'pm' role message, mirrors the existing mock-reply pattern so the
    UI sees a server-generated 'master' reply too — keeps the chat
    feeling alive while the real LLM wiring is still ahead.
    """
    if role not in VALID_ROLES:
        raise ValueError(f"role must be one of {VALID_ROLES}, got {role!r}")
    store = load_chats(path=path)
    owner = store.for_owner(owner_key)
    session = next((s for s in owner.sessions if s.id == session_id), None)
    if session is None:
        raise ValueError(f"session not found: {session_id}")

    now = _now_iso()
    text = (text or "").strip()
    if text:
        session.messages.append(Message(id=_new_id("m"), role=role, text=text, ts=now))
        session.lastMessageAt = now
        session.preview = text[:90]
        # Auto-name a brand-new session from the first user message.
        if role == "pm" and (session.title == "New session" or not session.title):
            session.title = text[:40]

    save_chats(store, path=path)
    return session


def delete_session(
    owner_key: str,
    session_id: str,
    *,
    path: Path | None = None,
) -> OwnerChats:
    store = load_chats(path=path)
    owner = store.for_owner(owner_key)
    owner.sessions = [s for s in owner.sessions if s.id != session_id]
    save_chats(store, path=path)
    return owner


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
