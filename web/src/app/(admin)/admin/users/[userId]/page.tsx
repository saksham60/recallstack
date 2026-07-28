import { UserDetailScreen } from "@/features/admin";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <UserDetailScreen userId={userId} />;
}
