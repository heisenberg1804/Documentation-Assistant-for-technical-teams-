import logging
import time
from typing import Literal, Optional, List, Dict
from langgraph.graph import StateGraph, MessagesState, START, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.checkpoint.memory import MemorySaver

from app.rag.dual_retrieval import get_dual_retriever

# Configure logging
logger = logging.getLogger(__name__)

# --- Model Definition ---
from app.config import config

model = ChatOpenAI(
    model=config.llm_model,
    api_key=config.openai_api_key
)

# --- Enhanced Graph State Definition ---
class DraftReviewState(MessagesState):
    human_request: str
    human_comment: Optional[str]
    status: Literal["approved", "feedback"]
    assistant_response: str
    # RAG-related fields
    rag_context: Optional[str] = None
    rag_sources: Optional[List[Dict]] = None
    response_sources: Optional[List[Dict]] = None
    retrieval_confidence: Optional[float] = None
    # Performance tracking fields
    retrieval_start_time: Optional[float] = None
    response_generation_time_ms: Optional[float] = None

# --- FIXED: Retrieve Context Node ---
def retrieve_context(state: DraftReviewState) -> DraftReviewState:
    """FIXED: Retrieve relevant context using dual-retrieval system"""
    
    retrieval_start = time.time()
    query = state["human_request"]
    
    logger.info(f"🔍 RETRIEVE_CONTEXT: Starting retrieval for query: '{query[:50]}...'")
    
    try:
        # Get retriever instance
        retriever = get_dual_retriever()
        
        # Perform retrieval
        results = retriever.retrieve(query=query, top_k=5)
        
        retrieval_time_ms = (time.time() - retrieval_start) * 1000
        
        logger.info(f"🔍 RETRIEVE_CONTEXT: Found {len(results)} raw results in {retrieval_time_ms:.1f}ms")
        
        if not results:
            logger.warning("🔍 RETRIEVE_CONTEXT: No retrieval results found")
            return {
                **state, 
                "rag_context": "", 
                "rag_sources": [], 
                "retrieval_confidence": 0.0,
                "response_generation_time_ms": retrieval_time_ms
            }
        
        # Format context for LLM
        context_parts = []
        sources = []
        total_confidence = 0.0
        
        for i, result in enumerate(results, 1):
            # Add to context with clear labeling
            source_label = "✓ Validated Answer" if result.source == 'validated' else "📄 Documentation"
            if result.source == 'cache':
                source_label = "⚡ Cached Result"
            
            context_parts.append(
                f"[Source {i}: {source_label} - Confidence: {result.confidence:.2f}]\n"
                f"{result.content}\n"
            )
            
            # FIXED: Extract metadata properly - handle the "Unknown" issue
            metadata = result.metadata if result.metadata else {}
            
            # Try multiple possible metadata keys for filename
            source_file = (
                metadata.get('source_file') or 
                metadata.get('file') or 
                metadata.get('filename') or
                'Unknown'
            )
            
            # Try multiple possible keys for section
            section = (
                metadata.get('section') or
                metadata.get('title') or
                metadata.get('chapter') or
                ''
            )
            
            # FIXED: Create properly formatted source for frontend
            formatted_source = {
                "index": i,
                "content": result.content[:300] + "..." if len(result.content) > 300 else result.content,
                "source_type": result.source,
                "confidence": float(result.confidence),  # Ensure float
                "metadata": {
                    "file": source_file,
                    "section": section,
                    "validated": result.source == 'validated',
                    "chunk_type": metadata.get('chunk_type', 'text'),
                    "has_code": metadata.get('has_code', False),
                    # DEBUG: Include original metadata to see what's available
                    "debug_original_metadata": dict(metadata) if metadata else {}
                }
            }
            
            # Add validation info if available
            if hasattr(result, 'validation_info') and result.validation_info:
                formatted_source["metadata"]["validation_info"] = result.validation_info
            
            sources.append(formatted_source)
            total_confidence += result.confidence
        
        # Calculate average confidence
        avg_confidence = total_confidence / len(results)
        
        # Join context
        formatted_context = "\n---\n".join(context_parts)
        
        logger.info(f"🔍 RETRIEVE_CONTEXT: Processed {len(sources)} sources with avg confidence: {avg_confidence:.3f}")
        
        # DEBUG: Log what we're about to store
        for i, source in enumerate(sources[:2]):  # Log first 2 sources
            logger.info(f"   📝 Source {i+1}: type={source['source_type']}, file={source['metadata']['file']}, conf={source['confidence']:.3f}")
        
        # FIXED: Store sources properly in state
        updated_state = {
            **state,
            "rag_context": formatted_context,
            "rag_sources": sources,  # This is what the API looks for
            "retrieval_confidence": float(avg_confidence),
            "response_generation_time_ms": retrieval_time_ms
        }
        
        logger.info(f"🔍 RETRIEVE_CONTEXT: Successfully stored {len(sources)} sources in state")
        
        return updated_state
        
    except Exception as e:
        logger.error(f"🔍 RETRIEVE_CONTEXT ERROR: {e}")
        import traceback
        logger.error(f"🔍 RETRIEVE_CONTEXT TRACEBACK: {traceback.format_exc()}")
        
        retrieval_time_ms = (time.time() - retrieval_start) * 1000
        
        # Graceful degradation
        return {
            **state,
            "rag_context": "",
            "rag_sources": [],
            "retrieval_confidence": 0.0,
            "response_generation_time_ms": retrieval_time_ms
        }

