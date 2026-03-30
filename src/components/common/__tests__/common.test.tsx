// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import ErrorBoundary from '../ErrorBoundary';
import LoadingSpinner from '../LoadingSpinner';
import ComponentCard from '../ComponentCard';

// ─── ErrorBoundary ───────────────────────────────────────────────────────────

const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) throw new Error('Test error');
  return <div>No error</div>;
};

describe('ErrorBoundary', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('catches error and shows default fallback', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Algo deu errado')).toBeInTheDocument();
    expect(screen.getByText('Tentar novamente')).toBeInTheDocument();
  });

  it('shows custom fallback when fallback prop provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
    expect(screen.queryByText('Algo deu errado')).not.toBeInTheDocument();
  });

  it('retry button re-renders children and resets error state', () => {
    // Use a ref-like object so the value is read at render time
    const flag = { current: true };
    const DynamicThrow = () => {
      if (flag.current) throw new Error('Test error');
      return <div>No error</div>;
    };

    render(
      <ErrorBoundary>
        <DynamicThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Algo deu errado')).toBeInTheDocument();

    flag.current = false;
    fireEvent.click(screen.getByText('Tentar novamente'));

    expect(screen.getByText('No error')).toBeInTheDocument();
    expect(screen.queryByText('Algo deu errado')).not.toBeInTheDocument();
  });

  it('logs error to console via componentDidCatch', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      'ErrorBoundary caught:',
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) }),
    );
  });

  it('does not show error details in production', () => {
    vi.stubEnv('NODE_ENV', 'production');

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Algo deu errado')).toBeInTheDocument();
    expect(screen.queryByText('Test error')).not.toBeInTheDocument();

    vi.unstubAllEnvs();
  });
});

// ─── LoadingSpinner ──────────────────────────────────────────────────────────

describe('LoadingSpinner', () => {
  it('renders spinner element', () => {
    const { container } = render(<LoadingSpinner />);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('shows text when text prop provided', () => {
    render(<LoadingSpinner text="Carregando..." />);
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('hides text when no text prop', () => {
    const { container } = render(<LoadingSpinner />);
    const paragraph = container.querySelector('p');
    expect(paragraph).not.toBeInTheDocument();
  });

  it('applies correct size classes', () => {
    const { container: smContainer } = render(<LoadingSpinner size="sm" />);
    const smSpinner = smContainer.querySelector('.animate-spin');
    expect(smSpinner?.className).toContain('w-4');
    expect(smSpinner?.className).toContain('h-4');

    const { container: lgContainer } = render(<LoadingSpinner size="lg" />);
    const lgSpinner = lgContainer.querySelector('.animate-spin');
    expect(lgSpinner?.className).toContain('w-12');
    expect(lgSpinner?.className).toContain('h-12');
  });
});

// ─── ComponentCard ───────────────────────────────────────────────────────────

describe('ComponentCard', () => {
  it('renders title', () => {
    render(<ComponentCard title="Card Title">Content</ComponentCard>);
    expect(screen.getByText('Card Title')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <ComponentCard title="Title">
        <span>Child element</span>
      </ComponentCard>,
    );
    expect(screen.getByText('Child element')).toBeInTheDocument();
  });

  it('renders description when desc prop provided', () => {
    render(
      <ComponentCard title="Title" desc="A description">
        Content
      </ComponentCard>,
    );
    expect(screen.getByText('A description')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <ComponentCard title="Title" className="custom-class">
        Content
      </ComponentCard>,
    );
    const card = container.firstElementChild;
    expect(card?.className).toContain('custom-class');
  });
});
