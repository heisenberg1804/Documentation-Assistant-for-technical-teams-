from pydantic import BaseModel
from typing import Optional, List, Dict, Literal

# --- Start Graph Run ---
class StartRequest(BaseModel):
    human_request: str

# --- Resume Paused Graph Run ---
class ResumeRequest(BaseModel):
    thread_id: str
    review_action: Literal["approved", "feedback"]
    human_comment: Optional[str] = None

# --- Minimal API Response ---
class GraphResponse(BaseModel):
    thread_id: str
    run_status: Literal["finished", "user_feedback", "pending"]
    assistant_response: Optional[str] = None

# --- Document Upload Request ---
class DocumentUploadResponse(BaseModel):
    status: Literal["success", "error"]
    filename: str
    chunks_created: Optional[int] = None
    error_message: Optional[str] = None

# --- Document Status Response ---
class DocumentStatusResponse(BaseModel):
    total_chunks: int
    total_validated: int
    cache_stats: Dict[str, int]