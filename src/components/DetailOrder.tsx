"use client";
import { useState, useTransition } from "react";
import { saveDetails } from "@/app/actions";
import { DEFAULT_ORDER, DETAIL_IDS, detailLabel, type DetailId } from "@/lib/details";
import type { MediaType } from "@/lib/types";

/**
 * "Customize" panel for the title page: tick the details you care about and move them up or down.
 * Hidden ones stay listed underneath so they are one tap away. Saves to your profile, so it applies to every title.
 */
export default function DetailOrder({ initial, type = "movie", always }: { initial: DetailId[]; type?: MediaType; always?: boolean }) {
  const [order, setOrder] = useState<DetailId[]>(initial);
  const [open, setOpen] = useState(!!always);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const hidden = DETAIL_IDS.filter((id) => !order.includes(id));

  function commit(next: DetailId[]) {
    const prev = order; setOrder(next); setError("");
    start(async () => { try { await saveDetails(next); } catch (e) { setOrder(prev); setError((e as Error).message || "Could not save."); } });
  }
  function move(i: number, d: -1 | 1) {
    const next = [...order]; const j = i + d; if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]]; commit(next);
  }

  return (
    <div className={always ? undefined : "dorder"}>
      {!always && <button type="button" className="chip sm" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Done" : "Customize"}</button>}
      {open && (
        <div className="card pad dorder-panel">
          <p className="muted small" style={{ margin: "0 0 8px" }}>Tick what to show on every title and set the order.</p>
          <ol className="dorder-list">
            {order.map((id, i) => (
              <li key={id}>
                <label><input type="checkbox" checked onChange={() => commit(order.filter((x) => x !== id))} /> {detailLabel(id, type)}</label>
                <span className="dorder-move">
                  <button type="button" className="chip sm" aria-label={`Move ${detailLabel(id, type)} up`} disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                  <button type="button" className="chip sm" aria-label={`Move ${detailLabel(id, type)} down`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>▼</button>
                </span>
              </li>
            ))}
          </ol>
          {hidden.length > 0 && (
            <>
              <p className="muted small" style={{ margin: "10px 0 4px" }}>Hidden</p>
              <ul className="dorder-list">
                {hidden.map((id) => (
                  <li key={id}><label><input type="checkbox" checked={false} onChange={() => commit([...order, id])} /> {detailLabel(id, type)}</label></li>
                ))}
              </ul>
            </>
          )}
          <div className="inline" style={{ marginTop: 10 }}>
            <button type="button" className="btn sm" onClick={() => commit([...DEFAULT_ORDER])}>Reset</button>
            {pending && <span className="muted small"><span className="spin" />Saving</span>}
            {error && <span className="small" style={{ color: "var(--bad, #c0392b)" }} role="alert">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
