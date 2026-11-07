import { Modal } from "@/components/Modal";

/** One popup frame for every title opened from inside it, so switching titles keeps the frame and only the content changes. */
export default function TitleModalLayout({ children }: { children: React.ReactNode }) {
  return <Modal>{children}</Modal>;
}
