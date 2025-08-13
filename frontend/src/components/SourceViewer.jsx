import React, { useState } from 'react';

const SourceViewer = ({ sources, confidence, isVisible = true }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!sources || sources.length === 0 || !isVisible) {
    return null;
  }

  const getConfidenceColor = (conf) => {
    if (conf >= 0.8) return '#4caf50'; // Green
    if (conf >= 0.6) return '#ff9800'; // Orange
    return '#f44336'; // Red
  };

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

  const avgConfidence = confidence || (sources.reduce((sum, s) => sum + s.confidence, 0) / sources.length);

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
          padding: '8px 12px',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12 }}>📚</span>
          <span style={{ fontWeight: 600, color: '#1565c0' }}>
            Sources ({sources.length})
          </span>
          <span style={{
            backgroundColor: getConfidenceColor(avgConfidence),
            color: 'white',
            padding: '2px 6px',
            borderRadius: 10,
            fontSize: 11,
            fontWeight: 500
          }}>
            {(avgConfidence * 100).toFixed(0)}%
          </span>
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

      {/* Expandable Content */}
      {isExpanded && (
        <div style={{ padding: '12px' }}>
          {sources.map((source, idx) => (
            <div 
              key={idx}
              style={{
                marginBottom: idx === sources.length - 1 ? 0 : 12,
                padding: 10,
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
                alignItems: 'center',
                marginBottom: 8
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>
                    {getSourceTypeIcon(source.source_type)}
                  </span>
                  <span style={{ 
                    fontWeight: 600, 
                    color: '#333',
                    fontSize: 13
                  }}>
                    {getSourceTypeLabel(source.source_type)}
                  </span>
                  {source.metadata?.validated && (
                    <span style={{
                      backgroundColor: '#4caf50',
                      color: 'white',
                      padding: '1px 4px',
                      borderRadius: 3,
                      fontSize: 10,
                      fontWeight: 500
                    }}>
                      VALIDATED
                    </span>
                  )}
                </div>
                <span style={{
                  color: getConfidenceColor(source.confidence),
                  fontWeight: 600,
                  fontSize: 12
                }}>
                  {(source.confidence * 100).toFixed(0)}%
                </span>
              </div>

              {/* Source Metadata */}
              <div style={{
                display: 'flex',
                gap: 12,
                marginBottom: 8,
                fontSize: 11,
                color: '#666'
              }}>
                {source.metadata?.file && (
                  <span>📄 {source.metadata.file}</span>
                )}
                {source.metadata?.section && (
                  <span>📍 {source.metadata.section}</span>
                )}
              </div>

              {/* Source Content Preview */}
              <div style={{
                backgroundColor: '#f8f9fa',
                padding: 8,
                borderRadius: 3,
                fontSize: 12,
                lineHeight: '1.4',
                color: '#444',
                fontFamily: 'monospace, sans-serif',
                maxHeight: 100,
                overflowY: 'auto',
                border: '1px solid #e9ecef'
              }}>
                {source.content || 'No preview available'}
              </div>

              {/* Validation Info (if available) */}
              {source.metadata?.validation_info && (
                <div style={{
                  marginTop: 8,
                  padding: 6,
                  backgroundColor: '#e8f5e8',
                  borderRadius: 3,
                  fontSize: 11,
                  color: '#2e7d32'
                }}>
                  <strong>Validation:</strong> Approved by {source.metadata.validation_info.approved_by}
                  {source.metadata.validation_info.feedback_received && (
                    <div style={{ marginTop: 2, fontStyle: 'italic' }}>
                      "{source.metadata.validation_info.feedback_received}"
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Summary Footer */}
          <div style={{
            marginTop: 12,
            paddingTop: 8,
            borderTop: '1px solid #e5e5e5',
            fontSize: 11,
            color: '#666',
            display: 'flex',
            justifyContent: 'space-between'
          }}>
            <span>
              {sources.filter(s => s.source_type === 'validated').length} validated, {' '}
              {sources.filter(s => s.source_type === 'rag').length} from docs
            </span>
            <span>
              Avg. confidence: {(avgConfidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SourceViewer;