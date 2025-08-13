import logging
import sys
from typing import Dict, Any

def setup_logging(level: str = "INFO") -> None:
    """
    Configure logging for the application
    
    Args:
        level: Logging level (DEBUG, INFO, WARNING, ERROR)
    """
    
    # Convert string level to logging constant
    numeric_level = getattr(logging, level.upper(), logging.INFO)
    
    # Create formatter
    formatter = logging.Formatter(
        fmt='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)
    
    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Add console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(numeric_level)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    
    # Configure specific loggers
    configure_app_loggers(numeric_level)
    
    logging.info(f"Logging configured at {level} level")

def configure_app_loggers(level: int) -> None:
    """Configure application-specific loggers"""
    
    # App loggers
    app_loggers = [
        'app.graph',
        'app.api', 
        'app.rag.dual_retrieval',
        'app.rag.rag_pipeline',
        'app.rag.vector_store',
        'app.rag.document_processor'
    ]
    
    for logger_name in app_loggers:
        logger = logging.getLogger(logger_name)
        logger.setLevel(level)
    
    # External library loggers (set to WARNING to reduce noise)
    external_loggers = [
        'chromadb',
        'openai',
        'httpx',
        'httpcore'
    ]
    
    for logger_name in external_loggers:
        logger = logging.getLogger(logger_name)
        logger.setLevel(logging.WARNING)

def get_logger(name: str) -> logging.Logger:
    """Get a logger with the given name"""
    return logging.getLogger(name)