"""Chat persistence — tasks, sessions, messages."""

from __future__ import annotations

import json
import pytest

from compass.chats import (
    append_message,
    create_session,
    create_task,
    delete_session,
    delete_task,
    list_for_owner,
    load_chats,
    update_task,
)


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    return tmp_path


def test_load_missing_is_empty(data_dir) -> None:
    owner = list_for_owner("maria-chen")
    assert owner.tasks == []
    assert owner.sessions == []


def test_create_task_persists(data_dir) -> None:
    task = create_task("maria-chen", title="NVDA thesis")
    assert task.title == "NVDA thesis"
    assert task.ownerKey == "maria-chen"
    assert task.status == "active"

    owner = list_for_owner("maria-chen")
    assert len(owner.tasks) == 1
    assert owner.tasks[0].id == task.id


def test_create_task_blanks_default_to_new_task(data_dir) -> None:
    assert create_task("maria-chen", title="  ").title == "New task"
    assert create_task("maria-chen", title="").title == "New task"


def test_create_task_isolates_owners(data_dir) -> None:
    create_task("maria-chen", title="Maria's")
    create_task("david-park", title="David's")
    assert len(list_for_owner("maria-chen").tasks) == 1
    assert len(list_for_owner("david-park").tasks) == 1


def test_update_task_changes_fields(data_dir) -> None:
    t = create_task("maria-chen", title="old")
    updated = update_task("maria-chen", t.id, title="new", status="paused")
    assert updated.title == "new"
    assert updated.status == "paused"


def test_update_task_rejects_bad_status(data_dir) -> None:
    t = create_task("maria-chen", title="x")
    with pytest.raises(ValueError, match="status"):
        update_task("maria-chen", t.id, status="not-a-status")


def test_update_task_missing_raises(data_dir) -> None:
    with pytest.raises(ValueError, match="task not found"):
        update_task("maria-chen", "nope")


def test_delete_task_cascades_sessions(data_dir) -> None:
    t = create_task("maria-chen", title="x")
    create_session("maria-chen", t.id, title="s1")
    create_session("maria-chen", t.id, title="s2")
    owner = delete_task("maria-chen", t.id)
    assert owner.tasks == []
    assert owner.sessions == []


def test_delete_task_idempotent(data_dir) -> None:
    owner = delete_task("maria-chen", "nope")
    assert owner.tasks == []


def test_create_session_needs_existing_task(data_dir) -> None:
    with pytest.raises(ValueError, match="task not found"):
        create_session("maria-chen", "nope", title="x")


def test_create_session_persists(data_dir) -> None:
    t = create_task("maria-chen", title="task")
    s = create_session("maria-chen", t.id, title="session")
    assert s.taskId == t.id
    owner = list_for_owner("maria-chen")
    assert len(owner.sessions) == 1


def test_append_message_renames_new_session_from_first_pm_msg(data_dir) -> None:
    t = create_task("maria-chen", title="task")
    s = create_session("maria-chen", t.id)  # default title 'New session'
    out = append_message("maria-chen", s.id, role="pm", text="What's the bear case on NVDA?")
    assert out.title.startswith("What's the bear case on NVDA")
    assert len(out.messages) == 1
    assert out.messages[0].role == "pm"
    assert out.preview.startswith("What's the bear case")


def test_append_message_records_preview_and_timestamp(data_dir) -> None:
    t = create_task("maria-chen", title="task")
    s = create_session("maria-chen", t.id)
    out = append_message("maria-chen", s.id, role="pm", text="hello")
    assert out.preview == "hello"
    assert out.lastMessageAt  # iso timestamp set


def test_append_message_rejects_bad_role(data_dir) -> None:
    t = create_task("maria-chen", title="task")
    s = create_session("maria-chen", t.id)
    with pytest.raises(ValueError, match="role"):
        append_message("maria-chen", s.id, role="alien", text="x")


def test_append_message_empty_is_noop(data_dir) -> None:
    t = create_task("maria-chen", title="task")
    s = create_session("maria-chen", t.id)
    out = append_message("maria-chen", s.id, role="pm", text="   ")
    assert out.messages == []


def test_delete_session_removes_only_that_session(data_dir) -> None:
    t = create_task("maria-chen", title="task")
    s1 = create_session("maria-chen", t.id, title="s1")
    s2 = create_session("maria-chen", t.id, title="s2")
    delete_session("maria-chen", s1.id)
    owner = list_for_owner("maria-chen")
    assert {x.id for x in owner.sessions} == {s2.id}


def test_disk_format_is_valid_json(data_dir) -> None:
    create_task("maria-chen", title="t")
    raw = json.loads((data_dir / "chats.json").read_text(encoding="utf-8"))
    assert "owners" in raw
    assert "maria-chen" in raw["owners"]
    assert isinstance(raw["owners"]["maria-chen"]["tasks"], list)
