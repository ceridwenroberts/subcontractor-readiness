"""Test-only setup.

FastAPI's TestClient sends requests with the host name "testserver". The backend refuses
unknown Host headers, so the tests allow it through the environment. The production default
(`Settings.allowed_hosts`) stays localhost and 127.0.0.1 only, and a test checks that.
"""

import os

os.environ.setdefault("ALLOWED_HOSTS", '["localhost", "127.0.0.1", "testserver"]')
