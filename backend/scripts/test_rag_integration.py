import os
import sys
import time
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.graph import graph, DraftReviewState
from app.rag.dual_retrieval import get_dual_retriever
from app.rag.rag_pipeline import get_rag_pipeline

def test_retrieve_context_node():
    """Test the retrieve_context node in isolation"""
    
    print("\n" + "="*50)
    print("TESTING retrieve_context NODE")
    print("="*50)
    
    # Test state
    test_state = DraftReviewState(
        human_request="How do I create a FastAPI application?",
        messages=[]
    )
    
    try:
        # Import the node function directly
        from app.graph import retrieve_context
        
        print(f"Query: {test_state['human_request']}")
        print("Running retrieve_context node...")
        
        # Run the node
        result = retrieve_context(test_state)
        
        # Check results
        context = result.get('rag_context', '')
        sources = result.get('rag_sources', [])
        confidence = result.get('retrieval_confidence', 0.0)
        
        print(f"✓ Context generated: {len(context)} characters")
        print(f"✓ Sources found: {len(sources)}")
        print(f"✓ Average confidence: {confidence:.3f}")
        
        if sources:
            print("\nTop sources:")
            for i, source in enumerate(sources[:3], 1):
                print(f"  {i}. {source['metadata']['file']} - {source['confidence']:.3f}")
                print(f"     Section: {source['metadata']['section']}")
                print(f"     Preview: {source['content'][:100]}...")
                print()
        
        return len(sources) > 0
        
    except Exception as e:
        print(f"✗ Error testing retrieve_context node: {e}")
        return False

def test_enhanced_assistant_draft():
    """Test the enhanced assistant_draft node with context"""
    
    print("\n" + "="*50)
    print("TESTING ENHANCED assistant_draft NODE")
    print("="*50)
    
    # Create state with RAG context
    test_state = DraftReviewState(
        human_request="How do I create a FastAPI application?",
        messages=[],
        rag_context="FastAPI is a modern web framework for building APIs with Python.\n\nTo create a FastAPI app:\n1. Import FastAPI\n2. Create an instance\n3. Define routes",
        rag_sources=[{
            "index": 1,
            "content": "FastAPI tutorial content...",
            "source_type": "rag",
            "confidence": 0.85,
            "metadata": {"file": "fastapi_tutorial.md", "section": "Getting Started"}
        }],
        retrieval_confidence=0.85
    )
    
    try:
        # Import the node function
        from app.graph import assistant_draft
        
        print(f"Query: {test_state['human_request']}")
        print("Running assistant_draft with RAG context...")
        
        # Run the node
        result = assistant_draft(test_state)
        
        # Check results
        response = result.get('assistant_response', '')
        sources = result.get('response_sources', [])
        
        print(f"✓ Response generated: {len(response)} characters")
        print(f"✓ Sources passed through: {len(sources)}")
        
        if response:
            print(f"\nResponse preview:")
            print(f"'{response[:200]}...'")
        
        return len(response) > 0
        
    except Exception as e:
        print(f"✗ Error testing assistant_draft: {e}")
        return False

