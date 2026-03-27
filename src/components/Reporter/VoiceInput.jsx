import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square } from 'lucide-react';
import './VoiceInput.css';

const VoiceInput = ({ onSelectText }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef(null);

  useEffect(() => {
    // Setup SpeechRecognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'ja-JP';

      recognition.onresult = (event) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      if (transcript) {
        onSelectText(transcript);
        setTranscript('');
      }
      setIsRecording(false);
    } else {
      setTranscript('');
      recognitionRef.current?.start();
      setIsRecording(true);
    }
  };

  if (!recognitionRef.current) {
    return <div className="voice-input-error">音声入力はサポートされていません</div>;
  }

  return (
    <div className={`voice-input-container ${isRecording ? 'recording' : ''}`}>
      <button 
        type="button" 
        className={`voice-btn ${isRecording ? 'recording-active' : ''}`}
        onClick={toggleRecording}
      >
        {isRecording ? <Square size={18} /> : <Mic size={18} />}
      </button>

      {isRecording && (
        <div className="voice-visualizer">
          <div className="bar"></div>
          <div className="bar"></div>
          <div className="bar"></div>
          <div className="bar"></div>
        </div>
      )}

      {isRecording && transcript && (
        <div className="voice-transcript-preview">{transcript}</div>
      )}
    </div>
  );
};

export default VoiceInput;
