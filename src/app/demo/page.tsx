import { ChatWorkspace } from "@/components/chat-workspace";
import { listRooms } from "@/lib/chat-service";

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const rooms = await listRooms();
  const initialRoomSlug = rooms.some((r) => r.slug === "sandbox")
    ? "sandbox"
    : (rooms[0]?.slug ?? "sandbox");

  return (
    <ChatWorkspace initialRooms={rooms} initialRoomSlug={initialRoomSlug} />
  );
}
