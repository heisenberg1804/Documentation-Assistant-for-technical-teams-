import hashlib
import logging
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
import numpy as np
from langchain_openai import OpenAIEmbeddings
import json

from app.config import config
from app.rag.vector_store import get_vector_store
from app.rag.rag_pipeline import get_rag_pipeline

# Configure logging
logger = logging.getLogger(__name__)

@dataclass
class RetrievalResult:
    """Unified result structure for both validated and RAG results"""
    content: str
    source: str  # 'validated' | 'rag' | 'cache'
    confidence: float
    metadata: Dict
    chunk_ids: List[str] = None
    validation_info: Optional[Dict] = None
    
    def to_dict(self):
        return asdict(self)

class DualRetrievalSystem:
    """
    Dual-retrieval system that prioritizes:
    1. Cache (instant)
    2. Validated answers (high confidence) 
    3. RAG fallback (comprehensive)
    """
    
    def __init__(self):
        self.embedding_model = OpenAIEmbeddings(
            model=config.embedding_model,
            api_key=config.openai_api_key
        )
        self.vector_store = get_vector_store()
        self.rag_pipeline = get_rag_pipeline()
        
        # Initialize caches
        self.query_cache = {}  # {query_hash: (result, timestamp)}
        self.embedding_cache = {}  # {text_hash: embedding}
        
        logger.info("DualRetrievalSystem initialized")
    
    def retrieve(self, 
                 query: str,
                 top_k: int = 5,
                 force_rag: bool = False) -> List[RetrievalResult]:
        """
        Main retrieval method with three-tier strategy
        
        Args:
            query: User's question
            top_k: Number of results to return
            force_rag: Skip cache and validated answers (for testing)
        
        Returns:
            List of RetrievalResult objects, sorted by confidence
        """
        
        logger.debug(f"Retrieving for query: {query[:50]}...")
        
        # Step 1: Check cache (unless forced RAG)
        if not force_rag:
            cache_result = self._check_cache(query)
            if cache_result:
                logger.debug("Cache hit - returning cached result")
                return [cache_result]
        
        # Step 2: Generate query embedding
        query_embedding = self._get_embedding(query)
        
        # Step 3: Search validated answers (unless forced RAG)
        validated_results = []
        if not force_rag:
            validated_results = self._search_validated(query_embedding, query, top_k=min(3, top_k))
            
            # If we have high-confidence validated answer, return immediately
            if validated_results and validated_results[0].confidence >= config.confidence_threshold:
                logger.debug(f"High-confidence validated answer found: {validated_results[0].confidence:.3f}")
                self._update_cache(query, validated_results[0])
                return validated_results[:top_k]
        
        # Step 4: Search RAG collection
        rag_results = self._search_rag(query_embedding, top_k=top_k * 2)
        
        # Step 5: Merge and re-rank
        merged_results = self._merge_and_rerank(validated_results, rag_results, query_embedding, top_k)
        
        # Step 6: Update cache with best result
        if merged_results:
            self._update_cache(query, merged_results[0])
            logger.debug(f"Cached best result with confidence: {merged_results[0].confidence:.3f}")
        
        logger.info(f"Retrieved {len(merged_results)} results for query")
        return merged_results
    
    def _check_cache(self, query: str) -> Optional[RetrievalResult]:
        """Check if query result is in cache and still valid"""
        query_hash = self._hash_text(query.lower().strip())
        
        if query_hash not in self.query_cache:
            return None
        
        result, timestamp = self.query_cache[query_hash]
        
        # Check if cache entry is still valid
        age_hours = (datetime.now() - timestamp).total_seconds() / 3600
        if age_hours < config.cache_ttl_hours:
            # Update access metadata
            result.metadata['cache_hit'] = True
            result.metadata['cache_age_hours'] = round(age_hours, 2)
            return result
        
        # Remove stale cache entry
        del self.query_cache[query_hash]
        logger.debug(f"Removed stale cache entry (age: {age_hours:.1f}h)")
        return None
    
    def _search_validated(self, 
                        query_embedding: List[float],
                        original_query: str,
                        top_k: int) -> List[RetrievalResult]:
        """Search validated answers collection"""
        
        try:
            results = self.vector_store.search_validated_answers(query_embedding, top_k)
            
            if not results['ids'] or not results['ids'][0]:
                return []
            
            retrieval_results = []
            for i in range(len(results['ids'][0])):
                metadata = results['metadatas'][0][i]
                
                # Calculate confidence (convert distance to similarity)
                confidence = 1.0 - results['distances'][0][i]
                
                # Boost confidence for exact query matches
                if metadata.get('original_query', '').lower() == original_query.lower():
                    confidence = min(1.0, confidence * 1.2)
                    logger.debug("Applied exact query match boost")
                
                # FIXED: Reconstruct validation_info from flat metadata
                validation_info = {
                    "approved_by": metadata.get('approved_by', 'unknown'),
                    "approved_at": metadata.get('approved_at', ''),
                    "feedback_received": metadata.get('feedback_received', '')
                }
                
                # FIXED: Parse source_chunks from JSON
                source_chunks = []
                try:
                    source_chunks_json = metadata.get('source_chunks_json', '[]')
                    source_chunks = json.loads(source_chunks_json) if source_chunks_json else []
                except (json.JSONDecodeError, TypeError):
                    source_chunks = []
                
                retrieval_results.append(RetrievalResult(
                    content=metadata.get('content', ''),
                    source='validated',
                    confidence=confidence,
                    metadata=metadata,
                    chunk_ids=source_chunks,
                    validation_info=validation_info
                ))
            
            # Update usage count for retrieved validated answers
            for result in retrieval_results:
                self._update_usage_count(result.metadata.get('id'))
            
            logger.debug(f"Found {len(retrieval_results)} validated answers")
            return retrieval_results
            
        except Exception as e:
            logger.error(f"Error searching validated answers: {e}")
            return []    
    def _search_rag(self, 
                   query_embedding: List[float],
                   top_k: int) -> List[RetrievalResult]:
        """Search document chunks collection"""
        
        try:
            results = self.vector_store.search_document_chunks(query_embedding, top_k)
            
            if not results['ids'] or not results['ids'][0]:
                return []
            
            retrieval_results = []
            for i in range(len(results['ids'][0])):
                metadata = results['metadatas'][0][i]
                
                # Calculate base confidence
                confidence = 1.0 - results['distances'][0][i]
                
                # Apply penalties/boosts based on chunk type
                chunk_type = metadata.get('chunk_type', 'text')
                if chunk_type == 'code':
                    confidence *= 0.9  # Slight penalty for pure code
                elif metadata.get('has_code') and chunk_type == 'mixed':
                    confidence *= 1.05  # Boost for explanatory code
                
                # Global penalty for non-validated content
                confidence *= 0.9
                
                retrieval_results.append(RetrievalResult(
                    content=metadata.get('content', ''),
                    source='rag',
                    confidence=confidence,
                    metadata=metadata,
                    chunk_ids=[results['ids'][0][i]]
                ))
            
            logger.debug(f"Found {len(retrieval_results)} RAG results")
            return retrieval_results
            
        except Exception as e:
            logger.error(f"Error searching RAG collection: {e}")
            return []
    
    def _merge_and_rerank(self,
                         validated: List[RetrievalResult],
                         rag: List[RetrievalResult],
                         query_embedding: List[float],
                         top_k: int) -> List[RetrievalResult]:
        """Merge validated and RAG results with intelligent re-ranking"""
        
        all_results = []
        seen_content_hashes = set()
        
        # Add validated results first (with boost)
        for result in validated:
            content_hash = self._hash_text(result.content[:200])
            if content_hash not in seen_content_hashes:
                result.confidence *= 1.15  # Boost validated answers
                all_results.append(result)
                seen_content_hashes.add(content_hash)
        
        # Add RAG results (check for duplicates)
        for result in rag:
            content_hash = self._hash_text(result.content[:200])
            if content_hash not in seen_content_hashes:
                all_results.append(result)
                seen_content_hashes.add(content_hash)
        
        # Sort by confidence
        all_results.sort(key=lambda x: x.confidence, reverse=True)
        
        # Apply diversity filter if we have many results
        final_results = all_results[:top_k]
        if len(all_results) > top_k:
            final_results = self._apply_diversity_filter(all_results, top_k)
        
        logger.debug(f"Merged and ranked {len(final_results)} results")
        return final_results
    
    def _apply_diversity_filter(self, 
                               results: List[RetrievalResult],
                               top_k: int,
                               similarity_threshold: float = 0.85) -> List[RetrievalResult]:
        """Ensure diversity in results by filtering similar content"""
        
        if not results:
            return []
        
        diverse_results = [results[0]]  # Always include top result
        
        for candidate in results[1:]:
            if len(diverse_results) >= top_k:
                break
            
            # Check similarity with already selected results
            is_diverse = True
            candidate_embedding = self._get_embedding(candidate.content[:200])
            
            for selected in diverse_results:
                selected_embedding = self._get_embedding(selected.content[:200])
                similarity = self._cosine_similarity(candidate_embedding, selected_embedding)
                
                if similarity > similarity_threshold:
                    is_diverse = False
                    break
            
            if is_diverse:
                diverse_results.append(candidate)
        
        logger.debug(f"Applied diversity filter: {len(results)} -> {len(diverse_results)}")
        return diverse_results
    
    def add_validated_answer(self,
                            query: str,
                            answer: str,
                            thread_id: str,
                            source_chunks: List[str],
                            feedback: Optional[str] = None):
        """Add a human-validated answer to the validated collection"""
        
        try:
            # Generate combined embedding (weighted average)
            query_embedding = self._get_embedding(query)
            answer_embedding = self._get_embedding(answer)
            
            # 30% query, 70% answer for better answer matching
            combined_embedding = [
                0.3 * q + 0.7 * a 
                for q, a in zip(query_embedding, answer_embedding)
            ]
            
            # Create FLAT metadata (ChromaDB requirement)
            validation_id = self._hash_text(f"{query}{answer}{thread_id}")
            metadata = {
                "id": validation_id,
                "content": answer,
                "original_query": query,
                "thread_id": thread_id,
                # FIXED: Flatten validator_info fields
                "approved_by": "thread_user",
                "approved_at": datetime.now().isoformat(),
                "feedback_received": feedback or "",
                "source_chunks_json": json.dumps(source_chunks),  # Serialize list as JSON string
                "confidence_score": 1.0,
                "validation_count": 1,
                "last_accessed": datetime.now().isoformat(),
                "usage_count": 0
            }
            
            # Add to collection
            self.vector_store.add_validated_answer(
                answer_id=validation_id,
                content=answer,
                metadata=metadata,
                embedding=combined_embedding
            )
            
            # Invalidate cache for this query
            query_hash = self._hash_text(query.lower().strip())
            if query_hash in self.query_cache:
                del self.query_cache[query_hash]
            
            logger.info(f"Added validated answer for query: {query[:50]}...")
            
        except Exception as e:
            logger.error(f"Error adding validated answer: {e}")  
          
    def _get_embedding(self, text: str) -> List[float]:
        """Get embedding with caching"""
        text_hash = self._hash_text(text)
        
        if text_hash in self.embedding_cache:
            return self.embedding_cache[text_hash]
        
        try:
            embedding = self.embedding_model.embed_query(text)
            self.embedding_cache[text_hash] = embedding
            
            # Limit cache size
            if len(self.embedding_cache) > config.max_embedding_cache:
                # Remove oldest 100 entries (simple FIFO)
                oldest_keys = list(self.embedding_cache.keys())[:100]
                for key in oldest_keys:
                    del self.embedding_cache[key]
                logger.debug("Cleaned embedding cache")
            
            return embedding
            
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            # Return zero vector as fallback
            return [0.0] * 1536  # text-embedding-3-small dimension
    
    def _update_cache(self, query: str, result: RetrievalResult):
        """Update query cache with result"""
        query_hash = self._hash_text(query.lower().strip())
        self.query_cache[query_hash] = (result, datetime.now())
        
        # Limit cache size
        if len(self.query_cache) > config.max_cache_size:
            # Remove oldest entries
            sorted_items = sorted(self.query_cache.items(), key=lambda x: x[1][1])
            for key, _ in sorted_items[:20]:
                del self.query_cache[key]
            logger.debug("Cleaned query cache")
    
    def _update_usage_count(self, validation_id: str):
        """Update usage count for validated answer"""
        if not validation_id:
            return
        
        try:
            # This would update the metadata in ChromaDB
            # For now, just log the usage
            logger.debug(f"Updated usage count for validation: {validation_id}")
        except Exception as e:
            logger.error(f"Error updating usage count: {e}")
    
    def _hash_text(self, text: str) -> str:
        """Generate hash for text"""
        return hashlib.md5(text.encode()).hexdigest()
    
    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between vectors"""
        try:
            vec1 = np.array(vec1)
            vec2 = np.array(vec2)
            return np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2))
        except Exception as e:
            logger.error(f"Error calculating cosine similarity: {e}")
            return 0.0
    
    def get_stats(self) -> Dict:
        """Get retrieval system statistics"""
        vector_stats = self.vector_store.get_collection_stats()
        
        return {
            **vector_stats,
            "query_cache_size": len(self.query_cache),
            "embedding_cache_size": len(self.embedding_cache)
        }

# Singleton instance
_dual_retriever = None

def get_dual_retriever() -> DualRetrievalSystem:
    """Get or create singleton dual retriever instance"""
    global _dual_retriever
    if _dual_retriever is None:
        _dual_retriever = DualRetrievalSystem()
    return _dual_retriever