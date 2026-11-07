export default function Loading() {
  return (
    <div className="page" aria-busy="true">
      <h2><span className="sk-b" style={{ width: 110, height: 12 }} /></h2>
      <div className="sk-b" style={{ height: 150, borderRadius: 14 }} />
      <h2><span className="sk-b" style={{ width: 90, height: 12 }} /></h2>
      <div className="sk-b" style={{ height: 120, borderRadius: 14 }} />
    </div>
  );
}
