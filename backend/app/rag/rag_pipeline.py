from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
import hashlib
from datetime import datetime
from langchain_openai import OpenAIEmbeddings
from app.config import config
from app.rag.vector_store import get_vector_store
from app.rag.document_processor import DocumentProcessor

@dataclass
class RAGResult:
    """Result from RAG retrieval"""
    content: str
    source: str
    confidence: float
    metadata: Dict
    chunk_id: str

class RAGPipeline:
    """Basic RAG pipeline for document retrieval"""
    
    def __init__(self):
        self.embedding_model = OpenAIEmbeddings(
            model=config.embedding_model,
            api_key=config.openai_api_key
        )
        self.vector_store = get_vector_store()
        self.document_processor = DocumentProcessor()
        
        # Simple caches
        self.embedding_cache = {}
        self.query_cache = {}
    
    def add_document(self, content: str, filename: str, doc_type: str = None) -> int:
        """Add a document to the RAG pipeline"""
        
        # Auto-detect document type if not provided
        if doc_type is None:
            if filename.endswith('.md'):
                doc_type = 'markdown'
            elif filename.endswith('.pdf'):
                doc_type = 'pdf'
            else:
                doc_type = 'text'
        
        # Process document into chunks
        if doc_type == 'markdown':
            chunks = self.document_processor.process_markdown(content, filename)
        elif doc_type == 'pdf':
            chunks = self.document_processor.process_pdf(content.encode() if isinstance(content, str) else content, filename)
        else:
            chunks = self.document_processor.process_text(content, filename)
        
        if not chunks:
            print(f"No chunks created for document: {filename}")
            return 0
        
        # Generate embeddings for chunks
        texts = [chunk.content for chunk in chunks]
        embeddings = self._generate_embeddings_batch(texts)
        
        # Prepare data for vector store
        chunk_data = [chunk.to_dict() for chunk in chunks]
        
        # Add to vector store
        self.vector_store.add_document_chunks(chunk_data, embeddings)
        
        print(f"Added {len(chunks)} chunks from {filename}")
        return len(chunks)
    
    def retrieve(self, query: str, top_k: int = 5) -> List[RAGResult]:
        """Basic retrieval from document chunks"""
        
        # Check query cache first
        query_hash = self._hash_text(query.lower().strip())
        if query_hash in self.query_cache:
            cached_result, timestamp = self.query_cache[query_hash]
            # Use cache if less than 1 hour old
            age = (datetime.now() - timestamp).total_seconds() / 3600
            if age < 1:
                print(f"Cache hit for query: {query[:50]}...")
                return cached_result
        
        # Generate query embedding
        query_embedding = self._get_embedding(query)
        
        # Search vector store
        search_results = self.vector_store.search_document_chunks(
            query_embedding=query_embedding,
            top_k=top_k
        )
        
        # Convert to RAGResult objects
        results = []
        if search_results['ids'] and len(search_results['ids'][0]) > 0:
            for i in range(len(search_results['ids'][0])):
                chunk_id = search_results['ids'][0][i]
                content = search_results['documents'][0][i]
                metadata = search_results['metadatas'][0][i]
                distance = search_results['distances'][0][i]
                
                # Convert distance to confidence (cosine distance -> similarity)
                confidence = 1.0 - distance
                
                result = RAGResult(
                    content=content,
                    source='rag',
                    confidence=confidence,
                    metadata=metadata,
                    chunk_id=chunk_id
                )
                results.append(result)
        
        # Cache results
        self.query_cache[query_hash] = (results, datetime.now())
        
        # Limit cache size
        if len(self.query_cache) > 50:
            oldest_key = min(self.query_cache.keys(), 
                           key=lambda k: self.query_cache[k][1])
            del self.query_cache[oldest_key]
        
        return results
    
    def _generate_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts"""
        
        # Check cache for existing embeddings
        uncached_texts = []
        uncached_indices = []
        embeddings = [None] * len(texts)
        
        for i, text in enumerate(texts):
            text_hash = self._hash_text(text)
            if text_hash in self.embedding_cache:
                embeddings[i] = self.embedding_cache[text_hash]
            else:
                uncached_texts.append(text)
                uncached_indices.append(i)
        
        # Generate embeddings for uncached texts
        if uncached_texts:
            print(f"Generating embeddings for {len(uncached_texts)} texts...")
            new_embeddings = self.embedding_model.embed_documents(uncached_texts)
            
            # Store in cache and results
            for idx, embedding in zip(uncached_indices, new_embeddings):
                text_hash = self._hash_text(texts[idx])
                self.embedding_cache[text_hash] = embedding
                embeddings[idx] = embedding
        
        # Limit embedding cache size
        if len(self.embedding_cache) > config.max_embedding_cache:
            # Remove oldest 100 entries
            keys_to_remove = list(self.embedding_cache.keys())[:100]
            for key in keys_to_remove:
                del self.embedding_cache[key]
        
        return embeddings
    
    def _get_embedding(self, text: str) -> List[float]:
        """Get embedding for single text with caching"""
        text_hash = self._hash_text(text)
        
        if text_hash in self.embedding_cache:
            return self.embedding_cache[text_hash]
        
        embedding = self.embedding_model.embed_query(text)
        self.embedding_cache[text_hash] = embedding
        
        return embedding
    
    def _hash_text(self, text: str) -> str:
        """Generate hash for text caching"""
        return hashlib.md5(text.encode()).hexdigest()
    
    def get_stats(self) -> Dict:
        """Get pipeline statistics"""
        vector_stats = self.vector_store.get_collection_stats()
        
        return {
            **vector_stats,
            "embedding_cache_size": len(self.embedding_cache),
            "query_cache_size": len(self.query_cache)
        }
    
    def clear_caches(self):
        """Clear all caches"""
        self.embedding_cache.clear()
        self.query_cache.clear()

# Singleton instance
_rag_pipeline = None

def get_rag_pipeline() -> RAGPipeline:
    """Get singleton RAG pipeline instance"""
    global _rag_pipeline
    if _rag_pipeline is None:
        _rag_pipeline = RAGPipeline()
    return _rag_pipeline