# --- Enhanced Assistant Draft Node ---
def assistant_draft(state: DraftReviewState) -> DraftReviewState:
    """Enhanced assistant draft with RAG context"""
    
    generation_start = time.time()
    
    # Get RAG context if available
    context = state.get("rag_context", "")
    sources = state.get("rag_sources", [])
    confidence = state.get("retrieval_confidence", 0.0)
    
    user_message = HumanMessage(content=state["human_request"])
    status = state.get("status", "approved")
    
    # Log context usage
    if context:
        logger.info(f"🤖 ASSISTANT_DRAFT: Using RAG context with {len(sources)} sources, confidence: {confidence:.3f}")
    else:
        logger.info("🤖 ASSISTANT_DRAFT: No RAG context available, using base knowledge")

    if (status == "feedback" and state.get("human_comment")):
        # Feedback revision with context
        system_prompt = f"""You are an AI assistant revising your previous draft based on human feedback.

{f"RELEVANT DOCUMENTATION CONTEXT:\n{context}\n" if context else ""}

HUMAN FEEDBACK: "{state["human_comment"]}"

Instructions:
- Carefully address all points raised in the feedback
- Incorporate corrections and improvements suggested
- Use the documentation context to ensure accuracy
- Provide a comprehensive, improved response
- DO NOT repeat the feedback verbatim in your response"""
        
        system_message = SystemMessage(content=system_prompt)
        messages = [user_message] + state["messages"] + [system_message]
        all_messages = state["messages"]
        
        logger.debug("🤖 ASSISTANT_DRAFT: Processing feedback revision with context")
        
    else:
        # Initial draft with context
        context_instruction = ""
        if context:
            if confidence >= 0.8:
                context_instruction = "Base your response primarily on the provided documentation context, which has high confidence."
            elif confidence >= 0.5:
                context_instruction = "Use the provided documentation context as a reference, supplementing with your knowledge as needed."
            else:
                context_instruction = "The provided context has lower confidence. Use it as supporting information but rely more on your knowledge."
        
        system_prompt = f"""You are an AI documentation assistant. Provide accurate, helpful responses to user questions.

{f"RELEVANT DOCUMENTATION CONTEXT:\n{context}\n" if context else ""}
{f"Context Confidence: {confidence:.1%}\n" if confidence > 0 else ""}

Instructions:
- Provide a clear, comprehensive response to the user's question
- {context_instruction if context_instruction else "Use your knowledge to provide accurate information"}
- Structure your response logically with clear explanations
- Include practical examples where appropriate
- Be helpful and actionable in your advice"""
        
        system_message = SystemMessage(content=system_prompt)
        messages = [system_message, user_message]
        all_messages = state["messages"]
        
        logger.debug("🤖 ASSISTANT_DRAFT: Processing initial draft with context")
    
    # Get response from model
    try:
        response = model.invoke(messages)
        all_messages = all_messages + [response]
        
        generation_time_ms = (time.time() - generation_start) * 1000
        total_time_ms = state.get("response_generation_time_ms", 0) + generation_time_ms
        
        logger.info(f"🤖 ASSISTANT_DRAFT: Generated response in {generation_time_ms:.1f}ms (total: {total_time_ms:.1f}ms)")
        
        return {
            **state,
            "messages": all_messages,
            "assistant_response": response.content,
            "response_sources": sources,
            "response_generation_time_ms": total_time_ms
        }
        
    except Exception as e:
        logger.error(f"🤖 ASSISTANT_DRAFT ERROR: {e}")
        generation_time_ms = (time.time() - generation_start) * 1000
        total_time_ms = state.get("response_generation_time_ms", 0) + generation_time_ms
        
        return {
            **state,
            "assistant_response": "I apologize, but I encountered an error generating a response. Please try again.",
            "response_generation_time_ms": total_time_ms
        }

