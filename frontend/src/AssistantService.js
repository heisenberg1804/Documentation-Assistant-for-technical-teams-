// AssistantService.js
// Enhanced service for assistant session/conversation API calls with RAG support

// FIXED: Use environment variable instead of hardcoded localhost
const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

export default class AssistantService {
  // Original blocking API methods (unchanged)
  static async startConversation(human_request) {
    try {
      const response = await fetch(`${BASE_URL}/graph/start`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": window.location.origin
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

  // Streaming API methods (enhanced with sources handling)
  static async createStreamingConversation(human_request) {
    try {
      const response = await fetch(`${BASE_URL}/graph/stream/create`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": window.location.origin
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
    
    // Handle token events (content streaming)
    eventSource.addEventListener('token', (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageCallback({ content: data.content });
      } catch (error) {
        console.error("Error parsing token event:", error, "Raw data:", event.data);
        onErrorCallback(error);
      }
    });

    // NEW: Handle sources events (RAG context sources)
    eventSource.addEventListener('sources', (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageCallback({ 
          sources: data.sources, 
          confidence: data.confidence,
          retrieval_time_ms: data.retrieval_time_ms,
          source_types: data.source_types
        });
        console.log(`Received sources event: ${data.sources?.length || 0} sources`);
      } catch (error) {
        console.error("Error parsing sources event:", error, "Raw data:", event.data);
        onErrorCallback(error);
      }
    });
    
    // Handle status events (user_feedback, finished)
    eventSource.addEventListener('status', (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageCallback({ status: data.status, metrics: data.metrics });
        
        // Mark that we've received a status event for this connection
        if (!window._hasReceivedStatusEvent) {
          window._hasReceivedStatusEvent = {};
        }
        window._hasReceivedStatusEvent[eventSource.url] = true;
        console.log("Received status event, marking connection for normal closure");
      } catch (error) {
        console.error("Error parsing status event:", error, "Raw data:", event.data);
        onErrorCallback(error);
      }
    });
    
    // Handle start/resume events
    eventSource.addEventListener('start', (event) => {
      console.log("Stream started:", event.data);
    });
    
    eventSource.addEventListener('resume', (event) => {
      console.log("Stream resumed:", event.data);
    });
    
    // Handle errors
    eventSource.onerror = (error) => {
      console.log("SSE connection state change - readyState:", eventSource.readyState);
      
      // Check if we've received a status event indicating completion
      const hasReceivedStatusEvent = window._hasReceivedStatusEvent && window._hasReceivedStatusEvent[eventSource.url];
      
      if (hasReceivedStatusEvent) {
        console.log("Stream completed normally after receiving status event");
        eventSource.close();
        onCompleteCallback();
        return;
      }
      
      // Only call the error callback if it's a real error, not a normal close
      if (eventSource.readyState !== EventSource.CLOSED && eventSource.readyState !== EventSource.CONNECTING) {
        console.error("SSE connection error:", error);
        eventSource.close();
        onErrorCallback(new Error("Connection error or server disconnected"));
      } else {
        console.log("Stream completed normally");
        onCompleteCallback();
      }
    };
    
    return eventSource;
  }

  // NEW: Document Management Methods

  /**
   * Upload a document for RAG processing
   * @param {File} file - The file to upload (PDF, MD, or TXT)
   * @returns {Promise<Object>} Upload result with status and chunk count
   */
  static async uploadDocument(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
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
      console.log(`Document upload result:`, result);
      return result;
    } catch (error) {
      console.error("Document upload failed:", error);
      throw error;
    }
  }

  /**
   * Get document indexing statistics
   * @returns {Promise<Object>} Stats about indexed documents and validated answers
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
      console.log("Document stats:", stats);
      return stats;
    } catch (error) {
      console.error("Failed to get document stats:", error);
      // Return default stats instead of throwing
      return { total_chunks: 0, total_validated: 0, cache_stats: {} };
    }
  }

  /**
   * Test RAG retrieval (for debugging)
   * @param {string} query - Query to test
   * @param {number} topK - Number of results to return
   * @returns {Promise<Object>} RAG test results
   */
  static async testRAGRetrieval(query, topK = 3) {
    try {
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
      console.log("RAG test result:", result);
      return result;
    } catch (error) {
      console.error("RAG test failed:", error);
      throw error;
    }
  }

  /**
   * Check system health
   * @returns {Promise<Object>} Health status including RAG system status
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
      console.log("System health:", health);
      return health;
    } catch (error) {
      console.error("Health check failed:", error);
      return { status: "unknown", error: error.message };
    }
  }

  /**
   * Get simple analytics (basic version)
   * @returns {Promise<Object>} Basic analytics data
   */
  static async getSimpleAnalytics() {
    try {
      const response = await fetch(`${BASE_URL}/analytics/simple`, {
        method: "GET",
        headers: { "Accept": "application/json" },
        credentials: "include"
      });

      if (!response.ok) {
        throw new Error(`Analytics failed: ${response.status}`);
      }

      const analytics = await response.json();
      console.log("Simple analytics:", analytics);
      return analytics;
    } catch (error) {
      console.error("Analytics request failed:", error);
      return { total_events: 0, error: error.message };
    }
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
}