import React from 'react';

const ConfidenceIndicator = ({ 
  confidence, 
  sourceCount = 0, 
  hasValidated = false,
  size = 'medium' // small, medium, large
}) => {
  if (confidence === null || confidence === undefined || sourceCount === 0) {
    return null;
  }

  const getConfidenceLevel = (conf) => {
    if (conf >= 0.8) return 'high';
    if (conf >= 0.6) return 'medium';
    return 'low';
  };

  const getColors = (level) => {
    switch (level) {
      case 'high':
        return { bg: '#e8f5e8', border: '#4caf50', text: '#2e7d32' };
      case 'medium':
        return { bg: '#fff3e0', border: '#ff9800', text: '#e65100' };
      case 'low':
      default:
        return { bg: '#ffebee', border: '#f44336', text: '#c62828' };
    }
  };

  const getSizes = (sizeType) => {
    switch (sizeType) {
      case 'small':
        return { padding: '2px 6px', fontSize: 10, height: 18 };
      case 'large':
        return { padding: '6px 12px', fontSize: 14, height: 32 };
      case 'medium':
      default:
        return { padding: '4px 8px', fontSize: 11, height: 24 };
    }
  };

  const confidenceLevel = getConfidenceLevel(confidence);
  const colors = getColors(confidenceLevel);
  const sizes = getSizes(size);

  const getConfidenceText = (level) => {
    switch (level) {
      case 'high':
        return 'High Confidence';
      case 'medium':
        return 'Medium Confidence';
      case 'low':
      default:
        return 'Low Confidence';
    }
  };

  const getIcon = (level) => {
    switch (level) {
      case 'high':
        return '✓';
      case 'medium':
        return '~';
      case 'low':
      default:
        return '!';
    }
  };

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: sizes.padding,
      backgroundColor: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: 12,
      fontSize: sizes.fontSize,
      fontWeight: 500,
      color: colors.text,
      height: sizes.height,
      boxSizing: 'border-box'
    }}>
      <span style={{ fontSize: sizes.fontSize + 1 }}>
        {getIcon(confidenceLevel)}
      </span>
      
      {size !== 'small' && (
        <>
          <span>{getConfidenceText(confidenceLevel)}</span>
          <span style={{ 
            color: colors.text, 
            fontWeight: 600,
            marginLeft: 2
          }}>
            {(confidence * 100).toFixed(0)}%
          </span>
        </>
      )}
      
      {size === 'small' && (
        <span style={{ fontWeight: 600 }}>
          {(confidence * 100).toFixed(0)}%
        </span>
      )}

      {hasValidated && (
        <span style={{
          backgroundColor: colors.border,
          color: 'white',
          padding: '1px 3px',
          borderRadius: 2,
          fontSize: sizes.fontSize - 1,
          marginLeft: 2
        }}>
          V
        </span>
      )}

      {sourceCount > 0 && size !== 'small' && (
        <span style={{
          color: colors.text,
          opacity: 0.8,
          fontSize: sizes.fontSize - 1
        }}>
          ({sourceCount} sources)
        </span>
      )}
    </div>
  );
};

export default ConfidenceIndicator;