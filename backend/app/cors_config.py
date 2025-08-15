# backend/app/cors_config.py - Permissive CORS fix (for deployment only)
from fastapi.middleware.cors import CORSMiddleware

def add_cors_middleware(app):
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Allow all origins (for demo deployment)
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"]
    )