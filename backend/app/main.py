import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.routes import router
from app.ws import router as ws_router
from app.proxy import router as proxy_router

app = FastAPI(title="injester.lol", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-Demo-Key"],
)

# Demo-key middleware: keep accidental/malicious abuse off the Nebius +
# Tavily + Playwright budget while the site is public. Gates /api/* and /ws/*.
# Accepts either an X-Demo-Key header OR a ?key= query param (for WebSockets
# that can't easily send custom headers). Set INJESTER_DEMO_KEY on the host
# to enable; leave unset for local dev.
@app.middleware("http")
async def require_demo_key(request: Request, call_next):
    expected = os.environ.get("INJESTER_DEMO_KEY")
    if expected:
        path = request.url.path
        if path.startswith("/api/") or path.startswith("/ws"):
            provided = request.headers.get("x-demo-key") or request.query_params.get("key")
            if provided != expected:
                return JSONResponse(
                    status_code=401,
                    content={"error": "unauthorized", "hint": "missing or invalid X-Demo-Key"},
                )
    return await call_next(request)

app.include_router(router, prefix="/api")
app.include_router(proxy_router, prefix="/api")
app.include_router(ws_router)

# Serve generated optimized HTML pages
generated_dir = Path(__file__).parent.parent / "generated"
generated_dir.mkdir(exist_ok=True)
app.mount("/generated", StaticFiles(directory=str(generated_dir), html=True), name="generated")


@app.get("/health")
def health():
    return {"status": "ok"}
