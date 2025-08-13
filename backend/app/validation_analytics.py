"""
Minimal Validation Analytics Module - Working Day 3 Version

Simplified analytics system that avoids import cycles and coroutine issues.
Focuses on core validation tracking without complex dependencies.
"""

import logging
from typing import Dict, List, Optional
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)

@dataclass
class ValidationEvent:
    """Single validation event record"""
    thread_id: str
    query: str
    response: str
    action: str  # 'approved', 'feedback', 'rejected'
    timestamp: datetime
    feedback_comment: Optional[str] = None
    source_count: int = 0
    retrieval_confidence: float = 0.0
    processing_time_ms: Optional[float] = None

class ValidationAnalytics:
    """Minimal analytics system for validation tracking"""
    
    def __init__(self):
        # Simple in-memory storage
        self.validation_events: List[ValidationEvent] = []
        logger.info("ValidationAnalytics initialized (minimal version)")
    
    def record_validation_event(self, 
                              thread_id: str,
                              query: str,
                              response: str,
                              action: str,
                              feedback_comment: Optional[str] = None,
                              source_count: int = 0,
                              retrieval_confidence: float = 0.0,
                              processing_time_ms: Optional[float] = None) -> None:
        """Record a validation event for tracking"""
        
        event = ValidationEvent(
            thread_id=thread_id,
            query=query,
            response=response,
            action=action,
            timestamp=datetime.now(),
            feedback_comment=feedback_comment,
            source_count=source_count,
            retrieval_confidence=retrieval_confidence,
            processing_time_ms=processing_time_ms
        )
        
        self.validation_events.append(event)
        
        logger.info(f"Recorded validation event: {action} for thread {thread_id} "
                   f"(confidence: {retrieval_confidence:.3f}, sources: {source_count})")
    
    def get_simple_stats(self) -> Dict:
        """Get basic validation statistics"""
        
        if not self.validation_events:
            return {
                "total_events": 0,
                "approval_rate": 0.0,
                "feedback_rate": 0.0,
                "avg_confidence": 0.0,
                "message": "No validation events recorded yet"
            }
        
        total = len(self.validation_events)
        approved = sum(1 for e in self.validation_events if e.action == 'approved')
        feedback_given = sum(1 for e in self.validation_events if e.action == 'feedback')
        
        avg_confidence = sum(e.retrieval_confidence for e in self.validation_events) / total
        
        # Calculate average processing time if available
        times = [e.processing_time_ms for e in self.validation_events if e.processing_time_ms is not None]
        avg_processing_time = sum(times) / len(times) if times else 0.0
        
        return {
            "total_events": total,
            "approval_rate": approved / total,
            "feedback_rate": feedback_given / total,
            "avg_confidence": avg_confidence,
            "avg_processing_time_ms": avg_processing_time,
            "recent_events": min(total, 10)  # Show we have recent activity
        }
    
    def get_recent_feedback(self, limit: int = 5) -> List[Dict]:
        """Get recent feedback events"""
        
        feedback_events = [
            e for e in self.validation_events
            if e.action == 'feedback' and e.feedback_comment
        ]
        
        # Get most recent feedback
        recent_feedback = sorted(feedback_events, key=lambda x: x.timestamp, reverse=True)[:limit]
        
        return [
            {
                "query_preview": event.query[:100] + "..." if len(event.query) > 100 else event.query,
                "feedback": event.feedback_comment,
                "confidence": event.retrieval_confidence,
                "timestamp": event.timestamp.isoformat()
            }
            for event in recent_feedback
        ]
    
    def clear_events(self):
        """Clear all recorded events (for testing)"""
        self.validation_events.clear()
        logger.info("Cleared all validation events")

# Singleton instance
_validation_analytics = None

def get_validation_analytics() -> ValidationAnalytics:
    """Get singleton validation analytics instance - SYNCHRONOUS"""
    global _validation_analytics
    if _validation_analytics is None:
        _validation_analytics = ValidationAnalytics()
    return _validation_analytics

# Utility functions for safe usage
def record_approval(thread_id: str, query: str, response: str, sources: List = None, confidence: float = 0.0):
    """Utility function to safely record approval"""
    try:
        analytics = get_validation_analytics()
        analytics.record_validation_event(
            thread_id=thread_id,
            query=query,
            response=response,
            action="approved",
            source_count=len(sources) if sources else 0,
            retrieval_confidence=confidence
        )
    except Exception as e:
        logger.error(f"Error recording approval: {e}")

def record_feedback(thread_id: str, query: str, response: str, feedback_comment: str, sources: List = None, confidence: float = 0.0):
    """Utility function to safely record feedback"""
    try:
        analytics = get_validation_analytics()
        analytics.record_validation_event(
            thread_id=thread_id,
            query=query,
            response=response,
            action="feedback",
            feedback_comment=feedback_comment,
            source_count=len(sources) if sources else 0,
            retrieval_confidence=confidence
        )
    except Exception as e:
        logger.error(f"Error recording feedback: {e}")