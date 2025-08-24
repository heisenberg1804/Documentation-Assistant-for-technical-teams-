import React, { useState, useRef, useEffect } from "react";
import AssistantService from "./AssistantService";
import ReactMarkdown from "react-markdown";
import SourceViewer from "./components/SourceViewer";
import ConfidenceIndicator from "./components/ConfidenceIndicator";
import DocumentUploader from "./components/DocumentUploader";

// Prevent MetaMask errors
if (window.ethereum) {
  console.log("MetaMask detected but not needed for this application");
  window.ethereum.autoRefreshOnNetworkChange = false;
}

const USE_STREAMING = true;

const App = () => {
  // Core states
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
  const [errorMessage, setErrorMessage] = useState(null);

  // Refs for streaming
  const startAccumulatedResponseRef = useRef("");
  const approveAccumulatedResponseRef = useRef("");
  const feedbackAccumulatedResponseRef = useRef("");
  const feedbackInputRef = useRef(null);

  useEffect(() => {
    if (uiState === "user_feedback" && feedbackInputRef.current) {
      feedbackInputRef.current.focus();
    }
  }, [uiState]);

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
      setErrorMessage("Failed to connect to knowledge base");
    }
  };

  // Enhanced source event handler with better metadata extraction
  const handleSourcesEvent = (data) => {
    if (data.sources && Array.isArray(data.sources)) {
      // FIXED: Better filename extraction from metadata
      const enhancedSources = data.sources.map(source => {
        const metadata = source.metadata || {};
        const originalMetadata = metadata.debug_original_metadata || {};
        
        // Try multiple ways to get filename
        const filename = 
          metadata.file !== 'Unknown' ? metadata.file :
          originalMetadata.source_file || 
          originalMetadata.filename ||
          (source.source_type === 'validated' ? 'Validated Answer' : 'Documentation');
        
        return {
          ...source,
          metadata: {
            ...metadata,
            file: filename,
            section: metadata.section || originalMetadata.section || ''
          }
        };
      });
      
      setSources(enhancedSources);
      setRetrievalConfidence(data.confidence || null);
      console.log(`Received ${enhancedSources.length} sources with confidence: ${(data.confidence * 100).toFixed(1)}%`);
    }
  };

  const clearSources = () => {
    setSources([]);
    setRetrievalConfidence(null);
    setValidationSuccess(false);
    setErrorMessage(null);
  };

  // Enhanced file upload with better error handling
  const handleFileUpload = async (files) => {
    const fileArray = Array.from(files);
    console.log("Uploading files:", fileArray.map(f => f.name));
    
    try {
      let totalChunks = 0;
      let successCount = 0;
      const errors = [];
      
      for (const file of fileArray) {
        const result = await AssistantService.uploadDocument(file);
        console.log("Upload result:", result);
        
        if (result.status === 'success') {
          successCount++;
          totalChunks += result.chunks_created || 0;
        } else {
          errors.push(`${file.name}: ${result.error_message}`);
        }
      }
      
      if (successCount > 0) {
        await loadDocumentStats();
        setShowUploadModal(false);
        setErrorMessage(null);
        
        // Success message with actionable guidance
        const successMsg = `✅ Successfully uploaded ${successCount} file(s) (${totalChunks} chunks created). ${
          errors.length > 0 ? `\n⚠️ ${errors.length} files failed: ${errors.join(', ')}` : ''
        }`;
        alert(successMsg);
      } else {
        setErrorMessage(`Upload failed: ${errors.join(', ')}`);
      }
      
    } catch (error) {
      setErrorMessage(`Upload system error: ${error.message}`);
    }
  };

  // Enhanced confidence display with user guidance
  const getConfidenceGuidance = (confidence) => {
    if (confidence >= 0.8) {
      return {
        level: "high",
        message: "High confidence - answer based on reliable sources",
        color: "#4caf50",
        icon: "✓"
      };
    } else if (confidence >= 0.6) {
      return {
        level: "medium", 
        message: "Medium confidence - consider validating if helpful",
        color: "#ff9800",
        icon: "~"
      };
    } else {
      return {
        level: "low",
        message: "Low confidence - upload more specific documentation to improve accuracy",
        color: "#f44336", 
        icon: "!"
      };
    }
  };

  // Smart filename display
  const getSourceFilesList = (sources) => {
    if (!sources || sources.length === 0) return "";
    
    const files = sources
      .map(s => s.metadata?.file || 'Unknown')
      .filter(f => f !== 'Unknown')
      .filter((f, i, arr) => arr.indexOf(f) === i); // Remove duplicates
    
    if (files.length === 0) {
      const validatedCount = sources.filter(s => s.source_type === 'validated').length;
      return validatedCount > 0 ? `${validatedCount} validated answer${validatedCount !== 1 ? 's' : ''}` : 'Various sources';
    }
    
    if (files.length <= 2) {
      return files.join(', ');
    } else {
      return `${files.slice(0, 2).join(', ')} +${files.length - 2} more`;
    }
  };

  // Enhanced markdown renderer with better code formatting
  const MarkdownRenderer = ({ content }) => (
    <ReactMarkdown
      components={{
        code: ({node, inline, className, children, ...props}) => {
          const match = /language-(\w+)/.exec(className || '');
          const language = match ? match[1] : '';
          
          return !inline ? (
            <div style={{
              margin: '16px 0',
              border: '1px solid #e1e5e9',
              borderRadius: 8,
              overflow: 'hidden',
              backgroundColor: '#f8f9fa',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              {language && (
                <div style={{
                  backgroundColor: '#e9ecef',
                  padding: '8px 16px',
                  fontSize: '12px',
                  color: '#495057',
                  fontWeight: 600,
                  borderBottom: '1px solid #e1e5e9',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span>💻 {language}</span>
                  <button 
                    style={{
                      background: 'none',
                      border: '1px solid #6c757d',
                      borderRadius: 4,
                      padding: '2px 8px',
                      fontSize: 10,
                      cursor: 'pointer',
                      color: '#6c757d'
                    }}
                    onClick={() => navigator.clipboard?.writeText(children)}
                  >
                    Copy
                  </button>
                </div>
              )}
              <pre style={{
                margin: 0,
                padding: '20px',
                overflowX: 'auto',
                backgroundColor: '#f8f9fa',
                fontFamily: "'SF Mono', 'Monaco', 'Menlo', 'Consolas', monospace",
                fontSize: '14px',
                lineHeight: '1.6',
                maxWidth: '100%',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            </div>
          ) : (
            <code style={{
              backgroundColor: '#f3f4f6',
              padding: '3px 6px',
              borderRadius: 4,
              fontFamily: "'SF Mono', 'Monaco', 'Menlo', 'Consolas', monospace",
              fontSize: '0.9em',
              color: '#d63384',
              border: '1px solid #f1f3f4'
            }} {...props}>
              {children}
            </code>
          );
        },
        pre: ({children}) => children
      }}
    >
      {content}
    </ReactMarkdown>
  );

  // Enhanced compact source display with better UX
  const CompactSourceDisplay = ({ sources, confidence }) => {
    if (!sources || sources.length === 0) return null;

    const guidance = getConfidenceGuidance(confidence);
    const filesList = getSourceFilesList(sources);

    return (
      <div style={{
        margin: '12px 0',
        padding: '12px 16px',
        backgroundColor: '#f0f7ff',
        border: '1px solid #c2d8f2',
        borderRadius: 8,
        fontSize: 13
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}>
            <span style={{ fontSize: 16 }}>📚</span>
            <span style={{ fontWeight: 600, color: '#1565c0' }}>
              {sources.length} source{sources.length !== 1 ? 's' : ''}
            </span>
            <ConfidenceIndicator 
              confidence={confidence} 
              sourceCount={sources.length}
              size="small"
            />
          </div>
          
          <div style={{
            fontSize: 11,
            color: guidance.color,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}>
            <span>{guidance.icon}</span>
            <span>{guidance.level.toUpperCase()}</span>
          </div>
        </div>
        
        <div style={{
          fontSize: 12,
          color: '#666',
          marginBottom: 6
        }}>
          <strong>Sources:</strong> {filesList}
        </div>
        
        <div style={{
          fontSize: 11,
          color: guidance.color,
          fontStyle: 'italic',
          padding: '6px 8px',
          backgroundColor: 'rgba(255,255,255,0.7)',
          borderRadius: 4,
          border: `1px solid ${guidance.color}40`
        }}>
          💡 {guidance.message}
        </div>
      </div>
    );
  };

  // Enhanced empty state with clear next steps
  const EmptyState = () => (
    <div style={{
      textAlign: 'center',
      padding: '60px 20px',
      color: '#666'
    }}>
      <div style={{ fontSize: 64, marginBottom: 20 }}>📚</div>
      <h3 style={{ margin: '0 0 12px 0', color: '#333', fontSize: 20 }}>
        Welcome to AI Documentation Assistant
      </h3>
      <p style={{ margin: '0 0 8px 0', fontSize: 15, color: '#666' }}>
        Upload your project documentation to get started
      </p>
      <p style={{ margin: '0 0 24px 0', fontSize: 13, color: '#888' }}>
        Supports: README files, API docs, setup guides (.md, .pdf, .txt)
      </p>
      <button
        onClick={() => setShowUploadModal(true)}
        style={{
          padding: '16px 32px',
          backgroundColor: '#1976d2',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 16,
          fontWeight: 600,
          boxShadow: '0 2px 8px rgba(25, 118, 210, 0.3)',
          transition: 'all 0.2s ease'
        }}
        onMouseOver={e => e.target.style.transform = 'translateY(-1px)'}
        onMouseOut={e => e.target.style.transform = 'translateY(0)'}
      >
        📄 Upload Documentation
      </button>
    </div>
  );

  // Professional query suggestions with better categorization
  const QuerySuggestions = () => {
    const suggestions = documentStats.total_chunks > 0 ? [
      { text: "What are the main features of this project?", icon: "🎯" },
      { text: "How do I set up the development environment?", icon: "⚙️" },
      { text: "What technologies and frameworks are used?", icon: "🛠️" },
      { text: "How do I deploy this application?", icon: "🚀" }
    ] : [];
    
    if (suggestions.length === 0) return null;
    
    return (
      <div style={{
        marginTop: 20,
        padding: 16,
        backgroundColor: '#f8faff',
        border: '1px solid #e0e7ff',
        borderRadius: 8
      }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#1565c0',
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          💡 Suggested questions for your documentation:
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 8
        }}>
          {suggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => setQuestion(suggestion.text)}
              style={{
                padding: '10px 12px',
                fontSize: 13,
                backgroundColor: 'white',
                border: '1px solid #d0d7de',
                borderRadius: 6,
                cursor: 'pointer',
                color: '#24292f',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
              onMouseOver={e => {
                e.target.style.backgroundColor = '#f6f8fa';
                e.target.style.borderColor = '#1976d2';
                e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
              }}
              onMouseOut={e => {
                e.target.style.backgroundColor = 'white';
                e.target.style.borderColor = '#d0d7de';
                e.target.style.boxShadow = 'none';
              }}
            >
              <span style={{ fontSize: 14 }}>{suggestion.icon}</span>
              <span>{suggestion.text}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  // Enhanced error display
  const ErrorDisplay = ({ error, onDismiss }) => {
    if (!error) return null;
    
    return (
      <div style={{
        margin: '12px 0',
        padding: '12px 16px',
        backgroundColor: '#fff5f5',
        border: '1px solid #fed7d7',
        borderRadius: 8,
        color: '#c53030',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{error}</span>
        </div>
        <button
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: '#c53030',
            cursor: 'pointer',
            fontSize: 16,
            padding: 4
          }}
        >
          ×
        </button>
      </div>
    );
  };

  // Submit handlers (unchanged core logic, enhanced error handling)
  const handleStart = async () => {
    setUiState("waiting");
    clearSources();
    setHistory([
      { role: "user", content: question },
      { role: "assistant", content: null }
    ]);
    
    try {
      if (!USE_STREAMING) {
        const data = await AssistantService.startConversation(question);
        setAssistantResponse(data.assistant_response);
        setUiState("idle");
        setThreadId(data.thread_id);
        setHistory([
          { role: "user", content: question },
          { role: "assistant", content: data.assistant_response }
        ]);
      } else {
        const data = await AssistantService.createStreamingConversation(question);
        setThreadId(data.thread_id);
        setAssistantResponse("");
        startAccumulatedResponseRef.current = "";
        
        const eventSource = AssistantService.streamResponse(
          data.thread_id,
          (data) => {
            if (data.content) {
              startAccumulatedResponseRef.current += data.content;
              setAssistantResponse(startAccumulatedResponseRef.current);
              setHistory([
                { role: "user", content: question },
                { role: "assistant", content: startAccumulatedResponseRef.current }
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
            setErrorMessage(`Connection error: ${error.message}`);
          },
          () => {
            console.log("Stream completed");
          }
        );
      }
    } catch (err) {
      setAssistantResponse("");
      setUiState("idle");
      clearSources();
      setErrorMessage(`Failed to process request: ${err.message}`);
    }
  };

  const handleApprove = async () => {
    setUiState("waiting");
    setHistory([...history, { role: "assistant", content: null }]);
    
    try {
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
              loadDocumentStats();
            }
          }
        },
        (error) => {
          console.error("Approval streaming error:", error);
          setUiState("idle");
          setErrorMessage(`Approval failed: ${error.message}`);
        },
        () => {
          console.log("Approval stream completed");
        }
      );
    } catch (err) {
      setUiState("idle");
      setErrorMessage(`Approval failed: ${err.message}`);
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
          console.error("Feedback streaming error:", error);
          setUiState("idle");
          setErrorMessage(`Feedback processing failed: ${error.message}`);
        },
        () => {
          console.log("Feedback stream completed");
        }
      );
      
      setFeedback("");
    } catch (err) {
      setUiState("idle");
      setErrorMessage(`Feedback failed: ${err.message}`);
    }
  };

  const handleNewSession = () => {
    setUiState("idle");
    setQuestion("");
    setAssistantResponse("");
    setFeedback("");
    setThreadId(null);
    setHistory([]);
    clearSources();
  };

  // Render
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'flex-start', 
      margin: '40px auto', 
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      maxWidth: 1200,
      width: '95%'
    }}>
      
      {/* Enhanced Sidebar */}
      <div style={{ 
        flex: '0 0 340px', 
        maxWidth: 340, 
        marginRight: 32, 
        background: 'linear-gradient(135deg, #fafbfc 0%, #f6f8fa 100%)', 
        borderRadius: 12, 
        border: '1px solid #e1e5e9', 
        padding: 20, 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        height: 'fit-content',
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
      }}>
        <img 
          src="/hitl-assistent.png" 
          alt="HITL Graph" 
          style={{ 
            width: '75%', 
            height: 'auto', 
            borderRadius: 8, 
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)', 
            marginBottom: 20 
          }} 
        />
        <div style={{ 
          fontSize: 16, 
          color: '#1565c0', 
          textAlign: 'center', 
          marginBottom: 16,
          fontWeight: 600
        }}>
          AI Documentation Assistant
        </div>
        
        {/* Enhanced Knowledge Base Stats */}
        <div style={{ 
          width: '100%', 
          padding: 16, 
          backgroundColor: 'white', 
          borderRadius: 8, 
          border: '1px solid #e1e5e9',
          fontSize: 13,
          marginBottom: 16,
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
        }}>
          <div style={{ 
            fontWeight: 600, 
            marginBottom: 12, 
            color: '#333',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
            <span style={{ fontSize: 16 }}>🧠</span>
            Knowledge Base Health
          </div>
          
          <div style={{ marginBottom: 8 }}>
            📄 <strong>{documentStats.total_chunks || 0}</strong> document chunks
          </div>
          <div style={{ marginBottom: 8 }}>
            ✅ <strong>{documentStats.total_validated || 0}</strong> validated answers
          </div>
          
          {documentStats.total_chunks > 0 && (
            <div style={{ 
              marginTop: 12, 
              padding: '8px 12px', 
              backgroundColor: documentStats.total_validated > 0 ? '#e8f5e8' : '#fff3e0',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              color: documentStats.total_validated > 0 ? '#2e7d32' : '#e65100',
              textAlign: 'center'
            }}>
              {documentStats.total_validated > 0 ? (
                <>
                  🎯 {Math.round((documentStats.total_validated / documentStats.total_chunks) * 100)}% validated coverage
                </>
              ) : (
                <>
                  🌱 Learning mode - validate answers to improve accuracy
                </>
              )}
            </div>
          )}
        </div>

        {/* Enhanced Upload Button */}
        {!showUploadModal && (
          <button
            onClick={() => setShowUploadModal(true)}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 15,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 8px rgba(25, 118, 210, 0.3)'
            }}
            onMouseOver={e => {
              e.target.style.backgroundColor = '#1565c0';
              e.target.style.transform = 'translateY(-1px)';
            }}
            onMouseOut={e => {
              e.target.style.backgroundColor = '#1976d2';
              e.target.style.transform = 'translateY(0)';
            }}
          >
            <span style={{ fontSize: 18 }}>📄</span>
            Upload Documents
          </button>
        )}

        {/* Upload Status */}
        {showUploadModal && (
          <div style={{
            width: '100%',
            padding: 14,
            backgroundColor: '#f0f7ff',
            border: '1px solid #c2d8f2',
            borderRadius: 8,
            fontSize: 13,
            color: '#1565c0',
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8
          }}>
            <span style={{ fontSize: 16 }}>📤</span>
            Upload in progress...
          </div>
        )}
      </div>

      {/* Enhanced Main Content */}
      <div style={{ 
        flex: 1,
        maxWidth: 700, 
        padding: 28, 
        border: '1px solid #e1e5e9', 
        borderRadius: 12, 
        background: 'white',
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
      }}>
        
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: 24 
        }}>
          <h1 style={{ 
            margin: 0, 
            fontSize: 24, 
            fontWeight: 700,
            color: '#1976d2',
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}>
            <span style={{ fontSize: 28 }}>🤖</span>
            Documentation Assistant
          </h1>
          <button
            onClick={handleNewSession}
            style={{ 
              padding: "10px 20px", 
              fontSize: 14, 
              borderRadius: 8, 
              background: "#f8f9fa", 
              border: "1px solid #e1e5e9", 
              cursor: "pointer",
              fontWeight: 500,
              transition: 'all 0.2s ease'
            }}
            onMouseOver={e => e.target.style.backgroundColor = '#e9ecef'}
            onMouseOut={e => e.target.style.backgroundColor = '#f8f9fa'}
          >
            🔄 New Session
          </button>
        </div>

        {/* Error Display */}
        <ErrorDisplay error={errorMessage} onDismiss={() => setErrorMessage(null)} />

        {/* Main Content Area */}
        {uiState === "idle" && history.length === 0 && (
          documentStats.total_chunks === 0 ? (
            <EmptyState />
          ) : (
            <div>
              <div style={{ marginBottom: 16 }}>
                <input
                  type="text"
                  placeholder="Ask about your documentation..."
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyDown={e => { 
                    if (e.key === "Enter" && question.trim()) {
                      e.preventDefault();
                      handleStart();
                    }
                  }}
                  style={{ 
                    width: "calc(100% - 120px)", 
                    padding: '16px 20px', 
                    fontSize: 16, 
                    borderRadius: 8, 
                    border: '2px solid #e1e5e9', 
                    marginRight: 12,
                    fontFamily: 'inherit',
                    outline: 'none',
                    transition: 'border-color 0.2s ease'
                  }}
                  onFocus={e => e.target.style.borderColor = '#1976d2'}
                  onBlur={e => e.target.style.borderColor = '#e1e5e9'}
                />
                <button 
                  onClick={handleStart}
                  disabled={!question.trim()}
                  style={{ 
                    padding: '16px 24px', 
                    fontSize: 16, 
                    borderRadius: 8, 
                    border: 'none', 
                    background: question.trim() ? 'linear-gradient(135deg, #1976d2, #1565c0)' : '#e9ecef',
                    color: question.trim() ? 'white' : '#adb5bd',
                    cursor: question.trim() ? 'pointer' : 'not-allowed', 
                    fontWeight: 600,
                    transition: 'all 0.2s ease',
                    boxShadow: question.trim() ? '0 2px 8px rgba(25, 118, 210, 0.3)' : 'none'
                  }}
                  onMouseOver={e => {
                    if (question.trim()) {
                      e.target.style.transform = 'translateY(-1px)';
                    }
                  }}
                  onMouseOut={e => {
                    e.target.style.transform = 'translateY(0)';
                  }}
                >
                  Send
                </button>
              </div>
              
              <QuerySuggestions />
            </div>
          )
        )}

        {/* Enhanced Sources Display */}
        {sources.length > 0 && (uiState === "waiting" || uiState === "idle") && (
          <div style={{ margin: '20px 0' }}>
            <CompactSourceDisplay sources={sources} confidence={retrievalConfidence} />
            <SourceViewer 
              sources={sources} 
              confidence={retrievalConfidence}
              isVisible={true}
            />
          </div>
        )}

        {/* Enhanced Conversation History */}
        {history.length > 0 && (
          <div style={{ margin: "28px 0" }}>
            {history.map((msg, idx) => {
              if (uiState === "finished" && msg.role === "assistant" && idx === history.length - 1) {
                return null;
              }
              
              let hint = null;
              if (msg.role === "user") {
                hint = idx === 0 ? "Initial request" : "Your feedback";
              }
              
              return (
                <div key={idx} style={{ 
                  textAlign: msg.role === "user" ? "right" : "left", 
                  margin: "20px 0" 
                }}>
                  {hint && (
                    <div style={{ 
                      fontSize: 12, 
                      color: "#6c757d", 
                      marginBottom: 6,
                      fontWeight: 500
                    }}>
                      {hint}
                    </div>
                  )}
                  <div style={{
                    display: 'inline-block',
                    maxWidth: msg.role === "user" ? '80%' : '100%',
                    padding: msg.role === "assistant" ? '20px 24px' : '12px 16px',
                    backgroundColor: msg.role === "assistant" ? '#f8faff' : '#e3f2fd',
                    border: msg.role === "assistant" ? '1px solid #c2d8f2' : '1px solid #90caf9',
                    borderRadius: msg.role === "assistant" ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    textAlign: 'left',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                  }}>
                    <div style={{
                      fontWeight: 600,
                      color: msg.role === "assistant" ? '#1976d2' : '#0d47a1',
                      fontSize: 14,
                      marginBottom: msg.role === "assistant" ? 12 : 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}>
                      <span style={{ fontSize: 16 }}>
                        {msg.role === "user" ? "👤" : "🤖"}
                      </span>
                      {msg.role === "user" ? "You" : "Assistant"}
                    </div>
                    
                    {msg.role === "assistant" && msg.content === null ? (
                      <div style={{ 
                        display: "flex", 
                        alignItems: "center",
                        gap: 12,
                        color: '#6c757d',
                        fontSize: 14
                      }}>
                        <div style={{
                          border: "3px solid #e9ecef",
                          borderTop: "3px solid #1976d2",
                          borderRadius: "50%",
                          width: 24,
                          height: 24,
                          animation: "spin 1s linear infinite"
                        }} />
                        <span>
                          {sources.length > 0 ? 
                            "Generating response with citations..." : 
                            "Finding relevant documentation..."
                          }
                        </span>
                        <style>{`
                          @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                          }
                        `}</style>
                      </div>
                    ) : msg.role === "assistant" ? (
                      <div style={{ fontSize: 15, lineHeight: 1.6 }}>
                        <MarkdownRenderer content={msg.content} />
                      </div>
                    ) : (
                      <div style={{ fontSize: 15, lineHeight: 1.5, color: '#1565c0' }}>
                        {msg.content}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Enhanced Feedback Form */}
        {uiState === "user_feedback" && (
          <div style={{ 
            marginTop: 28, 
            background: 'linear-gradient(135deg, #fff8e1 0%, #fff3e0 100%)', 
            border: '1px solid #ffcc02', 
            borderRadius: 12, 
            padding: 24 
          }}>
            <div style={{ 
              marginBottom: 12, 
              fontWeight: 600,
              color: '#e65100',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <span style={{ fontSize: 18 }}>💭</span>
              Help improve this response:
            </div>
            <textarea
              ref={feedbackInputRef}
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              rows={4}
              style={{ 
                width: '100%', 
                padding: 16, 
                fontSize: 15, 
                borderRadius: 8, 
                border: '2px solid #ffcc02', 
                resize: 'vertical',
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box'
              }}
              placeholder="What could be improved? Be specific about missing information, incorrect details, or clarity issues..."
            />
            <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
              <button
                onClick={handleFeedback}
                disabled={!feedback.trim()}
                style={{ 
                  padding: "12px 24px", 
                  fontSize: 15,
                  backgroundColor: feedback.trim() ? '#ff9800' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: feedback.trim() ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                  transition: 'all 0.2s ease'
                }}
              >
                📤 Submit Feedback
              </button>
              <button
                onClick={() => {
                  setUiState("idle");
                  setFeedback("");
                }}
                style={{ 
                  padding: "12px 24px", 
                  fontSize: 15,
                  backgroundColor: 'white',
                  color: '#666',
                  border: '2px solid #e1e5e9',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.2s ease'
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
            <div style={{ marginTop: 28 }}>
              {/* Enhanced Confidence Display */}
              {retrievalConfidence && (
                <div style={{ 
                  marginBottom: 16, 
                  textAlign: 'center',
                  padding: 12,
                  backgroundColor: '#f8faff',
                  borderRadius: 8,
                  border: '1px solid #e0e7ff'
                }}>
                  <div style={{ marginBottom: 8 }}>
                    <ConfidenceIndicator 
                      confidence={retrievalConfidence}
                      sourceCount={sources.length}
                      size="medium"
                    />
                  </div>
                  <div style={{ 
                    fontSize: 12, 
                    color: '#666',
                    fontStyle: 'italic'
                  }}>
                    {getConfidenceGuidance(retrievalConfidence).message}
                  </div>
                </div>
              )}
              
              <div style={{ 
                display: 'flex', 
                justifyContent: 'flex-end',
                gap: 12
              }}>
                <button
                  onClick={() => setUiState("user_feedback")}
                  style={{ 
                    padding: "14px 24px", 
                    fontSize: 15,
                    backgroundColor: '#ff9800',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 8px rgba(255, 152, 0, 0.3)'
                  }}
                  onMouseOver={e => e.target.style.transform = 'translateY(-1px)'}
                  onMouseOut={e => e.target.style.transform = 'translateY(0)'}
                >
                  <span style={{ fontSize: 16 }}>💬</span>
                  Provide Feedback
                </button>
                
                <button
                  onClick={handleApprove}
                  style={{ 
                    padding: "14px 24px", 
                    fontSize: 15,
                    backgroundColor: '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 8px rgba(76, 175, 80, 0.3)'
                  }}
                  onMouseOver={e => e.target.style.transform = 'translateY(-1px)'}
                  onMouseOut={e => e.target.style.transform = 'translateY(0)'}
                >
                  <span style={{ fontSize: 16 }}>✓</span>
                  Approve & Validate
                </button>
              </div>
            </div>
          )
        )}

        {/* Enhanced Final Version */}
        {uiState === "finished" && (
          <div style={{ marginTop: 28 }}>
            {/* Enhanced Validation Success */}
            {validationSuccess && (
              <div style={{
                marginBottom: 20,
                padding: 20,
                backgroundColor: 'linear-gradient(135deg, #e8f5e8 0%, #f1f8e9 100%)',
                border: '2px solid #4caf50',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                boxShadow: '0 4px 12px rgba(76, 175, 80, 0.15)'
              }}>
                <span style={{ fontSize: 24 }}>🎉</span>
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    fontWeight: 700, 
                    color: '#2e7d32', 
                    fontSize: 16,
                    marginBottom: 4
                  }}>
                    Answer Validated Successfully!
                  </div>
                  <div style={{ 
                    fontSize: 13, 
                    color: '#388e3c',
                    lineHeight: 1.4
                  }}>
                    This response has been stored and will be prioritized for similar future questions, improving the system's accuracy.
                  </div>
                </div>
                {retrievalConfidence && (
                  <ConfidenceIndicator 
                    confidence={retrievalConfidence}
                    sourceCount={sources.length}
                    hasValidated={true}
                    size="medium"
                  />
                )}
              </div>
            )}

            {/* Enhanced Final Response */}
            <div style={{ 
              background: 'linear-gradient(135deg, #f0f7ff 0%, #e8f4fd 100%)', 
              border: '2px solid #1976d2', 
              borderRadius: 12, 
              padding: 24,
              boxShadow: '0 4px 12px rgba(25, 118, 210, 0.15)'
            }}>
              <div style={{ 
                marginBottom: 16, 
                fontWeight: 700, 
                color: '#1976d2',
                fontSize: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 10
              }}>
                <span style={{ fontSize: 20 }}>✨</span>
                Final Validated Response
                {validationSuccess && (
                  <span style={{
                    backgroundColor: '#4caf50',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 600
                  }}>
                    VALIDATED
                  </span>
                )}
              </div>
              
              <div>
                <MarkdownRenderer content={assistantResponse} />
              </div>

              {/* Sources in finished state */}
              {sources.length > 0 && (
                <div style={{ 
                  marginTop: 20,
                  paddingTop: 16,
                  borderTop: '1px solid #c2d8f2'
                }}>
                  <CompactSourceDisplay sources={sources} confidence={retrievalConfidence} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Upload Modal */}
        {showUploadModal && (
          <DocumentUploader 
            currentStats={documentStats}
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