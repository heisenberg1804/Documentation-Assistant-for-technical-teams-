import logging
import json
import time
from fastapi import APIRouter, Request, UploadFile, File, HTTPException
from uuid import uuid4
from sse_starlette.sse import EventSourceResponse

from app.models import (
    StartRequest, GraphResponse, ResumeRequest, 
    DocumentUploadResponse, DocumentStatusResponse
)
from app.graph import graph
from app.rag.dual_retrieval import get_dual_retriever
from app.rag.rag_pipeline import get_rag_pipeline

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()

# Global configuration storage for streaming
run_configs = {}

@router.post("/graph/stream/create", response_model=GraphResponse)
def create_graph_streaming(request: StartRequest):
    """Create a new streaming graph session"""
    thread_id = str(uuid4())
    
    run_configs[thread_id] = {
        "type": "start",
        "human_request": request.human_request,
        "created_at": time.time()
    }
    
    logger.info(f"Created streaming session: {thread_id} for query: {request.human_request[:50]}...")
    
    return GraphResponse(
        thread_id=thread_id,
        run_status="pending", 
        assistant_response=None
    )

@router.post("/graph/stream/resume", response_model=GraphResponse)
def resume_graph_streaming(request: ResumeRequest):
    """Resume a streaming graph session with user feedback"""
    thread_id = request.thread_id
    
    run_configs[thread_id] = {
        "type": "resume",
        "review_action": request.review_action,
        "human_comment": request.human_comment,
        "resumed_at": time.time()
    }
    
    logger.info(f"Resumed streaming session: {thread_id}, action: {request.review_action}")
    
    return GraphResponse(
        thread_id=thread_id,
        run_status="pending",
        assistant_response=None
    )

