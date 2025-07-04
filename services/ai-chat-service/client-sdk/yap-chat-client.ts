/**
 * YAP AI Chat Client SDK
 * Easy integration for real-time voice conversations
 */

import { io, Socket } from 'socket.io-client';

export interface ChatSession {
  sessionId: string;
  userId: string;
  language: string;
  cefrLevel: string;
  conversationMode: 'guided' | 'free' | 'scenario';
}

export interface VoiceMessage {
  text: string;
  audio?: string; // base64 encoded
  audioFormat?: string;
  duration?: number;
  confidence?: number;
  transcriptionTime?: number;
}

export interface ChatResponse {
  text: string;
  audio?: string; // base64 encoded
  audioFormat?: string;
  duration?: number;
  context: {
    currentTopic: string;
    messagesExchanged: number;
    difficulty: number;
  };
  suggestedResponses?: string[];
  vocabularyHighlights?: Array<{
    word: string;
    translation: string;
    context: string;
  }>;
  pronunciationResult?: {
    overallScore: number;
    feedback: string[];
  };
}

export interface StreamingEvents {
  onSessionStarted: (session: ChatSession) => void;
  onPartialTranscription: (text: string, confidence: number) => void;
  onFinalTranscription: (result: VoiceMessage) => void;
  onVoiceResponse: (response: ChatResponse) => void;
  onTextResponse: (response: ChatResponse) => void;
  onError: (error: Error) => void;
  onDisconnected: () => void;
}

export class YAPChatClient {
  private socket?: Socket;
  private baseUrl: string;
  private currentSession?: ChatSession;
  private mediaRecorder?: MediaRecorder;
  private audioChunks: Blob[] = [];
  private isRecording = false;

  constructor(baseUrl: string, options?: {
    autoConnect?: boolean;
    debug?: boolean;
  }) {
    this.baseUrl = baseUrl;
    
    if (options?.autoConnect !== false) {
      this.connect();
    }
  }

