import logging
import json
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
        "human_request": request.human_request
    }
    
    logger.info(f"Created streaming session: {thread_id}")
    
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
        "human_comment": request.human_comment
    }
    
    logger.info(f"Resumed streaming session: {thread_id}, action: {request.review_action}")
    
    return GraphResponse(
        thread_id=thread_id,
        run_status="pending",
        assistant_response=None
    )

@router.get("/graph/stream/{thread_id}")
async def stream_graph(request: Request, thread_id: str):
    """Stream graph execution with enhanced events"""
    
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
        initial_data = json.dumps({"thread_id": thread_id})
        logger.debug(f"Starting {event_type} stream for thread: {thread_id}")
        yield {"event": event_type, "data": initial_data}
        
        # Track if we've sent sources
        sources_sent = False
        
        try:
            for msg, metadata in graph.stream(input_state, config, stream_mode="messages"):
                if await request.is_disconnected():
                    logger.debug("Client disconnected")
                    break
                
                # NEW: Send sources after retrieval
                if not sources_sent and metadata.get('langgraph_node') == 'retrieve_context':
                    state = graph.get_state(config)
                    rag_sources = state.values.get('rag_sources', [])
                    retrieval_confidence = state.values.get('retrieval_confidence', 0.0)
                    
                    if rag_sources:
                        sources_data = json.dumps({
                            "sources": rag_sources,
                            "confidence": retrieval_confidence
                        })
                        logger.debug(f"Sending {len(rag_sources)} sources with confidence: {retrieval_confidence:.3f}")
                        yield {"event": "sources", "data": sources_data}
                        sources_sent = True
                
                # Stream tokens from assistant nodes
                if metadata.get('langgraph_node') in ['assistant_draft', 'assistant_finalize']:
                    token_data = json.dumps({"content": msg.content})
                    yield {"event": "token", "data": token_data}
            
            # Check final status
            state = graph.get_state(config)
            if state.next and 'human_feedback' in state.next:
                status_data = json.dumps({"status": "user_feedback"})
                logger.debug("Stream paused for user feedback")
                yield {"event": "status", "data": status_data}
            else:
                status_data = json.dumps({"status": "finished"})
                logger.debug("Stream completed")
                yield {"event": "status", "data": status_data}
            
            # Cleanup
            if thread_id in run_configs:
                del run_configs[thread_id]
                logger.debug(f"Cleaned up thread config: {thread_id}")
                
        except Exception as e:
            logger.error(f"Stream error for thread {thread_id}: {e}")
            yield {"event": "error", "data": json.dumps({"error": str(e)})}
            
            # Clean up on error
            if thread_id in run_configs:
                del run_configs[thread_id]
    
    return EventSourceResponse(event_generator())

# --- NEW: Document Management Endpoints ---

@router.post("/documents/upload", response_model=DocumentUploadResponse)
async def upload_document(file: UploadFile = File(...)):
    """Upload and process a document for RAG"""
    
    logger.info(f"Uploading document: {file.filename}")
    
    try:
        # Validate file type
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
        
        # Read file content
        content = await file.read()
        logger.debug(f"Read {len(content)} bytes from {file.filename}")
        
        # Get RAG pipeline
        rag_pipeline = get_rag_pipeline()
        
        # Process document based on type
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
    """Get status of indexed documents"""
    
    try:
        # Get statistics from dual retriever
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

# --- NEW: RAG Testing Endpoint ---
@router.post("/rag/test")
async def test_rag_retrieval(request: Request):
    """Test RAG retrieval for debugging"""
    
    # Get query from request body
    body = await request.json()
    query = body.get("query")
    top_k = body.get("top_k", 3)
    
    if not query:
        raise HTTPException(status_code=400, detail="Query is required")
    
    logger.info(f"Testing RAG retrieval for query: {query}")
    
    try:
        dual_retriever = get_dual_retriever()
        results = dual_retriever.retrieve(query, top_k=top_k)
        
        formatted_results = []
        for result in results:
            formatted_results.append({
                "content_preview": result.content[:200] + "..." if len(result.content) > 200 else result.content,
                "source": result.source,
                "confidence": result.confidence,
                "metadata": {
                    "file": result.metadata.get('source_file', 'Unknown'),
                    "section": result.metadata.get('section', 'Unknown')
                }
            })
        
        return {
            "query": query,
            "results_count": len(results),
            "results": formatted_results
        }
        
    except Exception as e:
        logger.error(f"Error testing RAG retrieval: {e}")
        raise HTTPException(status_code=500, detail=f"RAG test error: {str(e)}")

# --- Health Check ---
@router.get("/health")
async def health_check():
    """Health check endpoint"""
    
    try:
        # Test RAG system
        dual_retriever = get_dual_retriever()
        stats = dual_retriever.get_stats()
        
        return {
            "status": "healthy",
            "rag_enabled": True,
            "document_chunks": stats.get('document_chunks_count', 0),
            "validated_answers": stats.get('validated_answers_count', 0)
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {"status": "unhealthy", "error": str(e)}