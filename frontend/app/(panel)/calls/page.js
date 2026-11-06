import CallsScreen from "./CallsScreen";

function searchValue(value) {
  if (Array.isArray(value)) return value[0] || "";
  return typeof value === "string" ? value : "";
}

export default async function CallsPage({ searchParams }) {
  const query = await searchParams;
  return <CallsScreen follow={searchValue(query.follow) === "1"} callId={searchValue(query.id)} />;
}