# --- Safe Human Feedback Node ---
def human_feedback(state: DraftReviewState):
    """Human feedback node with safe analytics integration"""
    
    try:
        # Safely import and use analytics
        from app.validation_analytics import record_approval, record_feedback
        
        # Extract data safely
        thread_id = state.get('thread_id', 'unknown')
        query = state.get('human_request', '')
        response = state.get('assistant_response', '')
        status = state.get('status', 'unknown')
        feedback_comment = state.get('human_comment')
        sources = state.get('rag_sources', [])
        confidence = state.get('retrieval_confidence', 0.0)
        
        logger.info(f"👤 HUMAN_FEEDBACK: Processing {status} action for thread {thread_id}")
        
        # Record analytics using utility functions
        if status == 'approved':
            record_approval(thread_id, query, response, sources, confidence)
        elif status == 'feedback' and feedback_comment:
            record_feedback(thread_id, query, response, feedback_comment, sources, confidence)
        
        # Store validated answer if approved
        if status == 'approved' and response:
            try:
                retriever = get_dual_retriever()
                
                # Get source chunk IDs if available
                source_chunks = []
                for source in sources:
                    chunk_ids = source.get('metadata', {}).get('chunk_ids', [])
                    if chunk_ids:
                        source_chunks.extend(chunk_ids)
                
                # Store validated answer
                retriever.add_validated_answer(
                    query=query,
                    answer=response,
                    thread_id=thread_id,
                    source_chunks=source_chunks,
                    feedback=feedback_comment
                )
                
                logger.info(f"👤 HUMAN_FEEDBACK: Stored validated answer for thread {thread_id}")
                
            except Exception as e:
                logger.error(f"👤 HUMAN_FEEDBACK: Error storing validated answer: {e}")
        
    except Exception as e:
        logger.error(f"👤 HUMAN_FEEDBACK: Error (non-critical): {e}")
    
    # Original function behavior - just pass through
    pass

# --- Assistant Finalize Node ---
def assistant_finalize(state: DraftReviewState) -> DraftReviewState:
    """Finalize the approved response"""
    
    finalize_start = time.time()
    
    # Get the most recent assistant response from the state
    latest_response = state["assistant_response"]
    
    logger.info(f"✨ ASSISTANT_FINALIZE: Polishing approved response ({len(latest_response)} chars)")
    
    system_message = SystemMessage(content="""You are an AI assistant finalizing an approved response.

The user has approved your draft. Your task is to:
- Polish the response for maximum clarity and professionalism
- Ensure all technical details are accurate and well-explained  
- Improve the structure and flow if needed
- Make it ready as a final, high-quality answer

DO NOT expand the response significantly or change its fundamental approach.
Focus on polishing the approved content.""")
    
    # Create focused message list
    user_message = HumanMessage(content=state["human_request"])
    assistant_message = HumanMessage(content=f"My approved draft to finalize: {latest_response}")
    
    messages = [system_message, user_message, assistant_message]
    
    try:
        response = model.invoke(messages)
        all_messages = state['messages'] + [response]
        
        finalize_time_ms = (time.time() - finalize_start) * 1000
        total_time_ms = state.get("response_generation_time_ms", 0) + finalize_time_ms
        
        logger.info(f"✨ ASSISTANT_FINALIZE: Completed in {finalize_time_ms:.1f}ms")
        
        return {
            **state,
            "messages": all_messages,
            "assistant_response": response.content,
            "response_generation_time_ms": total_time_ms
        }
        
    except Exception as e:
        logger.error(f"✨ ASSISTANT_FINALIZE ERROR: {e}")
        return state

# --- Router Function ---
def feedback_router(state: DraftReviewState) -> str:
    """Route based on user feedback status"""
    if state['status'] == 'approved':
        return 'assistant_finalize'
    else:
        return 'assistant_draft'

# --- Graph Construction ---
builder = StateGraph(DraftReviewState)

# Add nodes
builder.add_node('retrieve_context', retrieve_context)
builder.add_node('assistant_draft', assistant_draft)
builder.add_node('human_feedback', human_feedback)
builder.add_node('assistant_finalize', assistant_finalize)

# Add edges - CONFIRMED CORRECT
builder.add_edge(START, 'retrieve_context')
builder.add_edge('retrieve_context', 'assistant_draft')
builder.add_edge('assistant_draft', 'human_feedback')
builder.add_conditional_edges(
    'human_feedback', 
    feedback_router, 
    {
        'assistant_finalize': 'assistant_finalize', 
        'assistant_draft': 'assistant_draft'
    }
)
builder.add_edge('assistant_finalize', END)

memory = MemorySaver()
graph = builder.compile(interrupt_before=["human_feedback"], checkpointer=memory)

# --- DEBUG FUNCTION FOR TESTING ---
def test_retrieve_context_standalone(query: str = "How do I set up PhotoSphere?"):
    """Test retrieve_context node independently"""
    
    test_state = DraftReviewState(
        human_request=query,
        messages=[]
    )
    
    logger.info(f"🧪 Testing retrieve_context node with query: '{query}'")
    
    try:
        result = retrieve_context(test_state)
        
        sources = result.get('rag_sources', [])
        confidence = result.get('retrieval_confidence', 0.0)
        context = result.get('rag_context', '')
        
        logger.info(f"🧪 Test result: {len(sources)} sources, confidence: {confidence:.3f}")
        logger.info(f"🧪 Context length: {len(context)} chars")
        
        if sources:
            for i, source in enumerate(sources[:2]):
                logger.info(f"🧪   Source {i+1}: type={source.get('source_type')}, file={source.get('metadata', {}).get('file', 'Unknown')}")
        
        return len(sources) > 0
        
    except Exception as e:
        logger.error(f"🧪 Test failed: {e}")
        import traceback
        logger.error(f"🧪 Traceback: {traceback.format_exc()}")
        return False

# --- Exports ---
__all__ = ["graph", "DraftReviewState", "test_retrieve_context_standalone"]