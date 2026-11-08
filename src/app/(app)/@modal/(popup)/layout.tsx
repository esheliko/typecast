import { Modal } from "@/components/Modal";

/** One popup frame for every title and person opened from inside it, so switching keeps the frame and only the content changes. */
export default function PopupLayout({ children }: { children: React.ReactNode }) {
  return <Modal>{children}</Modal>;
}
