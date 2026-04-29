import { useAppContext } from "../app-context.js";

export function TokenInput() {
  const { adminToken, setAdminToken } = useAppContext();
  return (
    <input
      placeholder="admin token"
      value={adminToken}
      onChange={(e) => setAdminToken(e.target.value)}
      style={{ marginLeft: 16 }}
    />
  );
}
