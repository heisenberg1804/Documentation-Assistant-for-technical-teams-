import logging
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
    # NEW RAG-related fields
    rag_context: Optional[str] = None
    rag_sources: Optional[List[Dict]] = None
    response_sources: Optional[List[Dict]] = None
    retrieval_confidence: Optional[float] = None

# --- NEW: Retrieve Context Node ---
def retrieve_context(state: DraftReviewState) -> DraftReviewState:
    """
    Retrieve relevant context using dual-retrieval system
    
    This node:
    1. Takes the human_request from state
    2. Performs dual-retrieval (cache → validated → RAG)
    3. Formats context for LLM consumption
    4. Adds sources for frontend display
    """
    
    logger.info(f"Retrieving context for query: {state['human_request'][:50]}...")
    
    try:
        # Get retriever instance
        retriever = get_dual_retriever()
        
        # Perform retrieval
        query = state["human_request"]
        results = retriever.retrieve(query=query, top_k=5)
        
        if not results:
            logger.warning("No retrieval results found")
            return {**state, "rag_context": "", "rag_sources": [], "retrieval_confidence": 0.0}
        
        # Format context for LLM
        context_parts = []
        sources = []
        total_confidence = 0.0
        
        for i, result in enumerate(results, 1):
            # Add to context with clear labeling
            source_label = "✓ Validated Answer" if result.source == 'validated' else "📄 Documentation"
            context_parts.append(
                f"[Source {i}: {source_label} - Confidence: {result.confidence:.2f}]\n"
                f"{result.content}\n"
            )
            
            # Prepare source for frontend
            sources.append({
                "index": i,
                "content": result.content[:300] + "..." if len(result.content) > 300 else result.content,
                "source_type": result.source,
                "confidence": result.confidence,
                "metadata": {
                    "file": result.metadata.get('source_file', 'Unknown'),
                    "section": result.metadata.get('section', ''),
                    "validated": result.source == 'validated',
                    "validation_info": result.validation_info
                }
            })
            
            total_confidence += result.confidence
        
        # Calculate average confidence
        avg_confidence = total_confidence / len(results)
        
        # Join context
        formatted_context = "\n---\n".join(context_parts)
        
        logger.info(f"Retrieved {len(results)} sources with avg confidence: {avg_confidence:.3f}")
        
        # Update state
        return {
            **state,
            "rag_context": formatted_context,
            "rag_sources": sources,
            "retrieval_confidence": avg_confidence
        }
        
    except Exception as e:
        logger.error(f"Error in retrieve_context: {e}")
        # Graceful degradation - continue without context
        return {
            **state,
            "rag_context": "",
            "rag_sources": [],
            "retrieval_confidence": 0.0
        }

# --- MODIFIED: Enhanced Assistant Draft Node ---
def assistant_draft(state: DraftReviewState) -> DraftReviewState:
    """Enhanced assistant draft with RAG context"""
    
    # Get RAG context if available
    context = state.get("rag_context", "")
    sources = state.get("rag_sources", [])
    confidence = state.get("retrieval_confidence", 0.0)
    
    user_message = HumanMessage(content=state["human_request"])
    status = state.get("status", "approved")
    
    # Log context usage
    if context:
        logger.info(f"Using RAG context with {len(sources)} sources, confidence: {confidence:.3f}")
    else:
        logger.info("No RAG context available, using base knowledge")

    if (status == "feedback" and state.get("human_comment")):
        # Feedback revision with context
        system_prompt = f"""You are an AI assistant revising your previous draft.

{f"RELEVANT DOCUMENTATION CONTEXT:\n{context}\n" if context else ""}
FEEDBACK FROM HUMAN: "{state["human_comment"]}"

Carefully incorporate this feedback into your response. Address all comments, 
corrections, or suggestions. Ensure your revised response fully integrates 
the feedback, improves clarity, and resolves any issues raised.

{f"Use the documentation context above to ensure accuracy and completeness." if context else ""}
DO NOT repeat the feedback verbatim in your response.
"""
        
        system_message = SystemMessage(content=system_prompt)
        messages = [user_message] + state["messages"] + [system_message]
        all_messages = state["messages"]
        
        logger.debug("Processing feedback revision with context")
        
    else:
        # Initial draft with context
        context_instruction = ""
        if context:
            if confidence >= 0.8:
                context_instruction = "Base your response primarily on the provided documentation context, which has high confidence."
            elif confidence >= 0.5:
                context_instruction = "Use the provided documentation context as a reference, but supplement with your knowledge as needed."
            else:
                context_instruction = "The provided context has low confidence. Use it cautiously and rely more on your base knowledge."
        
        system_prompt = f"""You are an AI assistant. Your goal is to fully understand and fulfill the user's 
request by preparing a relevant, clear, and helpful draft reply.

{f"RELEVANT DOCUMENTATION CONTEXT:\n{context}\n" if context else ""}
{f"Confidence Level: {confidence:.1%}\n" if confidence > 0 else ""}

Focus on addressing the user's needs directly and comprehensively.
{context_instruction}
Be accurate and cite specific details when relevant.
Do not reference any previous human feedback at this stage.
"""
        
        system_message = SystemMessage(content=system_prompt)
        messages = [system_message, user_message]
        all_messages = state["messages"]
        
        logger.debug("Processing initial draft with context")
    
    # Get response from model
    try:
        response = model.invoke(messages)
        all_messages = all_messages + [response]
        
        logger.info("Generated assistant response successfully")
        
        return {
            **state,
            "messages": all_messages,
            "assistant_response": response.content,
            "response_sources": sources  # Pass sources forward for frontend
        }
        
    except Exception as e:
        logger.error(f"Error generating assistant response: {e}")
        # Return error state
        return {
            **state,
            "assistant_response": "I apologize, but I encountered an error generating a response. Please try again."
        }

