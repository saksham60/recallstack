import { notFound } from "next/navigation";
import { LiveSystemDesignCanvasScreen } from "@/features/system-design";

const ROOM_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,128}$/u;

export default async function LiveSystemDesignPage({
  params,
}: {
  params: Promise<{ roomToken: string }>;
}) {
  const { roomToken } = await params;
  if (!ROOM_TOKEN_PATTERN.test(roomToken)) notFound();
  return <LiveSystemDesignCanvasScreen roomToken={roomToken} />;
}