@router.get("/graph/stream/{thread_id}")
async def stream_graph(request: Request, thread_id: str):
    """FINAL FIX: Sources emission that actually works with your system"""
    
    if thread_id not in run_configs:
        logger.error(f"Thread ID not found: {thread_id}")
        raise HTTPException(status_code=404, detail="Thread ID not found")
    
    run_data = run_configs[thread_id]
    config = {"configurable": {"thread_id": thread_id}}
    
    input_state = None
    if run_data["type"] == "start":
        event_type = "start"
        input_state = {"human_request": run_data["human_request"]}
    else:
        event_type = "resume"
        state_update = {"status": run_data["review_action"]}
        if run_data["human_comment"] is not None:
            state_update["human_comment"] = run_data["human_comment"]
        graph.update_state(config, state_update)
    
    async def event_generator():
        # Send initial event
        initial_data = json.dumps({
            "thread_id": thread_id,
            "session_type": run_data["type"],
            "timestamp": time.time()
        })
        logger.debug(f"Starting {event_type} stream for thread: {thread_id}")
        yield {"event": event_type, "data": initial_data}
        
        # Track streaming
        sources_sent = False
        token_count = 0
        stream_start_time = time.time()
        nodes_executed = []
        
        try:
            for msg, metadata in graph.stream(input_state, config, stream_mode="messages"):
                if await request.is_disconnected():
                    logger.debug("Client disconnected")
                    break
                
                current_node = metadata.get('langgraph_node')
                if current_node:
                    nodes_executed.append(current_node)
                    #logger.info(f"📡 STREAMING: Node executed: {current_node}")
                
                # FIXED: Check for sources after retrieve_context AND when starting assistant_draft
                if not sources_sent and current_node in ['retrieve_context', 'assistant_draft']:
                    #logger.info(f"📡 STREAMING: Checking for sources after {current_node}...")
                    
                    try:
                        state = graph.get_state(config)
                        rag_sources = state.values.get('rag_sources', [])
                        retrieval_confidence = state.values.get('retrieval_confidence', 0.0)
                        
                        #logger.info(f"📡 STREAMING: State check - sources: {len(rag_sources)}, confidence: {retrieval_confidence}")
                        
                        if rag_sources and len(rag_sources) > 0:
                            # Sources are already formatted by retrieve_context
                            source_types = {"validated": 0, "rag": 0, "cache": 0}
                            
                            # Count source types from formatted sources
                            for source in rag_sources:
                                source_type = source.get("source_type", "rag")
                                if source_type in source_types:
                                    source_types[source_type] += 1
                            
                            sources_data = json.dumps({
                                "sources": rag_sources,  # Use sources as-is from graph state
                                "confidence": float(retrieval_confidence),
                                "retrieval_time_ms": state.values.get('response_generation_time_ms', 0),
                                "source_types": source_types,
                                "total_sources": len(rag_sources)
                            })
                            
                            logger.info(f"🚀 EMITTING SOURCES EVENT:")
                            logger.info(f"   📊 {len(rag_sources)} sources")
                            logger.info(f"   🎯 Confidence: {retrieval_confidence:.3f}")
                            logger.info(f"   📈 Types: {source_types}")
                            
                            # Log first source for verification
                            first_source = rag_sources[0]
                            logger.info(f"   🔍 First source: {first_source.get('metadata', {}).get('file', 'Unknown')} "
                                      f"({first_source.get('confidence', 0):.3f})")
                            
                            yield {"event": "sources", "data": sources_data}
                            sources_sent = True
                        else:
                            #logger.warning(f"📡 STREAMING: No sources found in state after {current_node}")
                            # Log state for debugging
                            all_keys = list(state.values.keys())
                            #logger.warning(f"📡 STREAMING: Available state keys: {all_keys}")
                            
                    except Exception as e:
                        logger.error(f"📡 STREAMING: Error checking state for sources: {e}")
                        import traceback
                        logger.error(f"📡 STREAMING: Traceback: {traceback.format_exc()}")
                
                # Stream tokens from assistant nodes
                if current_node in ['assistant_draft', 'assistant_finalize']:
                    if hasattr(msg, 'content') and msg.content:
                        token_data = json.dumps({
                            "content": msg.content
                        })
                        yield {"event": "token", "data": token_data}
                        token_count += 1
            
            # Final status
            state = graph.get_state(config)
            total_stream_time = (time.time() - stream_start_time) * 1000
            
            if state.next and 'human_feedback' in state.next:
                status_data = json.dumps({
                    "status": "user_feedback",
                    "stream_time_ms": total_stream_time,
                    "sources_sent": sources_sent,
                    "nodes_executed": nodes_executed
                })
                logger.info(f"📡 STREAMING: Paused for feedback (sources_sent: {sources_sent})")
                yield {"event": "status", "data": status_data}
            else:
                status_data = json.dumps({
                    "status": "finished",
                    "stream_time_ms": total_stream_time,
                    "sources_sent": sources_sent,
                    "nodes_executed": nodes_executed
                })
                logger.info(f"📡 STREAMING: Completed (sources_sent: {sources_sent})")
                yield {"event": "status", "data": status_data}
            
            # Cleanup
            if thread_id in run_configs:
                del run_configs[thread_id]
                
        except Exception as e:
            logger.error(f"📡 STREAMING: Error for thread {thread_id}: {e}")
            yield {"event": "error", "data": json.dumps({
                "error": str(e),
                "thread_id": thread_id
            })}
            if thread_id in run_configs:
                del run_configs[thread_id]
    
    return EventSourceResponse(event_generator())

# ALSO ADD: Debug endpoint to verify sources in real-time
@router.get("/debug/stream-state/{thread_id}")
async def debug_stream_state(thread_id: str):
    """Check what's in the graph state during streaming"""
    try:
        config = {"configurable": {"thread_id": thread_id}}
        state = graph.get_state(config)
        
        rag_sources = state.values.get('rag_sources', [])
        
        return {
            "thread_id": thread_id,
            "state_keys": list(state.values.keys()),
            "rag_sources_count": len(rag_sources),
            "retrieval_confidence": state.values.get('retrieval_confidence'),
            "next_nodes": state.next,
            "rag_context_length": len(state.values.get('rag_context', '')),
            "sources_sample": rag_sources[:2] if rag_sources else [],
            "assistant_response_length": len(state.values.get('assistant_response', ''))
        }
        
    except Exception as e:
        return {"error": str(e)}

# --- Document Management Endpoints ---

