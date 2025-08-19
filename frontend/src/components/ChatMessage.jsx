import React from 'react';
import ReactMarkdown from 'react-markdown';
import ConfidenceIndicator from './ConfidenceIndicator';

const ChatMessage = ({ 
  role, 
  content, 
  sources = [], 
  confidence = null, 
  isValidated = false, 
  isStreaming = false,
  timestamp = null,
  messageHint = null
}) => {
  
  // Enhanced markdown renderer with proper code formatting
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
              backgroundColor: '#f8f9fa',
              maxWidth: '100%'
            }}>
              {language && (
                <div style={{
                  backgroundColor: '#e9ecef',
                  padding: '6px 12px',
                  fontSize: '11px',
                  color: '#495057',
                  fontWeight: 600,
                  borderBottom: '1px solid #e1e5e9',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  {language}
                </div>
              )}
              <pre style={{
                margin: 0,
                padding: '16px',
                overflowX: 'auto',
                backgroundColor: '#f8f9fa',
                fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
                fontSize: '13px',
                lineHeight: '1.5',
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
              padding: '2px 5px',
              borderRadius: 3,
              fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
              fontSize: '0.9em',
              color: '#d63384',
              border: '1px solid #f1f3f4'
            }} {...props}>
              {children}
            </code>
          );
        },
        pre: ({children}) => children, // Prevent double wrapping
        
        // Enhanced list styling
        ul: ({children}) => (
          <ul style={{
            paddingLeft: '20px',
            marginBottom: '12px'
          }}>
            {children}
          </ul>
        ),
        
        ol: ({children}) => (
          <ol style={{
            paddingLeft: '20px',
            marginBottom: '12px'
          }}>
            {children}
          </ol>
        ),
        
        // Enhanced heading styling
        h1: ({children}) => (
          <h1 style={{
            fontSize: '1.5em',
            fontWeight: 600,
            marginBottom: '12px',
            color: '#1976d2',
            borderBottom: '2px solid #e0e7ff',
            paddingBottom: '6px'
          }}>
            {children}
          </h1>
        ),
        
        h2: ({children}) => (
          <h2 style={{
            fontSize: '1.3em',
            fontWeight: 600,
            marginBottom: '10px',
            color: '#1976d2'
          }}>
            {children}
          </h2>
        ),
        
        h3: ({children}) => (
          <h3 style={{
            fontSize: '1.1em',
            fontWeight: 600,
            marginBottom: '8px',
            color: '#1565c0'
          }}>
            {children}
          </h3>
        ),
        
        // Enhanced blockquote styling
        blockquote: ({children}) => (
          <blockquote style={{
            borderLeft: '4px solid #1976d2',
            margin: '12px 0',
            padding: '8px 16px',
            backgroundColor: '#f8faff',
            fontStyle: 'italic',
            color: '#555'
          }}>
            {children}
          </blockquote>
        )
      }}
    >
      {content}
    </ReactMarkdown>
  );

  // Streaming indicator
  const StreamingIndicator = () => (
    <div style={{ 
      display: "flex", 
      alignItems: "center",
      gap: 8,
      color: '#666',
      fontSize: 14
    }}>
      <div style={{
        border: "3px solid #eee",
        borderTop: "3px solid #1976d2",
        borderRadius: "50%",
        width: 18,
        height: 18,
        animation: "spin 1s linear infinite"
      }} />
      <span>
        {sources.length > 0 ? "Generating response with citations..." : "Finding relevant sources..."}
      </span>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );

  return (
    <div style={{ 
      textAlign: role === "user" ? "right" : "left", 
      margin: "16px 0",
      maxWidth: '100%'
    }}>
      {/* Message hint */}
      {messageHint && (
        <div style={{ 
          fontSize: 11, 
          color: "#888", 
          marginBottom: 4,
          textAlign: role === "user" ? "right" : "left"
        }}>
          {messageHint}
        </div>
      )}
      
      {/* Message bubble */}
      <div style={{
        display: 'inline-block',
        maxWidth: role === "user" ? '75%' : '90%',
        minWidth: role === "user" ? '120px' : '200px',
        padding: role === "assistant" ? '16px 20px' : '12px 16px',
        backgroundColor: role === "assistant" ? 'rgba(25, 118, 210, 0.06)' : '#f0f7ff',
        border: role === "assistant" ? '1px solid rgba(25, 118, 210, 0.15)' : '1px solid #c2d8f2',
        borderRadius: role === "assistant" ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        textAlign: 'left',
        position: 'relative',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        {/* Message header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: role === "assistant" ? 8 : 4
        }}>
          <span style={{
            fontWeight: 600,
            color: role === "assistant" ? '#1976d2' : '#1565c0',
            fontSize: 13
          }}>
            {role === "user" ? "You" : "Assistant"}
          </span>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Validation badge */}
            {isValidated && role === "assistant" && (
              <span style={{
                backgroundColor: '#4caf50',
                color: 'white',
                padding: '1px 6px',
                borderRadius: 8,
                fontSize: 9,
                fontWeight: 500
              }}>
                ✓ VALIDATED
              </span>
            )}
            
            {/* Confidence indicator for assistant messages */}
            {role === "assistant" && confidence && !isStreaming && (
              <ConfidenceIndicator 
                confidence={confidence}
                sourceCount={sources.length}
                size="small"
              />
            )}
            
            {/* Timestamp */}
            {timestamp && (
              <span style={{
                fontSize: 10,
                color: '#999',
                marginLeft: 4
              }}>
                {new Date(timestamp).toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </span>
            )}
          </div>
        </div>
        
        {/* Message content */}
        {role === "assistant" && isStreaming ? (
          <StreamingIndicator />
        ) : role === "assistant" ? (
          <div style={{ fontSize: 15, lineHeight: 1.5 }}>
            <MarkdownRenderer content={content} />
          </div>
        ) : (
          <div style={{ 
            fontSize: 15, 
            lineHeight: 1.5,
            color: '#333'
          }}>
            {content}
          </div>
        )}
        
        {/* Sources attachment for assistant messages */}
        {role === "assistant" && sources.length > 0 && !isStreaming && (
          <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #e0e7ff' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: '#666'
            }}>
              <span>📚</span>
              <span>
                Based on {sources.length} source{sources.length !== 1 ? 's' : ''} 
              </span>
              {confidence && (
                <>
                  <span>•</span>
                  <ConfidenceIndicator 
                    confidence={confidence}
                    sourceCount={sources.length}
                    size="small"
                  />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;