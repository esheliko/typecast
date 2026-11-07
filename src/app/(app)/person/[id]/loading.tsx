import { RowsSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="page" aria-busy="true">
      <div className="sh-top" style={{ marginTop: 14 }}>
        <div className="sh-poster sk-b" style={{ aspectRatio: "2 / 3" }} />
        <div style={{ flex: 1 }}><div className="sk-b" style={{ width: "65%", height: 34 }} /><div className="sk-b" style={{ width: "30%", height: 13, marginTop: 12 }} /></div>
      </div>
      <h2><span className="sk-b" style={{ width: 90, height: 12 }} /></h2>
      <RowsSkeleton n={6} />
    </div>
  );
}
