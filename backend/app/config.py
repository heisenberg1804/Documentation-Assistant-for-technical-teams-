from pydantic_settings import BaseSettings
from pydantic import Field
import os
from dotenv import find_dotenv, load_dotenv

# Find and load the .env file from the backend directory
env_path = find_dotenv(usecwd=True)
if not env_path:
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
load_dotenv(env_path)

class RAGConfig(BaseSettings):
    """RAG system configuration"""
    
    # Model settings
    openai_api_key: str = Field(default=os.getenv("OPENAI_API_KEY"), env="OPENAI_API_KEY")
    embedding_model: str = "text-embedding-3-small"
    llm_model: str = "gpt-4"  # Fixed model name
    
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
        env_file = env_path  # Use the found .env path

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY not found in environment variables. Please check your .env file.")

# Singleton config
config = RAGConfig()