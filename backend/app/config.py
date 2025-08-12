from pydantic_settings import BaseSettings
from pydantic import Field
import os

class RAGConfig(BaseSettings):
    """RAG system configuration"""
    
    # Model settings
    openai_api_key: str
    embedding_model: str = "text-embedding-3-small"
    llm_model: str = "gpt-4o-mini"
    
    # ChromaDB settings
    chroma_persist_dir: str = "./chroma_db"
    
    # Retrieval settings
    confidence_threshold: float = 0.85
    top_k_results: int = 5
    
    # Caching settings
    cache_ttl_hours: int = 24
    max_cache_size: int = 100
    max_embedding_cache: int = 1000
    
    # Chunking settings
    chunk_size: int = 512
    chunk_overlap: int = 50
    max_chunks_per_doc: int = 100
    
    class Config:
        env_file = ".env"

# Singleton config
config = RAGConfig()