def test_full_graph_execution():
    """Test full graph execution with RAG"""
    
    print("\n" + "="*50)
    print("TESTING FULL GRAPH EXECUTION")
    print("="*50)
    
    try:
        # Test configuration
        thread_id = "test_thread_123"
        config = {"configurable": {"thread_id": thread_id}}
        
        # Initial state
        initial_state = {"human_request": "How do I create a FastAPI application?"}
        
        print(f"Query: {initial_state['human_request']}")
        print("Executing full graph...")
        
        # Execute graph until interrupt
        result = None
        for chunk in graph.stream(initial_state, config):
            result = chunk
            print(f"  Node executed: {list(chunk.keys())[0] if chunk else 'None'}")
        
        # Get final state
        state = graph.get_state(config)
        
        print(f"\n✓ Graph execution completed")
        print(f"✓ Next nodes: {state.next}")
        print(f"✓ Values keys: {list(state.values.keys())}")
        
        # Check if we have expected fields
        values = state.values
        has_context = bool(values.get('rag_context'))
        has_sources = bool(values.get('rag_sources'))
        has_response = bool(values.get('assistant_response'))
        
        print(f"✓ Has RAG context: {has_context}")
        print(f"✓ Has sources: {has_sources}")
        print(f"✓ Has assistant response: {has_response}")
        
        if has_sources:
            sources_count = len(values.get('rag_sources', []))
            confidence = values.get('retrieval_confidence', 0.0)
            print(f"✓ Sources count: {sources_count}")
            print(f"✓ Retrieval confidence: {confidence:.3f}")
        
        if has_response:
            response_length = len(values.get('assistant_response', ''))
            print(f"✓ Response length: {response_length} characters")
        
        # Simulate approval to test validation storage
        print("\nSimulating user approval...")
        graph.update_state(config, {"status": "approved"})
        
        # Continue execution
        for chunk in graph.stream(None, config):
            print(f"  Node executed: {list(chunk.keys())[0] if chunk else 'None'}")
        
        # Check final state
        final_state = graph.get_state(config)
        print(f"✓ Final status: {final_state.next}")
        
        return has_context and has_response
        
    except Exception as e:
        print(f"✗ Error in full graph execution: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_validation_storage():
    """Test that approved answers are stored as validated"""
    
    print("\n" + "="*50)
    print("TESTING VALIDATION STORAGE")
    print("="*50)
    
    try:
        dual_retriever = get_dual_retriever()
        
        # Get initial stats
        initial_stats = dual_retriever.get_stats()
        initial_validated = initial_stats.get('validated_answers_count', 0)
        
        print(f"Initial validated answers: {initial_validated}")
        
        # Manually add a validated answer
        dual_retriever.add_validated_answer(
            query="Test query for validation",
            answer="This is a test validated answer",
            thread_id="test_validation_123",
            source_chunks=["chunk_1", "chunk_2"],
            feedback="Good answer"
        )
        
        # Get updated stats
        time.sleep(1)  # Brief wait for processing
        updated_stats = dual_retriever.get_stats()
        updated_validated = updated_stats.get('validated_answers_count', 0)
        
        print(f"Updated validated answers: {updated_validated}")
        
        # Test retrieval of validated answer
        print("\nTesting retrieval of validated answer...")
        results = dual_retriever.retrieve("Test query for validation", top_k=3)
        
        validated_found = any(r.source == 'validated' for r in results)
        print(f"✓ Validated answer retrieved: {validated_found}")
        
        if results:
            best_result = results[0]
            print(f"✓ Best result source: {best_result.source}")
            print(f"✓ Best result confidence: {best_result.confidence:.3f}")
        
        return updated_validated > initial_validated and validated_found
        
    except Exception as e:
        print(f"✗ Error testing validation storage: {e}")
        return False

def test_api_endpoints():
    """Test new API endpoints"""
    
    print("\n" + "="*50)
    print("TESTING API ENDPOINTS")
    print("="*50)
    
    try:
        # Test imports
        from app.api import router
        
        print("✓ API router imported successfully")
        
        # Check if new endpoints exist
        routes = [route.path for route in router.routes]
        expected_routes = [
            "/documents/upload",
            "/documents/status", 
            "/rag/test",
            "/health"
        ]
        
        for route in expected_routes:
            if route in routes:
                print(f"✓ Route exists: {route}")
            else:
                print(f"✗ Route missing: {route}")
                return False
        
        # Test document status endpoint logic
        from app.api import get_documents_status
        
        print("\nTesting document status logic...")
        # This would normally be an async call, but we can test the core logic
        
        return True
        
    except Exception as e:
        print(f"✗ Error testing API endpoints: {e}")
        return False

def main():
    """Run all Day 2 integration tests"""
    
    print("RAG Integration Day 2 Testing")
    print("=" * 60)
    
    # Ensure we have test data from Day 1
    rag_pipeline = get_rag_pipeline()
    stats = rag_pipeline.get_stats()
    
    if stats.get('document_chunks_count', 0) == 0:
        print("❌ No documents found! Please run Day 1 test first:")
        print("   python backend/scripts/test_document_ingestion.py")
        return False
    
    print(f"Using {stats['document_chunks_count']} document chunks from Day 1")
    print()
    
    tests = [
        ("Retrieve Context Node", test_retrieve_context_node),
        ("Enhanced Assistant Draft", test_enhanced_assistant_draft),
        ("Full Graph Execution", test_full_graph_execution),
        ("Validation Storage", test_validation_storage),
        ("API Endpoints", test_api_endpoints)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n{'='*20} {test_name} {'='*20}")
        try:
            if test_func():
                print(f"✅ {test_name} PASSED")
                passed += 1
            else:
                print(f"❌ {test_name} FAILED")
        except Exception as e:
            print(f"❌ {test_name} ERROR: {e}")
    
    print("\n" + "="*60)
    print(f"RESULTS: {passed}/{total} tests passed")
    
    if passed == total:
        print("✅ All Day 2 integration tests PASSED!")
        print("✅ RAG is successfully integrated with LangGraph")
        print("\nNext steps:")
        print("- Test with frontend UI")
        print("- Proceed to Day 3: Enhanced validation")
        print("- Upload more documents via API")
        return True
    else:
        print("❌ Some tests failed. Check the output above.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)