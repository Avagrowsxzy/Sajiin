interface ErrorStateProps {
  message: string;
  retry?: () => void;
}

export function ErrorState({ message, retry }: ErrorStateProps) {
  return (
    <div className="error-state">
      <h3>Terjadi Kesalahan</h3>
      <p>{message}</p>
      {retry && (
        <button className="btn btn-secondary" onClick={retry} style={{ marginTop: '16px' }}>
          Coba Lagi
        </button>
      )}
    </div>
  );
}
