import hashlib
import re
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict
from datetime import datetime
import markdown
import PyPDF2
import tiktoken
from app.config import config

@dataclass
class DocumentChunk:
    """Structured document chunk with metadata"""
    id: str
    content: str
    metadata: Dict
    
    def to_dict(self):
        return asdict(self)

class DocumentProcessor:
    """Smart document processor with code-aware chunking"""
    
    def __init__(self):
        self.encoding = tiktoken.encoding_for_model("gpt-4")
        self.chunk_size = config.chunk_size
        self.chunk_overlap = config.chunk_overlap
        self.max_chunks = config.max_chunks_per_doc
    
    def process_markdown(self, content: str, filename: str) -> List[DocumentChunk]:
        """Process markdown content with smart chunking"""
        
        # Parse markdown to HTML for structure
        md = markdown.Markdown(extensions=['fenced_code', 'tables', 'toc'])
        html = md.convert(content)
        
        # Extract sections based on headers
        sections = self._extract_markdown_sections(content)
        
        all_chunks = []
        for section in sections:
            chunks = self._chunk_section(section, filename, "markdown")
            all_chunks.extend(chunks)
        
        return all_chunks[:self.max_chunks]
    
    def process_pdf(self, content: bytes, filename: str) -> List[DocumentChunk]:
        """Process PDF content"""
        
        try:
            from io import BytesIO
            pdf_file = BytesIO(content)
            pdf_reader = PyPDF2.PdfReader(pdf_file)
            
            full_text = ""
            for page_num, page in enumerate(pdf_reader.pages):
                page_text = page.extract_text()
                full_text += f"\n\n--- Page {page_num + 1} ---\n\n{page_text}"
            
            # Create single section for PDF
            section = {
                "title": filename,
                "content": full_text,
                "level": 1
            }
            
            chunks = self._chunk_section(section, filename, "pdf")
            return chunks[:self.max_chunks]
            
        except Exception as e:
            print(f"Error processing PDF {filename}: {e}")
            return []
    
    def process_text(self, content: str, filename: str) -> List[DocumentChunk]:
        """Process plain text content"""
        
        section = {
            "title": filename,
            "content": content,
            "level": 1
        }
        
        chunks = self._chunk_section(section, filename, "text")
        return chunks[:self.max_chunks]
    
    def _extract_markdown_sections(self, content: str) -> List[Dict]:
        """Extract sections from markdown based on headers"""
        
        lines = content.split('\n')
        sections = []
        current_section = None
        
        for line in lines:
            # Check for markdown headers
            header_match = re.match(r'^(#{1,6})\s+(.*)', line)
            
            if header_match:
                # Save previous section
                if current_section:
                    sections.append(current_section)
                
                # Start new section
                level = len(header_match.group(1))
                title = header_match.group(2)
                
                current_section = {
                    "title": title,
                    "content": line + '\n',
                    "level": level
                }
            else:
                if current_section:
                    current_section["content"] += line + '\n'
                else:
                    # Content before first header
                    if not sections:
                        sections.append({
                            "title": "Introduction",
                            "content": line + '\n',
                            "level": 1
                        })
                    else:
                        sections[-1]["content"] += line + '\n'
        
        # Add last section
        if current_section:
            sections.append(current_section)
        
        return sections if sections else [{"title": "Document", "content": content, "level": 1}]
    
    def _chunk_section(self, section: Dict, filename: str, doc_type: str) -> List[DocumentChunk]:
        """Chunk a section with smart code block preservation"""
        
        content = section["content"]
        title = section["title"]
        
        # First, try to identify and preserve code blocks
        code_blocks = self._extract_code_blocks(content)
        
        # If we have code blocks, handle them specially
        if code_blocks:
            return self._chunk_with_code_blocks(section, filename, doc_type, code_blocks)
        else:
            return self._chunk_plain_text(section, filename, doc_type)
    
    def _extract_code_blocks(self, content: str) -> List[Dict]:
        """Extract code blocks from content"""
        
        code_blocks = []
        
        # Find fenced code blocks (```...```)
        fenced_pattern = r'```(\w+)?\n(.*?)\n```'
        for match in re.finditer(fenced_pattern, content, re.DOTALL):
            language = match.group(1) or "text"
            code = match.group(2)
            code_blocks.append({
                "type": "fenced",
                "language": language,
                "code": code,
                "start": match.start(),
                "end": match.end(),
                "full_match": match.group(0)
            })
        
        # Find indented code blocks (4+ spaces)
        lines = content.split('\n')
        in_code_block = False
        code_lines = []
        code_start_idx = None
        
        for i, line in enumerate(lines):
            if len(line) >= 4 and line[:4] == '    ':
                if not in_code_block:
                    in_code_block = True
                    code_start_idx = i
                code_lines.append(line[4:])  # Remove indentation
            else:
                if in_code_block and code_lines:
                    # End of code block
                    code_content = '\n'.join(code_lines)
                    code_blocks.append({
                        "type": "indented",
                        "language": "text",
                        "code": code_content,
                        "line_start": code_start_idx,
                        "line_end": i - 1
                    })
                    in_code_block = False
                    code_lines = []
        
        return code_blocks
    
    def _chunk_with_code_blocks(self, section: Dict, filename: str, doc_type: str, code_blocks: List[Dict]) -> List[DocumentChunk]:
        """Chunk content while preserving code blocks intact"""
        
        content = section["content"]
        chunks = []
        
        # Split content around code blocks
        parts = []
        last_end = 0
        
        for code_block in sorted(code_blocks, key=lambda x: x.get('start', 0)):
            if 'start' in code_block and 'end' in code_block:
                # Add text before code block
                if code_block['start'] > last_end:
                    parts.append({
                        "type": "text",
                        "content": content[last_end:code_block['start']],
                        "token_count": self._count_tokens(content[last_end:code_block['start']])
                    })
                
                # Add code block as single part
                parts.append({
                    "type": "code",
                    "content": code_block['full_match'],
                    "language": code_block['language'],
                    "token_count": self._count_tokens(code_block['full_match'])
                })
                
                last_end = code_block['end']
        
        # Add remaining text
        if last_end < len(content):
            parts.append({
                "type": "text",
                "content": content[last_end:],
                "token_count": self._count_tokens(content[last_end:])
            })
        
        # Now chunk the parts intelligently
        current_chunk = ""
        current_tokens = 0
        chunk_index = 0
        
        for part in parts:
            part_tokens = part['token_count']
            
            # If adding this part would exceed chunk size
            if current_tokens + part_tokens > self.chunk_size and current_chunk:
                # Create chunk from current content
                chunk = self._create_chunk(
                    current_chunk.strip(),
                    section,
                    filename,
                    doc_type,
                    chunk_index
                )
                chunks.append(chunk)
                
                chunk_index += 1
                current_chunk = ""
                current_tokens = 0
            
            # Add part to current chunk
            current_chunk += part['content']
            current_tokens += part_tokens
        
        # Add final chunk if there's content
        if current_chunk.strip():
            chunk = self._create_chunk(
                current_chunk.strip(),
                section,
                filename,
                doc_type,
                chunk_index
            )
            chunks.append(chunk)
        
        return chunks
    
    def _chunk_plain_text(self, section: Dict, filename: str, doc_type: str) -> List[DocumentChunk]:
        """Chunk plain text with overlap"""
        
        content = section["content"]
        chunks = []
        
        # Simple token-based chunking with overlap
        tokens = self.encoding.encode(content)
        chunk_index = 0
        
        for i in range(0, len(tokens), self.chunk_size - self.chunk_overlap):
            chunk_tokens = tokens[i:i + self.chunk_size]
            chunk_text = self.encoding.decode(chunk_tokens)
            
            chunk = self._create_chunk(
                chunk_text,
                section,
                filename,
                doc_type,
                chunk_index
            )
            chunks.append(chunk)
            chunk_index += 1
        
        return chunks
    
    def _create_chunk(self, content: str, section: Dict, filename: str, doc_type: str, chunk_index: int) -> DocumentChunk:
        """Create a DocumentChunk with rich metadata"""
        
        # Generate unique ID
        chunk_id = self._generate_chunk_id(content, filename, chunk_index)
        
        # Analyze chunk content
        has_code = bool(re.search(r'```|    \w+', content))
        chunk_type = self._classify_chunk_type(content)
        
        metadata = {
            "content": content,
            "source_file": filename,
            "doc_type": doc_type,
            "section": section["title"],
            "chunk_index": chunk_index,
            "chunk_type": chunk_type,
            "has_code": has_code,
            "timestamp": datetime.now().isoformat(),
            "char_count": len(content),
            "token_count": self._count_tokens(content),
            "section_level": section.get("level", 1)
        }
        
        return DocumentChunk(
            id=chunk_id,
            content=content,
            metadata=metadata
        )
    
    def _classify_chunk_type(self, content: str) -> str:
        """Classify chunk as code, text, or mixed"""
        
        lines = content.split('\n')
        code_lines = 0
        text_lines = 0
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            # Check if line looks like code
            if (line.startswith('def ') or 
                line.startswith('class ') or
                line.startswith('import ') or
                line.startswith('from ') or
                '=' in line and any(op in line for op in ['==', '!=', '<=', '>=']) or
                line.startswith('//') or
                line.startswith('#') and not line.startswith('# ')):
                code_lines += 1
            else:
                text_lines += 1
        
        if code_lines > text_lines * 2:
            return "code"
        elif text_lines > code_lines * 2:
            return "text"
        else:
            return "mixed"
    
    def _count_tokens(self, text: str) -> int:
        """Count tokens in text"""
        try:
            return len(self.encoding.encode(text))
        except:
            return len(text) // 4  # Rough estimate
    
    def _generate_chunk_id(self, content: str, filename: str, chunk_index: int) -> str:
        """Generate unique chunk ID"""
        content_hash = hashlib.md5(f"{filename}_{chunk_index}_{content[:100]}".encode()).hexdigest()
        return f"chunk_{content_hash[:12]}"