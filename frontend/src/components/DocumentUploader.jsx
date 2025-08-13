import React, { useState, useRef } from 'react';
import AssistantService from '../AssistantService';

const DocumentUploader = ({ onUploadComplete, onClose }) => {
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle, uploading, success, error
  const [uploadMessage, setUploadMessage] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);

  const handleFiles = async (files) => {
    const fileArray = Array.from(files);
    const supportedTypes = ['md', 'pdf', 'txt'];
    
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
      setUploadMessage(`${fileArray.length - validFiles.length} unsupported files ignored.`);
    }

    setUploadStatus('uploading');
    setUploadMessage(`Uploading ${validFiles.length} file(s)...`);

    const results = [];
    for (const file of validFiles) {
      try {
        const result = await AssistantService.uploadDocument(file);
        results.push({ file: file.name, ...result });
      } catch (error) {
        results.push({ 
          file: file.name, 
          status: 'error', 
          error_message: error.message 
        });
      }
    }

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

        {/* Upload Area */}
        <div
          style={{
            border: `2px dashed ${dragActive ? '#1976d2' : '#ddd'}`,
            borderRadius: 8,
            padding: 40,
            textAlign: 'center',
            backgroundColor: dragActive ? '#f0f7ff' : '#fafafa',
            marginBottom: 16,
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onClick={openFileDialog}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
          <div style={{ fontSize: 16, marginBottom: 8, fontWeight: 600 }}>
            {dragActive ? 'Drop files here' : 'Click to select or drag files here'}
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
          />
        </div>

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

        {/* Upload Progress */}
        {uploadStatus === 'uploading' && (
          <div style={{ marginBottom: 16 }}>
            <div style={{
              width: '100%',
              height: 4,
              backgroundColor: '#e0e0e0',
              borderRadius: 2,
              overflow: 'hidden'
            }}>
              <div style={{
                width: '100%',
                height: '100%',
                backgroundColor: '#1976d2',
                animation: 'progress 1.5s ease-in-out infinite'
              }} />
            </div>
            <style>{`
              @keyframes progress {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
              }
            `}</style>
          </div>
        )}

        {/* Results List */}
        {uploadedFiles.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#333' }}>Upload Results:</h4>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {uploadedFiles.map((result, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 8,
                  marginBottom: 4,
                  backgroundColor: result.status === 'success' ? '#f1f8e9' : '#ffebee',
                  borderRadius: 4,
                  fontSize: 14
                }}>
                  <span style={{ fontWeight: 500 }}>{result.file}</span>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      color: result.status === 'success' ? '#4caf50' : '#f44336',
                      marginRight: 8
                    }}>
                      {result.status === 'success' ? '✅' : '❌'}
                    </span>
                    {result.chunks_created && (
                      <span style={{ color: '#666', fontSize: 12 }}>
                        {result.chunks_created} chunks
                      </span>
                    )}
                    {result.error_message && (
                      <div style={{ color: '#f44336', fontSize: 11, marginTop: 2 }}>
                        {result.error_message}
                      </div>
                    )}
                  </div>
                </div>
              ))}
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
              onClick={() => {
                setUploadStatus('idle');
                setUploadMessage('');
                setUploadedFiles([]);
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#1976d2',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              Upload More
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: uploadStatus === 'uploading' ? '#ccc' : '#f5f5f5',
              color: '#333',
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
      </div>
    </div>
  );
};

export default DocumentUploader;