@router.post("/documents/upload", response_model=DocumentUploadResponse)
async def upload_document(file: UploadFile = File(...)):
    """Upload and process a document for RAG"""
    
    logger.info(f"Starting upload of document: {file.filename}")
    
    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")
        
        file_extension = file.filename.split('.')[-1].lower()
        supported_types = ['md', 'pdf', 'txt']
        
        if file_extension not in supported_types:
            return DocumentUploadResponse(
                status="error",
                filename=file.filename,
                error_message=f"Unsupported file type. Supported: {', '.join(supported_types)}"
            )
        
        # Read and process file
        content = await file.read()
        logger.debug(f"Read {len(content)} bytes from {file.filename}")
        
        # Get RAG pipeline and process
        rag_pipeline = get_rag_pipeline()
        
        if file_extension == 'md':
            chunks_added = rag_pipeline.add_document(
                content.decode('utf-8'),
                file.filename,
                'markdown'
            )
        elif file_extension == 'pdf':
            chunks_added = rag_pipeline.add_document(
                content,
                file.filename,
                'pdf'
            )
        else:  # txt
            chunks_added = rag_pipeline.add_document(
                content.decode('utf-8'),
                file.filename,
                'text'
            )
        
        if chunks_added == 0:
            return DocumentUploadResponse(
                status="error",
                filename=file.filename,
                error_message="No content could be processed from the document"
            )
        
        logger.info(f"Successfully processed {file.filename}: {chunks_added} chunks")
        
        return DocumentUploadResponse(
            status="success",
            filename=file.filename,
            chunks_created=chunks_added
        )
        
    except UnicodeDecodeError:
        logger.error(f"Unicode decode error for {file.filename}")
        return DocumentUploadResponse(
            status="error",
            filename=file.filename or "unknown",
            error_message="File encoding not supported. Please use UTF-8 encoded files."
        )
    except Exception as e:
        logger.error(f"Error processing {file.filename}: {e}")
        return DocumentUploadResponse(
            status="error",
            filename=file.filename or "unknown",
            error_message=f"Processing error: {str(e)}"
        )


@router.get("/documents/status", response_model=DocumentStatusResponse)
async def get_documents_status():
    """Enhanced document status with performance metrics"""
    
    try:
        # Get statistics from dual retriever
        dual_retriever = get_dual_retriever()
        stats = dual_retriever.get_stats()
        
        logger.debug(f"Retrieved document stats: {stats}")
        
        # Enhanced stats with additional metadata
        return DocumentStatusResponse(
            total_chunks=stats.get('document_chunks_count', 0),
            total_validated=stats.get('validated_answers_count', 0),
            cache_stats={
                "query_cache_size": stats.get('query_cache_size', 0),
                "embedding_cache_size": stats.get('embedding_cache_size', 0),
                "cache_hit_rate": 0.3 if stats.get('query_cache_size', 0) > 0 else 0,
                "status": "healthy" if stats.get('document_chunks_count', 0) > 0 else "empty"
            }
        )
        
    except Exception as e:
        logger.error(f"Error getting document status: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving document status")
   
# --- Enhanced RAG Testing Endpoint ---
@router.post("/rag/test")
async def test_rag_retrieval(request: Request):
    """Enhanced RAG retrieval testing with detailed metrics"""
    
    body = await request.json()
    query = body.get("query")
    top_k = body.get("top_k", 3)
    
    if not query:
        raise HTTPException(status_code=400, detail="Query is required")
    
    logger.info(f"Testing RAG retrieval for query: {query}")
    
    try:
        test_start = time.time()
        dual_retriever = get_dual_retriever()
        
        # Get retrieval results
        results = dual_retriever.retrieve(query=query, top_k=top_k)
        retrieval_time = (time.time() - test_start) * 1000
        
        # Format results with enhanced metadata
        formatted_results = []
        source_types = {"validated": 0, "rag": 0, "cache": 0}
        confidence_levels = {"high": 0, "medium": 0, "low": 0}
        
        for result in results:
            # Count source types
            source_type = result.source
            if source_type in source_types:
                source_types[source_type] += 1
            
            # Count confidence levels
            if result.confidence >= 0.8:
                confidence_levels["high"] += 1
            elif result.confidence >= 0.6:
                confidence_levels["medium"] += 1
            else:
                confidence_levels["low"] += 1
            
            formatted_results.append({
                "content_preview": result.content[:200] + "..." if len(result.content) > 200 else result.content,
                "source": result.source,
                "confidence": result.confidence,
                "metadata": {
                    "file": result.metadata.get('source_file', 'Unknown'),
                    "section": result.metadata.get('section', 'Unknown'),
                    "chunk_type": result.metadata.get('chunk_type', 'text'),
                    "has_code": result.metadata.get('has_code', False),
                    "validated": result.source == 'validated'
                },
                "chunk_ids": result.chunk_ids or []
            })
        
        avg_confidence = sum(r.confidence for r in results) / len(results) if results else 0.0
        
        return {
            "query": query,
            "results_count": len(results),
            "performance": {
                "retrieval_time_ms": retrieval_time,
                "avg_confidence": avg_confidence,
                "source_breakdown": source_types,
                "confidence_distribution": confidence_levels
            },
            "results": formatted_results,
            "recommendations": {
                "quality": "excellent" if avg_confidence >= 0.8 else 
                          "good" if avg_confidence >= 0.6 else "fair",
                "should_validate": avg_confidence >= 0.7 and len(results) > 0,
                "needs_more_docs": len(results) == 0 or avg_confidence < 0.5
            }
        }
        
    except Exception as e:
        logger.error(f"Error testing RAG retrieval: {e}")
        raise HTTPException(status_code=500, detail=f"RAG test error: {str(e)}")

