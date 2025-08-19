import React, { useState, useRef, useEffect } from "react";
import AssistantService from "./AssistantService";
import ReactMarkdown from "react-markdown";
import SourceViewer from "./components/SourceViewer";
import ConfidenceIndicator from "./components/ConfidenceIndicator";
import DocumentUploader from "./components/DocumentUploader";

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
  
  // RAG-related states
  const [sources, setSources] = useState([]);
  const [retrievalConfidence, setRetrievalConfidence] = useState(null);
  const [documentStats, setDocumentStats] = useState({ total_chunks: 0, total_validated: 0 });
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [validationSuccess, setValidationSuccess] = useState(false);

  // Refs for tracking accumulated responses in streaming mode
  const startAccumulatedResponseRef = useRef("");
  const approveAccumulatedResponseRef = useRef("");
  const feedbackAccumulatedResponseRef = useRef("");
  
  const feedbackInputRef = useRef(null);

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
    setValidationSuccess(false);
  };

  // Enhanced file upload handler
  const handleFileUpload = async (files) => {
    const fileArray = Array.from(files);
    console.log("Uploading files:", fileArray.map(f => f.name));
    
    try {
      let totalChunks = 0;
      let successCount = 0;
      
      for (const file of fileArray) {
        const result = await AssistantService.uploadDocument(file);
        console.log("Upload result:", result);
        
        if (result.status === 'success') {
          successCount++;
          totalChunks += result.chunks_created || 0;
        }
      }
      
      if (successCount > 0) {
        alert(`✅ Successfully uploaded ${successCount} file(s) (${totalChunks} chunks created)`);
        await loadDocumentStats();
        setShowUploadModal(false);
      } else {
        alert(`❌ Failed to upload files. Please check file formats.`);
      }
      
    } catch (error) {
      alert(`Upload failed: ${error.message}`);
    }
  };

  // Enhanced ReactMarkdown with proper code formatting
  const MarkdownRenderer = ({ content }) => (
    <ReactMarkdown
      components={{
        code: ({node, inline, className, children, ...props}) => {
          const match = /language-(\w+)/.exec(className || '');
          const language = match ? match[1] : '';
          
          return !inline ? (
            <div style={{
              margin: '12px 0',
              border: '1px solid #e1e5e9',
              borderRadius: 6,
              overflow: 'hidden',
              backgroundColor: '#f8f9fa'
            }}>
              {language && (
                <div style={{
                  backgroundColor: '#e9ecef',
                  padding: '4px 12px',
                  fontSize: '12px',
                  color: '#495057',
                  fontWeight: 500,
                  borderBottom: '1px solid #e1e5e9'
                }}>
                  {language.toUpperCase()}
                </div>
              )}
              <pre style={{
                margin: 0,
                padding: '16px',
                overflowX: 'auto',
                backgroundColor: '#f8f9fa',
                fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
                fontSize: '14px',
                lineHeight: '1.4',
                maxWidth: '100%'
              }}>
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            </div>
          ) : (
            <code style={{
              backgroundColor: '#f3f4f6',
              padding: '2px 4px',
              borderRadius: 3,
              fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
              fontSize: '0.9em',
              color: '#e83e8c'
            }} {...props}>
              {children}
            </code>
          );
        },
        pre: ({children}) => children // Prevent double wrapping
      }}
    >
      {content}
    </ReactMarkdown>
  );

  // Simple inline source display for compact view
  const CompactSourceDisplay = ({ sources, confidence }) => {
    if (!sources || sources.length === 0) return null;

    return (
      <div style={{
        margin: '8px 0',
        padding: '6px 10px',
        backgroundColor: '#f0f7ff',
        border: '1px solid #c2d8f2',
        borderRadius: 4,
        fontSize: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}>
        <span style={{ fontWeight: 600, color: '#1565c0' }}>
          📚 {sources.length} source{sources.length !== 1 ? 's' : ''}
        </span>
        <ConfidenceIndicator 
          confidence={confidence} 
          sourceCount={sources.length}
          size="small"
        />
        <span style={{ color: '#666', fontSize: 11 }}>
          {sources.slice(0, 2).map(s => s.metadata?.file || 'Unknown').join(', ')}
          {sources.length > 2 && ` +${sources.length - 2} more`}
        </span>
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
              // Handle sources event - FIXED: This was missing
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
        setValidationSuccess(true);
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
                setValidationSuccess(true);
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

  // Enhanced new session handler
  const handleNewSession = () => {
    setUiState("idle");
    setQuestion("");
    setAssistantResponse("");
    setFeedback("");
    setThreadId(null);
    setHistory([]);
    clearSources();
  };

  // Query suggestions based on document stats
  const getQuerySuggestions = () => {
    if (documentStats.total_chunks === 0) {
      return [];
    }
    
    return [
      "What technologies are used in this project?",
      "How do I set up the development environment?",
      "What are the main features?",
      "How do I deploy this application?"
    ];
  };

  // Empty state component
  const EmptyState = () => (
    <div style={{
      textAlign: 'center',
      padding: '40px 20px',
      color: '#666'
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
      <h3 style={{ margin: '0 0 12px 0', color: '#333' }}>
        No documents uploaded yet
      </h3>
      <p style={{ margin: '0 0 20px 0', fontSize: 14 }}>
        Upload documentation to start asking questions
      </p>
      <button
        onClick={() => setShowUploadModal(true)}
        style={{
          padding: '12px 24px',
          backgroundColor: '#1976d2',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 16,
          fontWeight: 500
        }}
      >
        📄 Upload Your First Document
      </button>
    </div>
  );

  // Query suggestions component
  const QuerySuggestions = () => {
    const suggestions = getQuerySuggestions();
    
    if (suggestions.length === 0) return null;
    
    return (
      <div style={{
        marginTop: 16,
        padding: 12,
        backgroundColor: '#f8faff',
        border: '1px solid #e0e7ff',
        borderRadius: 6
      }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#1565c0',
          marginBottom: 8
        }}>
          💡 Try asking:
        </div>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6
        }}>
          {suggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => setQuestion(suggestion)}
              style={{
                padding: '4px 8px',
                fontSize: 11,
                backgroundColor: 'white',
                border: '1px solid #d0d7de',
                borderRadius: 4,
                cursor: 'pointer',
                color: '#24292f',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                e.target.style.backgroundColor = '#f6f8fa';
                e.target.style.borderColor = '#1976d2';
              }}
              onMouseOut={(e) => {
                e.target.style.backgroundColor = 'white';
                e.target.style.borderColor = '#d0d7de';
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    );
  };

  // Render
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'flex-start', 
      margin: '40px auto', 
      fontFamily: 'sans-serif',
      maxWidth: 1200,
      width: '95%'
    }}>
      
      {/* Left Sidebar */}
      <div style={{ 
        flex: '0 0 320px', 
        maxWidth: 320, 
        marginRight: 32, 
        background: '#fafbfc', 
        borderRadius: 8, 
        border: '1px solid #eee', 
        padding: 16, 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        height: 'fit-content'
      }}>
        <img 
          src="/hitl-assistent.png" 
          alt="HITL Graph" 
          style={{ 
            width: '75%', 
            height: 'auto', 
            borderRadius: 6, 
            boxShadow: '0 2px 12px #0001', 
            marginBottom: 16 
          }} 
        />
        <div style={{ 
          fontSize: 16, 
          color: '#444', 
          textAlign: 'center', 
          marginBottom: 12 
        }}>
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
          <div style={{ fontWeight: 600, marginBottom: 4, color: '#333' }}>
            Knowledge Base
          </div>
          <div>📄 {documentStats.total_chunks || 0} document chunks</div>
          <div>✅ {documentStats.total_validated || 0} validated answers</div>
          {documentStats.total_chunks > 0 && (
            <div style={{ 
              marginTop: 6, 
              padding: '3px 6px', 
              backgroundColor: documentStats.total_validated > 0 ? '#e8f5e8' : '#fff3e0',
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 500,
              color: documentStats.total_validated > 0 ? '#2e7d32' : '#e65100'
            }}>
              {documentStats.total_validated > 0 ? 
                `${Math.round((documentStats.total_validated / documentStats.total_chunks) * 100)}% coverage` :
                'Learning mode active'
              }
            </div>
          )}
        </div>

        {/* Upload Button - Only show when modal is closed */}
        {!showUploadModal && (
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
        )}

        {/* Upload status when modal is open */}
        {showUploadModal && (
          <div style={{
            width: '100%',
            padding: 12,
            backgroundColor: '#f0f7ff',
            border: '1px solid #c2d8f2',
            borderRadius: 6,
            fontSize: 12,
            color: '#1565c0',
            textAlign: 'center'
          }}>
            📤 Upload in progress...
          </div>
        )}
      </div>

      {/* Main Content */}
      <div style={{ 
        maxWidth: 600, 
        width: '100%', 
        padding: 24, 
        border: '1px solid #eee', 
        borderRadius: 8, 
        position: 'relative', 
        background: '#fff' 
      }}>
        
        {/* Header with New Session Button */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: 16 
        }}>
          <h2 style={{ margin: 0 }}>AI Documentation Assistant</h2>
          <button
            onClick={handleNewSession}
            style={{ 
              padding: "8px 18px", 
              fontSize: 16, 
              borderRadius: 6, 
              background: "#f5f5f5", 
              border: "1px solid #ddd", 
              cursor: "pointer" 
            }}
          >
            New Session
          </button>
        </div>

        {/* Empty State or Input Section */}
        {uiState === "idle" && history.length === 0 && (
          documentStats.total_chunks === 0 ? (
            <EmptyState />
          ) : (
            <div>
              <input
                type="text"
                placeholder="Ask a question about your documentation..."
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && question.trim()) handleStart(); }}
                style={{ 
                  width: "70%", 
                  padding: 12, 
                  fontSize: 18, 
                  borderRadius: 6, 
                  border: '1px solid #bbb', 
                  marginRight: 8 
                }}
              />
              <button 
                onClick={handleStart}
                disabled={!question.trim()}
                style={{ 
                  padding: '12px 32px', 
                  fontSize: 20, 
                  borderRadius: 6, 
                  border: '1px solid #bbb', 
                  background: question.trim() ? '#1976d2' : '#f5f5f5',
                  color: question.trim() ? 'white' : '#999',
                  cursor: question.trim() ? 'pointer' : 'not-allowed', 
                  height: 48 
                }}
              >
                Send
              </button>
              
              {/* Query Suggestions */}
              <QuerySuggestions />
            </div>
          )
        )}

        {/* Sources Display - Show during waiting and idle states */}
        {sources.length > 0 && (uiState === "waiting" || uiState === "idle") && (
          <div style={{ margin: '16px 0' }}>
            <CompactSourceDisplay sources={sources} confidence={retrievalConfidence} />
            <SourceViewer 
              sources={sources} 
              confidence={retrievalConfidence}
              isVisible={true}
            />
          </div>
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
                <div key={idx} style={{ 
                  textAlign: msg.role === "user" ? "right" : "left", 
                  margin: "12px 0" 
                }}>
                  {hint && (
                    <div style={{ fontSize: 12, color: "#888", marginBottom: 2 }}>
                      {hint}
                    </div>
                  )}
                  <div style={{
                    display: 'inline-block',
                    maxWidth: '85%',
                    padding: msg.role === "assistant" ? '12px 16px' : '8px 12px',
                    backgroundColor: msg.role === "assistant" ? 'rgba(25, 118, 210, 0.08)' : '#f0f7ff',
                    border: msg.role === "assistant" ? '1px solid rgba(25, 118, 210, 0.2)' : '1px solid #c2d8f2',
                    borderRadius: msg.role === "assistant" ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    textAlign: 'left'
                  }}>
                    <span style={{
                      fontWeight: msg.role === "user" ? 600 : 700,
                      color: msg.role === "assistant" ? '#1976d2' : '#1565c0',
                      fontSize: 13,
                      marginBottom: msg.role === "assistant" ? 6 : 0,
                      display: 'block'
                    }}>
                      {msg.role === "user" ? "You" : "Assistant"}
                    </span>
                    
                    {msg.role === "assistant" && msg.content === null ? (
                      <div style={{ 
                        display: "flex", 
                        alignItems: "center",
                        gap: 8,
                        color: '#666'
                      }}>
                        <div style={{
                          border: "3px solid #eee",
                          borderTop: "3px solid #1976d2",
                          borderRadius: "50%",
                          width: 20,
                          height: 20,
                          animation: "spin 1s linear infinite"
                        }} />
                        <span style={{ fontSize: 14 }}>
                          {sources.length > 0 ? "Generating response..." : "Finding relevant sources..."}
                        </span>
                        <style>{`
                          @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                          }
                        `}</style>
                      </div>
                    ) : msg.role === "assistant" ? (
                      <MarkdownRenderer content={msg.content} />
                    ) : (
                      <div style={{ fontSize: 15, lineHeight: 1.4 }}>
                        {msg.content}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Feedback Form */}
        {uiState === "user_feedback" && (
          <div style={{ 
            marginTop: 24, 
            background: '#f8fafd', 
            border: '1px solid #e3eaf2', 
            borderRadius: 6, 
            padding: 18 
          }}>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>
              Please provide feedback to improve the assistant's answer:
            </div>
            <textarea
              ref={feedbackInputRef}
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              rows={3}
              style={{ 
                width: '95%', 
                padding: 12, 
                fontSize: 16, 
                borderRadius: 6, 
                border: '1px solid #bbb', 
                resize: 'vertical',
                fontFamily: 'inherit'
              }}
              placeholder="Your feedback..."
            />
            <div style={{ marginTop: 12 }}>
              <button
                onClick={handleFeedback}
                disabled={!feedback.trim()}
                style={{ 
                  marginRight: 8, 
                  padding: "10px 24px", 
                  fontSize: 16,
                  backgroundColor: feedback.trim() ? '#1976d2' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: feedback.trim() ? 'pointer' : 'not-allowed'
                }}
              >
                Submit Feedback
              </button>
              <button
                onClick={() => {
                  setUiState("idle");
                  setFeedback("");
                }}
                style={{ 
                  padding: "10px 24px", 
                  fontSize: 16,
                  backgroundColor: '#f5f5f5',
                  color: '#333',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Enhanced Review Buttons */}
        {uiState === "idle" && (
          (assistantResponse || (history.length > 0 && history[history.length - 1].role === "assistant" && history[history.length - 1].content)) && (
            <div style={{ marginTop: 24 }}>
              {/* Show confidence indicator if available */}
              {retrievalConfidence && (
                <div style={{ marginBottom: 12, textAlign: 'center' }}>
                  <ConfidenceIndicator 
                    confidence={retrievalConfidence}
                    sourceCount={sources.length}
                    size="medium"
                  />
                </div>
              )}
              
              <div style={{ textAlign: 'right' }}>
                <button
                  onClick={handleApprove}
                  style={{ 
                    marginRight: 8, 
                    padding: "12px 24px", 
                    fontSize: 16,
                    backgroundColor: '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    float: 'right',
                    marginLeft: 8
                  }}
                >
                  ✓ Approve & Validate
                </button>
                <button
                  onClick={() => setUiState("user_feedback")}
                  style={{ 
                    padding: "12px 24px", 
                    fontSize: 16,
                    backgroundColor: '#ff9800',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontWeight: 500,
                    float: 'right'
                  }}
                >
                  💬 Provide Feedback
                </button>
                <div style={{ clear: 'both' }} />
              </div>
            </div>
          )
        )}

        {/* Enhanced Final Version with Validation Success */}
        {uiState === "finished" && (
          <div style={{ marginTop: 24 }}>
            {/* Validation Success Message */}
            {validationSuccess && (
              <div style={{
                marginBottom: 16,
                padding: 12,
                backgroundColor: '#e8f5e8',
                border: '1px solid #4caf50',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <span style={{ fontSize: 16 }}>✅</span>
                <div>
                  <div style={{ fontWeight: 600, color: '#2e7d32', fontSize: 14 }}>
                    Answer Validated Successfully
                  </div>
                  <div style={{ fontSize: 12, color: '#388e3c', marginTop: 2 }}>
                    This response will be prioritized in future queries
                  </div>
                </div>
                {retrievalConfidence && (
                  <div style={{ marginLeft: 'auto' }}>
                    <ConfidenceIndicator 
                      confidence={retrievalConfidence}
                      sourceCount={sources.length}
                      hasValidated={true}
                      size="small"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Final Response */}
            <div style={{ 
              background: '#f0f7ff', 
              border: '1px solid #c2d8f2', 
              borderRadius: 6, 
              padding: 18 
            }}>
              <div style={{ 
                marginBottom: 8, 
                fontWeight: 600, 
                color: '#1976d2',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                Final Validated Response:
                {validationSuccess && (
                  <span style={{
                    backgroundColor: '#4caf50',
                    color: 'white',
                    padding: '2px 6px',
                    borderRadius: 10,
                    fontSize: 10,
                    fontWeight: 500
                  }}>
                    VALIDATED
                  </span>
                )}
              </div>
              
              <div style={{ padding: 12 }}>
                <MarkdownRenderer content={assistantResponse} />
              </div>

              {/* Sources in finished state */}
              {sources.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <CompactSourceDisplay sources={sources} confidence={retrievalConfidence} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Upload Modal */}
        {showUploadModal && (
          <DocumentUploader 
            onUploadComplete={(results) => {
              console.log("Upload completed:", results);
              loadDocumentStats();
            }}
            onClose={() => setShowUploadModal(false)}
          />
        )}
      </div>
    </div>
  );
};

export default App;