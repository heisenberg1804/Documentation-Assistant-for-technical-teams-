from fastapi.middleware.cors import CORSMiddleware

def add_cors_middleware(app):
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",  # Local development
            "https://documentation-assistant-chnic.vercel.app",  # Your Vercel domain
            "https://*.vercel.app",  # All Vercel preview deployments
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"]
    )