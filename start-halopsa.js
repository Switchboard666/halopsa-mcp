import { HaloPSAClient } from "./dist/halopsa-client.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const config = {
  url: process.env.HALOPSA_URL,
  clientId: process.env.HALOPSA_CLIENT_ID,
  clientSecret: process.env.HALOPSA_CLIENT_SECRET,
  tenant: process.env.HALOPSA_TENANT,
};

console.log("🟢 Starting HaloPSA MCP bridge...");
console.log("🔧 Using URL:", config.url);
console.log("🔧 Tenant:", config.tenant);

const halo = new HaloPSAClient(config);
const server = new Server(
  { name: "halopsa-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.connect(new StdioServerTransport());
console.log("✅ HaloPSA MCP Server initialized (via stdio).");
