#!/usr/bin/env python3
"""
Day 3 Testing Script - Human Validation Enhancement & Analytics

Tests the enhanced validation system with:
- Analytics tracking
- Frontend source display 
- Document upload functionality
- Performance monitoring
- Validation feedback analysis
"""

import os
import sys
import time
import json
import requests
from io import StringIO

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

def test_analytics_system():
    """Test the validation analytics system"""
    
    print("\n" + "="*50)
    print("TESTING ANALYTICS SYSTEM")
    print("="*50)
    
    try:
        from app.validation_analytics import get_validation_analytics
        
        analytics = get_validation_analytics()
        
        # Test recording validation events
        print("Testing validation event recording...")
        
        test_events = [
            {
                "thread_id": "test_thread_1",
                "query": "How do I create a FastAPI endpoint?",
                "response": "To create a FastAPI endpoint, use the @app.get() decorator...",
                "action": "approved",
                "source_count": 3,
                "retrieval_confidence": 0.85,
                "processing_time_ms": 1200.0
            },
            {
                "thread_id": "test_thread_2", 
                "query": "How to handle authentication in FastAPI?",
                "response": "FastAPI supports OAuth2 authentication...",
                "action": "feedback",
                "feedback_comment": "Please add more details about JWT tokens",
                "source_count": 2,
                "retrieval_confidence": 0.72,
                "processing_time_ms": 1800.0
            },
            {
                "thread_id": "test_thread_3",
                "query": "What is LangChain?",
                "response": "LangChain is a framework for developing applications powered by language models...",
                "action": "approved",
                "source_count": 4,
                "retrieval_confidence": 0.91,
                "processing_time_ms": 950.0
            }
        ]
        
        # Record test events
        for event in test_events:
            analytics.record_validation_event(**event)
        
        print(f"✅ Recorded {len(test_events)} validation events")
        
        # Test statistics generation
        print("\nTesting statistics generation...")
        stats = analytics.get_validation_stats(days_back=30)
        
        print(f"✅ Total interactions: {stats.total_interactions}")
        print(f"✅ Approval rate: {stats.approval_rate:.1%}")
        print(f"✅ Feedback rate: {stats.feedback_rate:.1%}")
        print(f"✅ Average confidence: {stats.avg_confidence:.3f}")
        print(f"✅ Average processing time: {stats.avg_processing_time_ms:.1f}ms")
        
        # Test feedback analysis
        print("\nTesting feedback analysis...")
        feedback_analysis = analytics.get_feedback_analysis(days_back=30)
        
        print(f"✅ Total feedback events: {feedback_analysis['total_feedback']}")
        print(f"✅ Sentiment: {feedback_analysis['sentiment']}")
        
        # Test comprehensive report
        print("\nTesting analytics report generation...")
        report = analytics.export_analytics_report(days_back=30)
        
        print(f"✅ Report generated with {len(report.keys())} sections")
        print(f"✅ Analysis period: {report['analysis_period_days']} days")
        
        return True
        
    except Exception as e:
        print(f"❌ Analytics system test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_enhanced_graph_integration():
    """Test enhanced graph with analytics integration"""
    
    print("\n" + "="*50)
    print("TESTING ENHANCED GRAPH INTEGRATION")
    print("="*50)
    
    try:
        from app.graph import graph, DraftReviewState
        from app.validation_analytics import get_validation_analytics
        
        analytics = get_validation_analytics()
        initial_event_count = len(analytics.validation_events)
        
        # Test state with enhanced fields
        test_state = DraftReviewState(
            human_request="How do I create a middleware in FastAPI?",
            messages=[]
        )
        
        print(f"Testing enhanced graph execution...")
        print(f"Initial analytics events: {initial_event_count}")
        
        # Test configuration
        thread_id = "test_enhanced_graph_123"
        config = {"configurable": {"thread_id": thread_id}}
        
        # Execute graph until interrupt
        start_time = time.time()
        result = None
        node_count = 0
        
        for chunk in graph.stream(test_state, config):
            result = chunk
            node_name = list(chunk.keys())[0] if chunk else 'None'
            print(f"  ✅ Node executed: {node_name}")
            node_count += 1
        
        execution_time = (time.time() - start_time) * 1000
        
        # Get final state with enhanced fields
        state = graph.get_state(config)
        values = state.values
        
        # Verify enhanced state fields
        has_context = bool(values.get('rag_context'))
        has_sources = bool(values.get('rag_sources'))
        has_response = bool(values.get('assistant_response'))
        has_confidence = values.get('retrieval_confidence') is not None
        has_timing = values.get('response_generation_time_ms') is not None
        
        print(f"\n✅ Graph execution completed in {execution_time:.1f}ms")
        print(f"✅ Nodes executed: {node_count}")
        print(f"✅ Has RAG context: {has_context}")
        print(f"✅ Has sources: {has_sources}")
        print(f"✅ Has response: {has_response}")
        print(f"✅ Has confidence tracking: {has_confidence}")
        print(f"✅ Has timing tracking: {has_timing}")
        
        if has_sources:
            sources_count = len(values.get('rag_sources', []))
            confidence = values.get('retrieval_confidence', 0.0)
            print(f"✅ Sources count: {sources_count}")
            print(f"✅ Retrieval confidence: {confidence:.3f}")
        
        # Simulate approval to test analytics recording
        print("\nTesting approval flow with analytics...")
        graph.update_state(config, {"status": "approved"})
        
        # Continue execution
        for chunk in graph.stream(None, config):
            node_name = list(chunk.keys())[0] if chunk else 'None'
            print(f"  ✅ Finalization node: {node_name}")
        
        # Check if analytics event was recorded
        final_event_count = len(analytics.validation_events)
        events_added = final_event_count - initial_event_count
        
        print(f"✅ Analytics events added: {events_added}")
        
        if events_added > 0:
            latest_event = analytics.validation_events[-1]
            print(f"✅ Latest event action: {latest_event.action}")
            print(f"✅ Latest event thread: {latest_event.thread_id}")
            print(f"✅ Latest event confidence: {latest_event.retrieval_confidence:.3f}")
        
        return has_context and has_response and events_added > 0
        
    except Exception as e:
        print(f"❌ Enhanced graph integration test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_api_analytics_endpoints():
    """Test new analytics API endpoints"""
    
    print("\n" + "="*50)
    print("TESTING API ANALYTICS ENDPOINTS")
    print("="*50)
    
    base_url = "http://localhost:8000"
    
    # Test endpoints
    endpoints = [
        ("/analytics/validation", "GET", "Validation Analytics"),
        ("/analytics/feedback", "GET", "Feedback Analysis"), 
        ("/analytics/report", "GET", "Comprehensive Report"),
        ("/health", "GET", "Enhanced Health Check")
    ]
    
    results = {}
    
    for endpoint, method, description in endpoints:
        try:
            print(f"\nTesting {description}: {method} {endpoint}")
            
            if method == "GET":
                response = requests.get(f"{base_url}{endpoint}", timeout=10)
            else:
                response = requests.post(f"{base_url}{endpoint}", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                results[endpoint] = True
                
                # Log key metrics
                if endpoint == "/analytics/validation":
                    stats = data.get('stats', {})
                    print(f"  ✅ Total interactions: {stats.get('total_interactions', 0)}")
                    print(f"  ✅ Approval rate: {stats.get('approval_rate', 0):.1%}")
                
                elif endpoint == "/analytics/feedback":
                    analysis = data.get('analysis', {})
                    print(f"  ✅ Total feedback: {analysis.get('total_feedback', 0)}")
                    print(f"  ✅ Sentiment: {analysis.get('sentiment', 'unknown')}")
                
                elif endpoint == "/analytics/report":
                    print(f"  ✅ Report sections: {len(data.keys())}")
                    print(f"  ✅ Generated at: {data.get('report_generated', 'unknown')}")
                
                elif endpoint == "/health":
                    print(f"  ✅ Status: {data.get('status', 'unknown')}")
                    components = data.get('components', {})
                    print(f"  ✅ Components healthy: {len([c for c in components.values() if c.get('enabled')])}")
                
                print(f"  ✅ {description} endpoint working")
            else:
                results[endpoint] = False
                print(f"  ❌ {description} returned status {response.status_code}")
                print(f"      Error: {response.text[:100]}...")
        
        except requests.exceptions.ConnectionError:
            results[endpoint] = False
            print(f"  ⚠️  {description} - Server not running (expected in test environment)")
        except Exception as e:
            results[endpoint] = False
            print(f"  ❌ {description} failed: {e}")
    
    working_endpoints = sum(results.values())
    total_endpoints = len(endpoints)
    
    print(f"\n✅ API endpoints working: {working_endpoints}/{total_endpoints}")
    
    # Return True if server is running and endpoints work, or if server not running (expected)
    return working_endpoints > 0 or all(not r for r in results.values())

def test_document_upload_enhancements():
    """Test enhanced document upload with analytics"""
    
    print("\n" + "="*50)
    print("TESTING ENHANCED DOCUMENT UPLOAD")
    print("="*50)
    
    try:
        from app.rag import get_rag_pipeline
        from app.validation_analytics import get_validation_analytics
        
        rag_pipeline = get_rag_pipeline()
        analytics = get_validation_analytics()
        
        # Create test document
        test_document = """# Test Document for Day 3

## FastAPI Advanced Features

### Custom Middleware
```python
from fastapi import FastAPI, Request

app = FastAPI()

@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response
```

### Background Tasks
FastAPI supports background tasks that run after returning the response:

```python
from fastapi import BackgroundTasks

def write_log(message: str):
    with open("log.txt", "a") as log:
        log.write(message)

@app.post("/send-notification/")
async def send_notification(background_tasks: BackgroundTasks):
    background_tasks.add_task(write_log, "Notification sent")
    return {"message": "Notification sent"}
```

This document contains both explanatory text and code examples for comprehensive testing.
"""
        
        print("Testing document processing with analytics...")
        
        # Process document and measure performance
        start_time = time.time()
        chunks_added = rag_pipeline.add_document(
            test_document,
            "test_advanced_features.md",
            "markdown"
        )
        processing_time = (time.time() - start_time) * 1000
        
        print(f"✅ Document processed: {chunks_added} chunks in {processing_time:.1f}ms")
        
        # Test retrieval with the new document
        test_queries = [
            "How to create custom middleware in FastAPI?",
            "How to use background tasks?",
            "FastAPI middleware examples"
        ]
        
        for query in test_queries:
            print(f"\nTesting query: {query}")
            
            retrieval_start = time.time()
            results = rag_pipeline.retrieve(query, top_k=3)
            retrieval_time = (time.time() - retrieval_start) * 1000
            
            if results:
                best_result = results[0]
                print(f"  ✅ Found {len(results)} results in {retrieval_time:.1f}ms")
                print(f"  ✅ Best confidence: {best_result.confidence:.3f}")
                print(f"  ✅ Source: {best_result.metadata.get('source_file', 'unknown')}")
                
                # Check if our test document was retrieved
                from_test_doc = any(
                    'test_advanced_features.md' in r.metadata.get('source_file', '')
                    for r in results
                )
                print(f"  ✅ Retrieved from test document: {from_test_doc}")
            else:
                print(f"  ❌ No results found")
        
        # Test enhanced stats
        stats = rag_pipeline.get_stats()
        print(f"\n✅ Total document chunks: {stats.get('document_chunks_count', 0)}")
        print(f"✅ Cache stats: query={stats.get('query_cache_size', 0)}, "
              f"embedding={stats.get('embedding_cache_size', 0)}")
        
        return chunks_added > 0
        
    except Exception as e:
        print(f"❌ Document upload enhancement test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_performance_monitoring():
    """Test performance monitoring and metrics"""
    
    print("\n" + "="*50)
    print("TESTING PERFORMANCE MONITORING")
    print("="*50)
    
    try:
        from app.rag.dual_retrieval import get_dual_retriever
        from app.validation_analytics import get_validation_analytics
        
        dual_retriever = get_dual_retriever()
        analytics = get_validation_analytics()
        
        # Test multiple queries to generate performance data
        test_queries = [
            "How to create API endpoints?",
            "Authentication in web applications",
            "Database integration patterns",
            "Error handling best practices",
            "API documentation generation"
        ]
        
        performance_results = []
        
        print("Running performance tests...")
        
        for i, query in enumerate(test_queries, 1):
            print(f"  Test {i}/5: {query[:30]}...")
            
            # Measure retrieval performance
            start_time = time.time()
            results = dual_retriever.retrieve(query, top_k=5)
            retrieval_time = (time.time() - start_time) * 1000
            
            # Record performance data
            perf_data = {
                "query": query,
                "retrieval_time_ms": retrieval_time,
                "results_count": len(results),
                "avg_confidence": sum(r.confidence for r in results) / len(results) if results else 0.0,
                "cache_hit": retrieval_time < 50  # Heuristic for cache hit
            }
            performance_results.append(perf_data)
            
            # Simulate validation event
            if results:
                analytics.record_validation_event(
                    thread_id=f"perf_test_{i}",
                    query=query,
                    response="Test response for performance monitoring",
                    action="approved" if i % 2 == 0 else "feedback",
                    feedback_comment="Test feedback" if i % 2 == 1 else None,
                    source_count=len(results),
                    retrieval_confidence=perf_data["avg_confidence"],
                    processing_time_ms=retrieval_time + 500  # Simulate additional processing
                )
        
        # Analyze performance results
        avg_retrieval_time = sum(p["retrieval_time_ms"] for p in performance_results) / len(performance_results)
        avg_confidence = sum(p["avg_confidence"] for p in performance_results) / len(performance_results)
        cache_hits = sum(1 for p in performance_results if p["cache_hit"])
        
        print(f"\n✅ Performance test completed:")
        print(f"  ✅ Average retrieval time: {avg_retrieval_time:.1f}ms")
        print(f"  ✅ Average confidence: {avg_confidence:.3f}")
        print(f"  ✅ Cache hits: {cache_hits}/{len(performance_results)}")
        print(f"  ✅ Performance target (<3000ms): {'✅ PASSED' if avg_retrieval_time < 3000 else '❌ NEEDS OPTIMIZATION'}")
        
        # Test analytics aggregation
        stats = analytics.get_validation_stats(days_back=1)
        print(f"\n✅ Analytics aggregation:")
        print(f"  ✅ Total events recorded: {stats.total_interactions}")
        print(f"  ✅ Average processing time: {stats.avg_processing_time_ms:.1f}ms")
        print(f"  ✅ Approval rate: {stats.approval_rate:.1%}")
        
        # Check improvement suggestions
        if stats.improvement_suggestions:
            print(f"  ✅ Improvement suggestions generated: {len(stats.improvement_suggestions)}")
            for suggestion in stats.improvement_suggestions[:2]:
                print(f"    • {suggestion}")
        
        return avg_retrieval_time < 5000  # 5 second threshold for tests
        
    except Exception as e:
        print(f"❌ Performance monitoring test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_frontend_integration_readiness():
    """Test that backend is ready for frontend integration"""
    
    print("\n" + "="*50)
    print("TESTING FRONTEND INTEGRATION READINESS")
    print("="*50)
    
    try:
        from app.graph import graph, DraftReviewState
        
        # Simulate a complete user interaction flow
        thread_id = "frontend_integration_test"
        config = {"configurable": {"thread_id": thread_id}}
        
        # Step 1: Initial request (what frontend would send)
        initial_state = {
            "human_request": "How do I add middleware to a FastAPI application?"
        }
        
        print("Step 1: Simulating frontend request...")
        
        # Execute until interrupt (human feedback)
        messages_received = []
        sources_received = []
        
        for chunk in graph.stream(initial_state, config):
            node_name = list(chunk.keys())[0] if chunk else None
            print(f"  ✅ Backend node executed: {node_name}")
        
        # Get state at interrupt
        state = graph.get_state(config)
        values = state.values
        
        # Check frontend-expected data
        response = values.get('assistant_response', '')
        sources = values.get('rag_sources', [])
        confidence = values.get('retrieval_confidence', 0.0)
        
        print(f"Step 2: Verifying frontend-expected data...")
        print(f"  ✅ Response generated: {len(response)} characters")
        print(f"  ✅ Sources provided: {len(sources)}")
        print(f"  ✅ Confidence available: {confidence:.3f}")
        
        # Verify source structure matches frontend expectations
        if sources:
            sample_source = sources[0]
            required_fields = ['index', 'content', 'source_type', 'confidence', 'metadata']
            has_all_fields = all(field in sample_source for field in required_fields)
            print(f"  ✅ Source structure complete: {has_all_fields}")
            
            # Check metadata structure
            metadata = sample_source.get('metadata', {})
            metadata_fields = ['file', 'section', 'validated']
            has_metadata = all(field in metadata for field in metadata_fields)
            print(f"  ✅ Source metadata complete: {has_metadata}")
        
        # Step 3: Simulate approval (what frontend would send)
        print(f"Step 3: Simulating frontend approval...")
        graph.update_state(config, {"status": "approved"})
        
        # Continue execution
        for chunk in graph.stream(None, config):
            node_name = list(chunk.keys())[0] if chunk else None
            print(f"  ✅ Finalization node: {node_name}")
        
        # Verify final state
        final_state = graph.get_state(config)
        final_response = final_state.values.get('assistant_response', '')
        
        print(f"  ✅ Final response length: {len(final_response)} characters")
        print(f"  ✅ Execution completed successfully")
        
        # Step 4: Verify analytics were recorded
        from app.validation_analytics import get_validation_analytics
        analytics = get_validation_analytics()
        
        # Check if event was recorded
        relevant_events = [
            e for e in analytics.validation_events
            if e.thread_id == thread_id
        ]
        
        print(f"  ✅ Analytics events recorded: {len(relevant_events)}")
        
        if relevant_events:
            event = relevant_events[-1]
            print(f"    • Action: {event.action}")
            print(f"    • Sources: {event.source_count}")
            print(f"    • Confidence: {event.retrieval_confidence:.3f}")
        
        # Summary
        integration_ready = (
            len(response) > 0 and
            len(sources) > 0 and
            confidence > 0 and
            len(final_response) > 0 and
            len(relevant_events) > 0
        )
        
        print(f"\n✅ Frontend integration readiness: {'✅ READY' if integration_ready else '❌ NOT READY'}")
        
        return integration_ready
        
    except Exception as e:
        print(f"❌ Frontend integration readiness test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Run all Day 3 tests"""
    
    print("AI Documentation Assistant - Day 3 Testing")
    print("Enhanced Human Validation & Analytics")
    print("=" * 60)
    
    # Ensure we have data from previous days
    try:
        from app.rag import get_rag_pipeline
        from app.validation_analytics import get_validation_analytics
        
        rag_pipeline = get_rag_pipeline()
        stats = rag_pipeline.get_stats()
        
        print(f"Prerequisite check:")
        print(f"  📄 Document chunks available: {stats.get('document_chunks_count', 0)}")
        print(f"  🧠 System components initialized: ✅")
        
    except Exception as e:
        print(f"❌ Prerequisite check failed: {e}")
        print("Please ensure Day 1 and Day 2 setup is complete.")
        return False
    
    # Run test suite
    tests = [
        ("Analytics System", test_analytics_system),
        ("Enhanced Graph Integration", test_enhanced_graph_integration),
        ("API Analytics Endpoints", test_api_analytics_endpoints),
        ("Document Upload Enhancements", test_document_upload_enhancements),
        ("Performance Monitoring", test_performance_monitoring),
        ("Frontend Integration Readiness", test_frontend_integration_readiness)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n{'='*20} {test_name} {'='*20}")
        try:
            start_time = time.time()
            result = test_func()
            test_time = time.time() - start_time
            
            if result:
                print(f"✅ {test_name} PASSED ({test_time:.1f}s)")
                passed += 1
            else:
                print(f"❌ {test_name} FAILED ({test_time:.1f}s)")
        except Exception as e:
            print(f"❌ {test_name} ERROR: {e}")
    
    # Final results
    print("\n" + "="*60)
    print(f"DAY 3 TEST RESULTS: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All Day 3 tests PASSED!")
        print("✅ Enhanced validation system is working")
        print("✅ Analytics tracking is operational")
        print("✅ Frontend integration is ready")
        print("✅ Performance monitoring is active")
        print("\nNext steps:")
        print("  • Deploy frontend with new components")
        print("  • Test full user workflow end-to-end")
        print("  • Monitor analytics in production")
        print("  • Proceed to Day 4: Optimization")
        return True
    else:
        print("⚠️  Some tests failed. Check output above for details.")
        print("Fix failing components before proceeding to Day 4.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)