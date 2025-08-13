import React, { useState, useRef, useEffect } from "react";
import AssistantService from "./AssistantService";
import ReactMarkdown from "react-markdown";

// Prevent MetaMask errors by setting ethereum to null if it's not needed
if (window.ethereum) {
  console.log("MetaMask detected but not needed for this application");
  window.ethereum.autoRefreshOnNetworkChange = false;
}

// Flag to toggle between blocking API and streaming API
const USE_STREAMING = true;

const App = () => {
  // UI states: idle, waiting, user_feedback, finished
  const [uiState, setUiState] = useState("idle");
  const [question, setQuestion] = useState("");
  const [assistantResponse, setAssistantResponse] = useState("");
  const [feedback, setFeedback] = useState("");
  const [threadId, setThreadId] = useState(null);
  const [history, setHistory] = useState([]);
  
  // NEW: RAG-related states
  const [sources, setSources] = useState([]);
  const [retrievalConfidence, setRetrievalConfidence] = useState(null);
  const [documentStats, setDocumentStats] = useState({ total_chunks: 0, total_validated: 0 });
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Refs for tracking accumulated responses in streaming mode
  const startAccumulatedResponseRef = useRef("");
  const approveAccumulatedResponseRef = useRef("");
  const feedbackAccumulatedResponseRef = useRef("");
  
  const feedbackInputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (uiState === "user_feedback" && feedbackInputRef.current) {
      feedbackInputRef.current.focus();
    }
  }, [uiState]);

  // Load document statistics on component mount
  useEffect(() => {
    loadDocumentStats();
  }, []);

  const loadDocumentStats = async () => {
    try {
      const stats = await AssistantService.getDocumentStats();
      setDocumentStats(stats);
      console.log("Loaded document stats:", stats);
    } catch (error) {
      console.warn("Failed to load document stats:", error);
    }
  };

  // Handle sources event from streaming
  const handleSourcesEvent = (data) => {
    if (data.sources && Array.isArray(data.sources)) {
      setSources(data.sources);
      setRetrievalConfidence(data.confidence || null);
      console.log(`Received ${data.sources.length} sources with confidence: ${(data.confidence * 100).toFixed(1)}%`);
    }
  };

  // Clear sources when starting new conversation
  const clearSources = () => {
    setSources([]);
    setRetrievalConfidence(null);
  };

  // NEW: Handle file upload
  const handleFileUpload = async (files) => {
    const fileArray = Array.from(files);
    console.log("Uploading files:", fileArray.map(f => f.name));
    
    try {
      for (const file of fileArray) {
        const result = await AssistantService.uploadDocument(file);
        console.log("Upload result:", result);
        
        if (result.status === 'success') {
          alert(`✅ Successfully uploaded ${file.name} (${result.chunks_created} chunks)`);
        } else {
          alert(`❌ Failed to upload ${file.name}: ${result.error_message}`);
        }
      }
      
      // Refresh document stats
      await loadDocumentStats();
      setShowUploadModal(false);
      
    } catch (error) {
      alert(`Upload failed: ${error.message}`);
    }
  };

  // Simple inline source display
  const SourceDisplay = ({ sources, confidence }) => {
    if (!sources || sources.length === 0) return null;

    return (
      <div style={{
        margin: '12px 0',
        padding: '8px 12px',
        backgroundColor: '#f8faff',
        border: '1px solid #e0e7ff',
        borderRadius: 4,
        fontSize: 12
      }}>
        <div style={{ fontWeight: 600, marginBottom: 4, color: '#1565c0' }}>
          📚 Sources ({sources.length}) - Confidence: {(confidence * 100).toFixed(0)}%
        </div>
        {sources.slice(0, 3).map((source, idx) => (
          <div key={idx} style={{ marginBottom: 2, color: '#666' }}>
            • {source.metadata?.file || 'Unknown'} 
            {source.metadata?.section && ` → ${source.metadata.section}`}
            <span style={{ 
              marginLeft: 8,
              color: source.confidence >= 0.8 ? '#4caf50' : source.confidence >= 0.6 ? '#ff9800' : '#f44336',
              fontWeight: 500
            }}>
              ({(source.confidence * 100).toFixed(0)}%)
            </span>
          </div>
        ))}
        {sources.length > 3 && (
          <div style={{ color: '#888', fontStyle: 'italic' }}>
            ...and {sources.length - 3} more sources
          </div>
        )}
      </div>
    );
  };

  // Simple upload modal
  const UploadModal = () => {
    if (!showUploadModal) return null;

    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 24,
          maxWidth: 400,
          width: '90%'
        }}>
          <h3>Upload Documents</h3>
          <div style={{ marginBottom: 16 }}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".md,.pdf,.txt"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileUpload(e.target.files);
                }
              }}
              style={{ width: '100%', padding: 8 }}
            />
          </div>
          <div style={{ textAlign: 'right' }}>
            <button
              onClick={() => setShowUploadModal(false)}
              style={{ padding: '8px 16px', marginRight: 8 }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Submit handlers
  const handleStart = async () => {
    // Show user message and pending spinner immediately
    setUiState("waiting");
    clearSources();
    setHistory([
      { role: "user", content: question },
      { role: "assistant", content: null } // null means pending/spinner
    ]);
    
    try {
      if (!USE_STREAMING) {
        // Original blocking API call
        const data = await AssistantService.startConversation(question);
        setAssistantResponse(data.assistant_response);
        setUiState("idle");
        setThreadId(data.thread_id);
        setHistory([
          { role: "user", content: question },
          { role: "assistant", content: data.assistant_response }
        ]);
      } else {
        // Streaming API call
        const data = await AssistantService.createStreamingConversation(question);
        setThreadId(data.thread_id);
        
        // Initialize an empty response that will be built up token by token
        setAssistantResponse("");
        
        // Reset the accumulated response ref for this session
        startAccumulatedResponseRef.current = "";
        
        // Start streaming the response
        const eventSource = AssistantService.streamResponse(
          data.thread_id,
          // Message callback - handle incoming tokens and sources
          (data) => {
            if (data.content) {
              // Update our ref with the new content
              startAccumulatedResponseRef.current += data.content;
              
              // Update React state with the accumulated content
              setAssistantResponse(startAccumulatedResponseRef.current);
              
              // Update history with current accumulated response
              setHistory([
                { role: "user", content: question },
                { role: "assistant", content: startAccumulatedResponseRef.current }
              ]);
            } else if (data.sources) {
              // Handle sources event
              handleSourcesEvent(data);
            } else if (data.status) {
              // Update UI state based on status updates
              if (data.status === "user_feedback") {
                setUiState("idle"); // Show review buttons
              } else if (data.status === "finished") {
                setUiState("finished");
              }
            }
          },
          // Error callback
          (error) => {
            console.error("Streaming error:", error);
            setUiState("idle");
            const errorMessage = error && error.message ? error.message : "Unknown error";
            alert("Streaming error: " + errorMessage);
          },
          // Complete callback
          () => {
            console.log("Stream completed");
          }
        );
      }
    } catch (err) {
      setAssistantResponse("");
      setUiState("idle");
      clearSources();
      const errorMessage = err && err.message ? err.message : "Unknown error";
      alert("Failed to contact backend: " + errorMessage);
    }
  };

  const handleApprove = async () => {
    setUiState("waiting");
    setHistory([...history, { role: "assistant", content: null }]); // Show spinner
    
    try {
      if (!USE_STREAMING) {
        const data = await AssistantService.submitReview({
          thread_id: threadId,
          review_action: "approved"
        });
        setAssistantResponse(data.assistant_response);
        setUiState("finished");
        setHistory(prev => [
          ...prev.slice(0, -1),
          { role: "assistant", content: data.assistant_response }
        ]);
      } else {
        const data = await AssistantService.resumeStreamingConversation({
          thread_id: threadId,
          review_action: "approved"
        });
        
        setAssistantResponse("");
        approveAccumulatedResponseRef.current = "";
        
        const eventSource = AssistantService.streamResponse(
          threadId,
          (data) => {
            if (data.content) {
              approveAccumulatedResponseRef.current += data.content;
              setAssistantResponse(approveAccumulatedResponseRef.current);
              setHistory(prev => [
                ...prev.slice(0, -1),
                { role: "assistant", content: approveAccumulatedResponseRef.current }
              ]);
            } else if (data.status) {
              if (data.status === "finished") {
                setUiState("finished");
                loadDocumentStats(); // Refresh stats after validation
              }
            }
          },
          (error) => {
            console.error("Streaming error:", error);
            setUiState("idle");
            const errorMessage = error && error.message ? error.message : "Unknown error";
            alert("Streaming error: " + errorMessage);
          },
          () => {
            console.log("Stream completed");
          }
        );
      }
    } catch (err) {
      setUiState("idle");
      const errorMessage = err && err.message ? err.message : "Unknown error";
      alert("Failed to contact backend: " + errorMessage);
    }
  };

  const handleFeedback = async () => {
    setUiState("waiting");
    setHistory([
      ...history,
      { role: "user", content: feedback },
      { role: "assistant", content: null }
    ]);
    
    try {
      if (!USE_STREAMING) {
        const data = await AssistantService.submitReview({
          thread_id: threadId,
          review_action: "feedback",
          human_comment: feedback
        });
        setAssistantResponse(data.assistant_response);
        setUiState("idle");
        setHistory(prev => [
          ...prev.slice(0, -1),
          { role: "assistant", content: data.assistant_response }
        ]);
        setFeedback("");
      } else {
        const data = await AssistantService.resumeStreamingConversation({
          thread_id: threadId,
          review_action: "feedback",
          human_comment: feedback
        });
        
        setAssistantResponse("");
        feedbackAccumulatedResponseRef.current = "";
        
        const eventSource = AssistantService.streamResponse(
          threadId,
          (data) => {
            if (data.content) {
              feedbackAccumulatedResponseRef.current += data.content;
              setAssistantResponse(feedbackAccumulatedResponseRef.current);
              setHistory(prev => [
                ...prev.slice(0, -1),
                { role: "assistant", content: feedbackAccumulatedResponseRef.current }
              ]);
            } else if (data.sources) {
              handleSourcesEvent(data);
            } else if (data.status) {
              if (data.status === "user_feedback") {
                setUiState("idle");
              } else if (data.status === "finished") {
                setUiState("finished");
              }
            }
          },
          (error) => {
            console.error("Streaming error:", error);
            setUiState("idle");
            const errorMessage = error && error.message ? error.message : "Unknown error";
            alert("Streaming error: " + errorMessage);
          },
          () => {
            console.log("Stream completed");
          }
        );
        
        setFeedback("");
      }
    } catch (err) {
      setUiState("idle");
      const errorMessage = err && err.message ? err.message : "Unknown error";
      alert("Failed to contact backend: " + errorMessage);
    }
  };

  // Render
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', margin: '40px auto', fontFamily: 'sans-serif' }}>
      
      {/* Left Sidebar */}
      <div style={{ flex: '0 0 320px', maxWidth: 320, marginRight: 32, background: '#fafbfc', borderRadius: 8, border: '1px solid #eee', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <img src="/hitl-assistent.png" alt="HITL Graph" style={{ width: '75%', height: 'auto', borderRadius: 6, boxShadow: '0 2px 12px #0001', marginBottom: 16 }} />
        <div style={{ fontSize: 16, color: '#444', textAlign: 'center', marginBottom: 12 }}>
          HITL Assistant Graph
        </div>
        
        {/* Document Stats */}
        <div style={{ 
          width: '100%', 
          padding: 8, 
          backgroundColor: 'white', 
          borderRadius: 4, 
          border: '1px solid #ddd',
          fontSize: 12,
          color: '#666',
          marginBottom: 12
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: '#333' }}>Knowledge Base</div>
          <div>📄 {documentStats.total_chunks || 0} document chunks</div>
          <div>✅ {documentStats.total_validated || 0} validated answers</div>
        </div>

        {/* Upload Button */}
        <button
          onClick={() => setShowUploadModal(true)}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8
          }}
        >
          📄 Upload Documents
        </button>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: 600, width: '95%', padding: 24, border: '1px solid #eee', borderRadius: 8, position: 'relative', background: '#fff' }}>
        
        {/* Header with New Session Button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Human-in-the-Loop Assistant</h2>
          <button
            onClick={() => {
              setUiState("idle");
              setQuestion("");
              setAssistantResponse("");
              setFeedback("");
              setThreadId(null);
              setHistory([]);
              clearSources();
            }}
            style={{ padding: "8px 18px", fontSize: 16, borderRadius: 6, background: "#f5f5f5", border: "1px solid #ddd", cursor: "pointer" }}
          >
            New Session
          </button>
        </div>

        {/* Input Section */}
        {uiState === "idle" && history.length === 0 && (
          <div>
            <input
              type="text"
              placeholder="Ask a question..."
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleStart(); }}
              style={{ width: "70%", padding: 12, fontSize: 18, borderRadius: 6, border: '1px solid #bbb', marginRight: 8 }}
            />
            <button onClick={handleStart} style={{ padding: '12px 32px', fontSize: 20, borderRadius: 6, border: '1px solid #bbb', background: '#f5f5f5', cursor: 'pointer', height: 48 }}>Send</button>
          </div>
        )}

        {/* Sources Display */}
        {sources.length > 0 && uiState !== "finished" && (
          <SourceDisplay sources={sources} confidence={retrievalConfidence} />
        )}

        {/* Conversation History */}
        {history.length > 0 && (
          <div style={{ margin: "24px 0" }}>
            {history.map((msg, idx) => {
              // Hide the last assistant message if in finished state
              if (uiState === "finished" && msg.role === "assistant" && idx === history.length - 1) {
                return null;
              }
              
              let hint = null;
              if (msg.role === "user") {
                hint = idx === 0 ? "Initial request" : "Feedback";
              }
              
              return (
                <div key={idx} style={{ textAlign: msg.role === "user" ? "right" : "left", margin: "8px 0" }}>
                  {hint && (
                    <div style={{ fontSize: 12, color: "#888", marginBottom: 2 }}>{hint}</div>
                  )}
                  <span style={{
                    fontWeight: msg.role === "user" ? 600 : 700,
                    color: msg.role === "assistant" ? '#1976d2' : undefined,
                    background: msg.role === "assistant" ? 'rgba(25, 118, 210, 0.08)' : undefined,
                    padding: msg.role === "assistant" ? '2px 8px' : undefined,
                    borderRadius: msg.role === "assistant" ? 4 : undefined
                  }}>
                    {msg.role === "user" ? "You: " : "Assistant: "}
                  </span>
                  {msg.role === "assistant" && msg.content === null ? (
                    <div style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 6 }}>
                      <div style={{
                        border: "4px solid #eee",
                        borderTop: "4px solid #333",
                        borderRadius: "50%",
                        width: 24,
                        height: 24,
                        animation: "spin 1s linear infinite",
                        display: "inline-block"
                      }} />
                      <style>{`
                        @keyframes spin {
                          0% { transform: rotate(0deg); }
                          100% { transform: rotate(360deg); }
                        }
                      `}</style>
                    </div>
                  ) : msg.role === "assistant" ? (
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Feedback Form */}
        {uiState === "user_feedback" && (
          <div style={{ marginTop: 24, background: '#f8fafd', border: '1px solid #e3eaf2', borderRadius: 6, padding: 18 }}>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>Please provide feedback to improve the assistant's answer:</div>
            <textarea
              ref={feedbackInputRef}
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              rows={3}
              style={{ width: '95%', padding: 12, fontSize: 18, borderRadius: 6, border: '1px solid #bbb', resize: 'vertical' }}
              placeholder="Your feedback..."
            />
            <div style={{ marginTop: 8 }}>
              <button
                onClick={handleFeedback}
                style={{ marginRight: 8, padding: "8px 24px", height: 48, fontSize: 20 }}
              >
                Submit Feedback
              </button>
              <button
                onClick={() => {
                  setUiState("idle");
                  setFeedback("");
                }}
                style={{ padding: "8px 24px", height: 48, fontSize: 20 }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Review Buttons */}
        {uiState === "idle" && (
          (assistantResponse || (history.length > 0 && history[history.length - 1].role === "assistant" && history[history.length - 1].content)) && (
            <div style={{ marginTop: 24, textAlign: 'right' }}>
              <button
                onClick={handleApprove}
                style={{ marginRight: 8, padding: "8px 24px", height: 48, fontSize: 20 }}
              >
                Approve
              </button>
              <button
                onClick={() => setUiState("user_feedback")}
                style={{ padding: "8px 24px", height: 48, fontSize: 20 }}
              >
                Provide Feedback
              </button>
            </div>
          )
        )}

        {/* Final Version */}
        {uiState === "finished" && (
          <div style={{ marginTop: 24, background: '#f0f7ff', border: '1px solid #c2d8f2', borderRadius: 6, padding: 18 }}>
            <div style={{ marginBottom: 8, fontWeight: 600, color: '#1976d2' }}>Final Version:</div>
            
            {/* Confidence indicator */}
            {retrievalConfidence && (
              <div style={{ marginBottom: 12, fontSize: 11, color: '#666' }}>
                <span style={{
                  padding: '2px 8px',
                  backgroundColor: retrievalConfidence >= 0.8 ? '#e8f5e8' : '#fff3e0',
                  color: retrievalConfidence >= 0.8 ? '#2e7d32' : '#e65100',
                  border: `1px solid ${retrievalConfidence >= 0.8 ? '#4caf50' : '#ff9800'}`,
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 500
                }}>
                  Confidence: {(retrievalConfidence * 100).toFixed(0)}%
                </span>
                <span style={{ marginLeft: 8 }}>
                  ✅ This answer has been validated and will be prioritized in future queries
                </span>
              </div>
            )}
            
            <div style={{ padding: 12 }}>
              <ReactMarkdown>{assistantResponse}</ReactMarkdown>
            </div>

            {/* Sources in finished state */}
            {sources.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <SourceDisplay sources={sources} confidence={retrievalConfidence} />
              </div>
            )}
          </div>
        )}

        {/* Upload Modal */}
        <UploadModal />
      </div>
    </div>
  );
};

export default App;