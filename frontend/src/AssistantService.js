// AssistantService.js
// Enhanced service for assistant session/conversation API calls with full RAG support

const BASE_URL = "http://localhost:8000";

export default class AssistantService {
  // Original blocking API methods (unchanged)
  static async startConversation(human_request) {
    try {
      const response = await fetch(`${BASE_URL}/graph/start`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": "http://localhost:3000"
        },
        credentials: "include",
        body: JSON.stringify({ human_request })
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Network response was not ok: ${response.status} ${errorText}`);
      }
      return response.json();
    } catch (error) {
      console.error("Request failed:", error);
      throw error;
    }
  }

  static async submitReview({ thread_id, review_action, human_comment }) {
    const body = { thread_id, review_action };
    if (human_comment) body.human_comment = human_comment;
    const response = await fetch(`${BASE_URL}/graph/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error("Network response was not ok");
    return response.json();
  }

  // Enhanced streaming API methods with robust sources handling
  static async createStreamingConversation(human_request) {
    try {
      const response = await fetch(`${BASE_URL}/graph/stream/create`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": "http://localhost:3000"
        },
        credentials: "include",
        body: JSON.stringify({ human_request })
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Network response was not ok: ${response.status} ${errorText}`);
      }
      return response.json();
    } catch (error) {
      console.error("Request failed:", error);
      throw error;
    }
  }

  static async resumeStreamingConversation({ thread_id, review_action, human_comment }) {
    const body = { thread_id, review_action };
    if (human_comment) body.human_comment = human_comment;
    const response = await fetch(`${BASE_URL}/graph/stream/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error("Network response was not ok");
    return response.json();
  }

  static streamResponse(thread_id, onMessageCallback, onErrorCallback, onCompleteCallback) {
    // Create a new EventSource connection to the streaming endpoint
    const eventSource = new EventSource(`${BASE_URL}/graph/stream/${thread_id}`, {
      withCredentials: true
    });
    
    // Enhanced connection monitoring
    let isConnected = true;
    let sourcesReceived = false;
    
    // Handle token events (content streaming)
    eventSource.addEventListener('token', (event) => {
      if (!isConnected) return;
      
      try {
        const data = JSON.parse(event.data);
        onMessageCallback({ content: data.content });
      } catch (error) {
        console.error("Error parsing token event:", error, "Raw data:", event.data);
        onErrorCallback(error);
      }
    });

    // Enhanced sources event handler with validation
    eventSource.addEventListener('sources', (event) => {
      if (!isConnected) return;
      
      try {
        const data = JSON.parse(event.data);
        
        // Validate sources data structure
        if (!data.sources || !Array.isArray(data.sources)) {
          console.warn("Invalid sources data received:", data);
          return;
        }
        
        // Ensure each source has required fields
        const validatedSources = data.sources.map((source, index) => ({
          index: source.index || index + 1,
          content: source.content || '',
          source_type: source.source_type || 'rag',
          confidence: source.confidence || 0.0,
          metadata: {
            file: source.metadata?.file || 'Unknown',
            section: source.metadata?.section || '',
            validated: source.metadata?.validated || false,
            chunk_type: source.metadata?.chunk_type || 'text',
            has_code: source.metadata?.has_code || false,
            ...source.metadata
          }
        }));
        
        onMessageCallback({ 
          sources: validatedSources, 
          confidence: data.confidence || 0.0,
          retrieval_time_ms: data.retrieval_time_ms || 0,
          source_types: data.source_types || {}
        });
        
        sourcesReceived = true;
        console.log(`Successfully processed sources event: ${validatedSources.length} sources, confidence: ${data.confidence}`);
      } catch (error) {
        console.error("Error parsing sources event:", error, "Raw data:", event.data);
        // Don't call error callback for sources parsing issues - continue with response
        console.warn("Continuing without sources display");
      }
    });
    
    // Handle status events (user_feedback, finished)
    eventSource.addEventListener('status', (event) => {
      if (!isConnected) return;
      
      try {
        const data = JSON.parse(event.data);
        onMessageCallback({ 
          status: data.status, 
          metrics: data.metrics,
          stream_time_ms: data.stream_time_ms
        });
        
        // Mark that we've received a status event for this connection
        if (!window._hasReceivedStatusEvent) {
          window._hasReceivedStatusEvent = {};
        }
        window._hasReceivedStatusEvent[eventSource.url] = true;
        console.log(`Received status event: ${data.status}, marking connection for normal closure`);
      } catch (error) {
        console.error("Error parsing status event:", error, "Raw data:", event.data);
        onErrorCallback(error);
      }
    });
    
    // Handle start/resume events
    eventSource.addEventListener('start', (event) => {
      console.log("Stream started for thread:", thread_id);
    });
    
    eventSource.addEventListener('resume', (event) => {
      console.log("Stream resumed for thread:", thread_id);
    });
    
    // Enhanced error handling
    eventSource.onerror = (error) => {
      console.log("SSE connection state change - readyState:", eventSource.readyState);
      
      // Check if we've received a status event indicating completion
      const hasReceivedStatusEvent = window._hasReceivedStatusEvent && window._hasReceivedStatusEvent[eventSource.url];
      
      if (hasReceivedStatusEvent) {
        console.log("Stream completed normally after receiving status event");
        isConnected = false;
        eventSource.close();
        onCompleteCallback();
        return;
      }
      
      // Only call the error callback if it's a real error, not a normal close
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log("Stream completed normally (connection closed)");
        isConnected = false;
        onCompleteCallback();
      } else if (eventSource.readyState === EventSource.CONNECTING) {
        console.log("Stream reconnecting...");
      } else {
        console.error("SSE connection error:", error);
        isConnected = false;
        eventSource.close();
        onErrorCallback(new Error("Connection error or server disconnected"));
      }
    };
    
    // Return eventSource for manual cleanup if needed
    return eventSource;
  }

  // Enhanced document management methods

  /**
   * Upload a document for RAG processing with enhanced error handling
   * @param {File} file - The file to upload (PDF, MD, or TXT)
   * @returns {Promise<Object>} Upload result with detailed status
   */
  static async uploadDocument(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
      console.log(`Starting upload: ${file.name} (${file.size} bytes)`);
      
      const response = await fetch(`${BASE_URL}/documents/upload`, {
        method: "POST",
        credentials: "include",
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log(`Document upload result for ${file.name}:`, result);
      
      // Validate result structure
      if (!result.status) {
        throw new Error("Invalid response from upload endpoint");
      }
      
      return {
        status: result.status,
        filename: result.filename || file.name,
        chunks_created: result.chunks_created || 0,
        error_message: result.error_message || null,
        file_size: file.size,
        upload_time: new Date().toISOString()
      };
      
    } catch (error) {
      console.error("Document upload failed:", error);
      return {
        status: "error",
        filename: file.name,
        chunks_created: 0,
        error_message: error.message,
        file_size: file.size,
        upload_time: new Date().toISOString()
      };
    }
  }

  /**
   * Get comprehensive document indexing statistics
   * @returns {Promise<Object>} Detailed stats about indexed documents and system health
   */
  static async getDocumentStats() {
    try {
      const response = await fetch(`${BASE_URL}/documents/status`, {
        method: "GET",
        headers: { "Accept": "application/json" },
        credentials: "include"
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch document stats: ${response.status}`);
      }

      const stats = await response.json();
      console.log("Document stats retrieved:", stats);
      
      // Ensure consistent structure
      return {
        total_chunks: stats.total_chunks || 0,
        total_validated: stats.total_validated || 0,
        cache_stats: stats.cache_stats || {},
        last_updated: new Date().toISOString(),
        health: stats.total_chunks > 0 ? 'healthy' : 'empty'
      };
      
    } catch (error) {
      console.error("Failed to get document stats:", error);
      // Return safe defaults instead of throwing
      return { 
        total_chunks: 0, 
        total_validated: 0, 
        cache_stats: {},
        last_updated: new Date().toISOString(),
        health: 'error',
        error: error.message
      };
    }
  }

  /**
   * Test RAG retrieval with detailed performance metrics
   * @param {string} query - Query to test
   * @param {number} topK - Number of results to return
   * @returns {Promise<Object>} Comprehensive RAG test results
   */
  static async testRAGRetrieval(query, topK = 3) {
    try {
      const startTime = performance.now();
      
      const response = await fetch(`${BASE_URL}/rag/test`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ query, top_k: topK })
      });

      if (!response.ok) {
        throw new Error(`RAG test failed: ${response.status}`);
      }

      const result = await response.json();
      const totalTime = performance.now() - startTime;
      
      console.log("RAG test completed:", {
        query: query.substring(0, 50),
        results: result.results_count || 0,
        client_time: totalTime,
        server_time: result.performance?.retrieval_time_ms || 0
      });
      
      return {
        ...result,
        client_request_time_ms: totalTime
      };
      
    } catch (error) {
      console.error("RAG test failed:", error);
      throw error;
    }
  }

  /**
   * Enhanced system health check with component status
   * @returns {Promise<Object>} Comprehensive health status
   */
  static async checkHealth() {
    try {
      const response = await fetch(`${BASE_URL}/health`, {
        method: "GET",
        headers: { "Accept": "application/json" },
        credentials: "include"
      });

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      const health = await response.json();
      console.log("System health check:", health);
      
      return {
        status: health.status || "unknown",
        rag_enabled: health.rag_enabled || false,
        document_chunks: health.document_chunks || 0,
        validated_answers: health.validated_answers || 0,
        timestamp: health.timestamp || Date.now(),
        components: {
          vector_store: health.document_chunks >= 0,
          rag_pipeline: health.rag_enabled || false,
          validation_system: health.validated_answers >= 0
        }
      };
      
    } catch (error) {
      console.error("Health check failed:", error);
      return { 
        status: "unhealthy", 
        error: error.message,
        timestamp: Date.now(),
        components: {
          vector_store: false,
          rag_pipeline: false,
          validation_system: false
        }
      };
    }
  }

  /**
   * Get analytics and performance statistics
   * @returns {Promise<Object>} System analytics data
   */
  static async getAnalytics() {
    try {
      const response = await fetch(`${BASE_URL}/analytics/stats`, {
        method: "GET",
        headers: { "Accept": "application/json" },
        credentials: "include"
      });

      if (!response.ok) {
        throw new Error(`Analytics failed: ${response.status}`);
      }

      const analytics = await response.json();
      console.log("Analytics data:", analytics);
      
      return {
        document_chunks: analytics.document_chunks || 0,
        validated_answers: analytics.validated_answers || 0,
        cache_sizes: analytics.cache_sizes || {},
        timestamp: analytics.timestamp || Date.now(),
        performance: {
          cache_hit_rate: analytics.cache_sizes?.query_cache > 0 ? 0.3 : 0, // Estimated
          avg_retrieval_time: analytics.avg_retrieval_time_ms || 0
        }
      };
      
    } catch (error) {
      console.error("Analytics request failed:", error);
      return { 
        document_chunks: 0,
        validated_answers: 0,
        cache_sizes: {},
        timestamp: Date.now(),
        error: error.message
      };
    }
  }

  /**
   * Batch upload multiple documents with progress tracking
   * @param {FileList} files - Files to upload
   * @param {Function} progressCallback - Called with upload progress
   * @returns {Promise<Array>} Array of upload results
   */
  static async batchUploadDocuments(files, progressCallback = null) {
    const fileArray = Array.from(files);
    const results = [];
    
    console.log(`Starting batch upload of ${fileArray.length} files`);
    
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      
      try {
        // Update progress
        if (progressCallback) {
          progressCallback({
            current: i + 1,
            total: fileArray.length,
            currentFile: file.name,
            status: 'uploading'
          });
        }
        
        const result = await this.uploadDocument(file);
        results.push(result);
        
        console.log(`Batch upload progress: ${i + 1}/${fileArray.length} - ${file.name}: ${result.status}`);
        
      } catch (error) {
        console.error(`Batch upload error for ${file.name}:`, error);
        results.push({
          status: "error",
          filename: file.name,
          chunks_created: 0,
          error_message: error.message
        });
      }
    }
    
    // Final progress update
    if (progressCallback) {
      const successCount = results.filter(r => r.status === 'success').length;
      const totalChunks = results.reduce((sum, r) => sum + (r.chunks_created || 0), 0);
      
      progressCallback({
        current: fileArray.length,
        total: fileArray.length,
        status: 'completed',
        summary: {
          success: successCount,
          failed: fileArray.length - successCount,
          total_chunks: totalChunks
        }
      });
    }
    
    console.log("Batch upload completed:", {
      total_files: fileArray.length,
      successful: results.filter(r => r.status === 'success').length,
      total_chunks: results.reduce((sum, r) => sum + (r.chunks_created || 0), 0)
    });
    
    return results;
  }

  /**
   * Clear system caches (development helper)
   * @returns {Promise<Object>} Operation result
   */
  static async clearCaches() {
    try {
      const response = await fetch(`${BASE_URL}/cache/clear`, {
        method: "POST",
        headers: { "Accept": "application/json" },
        credentials: "include"
      });

      if (!response.ok) {
        throw new Error(`Cache clear failed: ${response.status}`);
      }

      const result = await response.json();
      console.log("Caches cleared:", result);
      return result;
    } catch (error) {
      console.error("Cache clear failed:", error);
      throw error;
    }
  }

  /**
   * Get validation analytics for dashboard
   * @returns {Promise<Object>} Validation statistics and trends
   */
  static async getValidationAnalytics() {
    try {
      const response = await fetch(`${BASE_URL}/analytics/validation`, {
        method: "GET",
        headers: { "Accept": "application/json" },
        credentials: "include"
      });

      if (!response.ok) {
        // Not critical if analytics endpoint doesn't exist yet
        console.warn(`Validation analytics not available: ${response.status}`);
        return {
          total_interactions: 0,
          approval_rate: 0,
          avg_confidence: 0,
          recent_activity: []
        };
      }

      const analytics = await response.json();
      console.log("Validation analytics:", analytics);
      return analytics;
      
    } catch (error) {
      console.warn("Validation analytics request failed:", error);
      // Return safe defaults
      return {
        total_interactions: 0,
        approval_rate: 0,
        avg_confidence: 0,
        recent_activity: [],
        error: error.message
      };
    }
  }

  /**
   * Utility method to validate API connectivity
   * @returns {Promise<boolean>} True if API is reachable
   */
  static async validateConnectivity() {
    try {
      const response = await fetch(`${BASE_URL}/health`, {
        method: "GET",
        timeout: 5000
      });
      return response.ok;
    } catch (error) {
      console.error("API connectivity check failed:", error);
      return false;
    }
  }

  /**
   * Debug method to inspect streaming events
   * @param {string} thread_id - Thread to monitor
   * @returns {EventSource} Raw event source for debugging
   */
  static debugStreamingEvents(thread_id) {
    const eventSource = new EventSource(`${BASE_URL}/graph/stream/${thread_id}`);
    
    // Log all events for debugging
    ['token', 'sources', 'status', 'start', 'resume'].forEach(eventType => {
      eventSource.addEventListener(eventType, (event) => {
        console.log(`[DEBUG] ${eventType} event:`, event.data);
      });
    });
    
    eventSource.onerror = (error) => {
      console.log(`[DEBUG] Error event - readyState: ${eventSource.readyState}`, error);
    };
    
    return eventSource;
  }
}