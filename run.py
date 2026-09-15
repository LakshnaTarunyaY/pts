"""
MediKiosk — Quick Launcher
Run: python run.py
"""

import os
import uvicorn
from app.config import settings

if __name__ == "__main__":
    # WatchFiles reload on Windows frequently kills the worker mid-request
    # (multipart uploads / SQLite WAL), so keep it off on nt even when DEBUG=true.
    use_reload = bool(settings.DEBUG) and os.name != "nt"
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=use_reload,
        log_level="debug" if settings.DEBUG else "info"
    )
