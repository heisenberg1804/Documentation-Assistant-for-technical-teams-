import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.api import router
from app.cors_config import add_cors_middleware
from app.logging_config import setup_logging

# Setup logging before importing other modules
log_level = os.getenv("LOG_LEVEL", "INFO")
setup_logging(log_level)

# Get logger for this module
logger = logging.getLogger("app.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for FastAPI application"""
    # Startup
    logger.info("Starting AI Documentation Assistant")
    logger.info("RAG integration enabled")
    
    # Verify RAG system is working - start with foundation layer
    try:
        from app.rag import get_rag_pipeline
        rag_pipeline = get_rag_pipeline()
        stats = rag_pipeline.get_stats()
        logger.info(f"RAG Pipeline initialized: {stats['document_chunks_count']} chunks indexed")
        
        # Verify dual retrieval system can access the pipeline
        from app.rag.dual_retrieval import get_dual_retriever
        dual_retriever = get_dual_retriever()
        dual_stats = dual_retriever.get_stats()
        logger.info(f"Dual Retrieval initialized: {dual_stats['validated_answers_count']} validated answers")
        
    except Exception as e:
        logger.error(f"RAG system initialization error: {e}")
        # Don't raise - let app start even if RAG isn't ready
    
    yield  # Server is running
    
    # Cleanup (if needed)
    logger.info("Shutting down AI Documentation Assistant")

app = FastAPI(
    title="AI Documentation Assistant",
    description="Human-in-the-loop AI assistant with RAG capabilities",
    version="2.0.0",
    lifespan=lifespan
)

# Add CORS middleware
add_cors_middleware(app)

# Include API router
app.include_router(router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)