  /**
   * Connect to the streaming service
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(this.baseUrl, {
        transports: ['websocket'],
        upgrade: true,
        rememberUpgrade: true
      });

      this.socket.on('connect', () => {
        console.log('Connected to YAP Chat Service');
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('Connection failed:', error);
        reject(error);
      });

      this.setupEventHandlers();
    });
  }

  /**
   * Start a new chat session
   */
  async startSession(params: {
    userId: string;
    language: 'spanish' | 'french' | 'english';
    cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
    conversationMode: 'guided' | 'free' | 'scenario';
    scenario?: string;
  }, events: Partial<StreamingEvents> = {}): Promise<ChatSession> {
    if (!this.socket?.connected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      this.socket!.emit('start_streaming_session', params);

      this.socket!.once('session_started', (data) => {
        this.currentSession = {
          sessionId: data.data.sessionId,
          userId: params.userId,
          language: params.language,
          cefrLevel: params.cefrLevel,
          conversationMode: params.conversationMode
        };
        
        events.onSessionStarted?.(this.currentSession);
        resolve(this.currentSession);
      });

      this.socket!.once('error', (error) => {
        reject(new Error(error.data?.message || 'Failed to start session'));
      });

      // Setup session-specific event handlers
      this.setupSessionEvents(events);

      // Timeout after 10 seconds
      setTimeout(() => {
        reject(new Error('Session start timeout'));
      }, 10000);
    });
  }

  /**
   * Start recording audio
   */
  async startRecording(): Promise<void> {
    if (this.isRecording) {
      throw new Error('Already recording');
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.audioChunks = [];
      this.isRecording = true;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          
          // Send real-time audio chunks for streaming transcription
          event.data.arrayBuffer().then(buffer => {
            this.socket?.emit('audio_chunk', buffer);
          });
        }
      };

      this.mediaRecorder.onstop = () => {
        this.socket?.emit('audio_end');
        this.isRecording = false;
        
        // Cleanup stream
        stream.getTracks().forEach(track => track.stop());
      };

      // Start recording with 100ms chunks for real-time processing
      this.mediaRecorder.start(100);
    } catch (error) {
      throw new Error(`Failed to start recording: ${error}`);
    }
  }

  /**
   * Stop recording audio
   */
  stopRecording(): Promise<VoiceMessage> {
    return new Promise((resolve, reject) => {
      if (!this.isRecording || !this.mediaRecorder) {
        reject(new Error('Not currently recording'));
        return;
      }

      // Listen for final transcription
      this.socket!.once('final_transcription', (data) => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        resolve({
          text: data.data.text,
          confidence: data.data.confidence,
          transcriptionTime: data.data.processingTime
        });
      });

      this.mediaRecorder.stop();
      
      // Timeout after 5 seconds
      setTimeout(() => {
        reject(new Error('Transcription timeout'));
      }, 5000);
    });
  }

  /**
   * Send a text message
   */
  sendTextMessage(message: string): Promise<ChatResponse> {
    return new Promise((resolve, reject) => {
      if (!this.currentSession) {
        reject(new Error('No active session'));
        return;
      }

      this.socket!.emit('text_message', {
        message,
        sessionId: this.currentSession.sessionId
      });

      this.socket!.once('text_response', (data) => {
        resolve(data.data);
      });

      this.socket!.once('error', (error) => {
        reject(new Error(error.data?.message || 'Failed to send message'));
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        reject(new Error('Message timeout'));
      }, 30000);
    });
  }

  /**
   * Upload audio file for processing
   */
  async uploadAudio(audioFile: File, language: string): Promise<VoiceMessage> {
    const formData = new FormData();
    formData.append('audio', audioFile);
    formData.append('language', language);
    formData.append('sessionId', this.currentSession?.sessionId || '');

    const response = await fetch(`${this.baseUrl}/api/streaming/upload-audio`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    return {
      text: result.transcription.text,
      confidence: result.transcription.confidence,
      transcriptionTime: result.transcription.processingTime
    };
  }

  /**
   * Get available voices for a language
   */
  async getAvailableVoices(language: string): Promise<Array<{
    name: string;
    displayName: string;
    gender: string;
    locale: string;
  }>> {
    const response = await fetch(`${this.baseUrl}/api/streaming/voices/${language}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get voices: ${response.statusText}`);
    }

    const result = await response.json();
    return result.voices;
  }

  /**
   * Disconnect from the service
   */
  disconnect(): void {
    if (this.isRecording) {
      this.stopRecording().catch(console.error);
    }

    this.socket?.disconnect();
    this.currentSession = undefined;
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Get current session info
   */
  getCurrentSession(): ChatSession | undefined {
    return this.currentSession;
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('disconnect', () => {
      console.log('Disconnected from YAP Chat Service');
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }

  private setupSessionEvents(events: Partial<StreamingEvents>): void {
    if (!this.socket) return;

    this.socket.on('partial_transcription', (data) => {
      events.onPartialTranscription?.(data.data.text, data.data.confidence);
    });

    this.socket.on('final_transcription', (data) => {
      events.onFinalTranscription?.(data.data);
    });

    this.socket.on('voice_response', (data) => {
      events.onVoiceResponse?.(data.data);
    });

    this.socket.on('text_response', (data) => {
      events.onTextResponse?.(data.data);
    });

    this.socket.on('error', (data) => {
      events.onError?.(new Error(data.data?.message || 'Unknown error'));
    });

    this.socket.on('disconnect', () => {
      events.onDisconnected?.();
    });
  }
}

// React Hook for easy integration
export function useYAPChat(baseUrl: string) {
  const [client, setClient] = React.useState<YAPChatClient | null>(null);
  const [isConnected, setIsConnected] = React.useState(false);
  const [currentSession, setCurrentSession] = React.useState<ChatSession | null>(null);
  const [isRecording, setIsRecording] = React.useState(false);

  React.useEffect(() => {
    const chatClient = new YAPChatClient(baseUrl);
    setClient(chatClient);

    chatClient.connect().then(() => {
      setIsConnected(true);
    }).catch(console.error);

    return () => {
      chatClient.disconnect();
    };
  }, [baseUrl]);

  const startSession = async (params: Parameters<YAPChatClient['startSession']>[0]) => {
    if (!client) throw new Error('Client not initialized');
    
    const session = await client.startSession(params, {
      onSessionStarted: setCurrentSession,
      onDisconnected: () => {
        setIsConnected(false);
        setCurrentSession(null);
      }
    });
    
    return session;
  };

  const startRecording = async () => {
    if (!client) throw new Error('Client not initialized');
    setIsRecording(true);
    
    try {
      await client.startRecording();
    } catch (error) {
      setIsRecording(false);
      throw error;
    }
  };

  const stopRecording = async () => {
    if (!client) throw new Error('Client not initialized');
    
    try {
      const result = await client.stopRecording();
      setIsRecording(false);
      return result;
    } catch (error) {
      setIsRecording(false);
      throw error;
    }
  };

  return {
    client,
    isConnected,
    currentSession,
    isRecording,
    startSession,
    startRecording,
    stopRecording,
    sendTextMessage: client?.sendTextMessage.bind(client),
    uploadAudio: client?.uploadAudio.bind(client),
    getAvailableVoices: client?.getAvailableVoices.bind(client),
    disconnect: client?.disconnect.bind(client)
  };
}

export default YAPChatClient;
