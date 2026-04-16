import { useState, useEffect, useRef } from 'react';
import { Mic, Square } from 'lucide-react';
import './VoiceInput.css';

/**
 * テキスト入力欄の横に配置するコンパクトなマイクボタン
 * onResult(text): 録音停止時に認識テキストを返すコールバック
 */
const VoiceInput = ({ onResult }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [liveText, setLiveText] = useState('');
  const recognitionRef = useRef(null);
  const isSupported = typeof window !== 'undefined'
    && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  // stale closure を避けるため transcript を ref でも管理
  const transcriptRef = useRef('');

  useEffect(() => {
    if (!isSupported) return undefined;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ja-JP';

    recognition.onresult = (event) => {
      let current = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        current += event.results[i][0].transcript;
      }
      transcriptRef.current = current;
      setLiveText(current);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      setIsRecording(false);
    };

    // 認識エンジンが自動停止した場合も状態をリセット
    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [isSupported]);

  // SpeechRecognition 非対応ブラウザでは何も表示しない
  if (!isSupported) return null;

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      if (transcriptRef.current.trim()) {
        onResult(transcriptRef.current.trim());
      }
      transcriptRef.current = '';
      setLiveText('');
      setIsRecording(false);
    } else {
      transcriptRef.current = '';
      setLiveText('');
      recognitionRef.current?.start();
      setIsRecording(true);
    }
  };

  return (
    <div className="voice-input-inline">
      <button
        type="button"
        className={`voice-btn-inline ${isRecording ? 'recording-active' : ''}`}
        onClick={toggleRecording}
        title={isRecording ? '録音停止（クリックで確定）' : '音声入力'}
      >
        {isRecording ? <Square size={13} /> : <Mic size={13} />}
      </button>

      {/* 録音中インジケーター */}
      {isRecording && <span className="voice-recording-dot" />}

      {/* 認識中テキストのプレビュー（折り返しなし省略） */}
      {isRecording && liveText && (
        <span className="voice-live-text">{liveText}</span>
      )}
    </div>
  );
};

export default VoiceInput;
