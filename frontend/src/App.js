import React, { useState, useRef, useEffect } from "react";
import AssistantService from "./AssistantService";
import ReactMarkdown from "react-markdown";

// Prevent MetaMask errors by setting ethereum to null if it's not needed
if (window.ethereum) {
  console.log("MetaMask detected but not needed for this application");
  window.ethereum.autoRefreshOnNetworkChange = false;
}

const USE_STREAMING = true;

const App = () => {
  // Core UI states
  const [uiState, setUiState] = useState("idle");
  const [question, setQuestion] = useState("");
  const [assistantResponse, setAssistantResponse] = useState("");
  const [feedback, setFeedback] = useState("");
  const [threadId, setThreadId] = useState(null);
  const [history, setHistory] = useState([]);
  
  // RAG and enhancement states
  const [sources, setSources] = useState([]);
  const [retrievalConfidence, setRetrievalConfidence] = useState(null);
  const [documentStats, setDocumentStats] = useState({ total_chunks: 0, total_validated: 0 });
  const [responseQuality, setResponseQuality] = useState(null);
  
  // Upload states
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  
  // Notification state
  const [toast, setToast] = useState(null);

  // Refs for streaming responses
  const startAccumulatedResponseRef = useRef("");
  const approveAccumulatedResponseRef = useRef("");
  const feedbackAccumulatedResponseRef = useRef("");
  const feedbackInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Effects
  useEffect(() => {
    if (uiState === "user_feedback" && feedbackInputRef.current) {
      feedbackInputRef.current.focus();
    }
  }, [uiState]);

  useEffect(() => {
    loadDocumentStats();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Core functions
  const loadDocumentStats = async () => {
    try {
      const stats = await AssistantService.getDocumentStats();
      setDocumentStats(stats);
    } catch (error) {
      console.warn("Failed to load document stats:", error);
    }
  };

  const handleSourcesEvent = (data) => {
    if (data.sources && Array.isArray(data.sources)) {
      setSources(data.sources);
      setRetrievalConfidence(data.confidence || null);
      
      const avgConfidence = data.confidence || 0;
      setResponseQuality({
        level: avgConfidence >= 0.8 ? 'high' : avgConfidence >= 0.6 ? 'medium' : 'low',
        confidence: avgConfidence,
        sourceCount: data.sources.length
      });
      
      console.log(`Received ${data.sources.length} sources with confidence: ${(data.confidence * 100).toFixed(1)}%`);
    }
  };

  const clearSources = () => {
    setSources([]);
    setRetrievalConfidence(null);
    setResponseQuality(null);
  };

  const displayToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  // Enhanced file upload
  const handleFileUpload = async (files) => {
    const fileArray = Array.from(files);
    const supportedTypes = ['md', 'pdf', 'txt'];
    
    const validFiles = fileArray.filter(file => {
      const extension = file.name.split('.').pop().toLowerCase();
      return supportedTypes.includes(extension);
    });

    if (validFiles.length === 0) {
      displayToast('No supported files found. Please upload .md, .pdf, or .txt files.', 'error');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const results = [];
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        setUploadProgress(((i + 0.5) / validFiles.length) * 100);
        
        const result = await AssistantService.uploadDocument(file);
        results.push({ file: file.name, ...result });
        
        setUploadProgress(((i + 1) / validFiles.length) * 100);
      }

      const successCount = results.filter(r => r.status === 'success').length;
      const totalChunks = results.reduce((sum, r) => sum + (r.chunks_created || 0), 0);

      if (successCount === results.length) {
        displayToast(`✅ Successfully uploaded ${successCount} files (${totalChunks} chunks created)`);
      } else {
        displayToast(`⚠️ ${successCount}/${results.length} files uploaded successfully`, 'warning');
      }

      await loadDocumentStats();
      setShowUploadModal(false);
      
    } catch (error) {
      displayToast(`Upload failed: ${error.message}`, 'error');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Drag handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  // Enhanced Knowledge Base Status Component
  const KnowledgeBaseStatus = () => {
    const coverage = documentStats.total_chunks > 0 
      ? (documentStats.total_validated / documentStats.total_chunks * 100) 
      : 0;

    return (
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: 12,
        padding: 16,
        margin: '16px 0',
        color: 'white',
        boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
      }}>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: 12 
        }}>
          <div style={{
            textAlign: 'center',
            padding: 12,
            borderRadius: 8,
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            cursor: 'pointer',
            transition: 'transform 0.3s ease'
          }}
          onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
          onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
          >
            <div style={{ fontSize: 18, fontWeight: 600 }}>{documentStats.total_chunks}</div>
            <div style={{ fontSize: 11, opacity: 0.9 }}>Documents</div>
          </div>
          
          <div style={{
            textAlign: 'center',
            padding: 12,
            borderRadius: 8,
            background: 'rgba(76, 175, 80, 0.2)',
            backdropFilter: 'blur(10px)',
            cursor: 'pointer',
            transition: 'transform 0.3s ease'
          }}
          onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
          onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
          >
            <div style={{ fontSize: 18, fontWeight: 600 }}>{documentStats.total_validated}</div>
            <div style={{ fontSize: 11, opacity: 0.9 }}>Validated</div>
          </div>
          
          <div style={{
            textAlign: 'center',
            padding: 12,
            borderRadius: 8,
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            cursor: 'pointer',
            transition: 'transform 0.3s ease'
          }}
          onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
          onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
          >
            <div style={{ fontSize: 18, fontWeight: 600 }}>{coverage.toFixed(0)}%</div>
            <div style={{ fontSize: 11, opacity: 0.9 }}>Coverage</div>
          </div>
        </div>
      </div>
    );
  };

  // Quality Badge Component
  const QualityBadge = ({ quality }) => {
    if (!quality) return null;

    const getQualityStyle = (level) => {
      switch (level) {
        case 'high':
          return { 
            backgroundColor: '#e8f5e9', 
            color: '#2e7d32',
            border: '1px solid #4caf50',
            icon: '🟢' 
          };
        case 'medium':
          return { 
            backgroundColor: '#fff3e0', 
            color: '#f57c00',
            border: '1px solid #ff9800',
            icon: '🟡' 
          };
        case 'low':
        default:
          return { 
            backgroundColor: '#ffebee', 
            color: '#c62828',
            border: '1px solid #f44336',
            icon: '🔴' 
          };
      }
    };

    const style = getQualityStyle(quality.level);

    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 12px',
        borderRadius: 20,
        fontSize: 14,
        fontWeight: 500,
        gap: 4,
        transition: 'all 0.3s ease',
        ...style
      }}>
        <span>{style.icon}</span>
        <span>{(quality.confidence * 100).toFixed(0)}% confidence</span>
        <span style={{ opacity: 0.7 }}>• {quality.sourceCount} sources</span>
      </div>
    );
  };

  // Source Citations Component
  const SourceCitations = ({ sources, confidence }) => {
    const [expanded, setExpanded] = useState(false);

    if (!sources || sources.length === 0) return null;

    return (
      <div style={{
        marginTop: 12,
        padding: 12,
        background: '#f8f9fa',
        borderLeft: '3px solid #4CAF50',
        borderRadius: 4,
        fontSize: 14,
        transition: 'all 0.3s ease'
      }}>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
            color: '#1565c0',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: 0,
            transition: 'color 0.3s ease'
          }}
          onMouseEnter={(e) => e.target.style.color = '#0d47a1'}
          onMouseLeave={(e) => e.target.style.color = '#1565c0'}
        >
          <span>📚</span>
          <span>{sources.length} sources • {(confidence * 100).toFixed(0)}% confidence</span>
          <span style={{ 
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease'
          }}>
            ▼
          </span>
        </button>
        
        {expanded && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e5e5' }}>
            {sources.map((source, idx) => (
              <div key={idx} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 8px',
                marginBottom: 4,
                borderRadius: 4,
                transition: 'backgroundColor 0.3s ease',
                ':hover': {
                  backgroundColor: 'rgba(25, 118, 210, 0.05)'
                }
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(25, 118, 210, 0.05)'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>
                    {source.source_type === 'validated' ? '✓' : '📄'}
                  </span>
                  <span style={{ fontWeight: 500, color: '#333' }}>{source.metadata?.file || 'Unknown'}</span>
                  {source.metadata?.section && (
                    <span style={{ color: '#666', fontSize: 12 }}>
                      → {source.metadata.section}
                    </span>
                  )}
                </div>
                <span style={{
                  color: source.confidence >= 0.8 ? '#4caf50' : source.confidence >= 0.6 ? '#ff9800' : '#f44336',
                  fontWeight: 600,
                  fontSize: 12
                }}>
                  {(source.confidence * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Toast Notification Component
  const Toast = ({ toast }) => {
    if (!toast) return null;

    const getToastStyle = (type) => {
      switch (type) {
        case 'success':
          return { backgroundColor: '#e8f5e8', color: '#2e7d32', border: '1px solid #4caf50' };
        case 'error':
          return { backgroundColor: '#ffebee', color: '#c62828', border: '1px solid #f44336' };
        case 'warning':
          return { backgroundColor: '#fff3e0', color: '#e65100', border: '1px solid #ff9800' };
        default:
          return { backgroundColor: '#e8f5e8', color: '#2e7d32', border: '1px solid #4caf50' };
      }
    };

    const style = getToastStyle(toast.type);

    return (
      <div style={{
        position: 'fixed',
        top: 20,
        right: 20,
        padding: '12px 16px',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        zIndex: 1000,
        maxWidth: 400,
        fontWeight: 500,
        animation: 'slideIn 0.3s ease-out',
        ...style
      }}>
        {toast.message}
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}</style>
      </div>
    );
  };

  // Enhanced Upload Modal Component
  const DocumentUploadModal = () => {
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
          borderRadius: 12,
          padding: 32,
          maxWidth: 500,
          width: '90%',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            marginBottom: 24 
          }}>
            <h2 style={{ margin: 0, color: '#1976d2' }}>Upload Documents</h2>
            <button 
              onClick={() => setShowUploadModal(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 24,
                cursor: 'pointer',
                color: '#666',
                padding: 4,
                borderRadius: 4,
                transition: 'backgroundColor 0.3s ease'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              ×
            </button>
          </div>

          {/* Enhanced Upload Area */}
          <div
            style={{
              border: `2px dashed ${dragActive ? '#4299e1' : '#cbd5e0'}`,
              borderRadius: 8,
              padding: 40,
              textAlign: 'center',
              backgroundColor: dragActive ? '#bee3f8' : '#fafafa',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              marginBottom: 16,
              transform: dragActive ? 'scale(1.02)' : 'scale(1)'
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div style={{ 
              fontSize: 48, 
              marginBottom: 16,
              animation: 'float 3s ease-in-out infinite'
            }}>
              📁
            </div>
            <div style={{ fontSize: 16, marginBottom: 8, fontWeight: 600 }}>
              {dragActive ? 'Drop files here' : 'Drag & drop documents here'}
            </div>
            <div style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
              Supports .md, .pdf, .txt files
            </div>
            <button style={{
              padding: '8px 16px',
              backgroundColor: '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 500
            }}>
              Choose Files
            </button>
            
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
              style={{ display: 'none' }}
            />
            
            <style>{`
              @keyframes float {
                0%, 100% { transform: translateY(0px); }
                50% { transform: translateY(-10px); }
              }
            `}</style>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8, fontSize: 14, color: '#666' }}>
                Processing documents... {uploadProgress.toFixed(0)}%
              </div>
              <div style={{
                width: '100%',
                height: 8,
                backgroundColor: '#e0e0e0',
                borderRadius: 4,
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${uploadProgress}%`,
                  height: '100%',
                  backgroundColor: '#1976d2',
                  transition: 'width 0.3s ease',
                  position: 'relative'
                }}>
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: '100%',
                    width: '100%',
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                    animation: 'shimmer 1.5s infinite'
                  }} />
                </div>
              </div>
              <style>{`
                @keyframes shimmer {
                  0% { transform: translateX(-100%); }
                  100% { transform: translateX(100%); }
                }
              `}</style>
            </div>
          )}

          {/* Empty State Guidance */}
          {documentStats.total_chunks === 0 && !isUploading && (
            <div style={{
              marginTop: 20,
              padding: 16,
              background: 'rgba(25, 118, 210, 0.05)',
              borderRadius: 8,
              textAlign: 'left'
            }}>
              <p style={{ margin: '0 0 8px 0', fontWeight: 500, color: '#1976d2' }}>
                💡 Get the most out of your assistant:
              </p>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, color: '#666' }}>
                <li>Upload API documentation for technical queries</li>
                <li>Add README files for setup instructions</li>
                <li>Include troubleshooting guides</li>
                <li>Upload project specifications</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Empty State Component
  const EmptyState = () => (
    <div style={{
      textAlign: 'center',
      padding: 40,
      color: '#666',
      background: 'linear-gradient(135deg, #f8faff 0%, #f0f7ff 100%)',
      borderRadius: 12,
      border: '1px solid #e0e7ff'
    }}>
      <div style={{ 
        fontSize: 48, 
        marginBottom: 16,
        animation: 'pulse 2s ease-in-out infinite'
      }}>
        📚
      </div>
      <h3 style={{ margin: '0 0 8px 0', color: '#333', fontSize: 18 }}>
        No documents uploaded yet
      </h3>
      <p style={{ margin: '0 0 20px 0', fontSize: 14 }}>
        Upload your technical documentation to get AI-powered answers with citations
      </p>
      <button
        onClick={() => setShowUploadModal(true)}
        style={{
          padding: '12px 24px',
          backgroundColor: '#1976d2',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 16,
          fontWeight: 500,
          transition: 'all 0.3s ease',
          boxShadow: '0 2px 8px rgba(25, 118, 210, 0.3)'
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = '#1565c0';
          e.target.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = '#1976d2';
          e.target.style.transform = 'translateY(0)';
        }}
      >
        Upload First Document
      </button>
      
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );

  const handleStart = async () => {
    setUiState("waiting");
    clearSources();
    setHistory([
      { role: "user", content: question },
      { role: "assistant", content: null }
    ]);
    
    try {
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
          displayToast("Connection error occurred", "error");
        },
        () => {
          console.log("Stream completed");
        }
      );
    } catch (err) {
      setAssistantResponse("");
      setUiState("idle");
      clearSources();
      displayToast("Failed to contact backend", "error");
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
          } else if (data.status && data.status === "finished") {
            setUiState("finished");
            loadDocumentStats();
            displayToast("✅ Answer validated and added to knowledge base");
          }
        },
        (error) => {
          console.error("Streaming error:", error);
          setUiState("idle");
          displayToast("Streaming error occurred", "error");
        },
        () => {
          console.log("Stream completed");
        }
      );
    } catch (err) {
      setUiState("idle");
      displayToast("Failed to submit approval", "error");
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
          console.error("Streaming error:", error);
          setUiState("idle");
          displayToast("Streaming error occurred", "error");
        },
        () => {
          console.log("Stream completed");
        }
      );
      
      setFeedback("");
    } catch (err) {
      setUiState("idle");
      displayToast("Failed to submit feedback", "error");
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'flex-start', 
      margin: '40px auto', 
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      minHeight: '80vh',
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      minHeight: '100vh',
      padding: '40px 20px'
    }}>
      
      {/* Enhanced Left Sidebar */}
      <div style={{ 
        flex: '0 0 320px', 
        maxWidth: 320, 
        marginRight: 32,
        background: 'linear-gradient(135deg, #fafbfc 0%, #f0f2f5 100%)',
        borderRadius: 12,
        border: '1px solid #e8eaed',
        padding: 20,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        backdropFilter: 'blur(10px)'
      }}>
        <img 
          src="/hitl-assistent.png" 
          alt="HITL Graph" 
          style={{ 
            width: '75%', 
            height: 'auto', 
            borderRadius: 8, 
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)', 
            display: 'block',
            margin: '0 auto 20px auto'
          }} 
        />
        
        <div style={{ 
          fontSize: 16, 
          color: '#444', 
          textAlign: 'center', 
          marginBottom: 20,
          fontWeight: 500
        }}>
          HITL Assistant Graph
        </div>
        
        <KnowledgeBaseStatus />

        <button
          onClick={() => setShowUploadModal(true)}
          style={{
            width: '100%',
            padding: 14,
            backgroundColor: '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'all 0.3s ease',
            boxShadow: '0 2px 8px rgba(25, 118, 210, 0.3)',
            marginTop: 16
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#1565c0';
            e.target.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#1976d2';
            e.target.style.transform = 'translateY(0)';
          }}
        >
          📄 Upload Documents
        </button>

        {/* Empty State Hint */}
        {documentStats.total_chunks === 0 && (
          <div style={{
            marginTop: 20,
            padding: 16,
            backgroundColor: '#f0f7ff',
            borderRadius: 8,
            border: '1px solid #e0e7ff',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 14, color: '#1976d2', fontWeight: 500, marginBottom: 8 }}>
              🚀 Get Started
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>
              Upload documentation to enable AI-powered answers with citations
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Main Content */}
      <div style={{ 
        maxWidth: 600, 
        width: '95%', 
        padding: 32, 
        border: '1px solid #eee', 
        borderRadius: 12, 
        position: 'relative', 
        background: '#fff',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        minHeight: 500
      }}>
        
        {/* Enhanced Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: 24,
          paddingBottom: 16,
          borderBottom: '1px solid #f0f0f0'
        }}>
          <h1 style={{ 
            margin: 0, 
            fontSize: 24, 
            background: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontWeight: 700
          }}>
            AI Documentation Assistant
          </h1>
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
            style={{
              padding: '10px 20px',
              fontSize: 14,
              borderRadius: 8,
              background: '#f5f5f5',
              border: '1px solid #ddd',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#e8e8e8'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#f5f5f5'}
          >
            New Session
          </button>
        </div>

        {/* Enhanced Input Section */}
        {uiState === "idle" && history.length === 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ 
              display: 'flex', 
              gap: 12,
              marginBottom: 16
            }}>
              <input
                type="text"
                placeholder="Ask a question about your documentation..."
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && question.trim()) handleStart(); }}
                style={{
                  flex: 1,
                  padding: 16,
                  fontSize: 16,
                  borderRadius: 8,
                  border: '2px solid #e0e0e0',
                  outline: 'none',
                  transition: 'all 0.3s ease',
                  background: 'white'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#1976d2';
                  e.target.style.boxShadow = '0 0 0 3px rgba(25, 118, 210, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e0e0e0';
                  e.target.style.boxShadow = 'none';
                }}
              />
              <button 
                onClick={handleStart} 
                disabled={!question.trim()}
                style={{
                  padding: '16px 32px',
                  fontSize: 16,
                  borderRadius: 8,
                  border: 'none',
                  background: question.trim() ? '#1976d2' : '#ccc',
                  color: 'white',
                  cursor: question.trim() ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                  transition: 'all 0.3s ease',
                  boxShadow: question.trim() ? '0 2px 8px rgba(25, 118, 210, 0.3)' : 'none'
                }}
              >
                Send
              </button>
            </div>
            
            {/* Show empty state if no documents */}
            {documentStats.total_chunks === 0 && <EmptyState />}
          </div>
        )}

        {/* Response Quality Indicator */}
        {responseQuality && uiState !== "finished" && (
          <div style={{ marginBottom: 16 }}>
            <QualityBadge quality={responseQuality} />
          </div>
        )}

        {/* Sources Display */}
        {sources.length > 0 && uiState !== "finished" && (
          <SourceCitations sources={sources} confidence={retrievalConfidence} />
        )}

        {/* Enhanced Conversation History */}
        {history.length > 0 && (
          <div style={{ margin: "24px 0" }}>
            {history.map((msg, idx) => {
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
                  margin: "16px 0"
                }}>
                  {hint && (
                    <div style={{ 
                      fontSize: 12, 
                      color: "#888", 
                      marginBottom: 4,
                      fontWeight: 500
                    }}>
                      {hint}
                    </div>
                  )}
                  <div style={{
                    display: 'inline-block',
                    maxWidth: '85%',
                    padding: msg.role === "assistant" ? '12px 16px' : '8px 12px',
                    borderRadius: 12,
                    background: msg.role === "assistant" 
                      ? 'linear-gradient(135deg, #f0f7ff 0%, #e3f2fd 100%)' 
                      : 'linear-gradient(135deg, #e8f5e8 0%, #c8e6c9 100%)',
                    border: `1px solid ${msg.role === "assistant" ? '#c2d8f2' : '#c8e6c9'}`,
                    position: 'relative',
                    animation: 'fadeIn 0.3s ease-out'
                  }}>
                    <div style={{
                      fontWeight: 600,
                      color: msg.role === "assistant" ? '#1976d2' : '#2e7d32',
                      marginBottom: msg.role === "assistant" ? 8 : 0,
                      fontSize: 14
                    }}>
                      {msg.role === "user" ? "You" : "Assistant"}
                    </div>
                    {msg.role === "assistant" && msg.content === null ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          border: "3px solid #f0f0f0",
                          borderTop: "3px solid #1976d2",
                          borderRadius: "50%",
                          width: 20,
                          height: 20,
                          animation: "spin 1s linear infinite"
                        }} />
                        <span style={{ color: '#666', fontSize: 14 }}>Thinking...</span>
                        <style>{`
                          @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                          }
                          @keyframes fadeIn {
                            from { opacity: 0; transform: translateY(10px); }
                            to { opacity: 1; transform: translateY(0); }
                          }
                        `}</style>
                      </div>
                    ) : msg.role === "assistant" ? (
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    ) : (
                      <div style={{ fontSize: 15 }}>{msg.content}</div>
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
            marginTop: 24, 
            background: 'linear-gradient(135deg, #f8fafd 0%, #f0f7ff 100%)', 
            border: '1px solid #e3eaf2', 
            borderRadius: 12, 
            padding: 24 
          }}>
            <h3 style={{ 
              margin: '0 0 16px 0', 
              color: '#1976d2',
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              💬 Help improve this response
            </h3>
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
                border: '2px solid #e0e0e0',
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                marginBottom: 16,
                transition: 'all 0.3s ease'
              }}
              placeholder="What could be improved about this response?"
              onFocus={(e) => {
                e.target.style.borderColor = '#1976d2';
                e.target.style.boxShadow = '0 0 0 3px rgba(25, 118, 210, 0.1)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e0e0e0';
                e.target.style.boxShadow = 'none';
              }}
            />
            <div style={{ 
              display: 'flex',
              gap: 12,
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => {
                  setUiState("idle");
                  setFeedback("");
                }}
                style={{
                  padding: '12px 24px',
                  background: '#f5f5f5',
                  color: '#333',
                  border: '1px solid #ddd',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 15,
                  fontWeight: 500,
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#e8e8e8';
                  e.target.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#f5f5f5';
                  e.target.style.transform = 'translateY(0)';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleFeedback}
                disabled={!feedback.trim()}
                style={{
                  padding: '12px 24px',
                  fontSize: 15,
                  borderRadius: 8,
                  border: 'none',
                  background: feedback.trim() ? '#1976d2' : '#ccc',
                  color: 'white',
                  cursor: feedback.trim() ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                  transition: 'all 0.3s ease',
                  boxShadow: feedback.trim() ? '0 2px 8px rgba(25, 118, 210, 0.3)' : 'none'
                }}
              >
                Submit Feedback
              </button>
            </div>
          </div>
        )}

        {/* Enhanced Review Buttons */}
        {uiState === "idle" && (
          (assistantResponse || (history.length > 0 && history[history.length - 1].role === "assistant" && history[history.length - 1].content)) && (
            <div style={{ 
              marginTop: 24, 
              display: 'flex',
              gap: 12,
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => setUiState("user_feedback")}
                style={{ 
                  padding: "12px 24px", 
                  fontSize: 15,
                  borderRadius: 8,
                  border: '1px solid #ff9800',
                  background: '#fff3e0',
                  color: '#e65100',
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#ffe0b3'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#fff3e0'}
              >
                💬 Provide Feedback
              </button>
              <button
                onClick={handleApprove}
                style={{ 
                  padding: "12px 24px", 
                  fontSize: 15,
                  borderRadius: 8,
                  border: 'none',
                  background: 'linear-gradient(135deg, #4caf50 0%, #45a049 100%)',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.3s ease',
                  boxShadow: '0 2px 8px rgba(76, 175, 80, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'linear-gradient(135deg, #45a049 0%, #388e3c 100%)';
                  e.target.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'linear-gradient(135deg, #4caf50 0%, #45a049 100%)';
                  e.target.style.transform = 'translateY(0)';
                }}
              >
                ✓ Approve & Validate
              </button>
            </div>
          )
        )}

        {/* Enhanced Final Version Display */}
        {uiState === "finished" && (
          <div style={{ 
            marginTop: 24, 
            background: 'linear-gradient(135deg, #f0f7ff 0%, #e8f5e8 100%)', 
            border: '2px solid #4caf50', 
            borderRadius: 12, 
            padding: 24,
            position: 'relative'
          }}>
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              marginBottom: 16,
              gap: 12
            }}>
              <h3 style={{ 
                margin: 0, 
                color: '#1976d2',
                fontSize: 18,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                ✅ Validated Answer
              </h3>
              {responseQuality && (
                <QualityBadge quality={responseQuality} />
              )}
            </div>
            
            <div style={{ 
              background: 'white',
              padding: 20,
              borderRadius: 8,
              border: '1px solid #e0e7ff',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
            }}>
              <ReactMarkdown>{assistantResponse}</ReactMarkdown>
            </div>

            {/* Sources in finished state */}
            {sources.length > 0 && (
              <SourceCitations sources={sources} confidence={retrievalConfidence} />
            )}

            <div style={{
              marginTop: 16,
              padding: 12,
              backgroundColor: 'rgba(76, 175, 80, 0.1)',
              borderRadius: 8,
              border: '1px solid #c8e6c9',
              fontSize: 13,
              color: '#2e7d32',
              textAlign: 'center',
              fontWeight: 500
            }}>
              🎯 This answer has been validated and will be prioritized in future queries
            </div>
          </div>
        )}

        {/* Document Upload Modal */}
        <DocumentUploadModal />

        {/* Toast Notifications */}
        <Toast toast={toast} />
      </div>
    </div>
  );
};

export default App;