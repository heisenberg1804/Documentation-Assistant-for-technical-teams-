import React, { useState, useRef } from 'react';
import AssistantService from '../AssistantService';

const DocumentUploader = ({ onUploadComplete, onClose, currentStats = {} }) => {
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle, uploading, success, error
  const [uploadMessage, setUploadMessage] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);

  const handleFiles = async (files) => {
    const fileArray = Array.from(files);
    const supportedTypes = ['md', 'pdf', 'txt'];
    
    // Validate files
    const validFiles = fileArray.filter(file => {
      const extension = file.name.split('.').pop().toLowerCase();
      return supportedTypes.includes(extension);
    });

    if (validFiles.length === 0) {
      setUploadStatus('error');
      setUploadMessage('No supported files found. Please upload .md, .pdf, or .txt files.');
      return;
    }

    if (validFiles.length !== fileArray.length) {
      const ignoredCount = fileArray.length - validFiles.length;
      setUploadMessage(`${ignoredCount} unsupported file(s) ignored. Processing ${validFiles.length} valid files...`);
    }

    setUploadStatus('uploading');
    setUploadMessage(`Uploading ${validFiles.length} file(s)...`);
    setUploadProgress({ current: 0, total: validFiles.length });

    // Use batch upload for better progress tracking
    try {
      const results = await AssistantService.batchUploadDocuments(
        validFiles,
        (progress) => {
          setUploadProgress(progress);
          if (progress.status === 'uploading') {
            setUploadMessage(`Processing ${progress.currentFile}... (${progress.current}/${progress.total})`);
          }
        }
      );

      setUploadedFiles(results);
      
      const successCount = results.filter(r => r.status === 'success').length;
      const totalChunks = results.reduce((sum, r) => sum + (r.chunks_created || 0), 0);

      if (successCount === results.length) {
        setUploadStatus('success');
        setUploadMessage(`✅ Successfully uploaded ${successCount} files (${totalChunks} chunks created)`);
      } else {
        setUploadStatus('error');
        setUploadMessage(`⚠️ ${successCount}/${results.length} files uploaded successfully`);
      }

      if (onUploadComplete) {
        onUploadComplete(results);
      }

    } catch (error) {
      setUploadStatus('error');
      setUploadMessage(`Upload failed: ${error.message}`);
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
    if (fileInputRef.current) {
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
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: 8,
        padding: 32,
        maxWidth: 500,
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
      }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: 24 
        }}>
          <h2 style={{ margin: 0, color: '#1976d2' }}>Upload Documents</h2>
          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: '#666',
              padding: 4
            }}
          >
            ×
          </button>
        </div>

        {/* Current Knowledge Base Status */}
        {currentStats.total_chunks > 0 && (
          <div style={{
            marginBottom: 16,
            padding: 12,
            backgroundColor: '#f0f7ff',
            border: '1px solid #c2d8f2',
            borderRadius: 6,
            fontSize: 14
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4, color: '#1976d2' }}>
              📊 Current Knowledge Base
            </div>
            <div style={{ color: '#666' }}>
              📄 {currentStats.total_chunks} chunks • ✅ {currentStats.total_validated} validated
            </div>
          </div>
        )}

        {/* Upload Area */}
        <div
          style={{
            border: `2px dashed ${dragActive ? '#1976d2' : '#ddd'}`,
            borderRadius: 8,
            padding: 40,
            textAlign: 'center',
            backgroundColor: dragActive ? '#f0f7ff' : '#fafafa',
            marginBottom: 16,
            cursor: uploadStatus === 'uploading' ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            opacity: uploadStatus === 'uploading' ? 0.7 : 1
          }}
          onClick={uploadStatus !== 'uploading' ? openFileDialog : undefined}
          onDragEnter={uploadStatus !== 'uploading' ? handleDrag : undefined}
          onDragLeave={uploadStatus !== 'uploading' ? handleDrag : undefined}
          onDragOver={uploadStatus !== 'uploading' ? handleDrag : undefined}
          onDrop={uploadStatus !== 'uploading' ? handleDrop : undefined}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>
            {uploadStatus === 'uploading' ? '⏳' : '📄'}
          </div>
          <div style={{ fontSize: 16, marginBottom: 8, fontWeight: 600 }}>
            {uploadStatus === 'uploading' ? 
              'Processing files...' :
              dragActive ? 'Drop files here' : 
              'Click to select or drag files here'
            }
          </div>
          <div style={{ fontSize: 14, color: '#666' }}>
            Supported: .md, .pdf, .txt files
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

        {/* Upload Progress Bar */}
        {uploadStatus === 'uploading' && uploadProgress.total > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 4,
              fontSize: 12,
              color: '#666'
            }}>
              <span>Progress: {uploadProgress.current}/{uploadProgress.total}</span>
              <span>{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
            </div>
            <div style={{
              width: '100%',
              height: 6,
              backgroundColor: '#e0e0e0',
              borderRadius: 3,
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
                height: '100%',
                backgroundColor: '#1976d2',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
        )}

        {/* Status Message */}
        {uploadMessage && (
          <div style={{
            padding: 12,
            borderRadius: 4,
            marginBottom: 16,
            backgroundColor: uploadStatus === 'success' ? '#e8f5e8' : 
                           uploadStatus === 'error' ? '#ffe8e8' : '#f0f7ff',
            border: `1px solid ${uploadStatus === 'success' ? '#4caf50' : 
                                 uploadStatus === 'error' ? '#f44336' : '#1976d2'}`,
            color: uploadStatus === 'success' ? '#2e7d32' : 
                   uploadStatus === 'error' ? '#c62828' : '#1565c0'
          }}>
            {uploadMessage}
          </div>
        )}

        {/* Results List with Enhanced Details */}
        {uploadedFiles.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#333' }}>Upload Results:</h4>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {uploadedFiles.map((result, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 10,
                  marginBottom: 6,
                  backgroundColor: result.status === 'success' ? '#f1f8e9' : '#ffebee',
                  border: `1px solid ${result.status === 'success' ? '#c8e6c9' : '#ffcdd2'}`,
                  borderRadius: 4,
                  fontSize: 14
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, marginBottom: 2 }}>
                      {result.filename}
                    </div>
                    {result.file_size && (
                      <div style={{ fontSize: 11, color: '#666' }}>
                        {(result.file_size / 1024).toFixed(1)} KB
                      </div>
                    )}
                  </div>
                  
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        color: result.status === 'success' ? '#4caf50' : '#f44336',
                        fontSize: 16
                      }}>
                        {result.status === 'success' ? '✅' : '❌'}
                      </span>
                      
                      {result.chunks_created > 0 && (
                        <span style={{ 
                          backgroundColor: '#4caf50',
                          color: 'white',
                          padding: '2px 6px',
                          borderRadius: 10,
                          fontSize: 10,
                          fontWeight: 500
                        }}>
                          {result.chunks_created} chunks
                        </span>
                      )}
                    </div>
                    
                    {result.error_message && (
                      <div style={{ 
                        color: '#f44336', 
                        fontSize: 11, 
                        marginTop: 2,
                        maxWidth: 150,
                        textAlign: 'right'
                      }}>
                        {result.error_message}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Upload Summary */}
            {uploadStatus === 'success' && uploadedFiles.length > 0 && (
              <div style={{
                marginTop: 12,
                padding: 10,
                backgroundColor: '#e8f5e8',
                border: '1px solid #4caf50',
                borderRadius: 4,
                fontSize: 13,
                textAlign: 'center'
              }}>
                <div style={{ fontWeight: 600, color: '#2e7d32', marginBottom: 4 }}>
                  🎉 Upload Complete!
                </div>
                <div style={{ color: '#388e3c' }}>
                  Added {uploadedFiles.reduce((sum, f) => sum + (f.chunks_created || 0), 0)} new chunks 
                  to your knowledge base
                </div>
              </div>
            )}
          </div>
        )}

        {/* File Type Guide */}
        {uploadStatus === 'idle' && (
          <div style={{
            padding: 12,
            backgroundColor: '#f8f9fa',
            border: '1px solid #e9ecef',
            borderRadius: 4,
            fontSize: 12,
            marginBottom: 16
          }}>
            <div style={{ fontWeight: 600, marginBottom: 6, color: '#495057' }}>
              📋 Supported File Types:
            </div>
            <div style={{ color: '#6c757d', lineHeight: 1.4 }}>
              • <strong>.md</strong> - Markdown documentation<br/>
              • <strong>.pdf</strong> - PDF documents<br/>
              • <strong>.txt</strong> - Plain text files
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'flex-end', 
          gap: 12,
          marginTop: 24
        }}>
          {uploadStatus === 'success' && (
            <button
              onClick={resetUpload}
              style={{
                padding: '10px 16px',
                backgroundColor: '#1976d2',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 500
              }}
            >
              Upload More
            </button>
          )}
          
          <button
            onClick={onClose}
            style={{
              padding: '10px 16px',
              backgroundColor: uploadStatus === 'uploading' ? '#ccc' : '#f5f5f5',
              color: uploadStatus === 'uploading' ? '#666' : '#333',
              border: '1px solid #ddd',
              borderRadius: 4,
              cursor: uploadStatus === 'uploading' ? 'not-allowed' : 'pointer',
              fontSize: 14
            }}
            disabled={uploadStatus === 'uploading'}
          >
            {uploadStatus === 'uploading' ? 'Uploading...' : 'Close'}
          </button>
        </div>

        {/* Upload Tips */}
        {uploadStatus === 'idle' && currentStats.total_chunks === 0 && (
          <div style={{
            marginTop: 20,
            padding: 12,
            backgroundColor: '#fff3e0',
            border: '1px solid #ffcc02',
            borderRadius: 4,
            fontSize: 12
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4, color: '#e65100' }}>
              💡 Getting Started Tips:
            </div>
            <div style={{ color: '#bf360c', lineHeight: 1.4 }}>
              • Start with README or overview documents<br/>
              • Upload API documentation for technical queries<br/>
              • Include setup/installation guides<br/>
              • Add troubleshooting documentation
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentUploader;