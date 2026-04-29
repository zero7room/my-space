import type { ChannelConfigStore } from "../channel/config-store.js";
import type { IngressServer } from "../ingress/http-server.js";
import { mountChannelConfigApi } from "./channel-config-api.js";

export type AdminApiOptions = {
  adminToken: string;
  channelStore: ChannelConfigStore;
  onChannelConfigChanged?: (provider: string) => void | Promise<void>;
};

export function mountAdminApi(server: IngressServer, opts: AdminApiOptions): void {
  mountChannelConfigApi(server, {
    store: opts.channelStore,
    adminToken: opts.adminToken,
    ...(opts.onChannelConfigChanged !== undefined && {
      onConfigChanged: opts.onChannelConfigChanged,
    }),
  });
}
