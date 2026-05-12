"""Test-suite-wide setup.

``load_dotenv()`` runs once at collection time so individual tests can
gate themselves on env-driven config (SEC creds, ``ANTHROPIC_API_KEY``,
``COMPASS_DATA_DIR``) without each one re-implementing dotenv handling.
The CLI loads ``.env`` itself in ``compass/cli.py``; this gives pytest
the same behavior.
"""

from __future__ import annotations

from dotenv import load_dotenv

load_dotenv()