# --- MODIFIED: Enhanced Human Feedback Node ---
def human_feedback(state: DraftReviewState):
    """
    Enhanced human feedback node that stores validated answers
    
    When user approves (status='approved'), store the validated answer
    """
    
    # Check if we should store a validated answer
    if state.get('status') == 'approved' and state.get('assistant_response'):
        try:
            retriever = get_dual_retriever()
            
            # Get source chunk IDs if available
            source_chunks = []
            if state.get('rag_sources'):
                for source in state['rag_sources']:
                    chunk_ids = source.get('metadata', {}).get('chunk_ids', [])
                    if chunk_ids:
                        source_chunks.extend(chunk_ids)
            
            # Store validated answer
            retriever.add_validated_answer(
                query=state['human_request'],
                answer=state['assistant_response'],
                thread_id=state.get('thread_id', 'unknown'),
                source_chunks=source_chunks,
                feedback=state.get('human_comment')
            )
            
            logger.info("Stored validated answer successfully")
            
        except Exception as e:
            logger.error(f"Error storing validated answer: {e}")
    
    # Original function behavior - just pass through
    pass

# --- UNCHANGED: Assistant Finalize Node ---
def assistant_finalize(state: DraftReviewState) -> DraftReviewState:
    """Finalize the approved response"""
    
    # Get the most recent assistant response from the state
    latest_response = state["assistant_response"]
    
    system_message = SystemMessage(content="""
You are an AI assistant. The user has approved your draft. Carefully 
review your reply and make any final improvements to clarity, tone, and 
completeness. Ensure the response is polished, professional, and ready 
to be delivered as the final answer.

DO NOT expand the response significantly or revert to earlier versions.
Focus on polishing the MOST RECENT draft that was approved.
""")
    
    # Create a focused message list with just the original request and latest response
    user_message = HumanMessage(content=state["human_request"])
    assistant_message = HumanMessage(content=f"My previous draft: {latest_response}")
    
    # Use a more focused set of messages for the finalize step
    messages = [system_message, user_message, assistant_message]
    
    try:
        response = model.invoke(messages)
        all_messages = state['messages'] + [response]
        
        logger.info("Finalized assistant response")
        
        return {
            **state,
            "messages": all_messages,
            "assistant_response": response.content
        }
        
    except Exception as e:
        logger.error(f"Error finalizing response: {e}")
        # Return the draft as-is if finalization fails
        return state

# --- UNCHANGED: Router Function ---
def feedback_router(state: DraftReviewState) -> str:
    """Route based on user feedback status"""
    if state['status'] == 'approved':
        return 'assistant_finalize'
    else:
        return 'assistant_draft'

# --- MODIFIED: Graph Construction with retrieve_context ---
builder = StateGraph(DraftReviewState)

# Add nodes
builder.add_node('retrieve_context', retrieve_context)  # NEW
builder.add_node('assistant_draft', assistant_draft)
builder.add_node('human_feedback', human_feedback)
builder.add_node('assistant_finalize', assistant_finalize)

# Modified edges to include retrieve_context
builder.add_edge(START, 'retrieve_context')  # NEW: Start with retrieval
builder.add_edge('retrieve_context', 'assistant_draft')  # NEW: Then draft
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

# --- Exports ---
__all__ = ["graph", "DraftReviewState"]