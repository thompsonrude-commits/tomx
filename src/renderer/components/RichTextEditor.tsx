import React, { useRef, useEffect, useState } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, Type, Code, Trash2 } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ 
  value, 
  onChange, 
  placeholder,
  className = "" 
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isRaw, setIsRaw] = useState(false);
  const [rawText, setRawText] = useState(value);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, []);

  const [activeStates, setActiveStates] = useState<Record<string, boolean>>({});

  const updateActiveStates = () => {
    setActiveStates({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      unorderedList: document.queryCommandState('insertUnorderedList'),
      orderedList: document.queryCommandState('insertOrderedList'),
    });
  };

  const execCommand = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    updateActiveStates();
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleInput = () => {
    updateActiveStates();
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
      setRawText(editorRef.current.innerHTML);
    }
  };

  const toggleRaw = () => {
    if (isRaw) {
      // Switching from Raw to Visual
      if (editorRef.current) {
        editorRef.current.innerHTML = rawText;
      }
    } else {
      // Switching from Visual to Raw
      if (editorRef.current) {
        setRawText(editorRef.current.innerHTML);
      }
    }
    setIsRaw(!isRaw);
  };

  const ToolbarButton = ({ onClick, children, title, active = false }: any) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-all hover:bg-cyber-accent/20 ${active ? 'text-cyber-accent bg-cyber-accent/10' : 'text-gray-400'}`}
    >
      {children}
    </button>
  );

  return (
    <div className={`flex flex-col border border-gray-700 rounded-lg overflow-hidden bg-cyber-bg ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b border-gray-800 bg-black/30">
        <ToolbarButton onClick={() => execCommand('bold')} active={activeStates.bold} title="Bold"><Bold size={16} /></ToolbarButton>
        <ToolbarButton onClick={() => execCommand('italic')} active={activeStates.italic} title="Italic"><Italic size={16} /></ToolbarButton>
        <ToolbarButton onClick={() => execCommand('underline')} active={activeStates.underline} title="Underline"><Underline size={16} /></ToolbarButton>
        <div className="w-px h-4 bg-gray-800 mx-1" />
        <ToolbarButton onClick={() => execCommand('insertUnorderedList')} active={activeStates.unorderedList} title="Bullet List"><List size={16} /></ToolbarButton>
        <ToolbarButton onClick={() => execCommand('insertOrderedList')} active={activeStates.orderedList} title="Numbered List"><ListOrdered size={16} /></ToolbarButton>
        <div className="w-px h-4 bg-gray-800 mx-1" />
        <ToolbarButton onClick={() => execCommand('removeFormat')} title="Clear Formatting"><Type size={16} /></ToolbarButton>
        <div className="flex-1" />
        <button
          type="button"
          onClick={toggleRaw}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase transition-all ${
            isRaw ? 'bg-cyber-accent text-black' : 'bg-gray-800 text-gray-500 hover:text-cyber-accent'
          }`}
        >
          {isRaw ? <Type size={12} /> : <Code size={12} />}
          {isRaw ? 'Visual Editor' : 'Source Code'}
        </button>
      </div>

      {/* Editor Area */}
      <div className="relative min-h-[200px]">
        {!isRaw ? (
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            onBlur={handleInput}
            onMouseUp={updateActiveStates}
            className="w-full h-full min-h-[300px] p-4 text-sm text-cyber-text focus:outline-none custom-scrollbar overflow-y-auto"
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          />
        ) : (
          <textarea
            value={rawText}
            onChange={(e) => {
              setRawText(e.target.value);
              onChange(e.target.value);
            }}
            placeholder="Paste your HTML here..."
            className="w-full h-full min-h-[200px] p-4 bg-black/40 text-sm font-mono text-cyber-accent/80 focus:outline-none resize-none custom-scrollbar"
          />
        )}
        
        {!value && !isRaw && (
          <div className="absolute top-4 left-4 text-gray-600 pointer-events-none text-sm italic">
            {placeholder || 'Compose your professional email...'}
          </div>
        )}
      </div>
      
      {/* Footer Info */}
      <div className="px-3 py-1.5 border-t border-gray-800 bg-black/10 flex justify-between items-center text-[10px] text-gray-500">
        <span>Rich HTML Support Enabled</span>
        <div className="flex gap-3">
            <span>{value.length} characters</span>
            {value.includes('style=') && <span className="text-yellow-500/70">Custom CSS Detected</span>}
        </div>
      </div>
    </div>
  );
};
