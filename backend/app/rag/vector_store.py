import chromadb
from chromadb.config import Settings
from typing import List, Dict, Optional
import os
import logging
from app.config import config
from app.logging_config import get_logger

class VectorStore:
    """ChromaDB vector store manager"""
    
    def __init__(self, persist_directory: str = None):
        self.logger = get_logger("app.rag.vector_store")
        self.persist_directory = persist_directory or config.chroma_persist_dir
        
        # Ensure directory exists
        os.makedirs(self.persist_directory, exist_ok=True)
        self.logger.debug(f"Ensuring vector store directory exists: {self.persist_directory}")
        
        # Initialize ChromaDB client
        self.logger.info("Initializing ChromaDB client")
        self.client = chromadb.PersistentClient(
            path=self.persist_directory,
            settings=Settings(
                anonymized_telemetry=False
            )
        )
        self.logger.info("ChromaDB client initialized successfully")
        
        # Collections
        self._document_chunks = None
        self._validated_answers = None
    
    @property
    def document_chunks(self):
        """Get or create document chunks collection"""
        if self._document_chunks is None:
            logger = logging.getLogger("app.rag.vector_store")
            try:
                logger.debug("Attempting to get existing document_chunks collection")
                self._document_chunks = self.client.get_collection("document_chunks")
                logger.info("Retrieved existing document_chunks collection")
            except Exception as e:
                logger.info("Creating new document_chunks collection")
                self._document_chunks = self.client.create_collection(
                    name="document_chunks",
                    metadata={"hnsw:space": "cosine"},
                    embedding_function=None  # We'll provide embeddings manually
                )
                logger.info("Created new document_chunks collection")
        return self._document_chunks
    
    @property
    def validated_answers(self):
        """Get or create validated answers collection"""
        if self._validated_answers is None:
            try:
                self.logger.debug("Attempting to get existing validated_answers collection")
                self._validated_answers = self.client.get_collection("validated_answers")
                self.logger.info("Retrieved existing validated_answers collection")
            except Exception as e:
                self.logger.info("Creating new validated_answers collection")
                self._validated_answers = self.client.create_collection(
                    name="validated_answers",
                    metadata={"hnsw:space": "cosine"},
                    embedding_function=None
                )
                self.logger.info("Created new validated_answers collection")
        return self._validated_answers
    
    def add_document_chunks(self, 
                           chunks: List[Dict],
                           embeddings: List[List[float]]):
        """Add document chunks to vector store"""
        self.logger.info(f"Adding {len(chunks)} document chunks to vector store")
        
        if len(chunks) != len(embeddings):
            self.logger.error(f"Mismatch: {len(chunks)} chunks but {len(embeddings)} embeddings")
            raise ValueError("Number of chunks must match number of embeddings")
        
        try:
            ids = [chunk["id"] for chunk in chunks]
            documents = [chunk["content"] for chunk in chunks]
            metadatas = [chunk["metadata"] for chunk in chunks]
            
            # Add to collection in batches to avoid memory issues
            batch_size = 100
            total_added = 0
            
            for i in range(0, len(chunks), batch_size):
                batch_ids = ids[i:i + batch_size]
                batch_docs = documents[i:i + batch_size]
                batch_meta = metadatas[i:i + batch_size]
                batch_emb = embeddings[i:i + batch_size]
                
                self.logger.debug(f"Adding batch of {len(batch_ids)} chunks (total so far: {total_added})")
                self.document_chunks.add(
                    ids=batch_ids,
                    documents=batch_docs,
                    metadatas=batch_meta,
                    embeddings=batch_emb
                )
                total_added += len(batch_ids)
            
            self.logger.info(f"Successfully added {total_added} document chunks")
            
            # Verify addition
            current_count = self.document_chunks.count()
            self.logger.info(f"Current document chunks count: {current_count}")
            
        except Exception as e:
            self.logger.error(f"Error adding document chunks: {e}")
            raise
    
    def add_validated_answer(self,
                           answer_id: str,
                           content: str,
                           metadata: Dict,
                           embedding: List[float]):
        """Add validated answer to vector store"""
        
        self.validated_answers.add(
            ids=[answer_id],
            documents=[content],
            metadatas=[metadata],
            embeddings=[embedding]
        )
    
    def search_document_chunks(self,
                              query_embedding: List[float],
                              top_k: int = 5,
                              where: Optional[Dict] = None) -> Dict:
        """Search document chunks"""
        
        return self.document_chunks.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where,
            include=["documents", "metadatas", "distances"]
        )
    
    def search_validated_answers(self,
                               query_embedding: List[float],
                               top_k: int = 3) -> Dict:
        """Search validated answers"""
        
        return self.validated_answers.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            include=["documents", "metadatas", "distances"]
        )
    
    def get_collection_stats(self) -> Dict:
        """Get statistics about collections"""
        try:
            doc_count = self.document_chunks.count()
            val_count = self.validated_answers.count()
            self.logger.info(f"Collection stats - Documents: {doc_count}, Validated Answers: {val_count}")
            
            # Additional debug info
            if doc_count == 0:
                try:
                    all_collections = self.client.list_collections()
                    self.logger.debug(f"Available collections: {[c.name for c in all_collections]}")
                    if self._document_chunks:
                        peek = self.document_chunks.peek()
                        self.logger.debug(f"Document chunks peek: {peek}")
                except Exception as e:
                    self.logger.error(f"Error getting debug info: {e}")
            
            return {
                "document_chunks_count": doc_count,
                "validated_answers_count": val_count
            }
        except Exception as e:
            self.logger.error(f"Error getting collection stats: {e}")
            return {
                "document_chunks_count": 0,
                "validated_answers_count": 0,
                "error": str(e)
            }
    
    def delete_collection(self, name: str):
        """Delete a collection (for testing/reset)"""
        try:
            self.client.delete_collection(name)
            if name == "document_chunks":
                self._document_chunks = None
            elif name == "validated_answers":
                self._validated_answers = None
        except Exception as e:
            print(f"Error deleting collection {name}: {e}")
    
    def reset_collections(self):
        """Reset all collections (for testing)"""
        self.delete_collection("document_chunks")
        self.delete_collection("validated_answers")

# Singleton instance
_vector_store = None

def get_vector_store() -> VectorStore:
    """Get singleton vector store instance"""
    global _vector_store
    if _vector_store is None:
        _vector_store = VectorStore()
    return _vector_store