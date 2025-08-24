import React, { useState, useRef } from 'react';
import AssistantService from '../AssistantService';

const DocumentUploader = ({ onUploadComplete, onClose, currentStats = {} }) => {
  const [uploadStatus, setUploadStatus] = useState('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);

  // Enhanced error handling with user guidance
  const getErrorGuidance = (errorMessage) => {
    if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
      return {
        title: "Upload Service Unavailable",
        message: "The document upload service is not responding. Please check if the backend server is running on port 8000.",
        action: "Verify backend is running: python main.py"
      };
    }
    
    if (errorMessage.includes('CORS') || errorMessage.includes('Access-Control')) {
      return {
        title: "Connection Issue",
        message: "Browser security is blocking the upload. This usually happens in development.",
        action: "Check CORS configuration in backend"
      };
    }
    
    if (errorMessage.includes('File too large')) {
      return {
        title: "File Size Limit",
        message: "Files must be under 10MB. Consider splitting large documents into smaller sections.",
        action: "Split document or compress file size"
      };
    }
    
    if (errorMessage.includes('Unsupported file type')) {
      return {
        title: "Invalid File Format", 
        message: "Only .md, .pdf, and .txt files are supported.",
        action: "Convert file to supported format"
      };
    }
    
    return {
      title: "Upload Error",
      message: errorMessage,
      action: "Try again or check file format"
    };
  };

  const handleFiles = async (files) => {
    const fileArray = Array.from(files);
    const supportedTypes = ['md', 'pdf', 'txt'];
    
    // Enhanced file validation
    const fileValidation = fileArray.map(file => {
      const extension = file.name.split('.').pop().toLowerCase();
      const isSupported = supportedTypes.includes(extension);
      const isSizeOk = file.size <= 10 * 1024 * 1024; // 10MB limit
      
      return {
        file,
        extension,
        isSupported,
        isSizeOk,
        sizeStr: (file.size / 1024).toFixed(1) + ' KB'
      };
    });

    const validFiles = fileValidation.filter(f => f.isSupported && f.isSizeOk);
    const invalidFiles = fileValidation.filter(f => !f.isSupported || !f.isSizeOk);

    // Show validation results
    if (invalidFiles.length > 0) {
      const invalidReasons = invalidFiles.map(f => 
        `${f.file.name}: ${!f.isSupported ? 'unsupported format' : 'file too large'}`
      ).join(', ');
      
      if (validFiles.length === 0) {
        const guidance = getErrorGuidance('Unsupported file type');
        setUploadStatus('error');
        setUploadMessage(guidance.message);
        return;
      } else {
        setUploadMessage(`⚠️ ${invalidFiles.length} files skipped (${invalidReasons}). Processing ${validFiles.length} valid files...`);
      }
    }

    setUploadStatus('uploading');
    setUploadProgress({ current: 0, total: validFiles.length });

    try {
      const results = [];
      
      for (let i = 0; i < validFiles.length; i++) {
        const fileInfo = validFiles[i];
        setUploadProgress({ 
          current: i + 1, 
          total: validFiles.length,
          currentFile: fileInfo.file.name
        });
        
        setUploadMessage(`Uploading ${fileInfo.file.name}... (${i + 1}/${validFiles.length})`);
        
        try {
          const result = await AssistantService.uploadDocument(fileInfo.file);
          results.push({
            ...result,
            file_size: fileInfo.file.size,
            size_str: fileInfo.sizeStr
          });
          
          console.log(`Upload result for ${fileInfo.file.name}:`, result);
          
        } catch (error) {
          console.error(`Upload error for ${fileInfo.file.name}:`, error);
          results.push({
            status: "error",
            filename: fileInfo.file.name,
            chunks_created: 0,
            error_message: error.message,
            file_size: fileInfo.file.size,
            size_str: fileInfo.sizeStr
          });
        }
      }

      setUploadedFiles(results);
      
      const successCount = results.filter(r => r.status === 'success').length;
      const totalChunks = results.reduce((sum, r) => sum + (r.chunks_created || 0), 0);

      if (successCount === results.length) {
        setUploadStatus('success');
        setUploadMessage(`🎉 All files uploaded successfully! Created ${totalChunks} searchable chunks.`);
      } else if (successCount > 0) {
        setUploadStatus('partial');
        setUploadMessage(`⚠️ ${successCount}/${results.length} files uploaded successfully (${totalChunks} chunks created)`);
      } else {
        setUploadStatus('error');
        const firstError = results.find(r => r.status === 'error')?.error_message || 'Unknown error';
        const guidance = getErrorGuidance(firstError);
        setUploadMessage(`❌ Upload failed: ${guidance.title}`);
      }

      if (onUploadComplete) {
        onUploadComplete(results);
      }

    } catch (error) {
      const guidance = getErrorGuidance(error.message);
      setUploadStatus('error');
      setUploadMessage(`❌ ${guidance.title}: ${guidance.message}`);
      setUploadedFiles([]);
    }
  };

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
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const openFileDialog = () => {
    if (uploadStatus !== 'uploading' && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const resetUpload = () => {
    setUploadStatus('idle');
    setUploadMessage('');
    setUploadedFiles([]);
    setUploadProgress({ current: 0, total: 0 });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 32,
        maxWidth: 520,
        width: '90%',
        maxHeight: '85vh',
        overflowY: 'auto',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)'
      }}>
        {/* Enhanced Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: 24 
        }}>
          <h2 style={{ 
            margin: 0, 
            color: '#1976d2',
            fontSize: 20,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <span style={{ fontSize: 24 }}>📄</span>
            Upload Documents
          </h2>
          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: '#666',
              padding: 8,
              borderRadius: 6,
              transition: 'all 0.2s ease'
            }}
            onMouseOver={e => e.target.style.backgroundColor = '#f5f5f5'}
            onMouseOut={e => e.target.style.backgroundColor = 'transparent'}
          >
            ×
          </button>
        </div>

        {/* Current Knowledge Base Status */}
        {currentStats.total_chunks > 0 && (
          <div style={{
            marginBottom: 20,
            padding: 16,
            backgroundColor: '#f0f7ff',
            border: '1px solid #c2d8f2',
            borderRadius: 8,
            fontSize: 14
          }}>
            <div style={{ 
              fontWeight: 600, 
              marginBottom: 8, 
              color: '#1976d2',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              <span style={{ fontSize: 16 }}>📊</span>
              Current Knowledge Base
            </div>
            <div style={{ color: '#666', lineHeight: 1.4 }}>
              📄 {currentStats.total_chunks} chunks • ✅ {currentStats.total_validated} validated
              <br/>
              <span style={{ fontSize: 12, fontStyle: 'italic' }}>
                Adding more documents improves answer accuracy
              </span>
            </div>
          </div>
        )}

        {/* Enhanced Upload Area */}
        <div
          style={{
            border: `3px dashed ${dragActive ? '#1976d2' : '#ddd'}`,
            borderRadius: 12,
            padding: 48,
            textAlign: 'center',
            backgroundColor: dragActive ? '#f0f7ff' : '#fafafa',
            marginBottom: 16,
            cursor: uploadStatus === 'uploading' ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s ease',
            opacity: uploadStatus === 'uploading' ? 0.7 : 1
          }}
          onClick={uploadStatus !== 'uploading' ? openFileDialog : undefined}
          onDragEnter={uploadStatus !== 'uploading' ? handleDrag : undefined}
          onDragLeave={uploadStatus !== 'uploading' ? handleDrag : undefined}
          onDragOver={uploadStatus !== 'uploading' ? handleDrag : undefined}
          onDrop={uploadStatus !== 'uploading' ? handleDrop : undefined}
        >
          <div style={{ fontSize: 56, marginBottom: 16 }}>
            {uploadStatus === 'uploading' ? '⏳' : dragActive ? '📥' : '📄'}
          </div>
          <div style={{ fontSize: 18, marginBottom: 8, fontWeight: 600, color: '#333' }}>
            {uploadStatus === 'uploading' ? 
              'Processing files...' :
              dragActive ? 'Drop files here' : 
              'Click to select or drag files here'
            }
          </div>
          <div style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>
            Supported: .md, .pdf, .txt files (max 10MB each)
          </div>
          
          {/* Upload tips */}
          <div style={{
            fontSize: 12,
            color: '#888',
            fontStyle: 'italic',
            maxWidth: 300,
            margin: '0 auto'
          }}>
            💡 Best results: README files, API documentation, setup guides
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".md,.pdf,.txt"
            onChange={handleFileInput}
            style={{ display: 'none' }}
            disabled={uploadStatus === 'uploading'}
          />
        </div>

        {/* Enhanced Progress Bar */}
        {uploadStatus === 'uploading' && uploadProgress.total > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
              fontSize: 13,
              color: '#666'
            }}>
              <span>
                📤 {uploadProgress.currentFile || `File ${uploadProgress.current}`}
              </span>
              <span style={{ fontWeight: 600 }}>
                {uploadProgress.current}/{uploadProgress.total}
              </span>
            </div>
            <div style={{
              width: '100%',
              height: 8,
              backgroundColor: '#e9ecef',
              borderRadius: 4,
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #1976d2, #42a5f5)',
                transition: 'width 0.3s ease',
                borderRadius: 4
              }} />
            </div>
          </div>
        )}

        {/* Enhanced Status Message */}
        {uploadMessage && (
          <div style={{
            padding: 16,
            borderRadius: 8,
            marginBottom: 20,
            backgroundColor: 
              uploadStatus === 'success' ? '#e8f5e8' : 
              uploadStatus === 'partial' ? '#fff3e0' :
              uploadStatus === 'error' ? '#ffebee' : '#f0f7ff',
            border: `2px solid ${
              uploadStatus === 'success' ? '#4caf50' : 
              uploadStatus === 'partial' ? '#ff9800' :
              uploadStatus === 'error' ? '#f44336' : '#1976d2'
            }`,
            color: 
              uploadStatus === 'success' ? '#2e7d32' : 
              uploadStatus === 'partial' ? '#e65100' :
              uploadStatus === 'error' ? '#c62828' : '#1565c0'
          }}>
            <div style={{ 
              fontWeight: 600, 
              marginBottom: uploadStatus === 'error' ? 8 : 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <span style={{ fontSize: 16 }}>
                {uploadStatus === 'success' ? '✅' : 
                 uploadStatus === 'partial' ? '⚠️' :
                 uploadStatus === 'error' ? '❌' : 'ℹ️'}
              </span>
              {uploadMessage}
            </div>
            
            {/* Enhanced error guidance */}
            {uploadStatus === 'error' && (
              <div style={{
                marginTop: 8,
                padding: 12,
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                borderRadius: 6,
                fontSize: 13
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  💡 How to fix this:
                </div>
                <div style={{ color: '#d32f2f' }}>
                  {getErrorGuidance(uploadMessage).action}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Enhanced Results List */}
        {uploadedFiles.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ 
              margin: '0 0 16px 0', 
              color: '#333',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              <span style={{ fontSize: 18 }}>📋</span>
              Upload Results:
            </h4>
            <div style={{ 
              maxHeight: 240, 
              overflowY: 'auto',
              border: '1px solid #e9ecef',
              borderRadius: 8,
              backgroundColor: '#f8f9fa'
            }}>
              {uploadedFiles.map((result, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 16,
                  marginBottom: idx === uploadedFiles.length - 1 ? 0 : 1,
                  backgroundColor: result.status === 'success' ? '#f1f8e9' : '#ffebee',
                  borderBottom: idx === uploadedFiles.length - 1 ? 'none' : '1px solid #e0e0e0'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontWeight: 600, 
                      marginBottom: 4,
                      color: '#333',
                      fontSize: 14
                    }}>
                      {result.filename}
                    </div>
                    <div style={{ 
                      fontSize: 12, 
                      color: '#666',
                      display: 'flex',
                      gap: 12
                    }}>
                      <span>📦 {result.size_str || 'Unknown size'}</span>
                      {result.chunks_created > 0 && (
                        <span>📄 {result.chunks_created} chunks</span>
                      )}
                    </div>
                    {result.error_message && (
                      <div style={{ 
                        color: '#d32f2f', 
                        fontSize: 11, 
                        marginTop: 4,
                        fontStyle: 'italic'
                      }}>
                        {result.error_message}
                      </div>
                    )}
                  </div>
                  
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    <span style={{
                      color: result.status === 'success' ? '#4caf50' : '#f44336',
                      fontSize: 20
                    }}>
                      {result.status === 'success' ? '✅' : '❌'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Enhanced Upload Summary */}
            {(uploadStatus === 'success' || uploadStatus === 'partial') && (
              <div style={{
                marginTop: 16,
                padding: 16,
                backgroundColor: uploadStatus === 'success' ? '#e8f5e8' : '#fff3e0',
                border: `1px solid ${uploadStatus === 'success' ? '#4caf50' : '#ff9800'}`,
                borderRadius: 8,
                fontSize: 14,
                textAlign: 'center'
              }}>
                <div style={{ 
                  fontWeight: 600, 
                  marginBottom: 6,
                  color: uploadStatus === 'success' ? '#2e7d32' : '#e65100'
                }}>
                  {uploadStatus === 'success' ? '🎉 Upload Complete!' : '⚠️ Partial Success'}
                </div>
                <div style={{ color: uploadStatus === 'success' ? '#388e3c' : '#f57c00' }}>
                  {uploadedFiles.reduce((sum, f) => sum + (f.chunks_created || 0), 0)} new chunks added to knowledge base
                </div>
                <div style={{
                  fontSize: 12,
                  color: '#666',
                  marginTop: 8,
                  fontStyle: 'italic'
                }}>
                  💡 You can now ask questions about the uploaded content
                </div>
              </div>
            )}
          </div>
        )}

        {/* Enhanced File Type Guide */}
        {uploadStatus === 'idle' && (
          <div style={{
            padding: 16,
            backgroundColor: '#f8f9fa',
            border: '1px solid #e9ecef',
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 20
          }}>
            <div style={{ 
              fontWeight: 600, 
              marginBottom: 12, 
              color: '#495057',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              <span style={{ fontSize: 16 }}>📋</span>
              Supported File Types:
            </div>
            <div style={{ color: '#6c757d', lineHeight: 1.5 }}>
              <div style={{ marginBottom: 4 }}>
                <strong>📝 .md</strong> - Markdown documentation (README, API docs)
              </div>
              <div style={{ marginBottom: 4 }}>
                <strong>📄 .pdf</strong> - PDF documents (manuals, guides)
              </div>
              <div style={{ marginBottom: 8 }}>
                <strong>📃 .txt</strong> - Plain text files (notes, configs)
              </div>
              <div style={{ 
                fontSize: 12, 
                color: '#888',
                fontStyle: 'italic',
                borderTop: '1px solid #e9ecef',
                paddingTop: 8
              }}>
                💡 <strong>Pro tip:</strong> Upload README files first for best results
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Actions */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'flex-end', 
          gap: 12
        }}>
          {(uploadStatus === 'success' || uploadStatus === 'partial') && (
            <button
              onClick={resetUpload}
              style={{
                padding: '12px 20px',
                backgroundColor: '#1976d2',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                transition: 'all 0.2s ease'
              }}
              onMouseOver={e => e.target.style.backgroundColor = '#1565c0'}
              onMouseOut={e => e.target.style.backgroundColor = '#1976d2'}
            >
              📄 Upload More
            </button>
          )}
          
          <button
            onClick={onClose}
            style={{
              padding: '12px 20px',
              backgroundColor: uploadStatus === 'uploading' ? '#e9ecef' : 'white',
              color: uploadStatus === 'uploading' ? '#6c757d' : '#495057',
              border: '2px solid #e1e5e9',
              borderRadius: 8,
              cursor: uploadStatus === 'uploading' ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 500,
              transition: 'all 0.2s ease'
            }}
            disabled={uploadStatus === 'uploading'}
            onMouseOver={e => {
              if (uploadStatus !== 'uploading') {
                e.target.style.backgroundColor = '#f8f9fa';
              }
            }}
            onMouseOut={e => {
              if (uploadStatus !== 'uploading') {
                e.target.style.backgroundColor = 'white';
              }
            }}
          >
            {uploadStatus === 'uploading' ? '⏳ Uploading...' : 'Close'}
          </button>
        </div>

        {/* Getting Started Tips */}
        {uploadStatus === 'idle' && currentStats.total_chunks === 0 && (
          <div style={{
            marginTop: 24,
            padding: 16,
            backgroundColor: '#fff8e1',
            border: '2px solid #ffcc02',
            borderRadius: 8,
            fontSize: 13
          }}>
            <div style={{ 
              fontWeight: 600, 
              marginBottom: 8, 
              color: '#e65100',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              <span style={{ fontSize: 16 }}>🚀</span>
              Getting Started Guide:
            </div>
            <div style={{ color: '#bf360c', lineHeight: 1.5 }}>
              <div>1. <strong>Upload README.md</strong> - Project overview</div>
              <div>2. <strong>Add API docs</strong> - Technical documentation</div>
              <div>3. <strong>Include setup guides</strong> - Installation instructions</div>
              <div style={{ 
                marginTop: 8, 
                fontSize: 12,
                fontStyle: 'italic',
                color: '#8d4004'
              }}>
                The more relevant docs you upload, the better the AI responses!
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentUploader;