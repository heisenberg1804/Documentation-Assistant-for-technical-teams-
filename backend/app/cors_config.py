# backend/app/cors_config.py - Simple dynamic CORS solution
from fastapi.middleware.cors import CORSMiddleware

def add_cors_middleware(app):
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^https://.*\.vercel\.app$|^http://localhost:3000$",
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"]
    )