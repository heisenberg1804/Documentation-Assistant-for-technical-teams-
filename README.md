# 🤖 AI Documentation Assistant for Technical Teams

An intelligent documentation Q&A system with human-in-the-loop validation, built using FastAPI, LangGraph, and React. The system uses RAG (Retrieval Augmented Generation) to answer technical queries, while human experts validate responses to create a continuously improving knowledge base.

![AI Documentation Assistant](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Python](https://img.shields.io/badge/python-3.9+-green.svg)
![React](https://img.shields.io/badge/react-18.0+-cyan.svg)
![License](https://img.shields.io/badge/license-MIT-purple.svg)

url: https://documentation-assistant-for-technical-teams-26ed5y4vd.vercel.app/

## ✨ Key Features

### 🔄 Human-in-the-Loop Workflow
- **Interactive Validation**: Users can approve or provide feedback on AI responses
- **Continuous Learning**: Validated answers are prioritized in future queries
- **Real-time Streaming**: SSE-based streaming for instant response delivery

### 📚 Dual-Retrieval RAG System
- **Smart Prioritization**: Cache → Validated Answers → Document Chunks
- **Source Citations**: Every response includes source documents with confidence scores
- **Project Isolation**: Maintains strict boundaries between different project documentation

### 🎨 Modern UI/UX
- **Visual Knowledge Base**: Interactive cards showing document stats (56 documents, 4 validated, 7% coverage)
- **Confidence Indicators**: Color-coded quality badges for response reliability
- **Drag-and-Drop Upload**: Intuitive document upload with progress tracking
- **Validated Answer Highlighting**: Clear visual distinction for human-approved responses

## 🏗️ Architecture

![alt text](https://github.com/heisenberg1804/Documentation-Assistant-for-technical-teams-/blob/main/mermaid-diagram-2025-08-13-195156.png "workflow")


### Core Components
- **LangGraph State Machine**: `retrieve_context` → `assistant_draft` → `human_feedback` → `assistant_finalize`
- **Interrupt-based Validation**: Graph pauses for human input at feedback node
- **Thread-based Memory**: Each conversation maintains independent state with checkpointing

## 🚀 Getting Started

### Prerequisites
- Python 3.9+
- Node.js 16+
- OpenAI API key

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/ai-documentation-assistant.git
cd ai-documentation-assistant
```

2. **Backend Setup**
```bash
cd backend
pip install -r requirements.txt

# Create .env file
echo "OPENAI_API_KEY=your_key_here" > .env
echo "CHROMA_PERSIST_DIR=./chroma_db" >> .env

# Run the backend
uvicorn app.main:app --reload --port 8000
```

3. **Frontend Setup**
```bash
cd frontend
npm install
npm start  # Runs on port 3000
```

4. **Upload Documentation**
- Click "Upload Documents" button
- Drag and drop your .md, .pdf, or .txt files
- System will automatically chunk and index them

## 📖 Usage

1. **Ask a Question**: Type your technical query in the input field
2. **Review Response**: The AI provides an answer with source citations
3. **Validate or Improve**:
   - ✅ **Approve**: Validates the answer for future use
   - 💬 **Provide Feedback**: Request improvements or corrections
4. **Continuous Improvement**: Validated answers are prioritized in future similar queries

### Example Interaction
```
You: "Explain to me fast api as if i were a 5 year old"
Assistant: [Provides ELI5 explanation with toy shop analogy]
You: [Approves answer]
System: ✅ Answer validated and will be prioritized in future queries
```

## 🛠️ Tech Stack

- **Backend**: FastAPI, LangGraph, Python 3.9+
- **Frontend**: React.js 18, Server-Sent Events
- **Vector Database**: ChromaDB (local)
- **LLM**: OpenAI GPT-4o-mini
- **Embeddings**: OpenAI text-embedding-3-small
- **State Management**: LangGraph Checkpointer

## 📊 Performance Metrics

- **Response Time**: <3 seconds average
- **Cache Hit Rate**: 30-40% for common queries
- **Validation Rate**: 60%+ answers approved without changes
- **Document Processing**: 100+ documents indexed efficiently

## 🗺️ Future Roadmap

### Phase 2: Web Search Integration
- Integrate web search agent for real-time information
- Combine documentation with live web results
- Fact-checking against current online sources

### Phase 3: Multi-Project Intelligence
- **Enterprise Project Isolation**: Separate knowledge bases per project
- **Cross-Project Insights**: Identify patterns across projects
- **Team-based Permissions**: Role-based access control
- **Advanced Analytics**: Usage patterns and knowledge gaps

### Phase 4: Local LLM Support
- **Ollama Integration**: Support for local LLM deployment
- **Privacy-First**: Complete on-premise operation
- **Cost Optimization**: Eliminate API costs
- **Custom Fine-tuning**: Project-specific model training

### Additional Enhancements
- Dark mode support
- Export validated knowledge base
- Multi-language documentation support
- Advanced analytics dashboard
- Webhook integrations
- API for external systems

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [LangGraph](https://github.com/langchain-ai/langgraph) for stateful AI workflows
- Powered by [FastAPI](https://fastapi.tiangolo.com/) for high-performance backend
- UI components inspired by modern design systems
- Vector search enabled by [ChromaDB](https://www.trychroma.com/)

## 📧 Contact

For questions or feedback, please open an issue or reach out to sahil.s.mohanty@gmail.com

---

**Made with ❤️ for technical teams who value accurate, validated documentation**
