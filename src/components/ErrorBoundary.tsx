import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Ocurrió un error inesperado.'
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Cleasy Survey ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#081529] text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#0F2342] border border-[#1E3A5F] rounded-xl p-6 space-y-4">
            <h1 className="text-lg font-semibold text-orange-400">
              Se detectó un problema de conexión o permisos
            </h1>
            <p className="text-xs text-slate-300 leading-relaxed break-words">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, errorMessage: '' })}
              className="px-4 py-2 text-xs font-semibold text-[#081529] bg-orange-500 rounded-lg hover:bg-orange-400 cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
