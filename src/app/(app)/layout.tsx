import Tabs from "@/components/Tabs";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="top"><div className="top-in">
        <div className="logo"><span className="mark" aria-hidden="true" />Typecast</div>
        <Tabs where="top" />
      </div></header>
      <main className="wrap">{children}</main>
      <Tabs where="bottom" />
    </>
  );
}