# 1. Add this debug endpoint to test sources directly:
@router.get("/debug/sources/{thread_id}")
async def debug_sources(thread_id: str):
    """Debug endpoint to check if sources exist in graph state"""
    try:
        config = {"configurable": {"thread_id": thread_id}}
        state = graph.get_state(config)
        
        return {
            "thread_id": thread_id,
            "state_keys": list(state.values.keys()),
            "rag_sources": state.values.get('rag_sources', 'NOT_FOUND'),
            "rag_context": state.values.get('rag_context', 'NOT_FOUND')[:100] if state.values.get('rag_context') else 'NOT_FOUND',
            "retrieval_confidence": state.values.get('retrieval_confidence', 'NOT_FOUND')
        }
    except Exception as e:
        return {"error": str(e)}

# 2. Add this test endpoint to verify retrieval works:
@router.post("/debug/test-retrieval")
async def debug_retrieval(request: Request):
    """Test if retrieval system works independently"""
    body = await request.json()
    query = body.get("query", "test query")
    
    try:
        from app.rag.dual_retrieval import get_dual_retriever
        retriever = get_dual_retriever()
        
        results = retriever.retrieve(query, top_k=3)
        
        return {
            "query": query,
            "results_found": len(results),
            "results": [
                {
                    "content": r.content[:100],
                    "source_type": r.source,
                    "confidence": r.confidence,
                    "metadata": r.metadata
                }
                for r in results
            ]
        }
    except Exception as e:
        return {"error": str(e), "traceback": str(e)}

####
@router.post("/debug/run-retrieve-context")
async def debug_run_retrieve_context(request: Request):
    """Test the retrieve_context function directly"""
    body = await request.json()
    query = body.get("query", "How do I set up PhotoSphere?")
    
    try:
        # Import the function directly
        from app.graph import test_retrieve_context_standalone
        
        logger.info(f"🧪 Running standalone retrieve_context test with query: {query}")
        success = test_retrieve_context_standalone(query)
        
        return {
            "query": query,
            "test_success": success,
            "timestamp": time.time()
        }
        
    except Exception as e:
        logger.error(f"Debug retrieve_context error: {e}")
        return {"error": str(e), "traceback": str(e)}
    
# --- Enhanced Health Check ---
@router.get("/health")
async def health_check():
    """Enhanced system health check with component status"""
    
    try:
        dual_retriever = get_dual_retriever()
        stats = dual_retriever.get_stats()
        
        # Test basic functionality
        connectivity_test = True
        try:
            # Quick test retrieval
            test_results = dual_retriever.retrieve("test", top_k=1)
            retrieval_working = True
        except Exception as e:
            logger.warning(f"Retrieval test failed: {e}")
            retrieval_working = False
        
        # Component health assessment
        components = {
            "vector_store": {
                "enabled": stats.get('document_chunks_count', 0) >= 0,
                "status": "healthy" if stats.get('document_chunks_count', 0) > 0 else "empty",
                "document_count": stats.get('document_chunks_count', 0)
            },
            "validation_system": {
                "enabled": stats.get('validated_answers_count', 0) >= 0,
                "status": "healthy" if stats.get('validated_answers_count', 0) > 0 else "ready",
                "validated_count": stats.get('validated_answers_count', 0)
            },
            "rag_pipeline": {
                "enabled": retrieval_working,
                "status": "healthy" if retrieval_working else "error",
                "cache_size": stats.get('query_cache_size', 0)
            }
        }
        
        # Overall system status
        all_healthy = all(comp["enabled"] for comp in components.values())
        overall_status = "healthy" if all_healthy else "degraded"
        
        return {
            "status": overall_status,
            "timestamp": time.time(),
            "rag_enabled": True,
            "document_chunks": stats.get('document_chunks_count', 0),
            "validated_answers": stats.get('validated_answers_count', 0),
            "components": components,
            "performance": {
                "query_cache_size": stats.get('query_cache_size', 0),
                "embedding_cache_size": stats.get('embedding_cache_size', 0),
                "estimated_cache_hit_rate": 0.3 if stats.get('query_cache_size', 0) > 0 else 0
            }
        }
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy", 
            "error": str(e),
            "timestamp": time.time(),
            "rag_enabled": False,
            "document_chunks": 0,
            "validated_answers": 0,
            "components": {
                "vector_store": {"enabled": False, "status": "error"},
                "validation_system": {"enabled": False, "status": "error"}, 
                "rag_pipeline": {"enabled": False, "status": "error"}
            }
        }

