"""
app.py — Self Care Journal desktop launcher.

Starts the FastAPI server in a background thread, waits for it to be ready,
then opens a PyWebView native window pointing at http://localhost:8000.

Usage
-----
    python app.py               # production (serves built frontend)
    python app.py --dev         # development (Vite dev server on port 5173)
    python app.py --api-only    # just the FastAPI server, no window (for testing)
"""

import argparse
import sys
import threading
import time
from pathlib import Path

# Ensure project root is on path
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))


def start_api(port: int = 8000) -> None:
    import uvicorn
    uvicorn.run(
        "api.main:app",
        host="127.0.0.1",
        port=port,
        log_level="warning",    # suppress access logs in desktop mode
        reload=False,
    )


def wait_for_api(url: str, timeout: int = 15) -> bool:
    """Poll until the FastAPI server responds or timeout."""
    import urllib.request
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url + "/api/status", timeout=2)
            return True
        except Exception:
            time.sleep(0.3)
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Self Care Journal desktop app")
    parser.add_argument("--dev",      action="store_true", help="Open Vite dev server (port 5173)")
    parser.add_argument("--api-only", action="store_true", help="Run API without opening a window")
    parser.add_argument("--port",     type=int, default=8000, help="FastAPI port")
    args = parser.parse_args()

    # Start API in background thread
    api_thread = threading.Thread(target=start_api, kwargs={"port": args.port}, daemon=True)
    api_thread.start()

    if args.api_only:
        print(f"  API running at http://127.0.0.1:{args.port}")
        print("  Press Ctrl+C to stop.")
        try:
            api_thread.join()
        except KeyboardInterrupt:
            pass
        return

    # Wait for FastAPI to be ready
    api_url = f"http://127.0.0.1:{args.port}"
    print("  Starting Self Care Journal …")
    if not wait_for_api(api_url, timeout=20):
        print("  ERROR: API did not start in time. Check requirements.txt is installed.")
        sys.exit(1)

    # Determine which URL to open
    if args.dev:
        app_url = "http://localhost:5173"
    else:
        app_url = api_url

    # Open PyWebView window
    try:
        import webview  # noqa: F401 — optional dependency
        window = webview.create_window(
            title       = "Self Care Journal",
            url         = app_url,
            width       = 780,
            height      = 1000,
            resizable   = True,
            min_size    = (700, 650),
        )
        webview.start(debug=args.dev)
    except ImportError:
        # pywebview not installed — open in default browser instead
        print(f"\n  pywebview is not installed (optional dependency).")
        print(f"  Opening Self Care Journal in your browser at {app_url}")
        print(f"  To get the native window later: pip install pywebview --no-deps")
        print(f"  Press Ctrl+C to stop the server.\n")
        import webbrowser
        webbrowser.open(app_url)
        try:
            api_thread.join()
        except KeyboardInterrupt:
            print("\n  Shutting down.")


if __name__ == "__main__":
    main()