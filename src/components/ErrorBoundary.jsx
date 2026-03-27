import { Component } from 'react';

// 描画エラーをキャッチして白画面を防ぐ
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', gap: '16px', padding: '24px'
        }}>
          <h2 style={{ color: '#ef4444' }}>表示エラーが発生しました</h2>
          <pre style={{
            background: '#fef2f2', padding: '16px', borderRadius: '8px',
            fontSize: '0.85rem', maxWidth: '600px', whiteSpace: 'pre-wrap', color: '#991b1b'
          }}>
            {this.state.error?.message}
          </pre>
          <button
            style={{ padding: '10px 24px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            再試行
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
