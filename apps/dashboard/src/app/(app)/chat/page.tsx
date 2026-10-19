import { Chat } from "@/components/chat/chat";
import { pageMetadata } from "@/i18n/metadata";

export const generateMetadata = () => pageMetadata("chat");

export default function Page() {
  // Fills the frame: the thread scrolls inside <main> and the composer docks
  // to its bottom, so no PageShell gutters or title.
  return (
    <div className="h-full">
      <Chat />
    </div>
  );
}
