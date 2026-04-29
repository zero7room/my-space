import { useEffect, useState } from "react";
import { useAppContext } from "../app-context.js";

type Sanitized = {
  provider: string;
  enabled: boolean;
  ingress: { webhookEnabled?: boolean; longConnectionEnabled?: boolean };
  publicFields: Record<string, string | boolean | number>;
  secrets: Record<string, { hasSecret: boolean }>;
};

export function ChannelConfig() {
  const { client } = useAppContext();
  const [list, setList] = useState<Sanitized[]>([]);
  const [draft, setDraft] = useState({
    appId: "",
    verificationToken: "",
    encryptKey: "",
    appSecret: "ref::FEISHU_APP_SECRET",
    webhookEnabled: true,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function refresh() {
      try {
        setList((await client.getChannels()) as Sanitized[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    refresh();
  }, [client]);

  async function save() {
    try {
      await client.putChannel("feishu", {
        enabled: true,
        ingress: { webhookEnabled: draft.webhookEnabled },
        publicFields: {
          appId: draft.appId,
          verificationToken: draft.verificationToken,
          encryptKey: draft.encryptKey,
        },
        secretRefs: { appSecret: draft.appSecret },
      });
      const updated = (await client.getChannels()) as Sanitized[];
      setList(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="channel-config">
      <h2>Channels</h2>
      {error && <div className="error">{error}</div>}
      <ul>
        {list.map((c) => (
          <li key={c.provider}>
            {c.provider} — {c.enabled ? "enabled" : "disabled"} — secrets:{" "}
            {Object.entries(c.secrets)
              .map(([k, v]) => `${k}=${v.hasSecret ? "✓" : "✗"}`)
              .join(", ")}
          </li>
        ))}
      </ul>
      <h3>Configure Feishu</h3>
      <label>
        App ID:{" "}
        <input
          value={draft.appId}
          onChange={(e) => setDraft({ ...draft, appId: e.target.value })}
        />
      </label>
      <br />
      <label>
        Verification Token:{" "}
        <input
          value={draft.verificationToken}
          onChange={(e) => setDraft({ ...draft, verificationToken: e.target.value })}
        />
      </label>
      <br />
      <label>
        Encrypt Key:{" "}
        <input
          value={draft.encryptKey}
          onChange={(e) => setDraft({ ...draft, encryptKey: e.target.value })}
        />
      </label>
      <br />
      <label>
        App Secret Ref (env name with ref:: prefix):{" "}
        <input
          value={draft.appSecret}
          onChange={(e) => setDraft({ ...draft, appSecret: e.target.value })}
        />
      </label>
      <br />
      <button type="button" onClick={save}>
        Save
      </button>
    </div>
  );
}
