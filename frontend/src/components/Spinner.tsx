interface SpinnerProps {
  size?: 'sm' | 'lg';
  center?: boolean;
}

export function Spinner({ size, center = false }: SpinnerProps) {
  const sizeClass = size === 'lg' ? 'spinner-lg' : '';
  
  if (center) {
    return (
      <div className="loading-center">
        <div className={`spinner ${sizeClass}`} />
      </div>
    );
  }

  return <div className={`spinner ${sizeClass}`} />;
}
