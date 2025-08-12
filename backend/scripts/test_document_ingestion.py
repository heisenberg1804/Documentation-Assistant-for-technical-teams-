#!/usr/bin/env python3
"""
Test script for Day 1 - Document ingestion and basic RAG functionality
Run this to verify your RAG pipeline is working correctly.
"""

import os
import sys
import requests

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.rag import get_rag_pipeline
from app.config import config

def download_sample_docs():
    """Download sample documentation for testing"""
    
    sample_docs = [
        {
            "url": "https://raw.githubusercontent.com/tiangolo/fastapi/master/docs/en/docs/tutorial/first-steps.md",
            "filename": "fastapi_first_steps.md"
        },
        {
            "url": "https://raw.githubusercontent.com/tiangolo/fastapi/master/docs/en/docs/tutorial/path-params.md", 
            "filename": "fastapi_path_params.md"
        },
        {
            "url": "https://raw.githubusercontent.com/langchain-ai/langchain/master/docs/docs/get_started/quickstart.mdx",
            "filename": "langchain_quickstart.md"
        }
    ]
    
    docs_dir = "test_docs"
    os.makedirs(docs_dir, exist_ok=True)
    
    downloaded = []
    for doc in sample_docs:
        filepath = os.path.join(docs_dir, doc["filename"])
        
        if os.path.exists(filepath):
            print(f"✓ {doc['filename']} already exists")
            with open(filepath, 'r', encoding='utf-8') as f:
                downloaded.append((doc["filename"], f.read()))
            continue
        
        try:
            print(f"Downloading {doc['filename']}...")
            response = requests.get(doc["url"], timeout=10)
            response.raise_for_status()
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(response.text)
            
            downloaded.append((doc["filename"], response.text))
            print(f"✓ Downloaded {doc['filename']}")
            
        except Exception as e:
            print(f"✗ Failed to download {doc['filename']}: {e}")
    
    return downloaded

def test_document_processing():
    """Test document processing and chunking"""
    
    print("\n" + "="*50)
    print("TESTING DOCUMENT PROCESSING")
    print("="*50)
    
    # Get RAG pipeline
    rag = get_rag_pipeline()
    
    # Download sample docs
    documents = download_sample_docs()
    
    if not documents:
        print("No documents to process!")
        return False
    
    total_chunks = 0
    
    for filename, content in documents:
        print(f"\nProcessing {filename}...")
        
        try:
            chunks_added = rag.add_document(content, filename, 'markdown')
            total_chunks += chunks_added
            print(f"✓ Added {chunks_added} chunks from {filename}")
        except Exception as e:
            print(f"✗ Error processing {filename}: {e}")
            return False
    
    print(f"\n✓ Total chunks processed: {total_chunks}")
    return total_chunks > 0

def test_basic_retrieval():
    """Test basic RAG retrieval"""
    
    print("\n" + "="*50) 
    print("TESTING BASIC RETRIEVAL")
    print("="*50)
    
    rag = get_rag_pipeline()
    
    test_queries = [
        "How do I create a FastAPI application?",
        "What are path parameters?",
        "How to get started with LangChain?",
        "How do I install dependencies?"
    ]
    
    for query in test_queries:
        print(f"\nQuery: {query}")
        print("-" * 40)
        
        try:
            results = rag.retrieve(query, top_k=3)
            
            if results:
                for i, result in enumerate(results, 1):
                    print(f"{i}. Confidence: {result.confidence:.3f}")
                    print(f"   Source: {result.metadata.get('source_file', 'Unknown')}")
                    print(f"   Section: {result.metadata.get('section', 'Unknown')}")
                    print(f"   Preview: {result.content[:100]}...")
                    print()
            else:
                print("   No results found")
                
        except Exception as e:
            print(f"   ✗ Error: {e}")
            return False
    
    return True

def test_pipeline_stats():
    """Test pipeline statistics"""
    
    print("\n" + "="*50)
    print("PIPELINE STATISTICS") 
    print("="*50)
    
    rag = get_rag_pipeline()
    stats = rag.get_stats()
    
    for key, value in stats.items():
        print(f"{key}: {value}")
    
    return stats.get('document_chunks_count', 0) > 0

def main():
    """Run all tests"""
    
    print("RAG Pipeline Day 1 Testing")
    print("=" * 60)
    print(f"ChromaDB directory: {config.chroma_persist_dir}")
    print(f"Chunk size: {config.chunk_size} tokens")
    print(f"Embedding model: {config.embedding_model}")
    print()
    
    try:
        # Test document processing
        if not test_document_processing():
            print("\n❌ Document processing test FAILED")
            return False
        
        # Test basic retrieval
        if not test_basic_retrieval():
            print("\n❌ Basic retrieval test FAILED") 
            return False
        
        # Show stats
        test_pipeline_stats()
        
        print("\n" + "="*60)
        print("✅ All Day 1 tests PASSED!")
        print("✅ RAG pipeline is working correctly")
        print("\nNext steps:")
        print("- Proceed to Day 2: Graph integration")
        print("- Add more documents to test with")
        print("- Monitor performance with larger datasets")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)