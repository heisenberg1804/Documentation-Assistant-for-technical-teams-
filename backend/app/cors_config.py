# backend/app/cors_config.py - Fix with actual Vercel URL
from fastapi.middleware.cors import CORSMiddleware

def add_cors_middleware(app):
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",  # Local development
            "https://documentation-assistant-for-technical-teams-7sxabc1q3.vercel.app",  #actual Vercel URL
            "https://*.vercel.app",  # All Vercel deployments
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"]
    )