"""In-memory pub/sub for engagement events.

Mirrors the WebSocket pattern from
``background/code_analysis_want_to_use/16-task-tracker-ui-design.md``
but uses SSE (one-way is what we need) and an in-process Python queue
since Compass is single-user / single-process for v1.

Producers (dispatcher, manual mutation endpoints) call :func:`publish`
after mutating engagement state. Consumers (SSE endpoint, in-process
listeners) call :func:`subscribe` to get an async iterator of events
scoped to one ``(analyst, ticker)`` pair.

Thread-safe: publishers running in the agent_helper worker thread are
bridged back to each subscriber's asyncio loop via
``call_soon_threadsafe``.
"""

from __future__ import annotations

import asyncio
import threading
from collections import defaultdict
from typing import Any, AsyncIterator


# Each subscriber registers an asyncio.Queue bound to its own event
# loop. We keep both so we can safely cross thread boundaries.
_subscribers: dict[
    tuple[str, str],
    list[tuple[asyncio.Queue, asyncio.AbstractEventLoop]],
] = defaultdict(list)
_lock = threading.Lock()


def _key(analyst: str, ticker: str) -> tuple[str, str]:
    return (analyst.strip().lower(), ticker.strip().upper())


def publish(analyst: str, ticker: str, event: dict[str, Any]) -> None:
    """Fan out ``event`` to every subscriber of ``(analyst, ticker)``.

    Safe to call from any thread. If a subscriber's queue is full
    (slow consumer) the event is dropped for *that* subscriber only —
    we never block a producer.
    """
    key = _key(analyst, ticker)
    with _lock:
        subs = list(_subscribers.get(key, ()))
    if not subs:
        return

    try:
        current_loop: asyncio.AbstractEventLoop | None = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    for q, loop in subs:
        if current_loop is loop:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass
        else:
            try:
                loop.call_soon_threadsafe(_safe_put, q, event)
            except RuntimeError:
                # Loop already closed — subscriber will be cleaned up on
                # its next iteration.
                pass


def _safe_put(q: asyncio.Queue, event: dict[str, Any]) -> None:
    try:
        q.put_nowait(event)
    except asyncio.QueueFull:
        pass


async def subscribe(
    analyst: str, ticker: str,
) -> AsyncIterator[dict[str, Any]]:
    """Async iterator over events for ``(analyst, ticker)``.

    Loops forever until the consumer cancels (e.g. SSE client
    disconnects). The subscriber is registered for the duration and
    deregistered automatically when the iterator is closed.
    """
    q: asyncio.Queue = asyncio.Queue(maxsize=256)
    loop = asyncio.get_running_loop()
    key = _key(analyst, ticker)

    with _lock:
        _subscribers[key].append((q, loop))
    try:
        while True:
            event = await q.get()
            yield event
    finally:
        with _lock:
            try:
                _subscribers[key].remove((q, loop))
            except ValueError:
                pass
            if not _subscribers[key]:
                _subscribers.pop(key, None)


def subscriber_count(analyst: str, ticker: str) -> int:
    """For telemetry / tests."""
    with _lock:
        return len(_subscribers.get(_key(analyst, ticker), ()))
