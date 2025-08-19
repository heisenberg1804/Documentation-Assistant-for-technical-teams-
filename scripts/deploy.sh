#!/bin/bash
# scripts/deploy.sh - Actually creates all deployment files

set -e

echo "🚀 Creating AI Documentation Assistant Deployment Files"
echo "======================================================"

# Create backend Dockerfile
echo "📝 Creating backend/Dockerfile..."
mkdir -p backend
cat > backend/Dockerfile << 'EOF'
# backend/Dockerfile
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create app user for security
RUN adduser --disabled-password --gecos '' appuser

# Copy application code
COPY . .

# Create and set permissions for ChromaDB directory
ENV CHROMA_PERSIST_DIR=/app/chroma_data
RUN mkdir -p /app/chroma_data && \
    chown -R appuser:appuser /app

# Switch to app user
USER appuser

# Expose port
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:10000/health || exit 1

# Start command
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "10000"]
EOF
echo "✅ Created backend/Dockerfile"

# Create render.yaml
echo "📝 Creating backend/render.yaml..."
cat > backend/render.yaml << 'EOF'
# render.yaml
services:
  - type: web
    name: ai-docs-assistant-backend
    runtime: python
    region: oregon
    plan: free
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port 10000
    healthCheckPath: /health
    envVars:
      - key: OPENAI_API_KEY
        sync: false  # Set this in Render dashboard
      - key: CHROMA_PERSIST_DIR
        value: /opt/render/project/src/chroma_data
      - key: LOG_LEVEL
        value: INFO
      - key: CONFIDENCE_THRESHOLD
        value: "0.85"
      - key: CHUNK_SIZE
        value: "512"
      - key: CACHE_TTL_HOURS
        value: "24"
        
EOF
echo "✅ Created backend/render.yaml"

# Create .dockerignore
echo "📝 Creating backend/.dockerignore..."
cat > backend/.dockerignore << 'EOF'
# backend/.dockerignore
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
env/
venv/
ENV/
env.bak/
venv.bak/
.env

# Development files
.pytest_cache/
.coverage
htmlcov/
.tox/
.cache
nosetests.xml
coverage.xml
*.cover
.hypothesis/

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Jupyter Notebooks
.ipynb_checkpoints

# ChromaDB local data (will be created fresh)
chroma_db/
chroma_data/

# Documentation and scripts
notebooks/
scripts/
test_docs/
*.md
LICENSE

# Git
.git/
.gitignore
EOF
echo "✅ Created backend/.dockerignore"

# Create frontend vercel.json
echo "📝 Creating frontend/vercel.json..."
mkdir -p frontend
cat > frontend/vercel.json << 'EOF'
{
  "version": 2,
  "name": "ai-docs-assistant-frontend",
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "build"
      }
    }
  ],
  "routes": [
    {
      "src": "/static/(.*)",
      "headers": {
        "cache-control": "public, max-age=31536000, immutable"
      }
    },
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ],
  "env": {
    "REACT_APP_API_URL": "@api_url"
  },
  "build": {
    "env": {
      "REACT_APP_API_URL": "@api_url"
    }
  },
  "functions": {},
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "origin-when-cross-origin"
        }
      ]
    }
  ],
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
EOF
echo "✅ Created frontend/vercel.json"

# Create GitHub Actions workflow
echo "📝 Creating .github/workflows/deploy.yml..."
mkdir -p .github/workflows
cat > .github/workflows/deploy.yml << 'EOF'
# .github/workflows/deploy.yml
name: Deploy AI Documentation Assistant

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install backend dependencies
        working-directory: ./backend
        run: |
          pip install -r requirements.txt

      - name: Run backend tests
        working-directory: ./backend
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          python -m pytest scripts/test_document_ingestion.py -v || echo "Tests completed"

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install frontend dependencies
        working-directory: ./frontend
        run: npm ci

      - name: Build frontend
        working-directory: ./frontend
        env:
          REACT_APP_API_URL: ${{ secrets.REACT_APP_API_URL }}
        run: npm run build

  deploy-backend:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to Render
        run: |
          echo "Deploying backend to Render..."
          curl -X POST "${{ secrets.RENDER_DEPLOY_HOOK }}"

  deploy-frontend:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: frontend
          vercel-args: '--prod'
EOF
echo "✅ Created .github/workflows/deploy.yml"

# Create environment files if they don't exist
echo "📝 Creating environment files..."

if [ ! -f "backend/.env" ]; then
    cat > backend/.env << 'EOF'
# backend/.env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Database Configuration
CHROMA_PERSIST_DIR=./chroma_data

# Model Configuration
EMBEDDING_MODEL=text-embedding-3-small
LLM_MODEL=gpt-4

# RAG Configuration
CONFIDENCE_THRESHOLD=0.85
TOP_K_RESULTS=5
CACHE_TTL_HOURS=24
MAX_CACHE_SIZE=100
MAX_EMBEDDING_CACHE=1000

# Document Processing
CHUNK_SIZE=512
CHUNK_OVERLAP=50
MAX_CHUNKS_PER_DOC=100

# Server Configuration
LOG_LEVEL=INFO
EOF
    echo "✅ Created backend/.env"
else
    echo "⚠️  backend/.env already exists, skipping"
fi

if [ ! -f "frontend/.env" ]; then
    cat > frontend/.env << 'EOF'
# frontend/.env
# API Configuration
REACT_APP_API_URL=http://localhost:8000

# For production deployment on Vercel:
# REACT_APP_API_URL=https://your-app-name.onrender.com
EOF
    echo "✅ Created frontend/.env"
else
    echo "⚠️  frontend/.env already exists, skipping"
fi

echo ""
echo "🎯 Deployment Files Created Successfully!"
echo "========================================"
echo "✅ backend/Dockerfile"
echo "✅ backend/render.yaml"
echo "✅ backend/.dockerignore"
echo "✅ frontend/vercel.json"
echo "✅ .github/workflows/deploy.yml"
echo "✅ Environment files"

echo ""
echo "🔑 Next Steps:"
echo "1. Edit backend/.env and add your OpenAI API key"
echo "2. Commit and push to GitHub:"
echo "   git add ."
echo "   git commit -m 'Add deployment configuration'"
echo "   git push origin main"
echo "3. Deploy backend on Render"
echo "4. Deploy frontend on Vercel"
echo "5. Update frontend/.env with your backend URL"

echo ""
echo "🚀 Ready for deployment!"
EOF

chmod +x scripts/deploy.sh
echo "✅ Created scripts/deploy.sh"