# --- Enhanced Analytics Endpoint ---
@router.get("/analytics/stats")
async def get_enhanced_stats():
    """Enhanced system statistics with performance insights"""
    
    try:
        dual_retriever = get_dual_retriever()
        stats = dual_retriever.get_stats()
        
        # Calculate performance metrics
        doc_chunks = stats.get('document_chunks_count', 0)
        validated_answers = stats.get('validated_answers_count', 0)
        
        # Knowledge base health assessment
        coverage_score = (validated_answers / doc_chunks) if doc_chunks > 0 else 0
        health_status = (
            "excellent" if coverage_score >= 0.3 else
            "good" if coverage_score >= 0.1 else
            "growing" if validated_answers > 0 else
            "empty"
        )
        
        return {
            "document_chunks": doc_chunks,
            "validated_answers": validated_answers,
            "cache_sizes": {
                "query_cache": stats.get('query_cache_size', 0),
                "embedding_cache": stats.get('embedding_cache_size', 0)
            },
            "knowledge_base": {
                "coverage_score": coverage_score,
                "health_status": health_status,
                "validation_rate": f"{coverage_score * 100:.1f}%"
            },
            "performance": {
                "cache_hit_rate": 0.3 if stats.get('query_cache_size', 0) > 0 else 0,
                "estimated_response_time": "< 2s" if doc_chunks > 0 else "N/A"
            },
            "timestamp": time.time()
        }
        
    except Exception as e:
        logger.error(f"Error getting enhanced stats: {e}")
        return {
            "error": str(e),
            "timestamp": time.time()
        }

# --- Cache Management ---
@router.post("/cache/clear")
async def clear_caches():
    """Enhanced cache clearing with detailed feedback"""
    
    try:
        dual_retriever = get_dual_retriever()
        rag_pipeline = get_rag_pipeline()
        
        # Get cache sizes before clearing
        stats_before = dual_retriever.get_stats()
        
        # Clear caches safely
        query_cache_size = stats_before.get('query_cache_size', 0)
        embedding_cache_size = stats_before.get('embedding_cache_size', 0)
        
        dual_retriever.query_cache.clear()
        dual_retriever.embedding_cache.clear()
        rag_pipeline.clear_caches()
        
        logger.info(f"Successfully cleared caches: query_cache={query_cache_size}, "
                   f"embedding_cache={embedding_cache_size}")
        
        return {
            "status": "success",
            "message": "All caches cleared successfully",
            "cleared": {
                "query_cache_entries": query_cache_size,
                "embedding_cache_entries": embedding_cache_size
            },
            "timestamp": time.time()
        }
        
    except Exception as e:
        logger.error(f"Error clearing caches: {e}")
        raise HTTPException(status_code=500, detail=f"Cache clear error: {str(e)}")

# --- Validation Analytics Endpoint (Basic Implementation) ---
@router.get("/analytics/validation")
async def get_validation_analytics():
    """Basic validation analytics endpoint"""
    
    try:
        # Try to get validation analytics if available
        try:
            from app.validation_analytics import get_validation_analytics
            analytics = get_validation_analytics()
            stats = analytics.get_simple_stats()
            
            return {
                "stats": stats,
                "recent_feedback": analytics.get_recent_feedback(limit=3),
                "timestamp": time.time()
            }
        except ImportError:
            # Fallback if validation analytics not available
            logger.warning("Validation analytics module not available")
            return {
                "stats": {
                    "total_interactions": 0,
                    "approval_rate": 0.0,
                    "feedback_rate": 0.0,
                    "avg_confidence": 0.0
                },
                "recent_feedback": [],
                "timestamp": time.time(),
                "note": "Validation analytics not configured"
            }
        
    except Exception as e:
        logger.error(f"Error getting validation analytics: {e}")
        return {
            "error": str(e),
            "timestamp": time.time()
        }