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
    """Enhanced streaming with sources support"""
    
    # Check if thread_id exists in our configurations
    if thread_id not in run_configs:
        logger.error(f"Thread ID not found: {thread_id}")
        raise HTTPException(
            status_code=404,
            detail="Thread ID not found. You must first call /graph/stream/create or /graph/stream/resume"
        )
    
    # Get the stored configuration
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
        
        # Track streaming metrics
        sources_sent = False
        token_count = 0
        stream_start_time = time.time()
        
        try:
            for msg, metadata in graph.stream(input_state, config, stream_mode="messages"):
                if await request.is_disconnected():
                    logger.debug("Client disconnected")
                    break
                
                # Send sources event after retrieval
                if not sources_sent and metadata.get('langgraph_node') == 'retrieve_context':
                    state = graph.get_state(config)
                    rag_sources = state.values.get('rag_sources', [])
                    retrieval_confidence = state.values.get('retrieval_confidence', 0.0)
                    
                    if rag_sources:
                        # Safely count source types
                        source_types = {"validated": 0, "rag": 0, "cache": 0}
                        for source in rag_sources:
                            source_type = source.get('source_type', 'rag')
                            if source_type in source_types:
                                source_types[source_type] += 1
                        
                        sources_data = json.dumps({
                            "sources": rag_sources,
                            "confidence": retrieval_confidence,
                            "source_types": source_types
                        })
                        logger.debug(f"Sending {len(rag_sources)} sources with confidence: {retrieval_confidence:.3f}")
                        yield {"event": "sources", "data": sources_data}
                        sources_sent = True
                
                # Stream tokens from assistant nodes
                if metadata.get('langgraph_node') in ['assistant_draft', 'assistant_finalize']:
                    token_data = json.dumps({
                        "content": msg.content
                    })
                    yield {"event": "token", "data": token_data}
                    token_count += 1
            
            # Check final status
            state = graph.get_state(config)
            total_stream_time = (time.time() - stream_start_time) * 1000
            
            if state.next and 'human_feedback' in state.next:
                status_data = json.dumps({
                    "status": "user_feedback",
                    "stream_time_ms": total_stream_time
                })
                logger.debug(f"Stream paused for user feedback after {total_stream_time:.1f}ms")
                yield {"event": "status", "data": status_data}
            else:
                status_data = json.dumps({
                    "status": "finished",
                    "stream_time_ms": total_stream_time
                })
                logger.debug(f"Stream completed in {total_stream_time:.1f}ms")
                yield {"event": "status", "data": status_data}
            
            # Cleanup
            if thread_id in run_configs:
                del run_configs[thread_id]
                logger.debug(f"Cleaned up thread config: {thread_id}")
                
        except Exception as e:
            logger.error(f"Stream error for thread {thread_id}: {e}")
            yield {"event": "error", "data": json.dumps({
                "error": str(e),
                "thread_id": thread_id
            })}
            
            # Clean up on error
            if thread_id in run_configs:
                del run_configs[thread_id]
    
    return EventSourceResponse(event_generator())

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
    """Get status of indexed documents - FIXED VERSION"""
    
    try:
        # Get statistics from dual retriever only
        dual_retriever = get_dual_retriever()
        stats = dual_retriever.get_stats()
        
        logger.debug(f"Retrieved document stats: {stats}")
        
        return DocumentStatusResponse(
            total_chunks=stats.get('document_chunks_count', 0),
            total_validated=stats.get('validated_answers_count', 0),
            cache_stats={
                "query_cache_size": stats.get('query_cache_size', 0),
                "embedding_cache_size": stats.get('embedding_cache_size', 0)
            }
        )
        
    except Exception as e:
        logger.error(f"Error getting document status: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving document status")

# --- RAG Testing Endpoint ---
@router.post("/rag/test")
async def test_rag_retrieval(request: Request):
    """Test RAG retrieval with performance metrics"""
    
    body = await request.json()
    query = body.get("query")
    top_k = body.get("top_k", 3)
    
    if not query:
        raise HTTPException(status_code=400, detail="Query is required")
    
    logger.info(f"Testing RAG retrieval for query: {query}")
    
    try:
        test_start = time.time()
        dual_retriever = get_dual_retriever()
        
        results = dual_retriever.retrieve(query=query, top_k=top_k)
        retrieval_time = (time.time() - test_start) * 1000
        
        # Format results
        formatted_results = []
        source_types = {"validated": 0, "rag": 0, "cache": 0}
        
        for result in results:
            source_types[result.source] = source_types.get(result.source, 0) + 1
            
            formatted_results.append({
                "content_preview": result.content[:200] + "..." if len(result.content) > 200 else result.content,
                "source": result.source,
                "confidence": result.confidence,
                "metadata": {
                    "file": result.metadata.get('source_file', 'Unknown'),
                    "section": result.metadata.get('section', 'Unknown')
                }
            })
        
        avg_confidence = sum(r.confidence for r in results) / len(results) if results else 0.0
        
        return {
            "query": query,
            "results_count": len(results),
            "performance": {
                "retrieval_time_ms": retrieval_time,
                "avg_confidence": avg_confidence,
                "source_breakdown": source_types
            },
            "results": formatted_results
        }
        
    except Exception as e:
        logger.error(f"Error testing RAG retrieval: {e}")
        raise HTTPException(status_code=500, detail=f"RAG test error: {str(e)}")

# --- Health Check ---
@router.get("/health")
async def health_check():
    """System health check"""
    
    try:
        dual_retriever = get_dual_retriever()
        stats = dual_retriever.get_stats()
        
        return {
            "status": "healthy",
            "timestamp": time.time(),
            "rag_enabled": True,
            "document_chunks": stats.get('document_chunks_count', 0),
            "validated_answers": stats.get('validated_answers_count', 0)
        }
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy", 
            "error": str(e),
            "timestamp": time.time()
        }

# --- Basic Analytics (Working Version) ---
@router.get("/analytics/stats")
async def get_basic_stats():
    """Get basic system statistics - WORKING VERSION"""
    
    try:
        dual_retriever = get_dual_retriever()
        stats = dual_retriever.get_stats()
        
        return {
            "document_chunks": stats.get('document_chunks_count', 0),
            "validated_answers": stats.get('validated_answers_count', 0),
            "cache_sizes": {
                "query_cache": stats.get('query_cache_size', 0),
                "embedding_cache": stats.get('embedding_cache_size', 0)
            },
            "timestamp": time.time()
        }
        
    except Exception as e:
        logger.error(f"Error getting basic stats: {e}")
        return {
            "error": str(e),
            "timestamp": time.time()
        }

# --- Cache Management ---
@router.post("/cache/clear")
async def clear_caches():
    """Clear system caches"""
    
    try:
        dual_retriever = get_dual_retriever()
        rag_pipeline = get_rag_pipeline()
        
        # Clear caches safely
        dual_retriever.query_cache.clear()
        dual_retriever.embedding_cache.clear()
        rag_pipeline.clear_caches()
        
        logger.info("Successfully cleared all system caches")
        
        return {
            "status": "success",
            "message": "All caches cleared",
            "timestamp": time.time()
        }
        
    except Exception as e:
        logger.error(f"Error clearing caches: {e}")
        raise HTTPException(status_code=500, detail=f"Cache clear error: {str(e)}")