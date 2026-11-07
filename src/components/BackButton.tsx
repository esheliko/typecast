"use client";
import { useRouter } from "next/navigation";

export default function BackButton() {
  const router = useRouter();
  return (
    <button className="back" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}>
      <span aria-hidden="true">&#8249;</span> Back
    </button>
  );
}
