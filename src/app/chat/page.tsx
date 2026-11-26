import { ChatWorkspace } from "@/components/chat-workspace";
import { listRooms } from "@/lib/chat-service";

export const dynamic = "force-dynamic";

interface ChatPageProps {
  searchParams: Promise<{
    room?: string;
    guest?: string;
  }>;
}

export default async function ChatPage({ searchParams }: ChatPageProps) {
  const resolved = await searchParams;
  const rooms = await listRooms();
  const requestedRoom = resolved.room?.trim() || "sandbox";
  const initialRoomSlug = rooms.some((r) => r.slug === requestedRoom)
    ? requestedRoom
    : (rooms[0]?.slug ?? "sandbox");

  return (
    <ChatWorkspace
      initialRooms={rooms}
      initialRoomSlug={initialRoomSlug}
      initialGuest={resolved.guest}
    />
  );
}
