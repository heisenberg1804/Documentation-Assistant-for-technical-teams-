import React, { useState } from 'react';
import ConfidenceIndicator from './ConfidenceIndicator';

const SourceViewer = ({ sources, confidence, isVisible = true, compact = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!sources || sources.length === 0 || !isVisible) {
    return null;
  }

  const getSourceTypeIcon = (sourceType) => {
    switch (sourceType) {
      case 'validated':
        return '✓';
      case 'cache':
        return '⚡';
      case 'rag':
      default:
        return '📄';
    }
  };

  const getSourceTypeLabel = (sourceType) => {
    switch (sourceType) {
      case 'validated':
        return 'Validated Answer';
      case 'cache':
        return 'Cached Result';
      case 'rag':
      default:
        return 'Documentation';
    }
  };

  const getSourceTypeBadgeColor = (sourceType) => {
    switch (sourceType) {
      case 'validated':
        return { bg: '#e8f5e8', border: '#4caf50', text: '#2e7d32' };
      case 'cache':
        return { bg: '#fff3e0', border: '#ff9800', text: '#e65100' };
      case 'rag':
      default:
        return { bg: '#f0f7ff', border: '#2196f3', text: '#1565c0' };
    }
  };

  const avgConfidence = confidence || (sources.reduce((sum, s) => sum + s.confidence, 0) / sources.length);

  // Compact view for inline display
  if (compact) {
    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 8px',
        backgroundColor: '#f8faff',
        border: '1px solid #e0e7ff',
        borderRadius: 12,
        fontSize: 11
      }}>
        <span>📚</span>
        <span style={{ fontWeight: 500 }}>
          {sources.length} source{sources.length !== 1 ? 's' : ''}
        </span>
        <ConfidenceIndicator 
          confidence={avgConfidence}
          sourceCount={sources.length}
          size="small"
        />
      </div>
    );
  }

  return (
    <div style={{
      margin: '12px 0',
      border: '1px solid #e0e7ff',
      borderRadius: 6,
      backgroundColor: '#f8faff',
      fontSize: 14
    }}>
      {/* Header */}
      <div 
        style={{
          padding: '10px 14px',
          backgroundColor: '#e0e7ff',
          borderRadius: '5px 5px 0 0',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          userSelect: 'none'
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14 }}>📚</span>
          <span style={{ fontWeight: 600, color: '#1565c0' }}>
            {sources.length} Reference Source{sources.length !== 1 ? 's' : ''}
          </span>
          <ConfidenceIndicator 
            confidence={avgConfidence}
            sourceCount={sources.length}
            size="small"
          />
        </div>
        <span style={{ 
          color: '#666', 
          fontSize: 12,
          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease'
        }}>
          ▼
        </span>
      </div>

      {/* Preview Mode (collapsed) */}
      {!isExpanded && (
        <div style={{ padding: '8px 14px', fontSize: 12, color: '#666' }}>
          {sources.slice(0, 2).map((source, idx) => {
            const colors = getSourceTypeBadgeColor(source.source_type);
            return (
              <span key={idx} style={{ marginRight: 12 }}>
                <span style={{ marginRight: 4 }}>
                  {getSourceTypeIcon(source.source_type)}
                </span>
                {source.metadata?.file || 'Unknown'}
                <span style={{
                  marginLeft: 4,
                  color: colors.text,
                  fontWeight: 500
                }}>
                  ({(source.confidence * 100).toFixed(0)}%)
                </span>
              </span>
            );
          })}
          {sources.length > 2 && (
            <span style={{ color: '#888', fontStyle: 'italic' }}>
              +{sources.length - 2} more
            </span>
          )}
        </div>
      )}

      {/* Expandable Content */}
      {isExpanded && (
        <div style={{ padding: '12px 14px' }}>
          {sources.map((source, idx) => {
            const colors = getSourceTypeBadgeColor(source.source_type);
            
            return (
              <div 
                key={idx}
                style={{
                  marginBottom: idx === sources.length - 1 ? 0 : 16,
                  padding: 12,
                  backgroundColor: 'white',
                  borderRadius: 4,
                  border: '1px solid #e5e5e5',
                  position: 'relative'
                }}
              >
                {/* Source Header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 8
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <span style={{ fontSize: 14 }}>
                      {getSourceTypeIcon(source.source_type)}
                    </span>
                    <div>
                      <div style={{ 
                        fontWeight: 600, 
                        color: '#333',
                        fontSize: 13,
                        marginBottom: 2
                      }}>
                        {getSourceTypeLabel(source.source_type)}
                      </div>
                      
                      {/* Source metadata */}
                      <div style={{
                        display: 'flex',
                        gap: 8,
                        fontSize: 11,
                        color: '#666'
                      }}>
                        {source.metadata?.file && (
                          <span>📄 {source.metadata.file}</span>
                        )}
                        {source.metadata?.section && (
                          <span>🔍 {source.metadata.section}</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Source type badge */}
                    <span style={{
                      backgroundColor: colors.bg,
                      color: colors.text,
                      border: `1px solid ${colors.border}`,
                      padding: '2px 6px',
                      borderRadius: 10,
                      fontSize: 9,
                      fontWeight: 500,
                      textTransform: 'uppercase'
                    }}>
                      {source.source_type}
                    </span>
                    
                    {source.metadata?.validated && (
                      <span style={{
                        backgroundColor: '#4caf50',
                        color: 'white',
                        padding: '1px 4px',
                        borderRadius: 3,
                        fontSize: 9,
                        fontWeight: 500
                      }}>
                        VALIDATED
                      </span>
                    )}
                  </div>
                  
                  {/* Confidence indicator */}
                  <ConfidenceIndicator 
                    confidence={source.confidence}
                    size="small"
                  />
                </div>

                {/* Source Content Preview */}
                <div style={{
                  backgroundColor: '#f8f9fa',
                  padding: 10,
                  borderRadius: 3,
                  fontSize: 12,
                  lineHeight: '1.4',
                  color: '#444',
                  fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
                  maxHeight: 120,
                  overflowY: 'auto',
                  border: '1px solid #e9ecef',
                  position: 'relative'
                }}>
                  {source.content || 'No preview available'}
                  
                  {/* Fade effect for long content */}
                  {source.content && source.content.length > 200 && (
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 20,
                      background: 'linear-gradient(transparent, #f8f9fa)',
                      pointerEvents: 'none'
                    }} />
                  )}
                </div>

                {/* Additional metadata for validated sources */}
                {source.metadata?.validation_info && (
                  <div style={{
                    marginTop: 8,
                    padding: 8,
                    backgroundColor: '#e8f5e8',
                    borderRadius: 3,
                    fontSize: 11,
                    color: '#2e7d32'
                  }}>
                    <div style={{ fontWeight: 500, marginBottom: 2 }}>
                      ✓ Previously Validated
                    </div>
                    <div style={{ color: '#388e3c' }}>
                      Approved by: {source.metadata.validation_info.approved_by || 'user'}
                    </div>
                    {source.metadata.validation_info.feedback_received && (
                      <div style={{ 
                        marginTop: 4, 
                        fontStyle: 'italic',
                        color: '#4caf50'
                      }}>
                        Feedback: "{source.metadata.validation_info.feedback_received}"
                      </div>
                    )}
                  </div>
                )}

                {/* Code detection indicator */}
                {source.metadata?.has_code && (
                  <div style={{
                    marginTop: 6,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 10,
                    color: '#666',
                    backgroundColor: '#f0f0f0',
                    padding: '2px 6px',
                    borderRadius: 8
                  }}>
                    <span>💻</span>
                    <span>Contains code examples</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Summary Footer */}
          <div style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: '1px solid #e5e5e5',
            fontSize: 11,
            color: '#666',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <span style={{ marginRight: 12 }}>
                ✓ {sources.filter(s => s.source_type === 'validated').length} validated
              </span>
              <span style={{ marginRight: 12 }}>
                📄 {sources.filter(s => s.source_type === 'rag').length} from docs
              </span>
              {sources.filter(s => s.source_type === 'cache').length > 0 && (
                <span>
                  ⚡ {sources.filter(s => s.source_type === 'cache').length} cached
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Avg. confidence:</span>
              <ConfidenceIndicator 
                confidence={avgConfidence}
                size="small"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SourceViewer;